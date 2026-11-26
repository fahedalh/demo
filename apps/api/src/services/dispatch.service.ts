/**
 * Driver matching / dispatch.
 *
 * Strategy: sequential offers to the nearest eligible driver.
 *   - Eligible = online, approved, idle, matching vehicle category, location fresh, no pending
 *     offer, and not already offered this ride.
 *   - Each offer gives the driver `offerTimeoutSeconds` to accept; a reject or timeout moves on
 *     to the next driver immediately.
 *   - When nobody is around, we keep looking for a short search window before giving up with
 *     NO_DRIVER_AVAILABLE (nobody was ever offered) or EXPIRED (offers were made, none accepted).
 *
 * Concurrency: acceptance is a conditional update (`WHERE status = SEARCHING`), so two drivers
 * can never both win a ride. Timers are in-process; `recover()` re-arms them after a restart.
 * For multiple API instances, move timers to a delayed queue (e.g. BullMQ) — the logic is the same.
 */
import { haversine } from '@masar/shared';
import { prisma } from '../lib/prisma';
import { acquireLock } from '../lib/redis';
import { conflict, forbidden, notFound } from '../lib/errors';
import { getSettings } from '../lib/settings';
import { logger } from '../lib/logger';
import { env } from '../config/env';
import { emitToUser, joinRideRoom } from '../realtime/io';
import { driverLocations } from './driver-locations';
import { broadcastRide, loadRide, SYSTEM, transition } from './ride.service';
import { toRideDTO } from './serializers';
import { copy, notify } from './notifications';

const SEARCH_WINDOW_MS = 90_000;
const RETRY_MS = 4_000;
const scale = (ms: number) => Math.max(50, Math.round(ms * env.DISPATCH_TIME_SCALE));

const timers = new Map<string, NodeJS.Timeout>();
function setTimer(key: string, ms: number, fn: () => void) {
  clearTimer(key);
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      fn();
    }, ms),
  );
}
function clearTimer(key: string) {
  const t = timers.get(key);
  if (t) clearTimeout(t);
  timers.delete(key);
}

async function endSearch(rideId: string, offeredBefore: boolean) {
  const to = offeredBefore ? 'EXPIRED' : 'NO_DRIVER_AVAILABLE';
  try {
    await transition(rideId, 'SEARCHING', to, SYSTEM, {}, offeredBefore ? 'no driver accepted' : 'no eligible driver nearby');
  } catch {
    return; // ride moved on (accepted / cancelled) in the meantime
  }
  const ride = await broadcastRide(rideId);
  const c = copy.noDriver(ride.passenger.locale === 'ar');
  await notify(ride.passengerId, 'RIDE_NO_DRIVER', c.title, c.body, { rideId });
}

export const dispatch = {
  /** REQUESTED → SEARCHING, then start offering. */
  async start(rideId: string) {
    await transition(rideId, 'REQUESTED', 'SEARCHING', SYSTEM);
    await prisma.ride.update({ where: { id: rideId }, data: { requestedAt: new Date() } });
    await broadcastRide(rideId);
    await this.offerNext(rideId);
  },

  async offerNext(rideId: string): Promise<void> {
    const release = await acquireLock(`dispatch:${rideId}`, 5_000);
    if (!release) return; // another worker is dispatching this ride right now
    try {
      const ride = await prisma.ride.findUnique({ where: { id: rideId }, include: { category: true, offers: true } });
      if (!ride || ride.status !== 'SEARCHING') return;
      if (ride.offers.some((o) => o.status === 'PENDING')) return;

      const settings = await getSettings();
      const offeredBefore = ride.offers.length > 0;
      const searchingFor = Date.now() - ride.requestedAt.getTime();
      if (ride.dispatchAttempts >= settings.maxDispatchAttempts) return endSearch(rideId, offeredBefore);

      const alreadyOffered = new Set(ride.offers.map((o) => o.driverId));
      const nearby = await driverLocations.findNearby(ride.pickupLat, ride.pickupLng, settings.dispatchRadiusKm, ride.category.code, 25);
      const candidates = nearby.filter((d) => !alreadyOffered.has(d.driverId) && d.driverId !== ride.passengerId);

      // Defensive: only approved, active drivers with an approved vehicle are eligible.
      const eligible = candidates.length
        ? await prisma.driverProfile.findMany({
            where: {
              userId: { in: candidates.map((c) => c.driverId) },
              verificationStatus: 'APPROVED',
              isOnline: true,
              user: { status: 'ACTIVE' },
              activeVehicle: { status: 'APPROVED' },
            },
            select: { userId: true },
          })
        : [];
      const eligibleIds = new Set(eligible.map((e) => e.userId));
      const next = candidates.find((c) => eligibleIds.has(c.driverId));

      if (!next) {
        if (searchingFor >= scale(SEARCH_WINDOW_MS)) return endSearch(rideId, offeredBefore);
        setTimer(`retry:${rideId}`, scale(RETRY_MS), () => void this.offerNext(rideId));
        return;
      }

      const timeoutMs = scale(settings.offerTimeoutSeconds * 1000);
      const offer = await prisma.rideOffer.create({
        data: { rideId, driverId: next.driverId, distanceM: next.distanceM, expiresAt: new Date(Date.now() + timeoutMs) },
      });
      if (!(await driverLocations.reserveForOffer(next.driverId, offer.id, timeoutMs + 2000))) {
        await prisma.rideOffer.update({ where: { id: offer.id }, data: { status: 'CANCELLED' } });
        setTimer(`retry:${rideId}`, 200, () => void this.offerNext(rideId));
        return;
      }
      await prisma.$transaction([
        prisma.ride.update({ where: { id: rideId }, data: { dispatchAttempts: { increment: 1 } } }),
        prisma.driverProfile.update({ where: { userId: next.driverId }, data: { offersReceived: { increment: 1 } } }),
      ]);

      const full = await loadRide(rideId);
      const pickupEtaSeconds = Math.round(((next.distanceM * 1.3) / 1000 / 25) * 3600) + 60;
      const gross = ((full.fareBreakdown as any)?.subtotal as number | undefined) ?? full.estimatedFare;
      emitToUser(next.driverId, 'ride:offer', {
        offerId: offer.id,
        ride: toRideDTO(full, next.driverId, 'DRIVER'),
        expiresAt: offer.expiresAt.toISOString(),
        pickupDistanceMeters: next.distanceM,
        pickupEtaSeconds,
        estimatedEarning: Math.round(gross * (1 - full.commissionRate)),
      });
      logger.info({ rideId, driverId: next.driverId, offerId: offer.id }, 'ride offered');
      setTimer(`offer:${offer.id}`, timeoutMs, () => void this.expireOffer(offer.id));
    } catch (err) {
      logger.error({ err, rideId }, 'dispatch failed');
    } finally {
      await release();
    }
  },

  async expireOffer(offerId: string) {
    const res = await prisma.rideOffer.updateMany({ where: { id: offerId, status: 'PENDING' }, data: { status: 'EXPIRED', respondedAt: new Date() } });
    const offer = await prisma.rideOffer.findUnique({ where: { id: offerId } });
    if (!offer) return;
    await driverLocations.releaseOffer(offer.driverId);
    if (res.count === 1) {
      emitToUser(offer.driverId, 'ride:offer:cancelled', { offerId, rideId: offer.rideId, reason: 'timeout' });
      await this.offerNext(offer.rideId);
    }
  },

  async reject(offerId: string, driverId: string) {
    const offer = await prisma.rideOffer.findUnique({ where: { id: offerId } });
    if (!offer) throw notFound('Offer');
    if (offer.driverId !== driverId) throw forbidden();
    const res = await prisma.rideOffer.updateMany({ where: { id: offerId, status: 'PENDING' }, data: { status: 'REJECTED', respondedAt: new Date() } });
    clearTimer(`offer:${offerId}`);
    await driverLocations.releaseOffer(driverId);
    if (res.count === 1) void this.offerNext(offer.rideId);
  },

  async accept(offerId: string, driverId: string) {
    const offer = await prisma.rideOffer.findUnique({ where: { id: offerId } });
    if (!offer) throw notFound('Offer');
    if (offer.driverId !== driverId) throw forbidden();
    if (offer.status !== 'PENDING' || offer.expiresAt.getTime() < Date.now() - 1000) {
      throw conflict('This request is no longer available', 'OFFER_EXPIRED');
    }
    const driver = await prisma.driverProfile.findUnique({ where: { userId: driverId } });
    if (!driver?.activeVehicleId) throw conflict('Select an approved vehicle before accepting rides');

    await prisma.$transaction(async (tx) => {
      const o = await tx.rideOffer.updateMany({ where: { id: offerId, status: 'PENDING' }, data: { status: 'ACCEPTED', respondedAt: new Date() } });
      if (o.count !== 1) throw conflict('This request is no longer available', 'OFFER_EXPIRED');
      await transition(offer.rideId, 'SEARCHING', 'ACCEPTED', { id: driverId, role: 'DRIVER' }, { driverId, vehicleId: driver.activeVehicleId, acceptedAt: new Date() }, undefined, tx);
      await tx.driverProfile.update({ where: { userId: driverId }, data: { offersAccepted: { increment: 1 } } });
    });
    clearTimer(`offer:${offerId}`);
    clearTimer(`retry:${offer.rideId}`);
    await driverLocations.releaseOffer(driverId);
    await driverLocations.setBusy(driverId, offer.rideId);
    joinRideRoom(driverId, offer.rideId);

    const ride = await broadcastRide(offer.rideId);
    const ar = ride.passenger.locale === 'ar';
    const etaMin = Math.max(1, Math.round(((offer.distanceM * 1.3) / 1000 / 25) * 60) + 1);
    const c = copy.driverAssigned(ar, ride.driver!.firstName, etaMin);
    await notify(ride.passengerId, 'RIDE_ACCEPTED', c.title, c.body, { rideId: ride.id });
    return ride;
  },

  /** Withdraws outstanding offers (ride cancelled / reassigned). */
  async cancelPendingOffers(rideId: string, reason: string) {
    const pending = await prisma.rideOffer.findMany({ where: { rideId, status: 'PENDING' } });
    clearTimer(`retry:${rideId}`);
    for (const o of pending) {
      clearTimer(`offer:${o.id}`);
      await prisma.rideOffer.updateMany({ where: { id: o.id, status: 'PENDING' }, data: { status: 'CANCELLED', respondedAt: new Date() } });
      await driverLocations.releaseOffer(o.driverId);
      emitToUser(o.driverId, 'ride:offer:cancelled', { offerId: o.id, rideId, reason });
    }
  },

  /** Re-arms dispatch after a restart: stale offers are expired and searches resumed. */
  async recover() {
    await prisma.rideOffer.updateMany({ where: { status: 'PENDING' }, data: { status: 'EXPIRED', respondedAt: new Date() } });
    const searching = await prisma.ride.findMany({ where: { status: 'SEARCHING' }, select: { id: true } });
    for (const r of searching) void this.offerNext(r.id);
    if (searching.length) logger.info({ count: searching.length }, 'resumed dispatch for searching rides');
  },

  /** Promotes scheduled rides into dispatch shortly before their pickup time. */
  async dispatchScheduled() {
    const due = await prisma.ride.findMany({
      where: { status: 'REQUESTED', scheduledAt: { not: null, lte: new Date(Date.now() + 5 * 60_000) } },
      select: { id: true, scheduledAt: true },
    });
    for (const r of due) {
      if (r.scheduledAt && r.scheduledAt.getTime() < Date.now() - 30 * 60_000) {
        await transition(r.id, 'REQUESTED', 'EXPIRED', SYSTEM, {}, 'scheduled time passed').catch(() => undefined);
        await broadcastRide(r.id).catch(() => undefined);
        continue;
      }
      await this.start(r.id).catch((err) => logger.error({ err, rideId: r.id }, 'scheduled dispatch failed'));
    }
  },

  clearAllTimers() {
    for (const k of [...timers.keys()]) clearTimer(k);
  },

  /** Distance helper for the driver app. */
  distanceToPickup(ride: { pickupLat: number; pickupLng: number }, lat: number, lng: number) {
    return haversine({ lat, lng }, { lat: ride.pickupLat, lng: ride.pickupLng });
  },
};

let schedulerTimer: NodeJS.Timeout | null = null;
export function startScheduler() {
  if (schedulerTimer) return;
  schedulerTimer = setInterval(() => void dispatch.dispatchScheduled().catch(() => undefined), 30_000);
}
export function stopScheduler() {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = null;
}
