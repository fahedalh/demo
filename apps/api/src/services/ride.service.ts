/**
 * Ride lifecycle business logic. Every status change goes through `transition`, which:
 *   1. validates the move against the shared state machine (actor-aware),
 *   2. applies it with an optimistic-concurrency guard (`WHERE status = <from>`), so two
 *      concurrent actions (e.g. passenger cancels while driver starts) can't both win,
 *   3. appends RideStatusHistory, and
 *   4. broadcasts the fresh ride to the passenger, driver and admin dashboards.
 */
import { assertTransition, ACTIVE_RIDE_STATUSES, calculateFare, splitEarnings, pathLength, formatMoney } from '@masar/shared';
import type { ActorRole, RideStatus } from '@masar/shared';
import type { CreateRideInput } from '@masar/shared';
import type { Prisma, Ride } from '@prisma/client';
import { prisma, type Tx } from '../lib/prisma';
import { acquireLock } from '../lib/redis';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../lib/errors';
import { pin4, receiptNumber, rideCode } from '../lib/ids';
import { getSettings } from '../lib/settings';
import { logger } from '../lib/logger';
import { emitToAdmins, emitToUser, joinRideRoom, leaveRideRoom } from '../realtime/io';
import { geo } from './geo';
import { rideInclude, toRideDTO, type RideFull } from './serializers';
import { checkCoupon, couponAmount, requireServiceArea, surgeFor, toRule } from './pricing.service';
import { driverLocations } from './driver-locations';
import { postWalletTx } from './wallet.service';
import { gateway } from './payments';
import { copy, notify } from './notifications';

export interface Actor {
  id: string | null;
  role: ActorRole;
}

export const SYSTEM: Actor = { id: null, role: 'SYSTEM' };

export async function loadRide(id: string): Promise<RideFull> {
  const ride = await prisma.ride.findUnique({ where: { id }, include: rideInclude });
  if (!ride) throw notFound('Ride');
  return ride;
}

/** Pushes the current ride state to everyone who should see it. */
export async function broadcastRide(rideId: string) {
  const ride = await loadRide(rideId);
  emitToUser(ride.passengerId, 'ride:updated', toRideDTO(ride, ride.passengerId, 'PASSENGER'));
  if (ride.driverId) emitToUser(ride.driverId, 'ride:updated', toRideDTO(ride, ride.driverId, 'DRIVER'));
  emitToAdmins('admin:ride_event', { rideId: ride.id, status: ride.status, code: ride.code });
  return ride;
}

export async function transition(
  rideId: string,
  from: RideStatus | RideStatus[],
  to: RideStatus,
  actor: Actor,
  data: Prisma.RideUncheckedUpdateManyInput = {},
  note?: string,
  tx?: Tx,
): Promise<Ride> {
  const run = async (db: Tx) => {
    const current = await db.ride.findUnique({ where: { id: rideId } });
    if (!current) throw notFound('Ride');
    const allowed = Array.isArray(from) ? from : [from];
    if (!allowed.includes(current.status as RideStatus)) {
      throw conflict(`Ride is ${current.status.toLowerCase().replace(/_/g, ' ')}; this action is no longer possible`, 'INVALID_RIDE_STATE');
    }
    assertTransition(current.status as RideStatus, to, actor.role);
    const res = await db.ride.updateMany({ where: { id: rideId, status: current.status }, data: { ...data, status: to } });
    if (res.count !== 1) throw conflict('Ride was updated by someone else, please refresh', 'RIDE_CHANGED');
    await db.rideStatusHistory.create({
      data: { rideId, fromStatus: current.status, toStatus: to, actorId: actor.id, actorRole: actor.role, note },
    });
    return (await db.ride.findUnique({ where: { id: rideId } }))!;
  };
  return tx ? run(tx) : prisma.$transaction((t) => run(t));
}

// ───────────────────────── Booking ─────────────────────────

export async function quoteRide(input: { pickup: { lat: number; lng: number }; dropoff: { lat: number; lng: number } }) {
  const area = await requireServiceArea(input.pickup, 'pickup');
  await requireServiceArea(input.dropoff, 'dropoff');
  const route = await geo.route(input.pickup, input.dropoff);
  if (route.distanceMeters < 200) throw unprocessable('Pickup and destination are too close together', 'TRIP_TOO_SHORT');
  if (route.distanceMeters > 200_000) throw unprocessable('This trip is too long to book', 'TRIP_TOO_LONG');
  return { area, route };
}

export async function createRide(passengerId: string, input: CreateRideInput & { scheduledAt?: Date }, idempotencyKey?: string) {
  if (idempotencyKey) {
    const existing = await prisma.ride.findUnique({ where: { idempotencyKey: `${passengerId}:${idempotencyKey}` } });
    if (existing) return { ride: await loadRide(existing.id), created: false };
  }

  // Short Redis lock: blocks double-taps / parallel requests from creating two rides.
  const release = await acquireLock(`ride-create:${passengerId}`, 10_000);
  if (!release) throw conflict('A ride request is already being processed', 'DUPLICATE_REQUEST');
  try {
    if (!input.scheduledAt) {
      const active = await prisma.ride.findFirst({
        where: { passengerId, status: { in: ACTIVE_RIDE_STATUSES }, OR: [{ scheduledAt: null }, { status: { not: 'REQUESTED' } }] },
      });
      if (active) throw conflict('You already have an active ride', 'ACTIVE_RIDE_EXISTS');
    }

    const category = await prisma.vehicleCategory.findFirst({ where: { code: input.categoryCode, isActive: true } });
    if (!category) throw badRequest('This ride option is not available');

    const { area, route } = await quoteRide(input);
    const cfg = await prisma.pricingConfiguration.findUnique({
      where: { categoryId_serviceAreaId: { categoryId: category.id, serviceAreaId: area.id } },
    });
    if (!cfg) throw unprocessable(`${category.name} is not available in ${area.name}`, 'CATEGORY_UNAVAILABLE');

    // Payment method checks happen up front so we never dispatch an unpayable ride.
    let paymentMethodId: string | null = null;
    if (input.paymentType === 'CARD') {
      const pm = input.paymentMethodId
        ? await prisma.paymentMethod.findFirst({ where: { id: input.paymentMethodId, userId: passengerId, deletedAt: null } })
        : await prisma.paymentMethod.findFirst({ where: { userId: passengerId, isDefault: true, deletedAt: null, type: 'CARD' } });
      if (!pm) throw badRequest('Add a card or choose another payment method');
      paymentMethodId = pm.id;
    }

    const surge = input.scheduledAt ? 1 : await surgeFor(cfg, area, category.code);
    const rule = toRule(cfg, surge);
    const gross = calculateFare(rule, { distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds });

    let couponId: string | null = null;
    let discount = 0;
    if (input.couponCode) {
      const c = await checkCoupon(input.couponCode, passengerId);
      if (!c.valid || !c.coupon) throw badRequest(c.message ?? 'Invalid promo code');
      couponId = c.coupon.id;
      discount = couponAmount(c.coupon, gross.total);
    }
    const fare = calculateFare(rule, { distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds }, discount);

    if (input.paymentType === 'WALLET') {
      const w = await prisma.wallet.findUnique({ where: { userId: passengerId } });
      if (!w || w.balance < fare.total) throw unprocessable('Your wallet balance is too low for this ride', 'INSUFFICIENT_FUNDS');
    }

    const ride = await prisma.$transaction(async (tx) => {
      const r = await tx.ride.create({
        data: {
          code: rideCode(),
          passengerId,
          categoryId: category.id,
          serviceAreaId: area.id,
          status: 'REQUESTED',
          pickupAddress: input.pickup.address,
          pickupLat: input.pickup.lat,
          pickupLng: input.pickup.lng,
          dropoffAddress: input.dropoff.address,
          dropoffLat: input.dropoff.lat,
          dropoffLng: input.dropoff.lng,
          pickupNotes: input.pickupNotes || null,
          estimatedDistanceM: route.distanceMeters,
          estimatedDurationS: route.durationSeconds,
          routeGeometry: route.geometry,
          estimatedFare: fare.total,
          surgeMultiplier: surge,
          fareBreakdown: fare as any,
          discountAmount: fare.discount,
          currency: cfg.currency,
          commissionRate: cfg.commissionRate,
          paymentType: input.paymentType,
          paymentMethodId,
          couponId,
          startPin: pin4(),
          scheduledAt: input.scheduledAt ?? null,
          idempotencyKey: idempotencyKey ? `${passengerId}:${idempotencyKey}` : null,
        },
      });
      await tx.rideStatusHistory.create({
        data: { rideId: r.id, toStatus: 'REQUESTED', actorId: passengerId, actorRole: 'PASSENGER', note: input.scheduledAt ? 'scheduled' : undefined },
      });
      return r;
    });
    joinRideRoom(passengerId, ride.id);
    return { ride: await loadRide(ride.id), created: true };
  } finally {
    await release();
  }
}

// ───────────────────────── Driver actions ─────────────────────────

function assertDriverOf(ride: Ride, driverId: string) {
  if (ride.driverId !== driverId) throw forbidden('This ride is not assigned to you');
}

/** Called on the driver's first location update after accepting (or explicitly from the app). */
export async function markDriverArriving(rideId: string, driverId: string) {
  const ride = await prisma.ride.findUnique({ where: { id: rideId } });
  if (!ride) throw notFound('Ride');
  assertDriverOf(ride, driverId);
  if (ride.status !== 'ACCEPTED') return ride;
  await transition(rideId, 'ACCEPTED', 'DRIVER_ARRIVING', { id: driverId, role: 'DRIVER' });
  await broadcastRide(rideId);
  return ride;
}

export async function driverArrived(rideId: string, driverId: string) {
  const ride = await prisma.ride.findUnique({ where: { id: rideId } });
  if (!ride) throw notFound('Ride');
  assertDriverOf(ride, driverId);
  await transition(rideId, ['ACCEPTED', 'DRIVER_ARRIVING'], 'ARRIVED', { id: driverId, role: 'DRIVER' }, { arrivedAt: new Date() });
  const full = await broadcastRide(rideId);
  const ar = full.passenger.locale === 'ar';
  const c = copy.driverArrived(ar);
  await notify(full.passengerId, 'RIDE_DRIVER_ARRIVED', c.title, c.body, { rideId });
  return full;
}

export async function startTrip(rideId: string, driverId: string, pin?: string) {
  const ride = await prisma.ride.findUnique({ where: { id: rideId } });
  if (!ride) throw notFound('Ride');
  assertDriverOf(ride, driverId);
  if (pin !== undefined && pin !== ride.startPin) throw badRequest('Incorrect trip PIN — ask the passenger for their 4-digit PIN');
  await transition(rideId, 'ARRIVED', 'IN_PROGRESS', { id: driverId, role: 'DRIVER' }, { startedAt: new Date() });
  const full = await broadcastRide(rideId);
  const c = copy.tripStarted(full.passenger.locale === 'ar');
  await notify(full.passengerId, 'RIDE_STARTED', c.title, c.body, { rideId });
  return full;
}

/**
 * Upfront pricing: the passenger pays the quoted fare unless the driven distance differs from
 * the estimate by more than 25% (detours, changed destination), in which case it is re-metered.
 */
async function computeFinalFare(ride: Ride) {
  const cfg = await prisma.pricingConfiguration.findFirst({ where: { categoryId: ride.categoryId, serviceAreaId: ride.serviceAreaId ?? undefined } });
  if (!cfg) throw new Error('pricing configuration missing');
  const trail = await prisma.rideLocation.findMany({
    where: { rideId: ride.id, recordedAt: { gte: ride.startedAt ?? ride.createdAt } },
    orderBy: { recordedAt: 'asc' },
    select: { lat: true, lng: true },
  });
  const driven = trail.length > 1 ? Math.round(pathLength(trail)) : 0;
  const durationS = ride.startedAt ? Math.round((Date.now() - ride.startedAt.getTime()) / 1000) : ride.estimatedDurationS;
  const deviates = driven > 0 && Math.abs(driven - ride.estimatedDistanceM) / ride.estimatedDistanceM > 0.25;
  const rule = toRule(cfg, ride.surgeMultiplier);
  const metered = deviates
    ? calculateFare(rule, { distanceMeters: driven, durationSeconds: durationS })
    : calculateFare(rule, { distanceMeters: ride.estimatedDistanceM, durationSeconds: ride.estimatedDurationS });
  let discount = 0;
  if (ride.couponId) {
    const coupon = await prisma.coupon.findUnique({ where: { id: ride.couponId } });
    discount = couponAmount(coupon, metered.total);
  }
  const final = calculateFare(rule, deviates ? { distanceMeters: driven, durationSeconds: durationS } : { distanceMeters: ride.estimatedDistanceM, durationSeconds: ride.estimatedDurationS }, discount);
  return { final, driven: driven || ride.estimatedDistanceM, durationS, repriced: deviates };
}

export async function completeTrip(rideId: string, actor: Actor) {
  const ride = await prisma.ride.findUnique({ where: { id: rideId } });
  if (!ride) throw notFound('Ride');
  if (actor.role === 'DRIVER') assertDriverOf(ride, actor.id!);
  if (ride.status !== 'IN_PROGRESS') throw conflict('Only a trip in progress can be completed', 'INVALID_RIDE_STATE');

  const { final, driven, durationS, repriced } = await computeFinalFare(ride);
  const split = splitEarnings(final.subtotal, ride.commissionRate);

  await prisma.$transaction(async (tx) => {
    await transition(
      rideId,
      'IN_PROGRESS',
      'COMPLETED',
      actor,
      {
        completedAt: new Date(),
        finalFare: final.total,
        discountAmount: final.discount,
        fareBreakdown: { ...final, repriced } as any,
        actualDistanceM: driven,
        actualDurationS: durationS,
      },
      repriced ? 'fare re-metered: route deviated from estimate' : undefined,
      tx,
    );
    await tx.driverEarning.create({
      data: {
        driverId: ride.driverId!,
        rideId,
        grossFare: split.gross,
        commission: split.commission,
        netEarning: split.net,
        paymentType: ride.paymentType,
      },
    });
    if (ride.paymentType === 'CASH') {
      // Driver collected `total` in cash: they owe the commission, and the platform owes them
      // the promo discount it funded. Net effect goes to the driver's wallet (may be negative).
      await postWalletTx(tx, ride.driverId!, final.discount - split.commission, 'COMMISSION', {
        referenceType: 'ride',
        referenceId: rideId,
        description: `Cash trip ${ride.code}: commission ${split.commission}${final.discount ? `, promo reimbursement ${final.discount}` : ''}`,
        allowNegative: true,
      });
    } else {
      await postWalletTx(tx, ride.driverId!, split.net, 'EARNING', {
        referenceType: 'ride',
        referenceId: rideId,
        description: `Trip ${ride.code}`,
      });
    }
    if (ride.couponId && final.discount > 0) {
      await tx.couponRedemption.create({ data: { couponId: ride.couponId, userId: ride.passengerId, rideId, discount: final.discount } });
      await tx.coupon.update({ where: { id: ride.couponId }, data: { usedCount: { increment: 1 } } });
    }
    await tx.driverProfile.update({ where: { userId: ride.driverId! }, data: { completedRides: { increment: 1 } } });
    await tx.passengerProfile.upsert({
      where: { userId: ride.passengerId },
      create: { userId: ride.passengerId, totalRides: 1 },
      update: { totalRides: { increment: 1 } },
    });
  });

  await driverLocations.setBusy(ride.driverId!, null);
  await collectRidePayment(rideId);
  const full = await broadcastRide(rideId);
  const ar = full.passenger.locale === 'ar';
  const c = copy.tripCompleted(ar, formatMoney(full.finalFare ?? 0, full.currency, ar ? 'ar' : 'en'));
  await notify(full.passengerId, 'RIDE_COMPLETED', c.title, c.body, { rideId });
  return full;
}

/**
 * Collects payment for a completed ride: cash is recorded, wallet is debited, cards are charged
 * through the configured gateway. Failed card payments leave the ride in PAYMENT_PENDING so the
 * passenger can retry with another method.
 */
export async function collectRidePayment(rideId: string, override?: { paymentType: 'CARD' | 'WALLET' | 'CASH'; paymentMethodId?: string | null }) {
  const ride = await prisma.ride.findUnique({ where: { id: rideId }, include: { passenger: true } });
  if (!ride || ride.finalFare == null) throw notFound('Ride');
  if (!['COMPLETED', 'PAYMENT_PENDING'].includes(ride.status)) throw conflict('This ride is not awaiting payment', 'INVALID_RIDE_STATE');
  const type = override?.paymentType ?? ride.paymentType;
  const pmId = override?.paymentMethodId ?? ride.paymentMethodId;
  const amount = ride.finalFare;
  const base = { rideId, userId: ride.passengerId, amount, currency: ride.currency, purpose: 'RIDE' as const, receiptNumber: receiptNumber() };

  if (amount === 0 || type === 'CASH') {
    await prisma.$transaction(async (tx) => {
      await tx.payment.create({ data: { ...base, type: 'CASH', provider: 'CASH', status: 'SUCCEEDED', paidAt: new Date() } });
      await transition(rideId, ride.status as RideStatus, 'PAYMENT_COMPLETED', SYSTEM, {}, amount === 0 ? 'fully discounted' : 'cash collected by driver', tx);
    });
    return 'SUCCEEDED';
  }

  if (type === 'WALLET') {
    try {
      await prisma.$transaction(async (tx) => {
        const p = await tx.payment.create({ data: { ...base, type: 'WALLET', provider: 'WALLET', status: 'SUCCEEDED', paidAt: new Date() } });
        await postWalletTx(tx, ride.passengerId, -amount, 'RIDE_PAYMENT', { referenceType: 'payment', referenceId: p.id, description: `Trip ${ride.code}` });
        await transition(rideId, ride.status as RideStatus, 'PAYMENT_COMPLETED', SYSTEM, {}, 'paid from wallet', tx);
      });
      return 'SUCCEEDED';
    } catch (err) {
      return markPaymentPending(ride, type, pmId, (err as Error).message);
    }
  }

  // CARD
  const pm = pmId ? await prisma.paymentMethod.findUnique({ where: { id: pmId } }) : null;
  if (!pm?.providerRef) return markPaymentPending(ride, type, pmId, 'No card on file');
  const payment = await prisma.payment.create({
    data: { ...base, type: 'CARD', provider: gateway.name, paymentMethodId: pm.id, status: 'PENDING' },
  });
  const result = await gateway.charge({
    amount,
    currency: ride.currency,
    paymentMethodRef: pm.providerRef,
    customerRef: ride.passenger.paymentCustomerRef,
    description: `Masar trip ${ride.code}`,
    idempotencyKey: `ride-${ride.id}-${payment.id}`,
    metadata: { rideId: ride.id, paymentId: payment.id },
  });
  if (result.status === 'SUCCEEDED') {
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'SUCCEEDED', providerRef: result.providerRef, paidAt: new Date() } });
      await transition(rideId, ride.status as RideStatus, 'PAYMENT_COMPLETED', SYSTEM, {}, 'card charged', tx);
    });
    return 'SUCCEEDED';
  }
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: result.status === 'REQUIRES_ACTION' ? 'REQUIRES_ACTION' : 'FAILED',
      providerRef: result.providerRef,
      failureReason: result.failureReason,
      metadata: result.clientSecret ? { clientSecret: result.clientSecret } : undefined,
    },
  });
  return markPaymentPending(ride, type, pmId, result.failureReason ?? 'Card payment failed', false);
}

async function markPaymentPending(ride: Ride & { passenger: { locale: string } }, type: string, pmId: string | null | undefined, reason: string, record = true) {
  if (record) {
    await prisma.payment.create({
      data: {
        rideId: ride.id,
        userId: ride.passengerId,
        amount: ride.finalFare ?? 0,
        currency: ride.currency,
        purpose: 'RIDE',
        receiptNumber: receiptNumber(),
        type: type as any,
        provider: type === 'WALLET' ? 'WALLET' : gateway.name,
        paymentMethodId: type === 'CARD' ? pmId ?? null : null,
        status: 'FAILED',
        failureReason: reason,
      },
    });
  }
  if (ride.status === 'COMPLETED') await transition(ride.id, 'COMPLETED', 'PAYMENT_PENDING', SYSTEM, {}, reason);
  const c = copy.paymentFailed(ride.passenger.locale === 'ar');
  await notify(ride.passengerId, 'PAYMENT_FAILED', c.title, c.body, { rideId: ride.id });
  logger.warn({ rideId: ride.id, reason }, 'ride payment pending');
  return 'FAILED';
}

// ───────────────────────── Cancellation ─────────────────────────

export async function cancelRide(rideId: string, actor: Actor, reason?: string) {
  const ride = await prisma.ride.findUnique({ where: { id: rideId }, include: { passenger: true } });
  if (!ride) throw notFound('Ride');
  if (actor.role === 'PASSENGER' && ride.passengerId !== actor.id) throw forbidden();
  if (actor.role === 'DRIVER' && ride.driverId !== actor.id) throw forbidden();

  // A driver backing out returns the ride to dispatch instead of cancelling it for the passenger.
  if (actor.role === 'DRIVER') {
    if (!['ACCEPTED', 'DRIVER_ARRIVING', 'ARRIVED'].includes(ride.status)) throw conflict('This ride can no longer be cancelled', 'INVALID_RIDE_STATE');
    if (ride.status === 'ARRIVED') {
      // At pickup and the passenger is a no-show → genuine cancellation with fee.
      return finalizeCancellation(ride, actor, reason ?? 'Passenger no-show', true);
    }
    const driverId = ride.driverId!;
    await prisma.$transaction(async (tx) => {
      await transition(
        rideId,
        ride.status as RideStatus,
        'SEARCHING',
        SYSTEM,
        { driverId: null, vehicleId: null, acceptedAt: null },
        `driver ${driverId} cancelled: ${reason ?? 'no reason'}`,
        tx,
      );
      await tx.driverProfile.update({ where: { userId: driverId }, data: { cancelledRides: { increment: 1 } } });
    });
    await driverLocations.setBusy(driverId, null);
    leaveRideRoom(driverId, rideId);
    emitToUser(driverId, 'ride:updated', toRideDTO(await loadRide(rideId), driverId, 'DRIVER'));
    await broadcastRide(rideId);
    const { dispatch } = await import('./dispatch.service');
    void dispatch.offerNext(rideId);
    return loadRide(rideId);
  }

  if (!['REQUESTED', 'SEARCHING', 'ACCEPTED', 'DRIVER_ARRIVING', 'ARRIVED'].includes(ride.status)) {
    throw conflict('This ride can no longer be cancelled', 'INVALID_RIDE_STATE');
  }
  const settings = await getSettings();
  const lateCancel =
    actor.role === 'PASSENGER' &&
    (ride.status === 'ARRIVED' ||
      (ride.acceptedAt != null && Date.now() - ride.acceptedAt.getTime() > settings.freeCancellationSeconds * 1000));
  return finalizeCancellation(ride, actor, reason, lateCancel);
}

async function finalizeCancellation(ride: Ride & { passenger: { locale: string } }, actor: Actor, reason: string | undefined, chargeFee: boolean) {
  let fee = 0;
  if (chargeFee && ride.driverId) {
    const cfg = await prisma.pricingConfiguration.findFirst({ where: { categoryId: ride.categoryId, serviceAreaId: ride.serviceAreaId ?? undefined } });
    fee = cfg?.cancellationFee ?? 0;
  }
  const driverId = ride.driverId;
  await prisma.$transaction(async (tx) => {
    await transition(
      ride.id,
      ride.status as RideStatus,
      'CANCELLED',
      actor,
      { cancelledAt: new Date(), cancelledById: actor.id, cancelledByRole: actor.role, cancellationReason: reason ?? null, cancellationFee: fee },
      reason,
      tx,
    );
    if (fee > 0 && driverId) {
      // Fee comes from the passenger's wallet (allowed to go negative, settled on next top-up)
      // and is paid to the driver minus commission.
      const p = await tx.payment.create({
        data: {
          rideId: ride.id,
          userId: ride.passengerId,
          amount: fee,
          currency: ride.currency,
          purpose: 'CANCELLATION_FEE',
          type: 'WALLET',
          provider: 'WALLET',
          status: 'SUCCEEDED',
          paidAt: new Date(),
          receiptNumber: receiptNumber(),
        },
      });
      await postWalletTx(tx, ride.passengerId, -fee, 'RIDE_PAYMENT', {
        referenceType: 'payment',
        referenceId: p.id,
        description: `Cancellation fee ${ride.code}`,
        allowNegative: true,
      });
      const split = splitEarnings(fee, ride.commissionRate);
      await postWalletTx(tx, driverId, split.net, 'EARNING', { referenceType: 'ride', referenceId: ride.id, description: `Cancellation fee ${ride.code}` });
    }
  });
  const { dispatch } = await import('./dispatch.service');
  await dispatch.cancelPendingOffers(ride.id, 'ride_cancelled');
  if (driverId) await driverLocations.setBusy(driverId, null);
  const full = await broadcastRide(ride.id);
  const c = copy.rideCancelled(ride.passenger.locale === 'ar');
  if (actor.role !== 'PASSENGER') await notify(ride.passengerId, 'RIDE_CANCELLED', c.title, c.body, { rideId: ride.id });
  if (driverId && actor.role !== 'DRIVER') await notify(driverId, 'RIDE_CANCELLED', 'Ride cancelled', `Trip ${ride.code} was cancelled`, { rideId: ride.id });
  return full;
}

// ───────────────────────── Ratings & tips ─────────────────────────

export async function rateRide(rideId: string, raterId: string, input: { score: number; comment?: string; tags?: string[]; tip?: number }) {
  const ride = await prisma.ride.findUnique({ where: { id: rideId } });
  if (!ride) throw notFound('Ride');
  const isPassenger = ride.passengerId === raterId;
  const isDriver = ride.driverId === raterId;
  if (!isPassenger && !isDriver) throw forbidden();
  if (!['COMPLETED', 'PAYMENT_PENDING', 'PAYMENT_COMPLETED'].includes(ride.status)) throw conflict('You can rate a trip once it is completed');
  const rateeId = isPassenger ? ride.driverId! : ride.passengerId;

  await prisma.$transaction(async (tx) => {
    const rating = await tx.rating.create({
      data: { rideId, raterId, rateeId, raterRole: isPassenger ? 'PASSENGER' : 'DRIVER', score: input.score },
    });
    if (input.comment || input.tags?.length) {
      await tx.review.create({ data: { ratingId: rating.id, comment: input.comment ?? null, tags: input.tags ?? [] } });
    }
    const agg = await tx.rating.aggregate({ where: { rateeId }, _avg: { score: true }, _count: true });
    if (isPassenger) {
      await tx.driverProfile.update({ where: { userId: rateeId }, data: { rating: agg._avg.score ?? 5, ratingCount: agg._count } });
    } else {
      await tx.passengerProfile.upsert({
        where: { userId: rateeId },
        create: { userId: rateeId, rating: agg._avg.score ?? 5, ratingCount: agg._count },
        update: { rating: agg._avg.score ?? 5, ratingCount: agg._count },
      });
    }
  });

  if (isPassenger && input.tip && input.tip > 0) await tipDriver(ride, input.tip);
  return broadcastRide(rideId);
}

async function tipDriver(ride: Ride, amount: number) {
  if (ride.paymentType === 'CASH') return; // cash tips are handed over directly
  const passenger = await prisma.user.findUnique({ where: { id: ride.passengerId } });
  if (ride.paymentType === 'WALLET') {
    await prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: { rideId: ride.id, userId: ride.passengerId, amount, currency: ride.currency, purpose: 'TIP', type: 'WALLET', provider: 'WALLET', status: 'SUCCEEDED', paidAt: new Date(), receiptNumber: receiptNumber() },
      });
      await postWalletTx(tx, ride.passengerId, -amount, 'RIDE_PAYMENT', { referenceType: 'payment', referenceId: p.id, description: `Tip ${ride.code}` });
      await postWalletTx(tx, ride.driverId!, amount, 'EARNING', { referenceType: 'ride', referenceId: ride.id, description: `Tip ${ride.code}` });
      await tx.ride.update({ where: { id: ride.id }, data: { tipAmount: { increment: amount } } });
      await tx.driverEarning.update({ where: { rideId: ride.id }, data: { tip: { increment: amount } } });
    });
    return;
  }
  const pm = ride.paymentMethodId ? await prisma.paymentMethod.findUnique({ where: { id: ride.paymentMethodId } }) : null;
  if (!pm?.providerRef) return;
  const result = await gateway.charge({
    amount,
    currency: ride.currency,
    paymentMethodRef: pm.providerRef,
    customerRef: passenger?.paymentCustomerRef,
    description: `Tip for trip ${ride.code}`,
    idempotencyKey: `tip-${ride.id}`,
  });
  if (result.status !== 'SUCCEEDED') throw unprocessable(result.failureReason ?? 'Tip payment failed', 'PAYMENT_FAILED');
  await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: { rideId: ride.id, userId: ride.passengerId, amount, currency: ride.currency, purpose: 'TIP', type: 'CARD', provider: gateway.name, providerRef: result.providerRef, paymentMethodId: pm.id, status: 'SUCCEEDED', paidAt: new Date(), receiptNumber: receiptNumber() },
    });
    await postWalletTx(tx, ride.driverId!, amount, 'EARNING', { referenceType: 'ride', referenceId: ride.id, description: `Tip ${ride.code}` });
    await tx.ride.update({ where: { id: ride.id }, data: { tipAmount: { increment: amount } } });
    await tx.driverEarning.update({ where: { rideId: ride.id }, data: { tip: { increment: amount } } });
  });
}
