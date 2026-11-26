/** Ride endpoints for passengers (booking, tracking, cancel, rating, chat, receipts) + shared ride views. */
import { Router } from 'express';
import { z } from 'zod';
import {
  ACTIVE_RIDE_STATUSES,
  FINISHED_TRIP_STATUSES,
  calculateFare,
  cancelRideSchema,
  createRideSchema,
  estimateSchema,
  messageSchema,
  rateRideSchema,
  paymentTypeSchema,
} from '@masar/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { q, validate } from '../middleware/validate';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { pageArgs, paginated } from '../lib/pagination';
import { toCategoryDTO, toRideDTO, rideInclude } from '../services/serializers';
import { cancelRide, collectRidePayment, createRide, loadRide, quoteRide, rateRide, broadcastRide } from '../services/ride.service';
import { dispatch } from '../services/dispatch.service';
import { checkCoupon, couponAmount, estimateEtaToPickup, surgeFor, toRule } from '../services/pricing.service';
import { emitToAdmins, emitToRide } from '../realtime/io';
import { copy, notify } from '../services/notifications';

export const ridesRouter = Router();
ridesRouter.use(requireAuth);

async function rideForUser(id: string, user: { id: string; role: string }) {
  const ride = await loadRide(id);
  if (ride.passengerId !== user.id && ride.driverId !== user.id && user.role !== 'ADMIN') throw notFound('Ride');
  return ride;
}

/** Fare estimates for every category available at the pickup. */
ridesRouter.post('/estimate', requireRole('PASSENGER'), validate(estimateSchema), async (req, res) => {
  const { pickup, dropoff, couponCode } = req.body;
  const { area, route } = await quoteRide({ pickup, dropoff });
  const configs = await prisma.pricingConfiguration.findMany({
    where: { serviceAreaId: area.id, category: { isActive: true } },
    include: { category: true },
    orderBy: { category: { sortOrder: 'asc' } },
  });
  const couponCheck = couponCode ? await checkCoupon(couponCode, req.user!.id) : null;
  const options = await Promise.all(
    configs.map(async (cfg) => {
      const surge = await surgeFor(cfg, area, cfg.category.code);
      const rule = toRule(cfg, surge);
      const input = { distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds };
      const gross = calculateFare(rule, input);
      const discount = couponCheck?.valid ? couponAmount(couponCheck.coupon, gross.total) : 0;
      const eta = await estimateEtaToPickup(pickup, cfg.category.code);
      return {
        category: toCategoryDTO(cfg.category),
        fare: gross.total - discount,
        fareBeforeDiscount: gross.total,
        discount,
        currency: cfg.currency,
        surgeMultiplier: surge,
        etaSeconds: eta.etaSeconds,
        nearbyDrivers: eta.nearbyDrivers,
      };
    }),
  );
  res.json({
    route,
    options,
    coupon: couponCode ? { code: couponCode.toUpperCase(), valid: !!couponCheck?.valid, message: couponCheck?.message } : null,
  });
});

ridesRouter.post('/', requireRole('PASSENGER'), validate(createRideSchema), async (req, res) => {
  const key = req.header('Idempotency-Key')?.slice(0, 80);
  const { ride, created } = await createRide(req.user!.id, req.body, key);
  if (created && !ride.scheduledAt) await dispatch.start(ride.id);
  const fresh = await loadRide(ride.id);
  res.status(created ? 201 : 200).json({ ride: toRideDTO(fresh, req.user!.id, req.user!.role) });
});

const listSchema = z.object({
  scope: z.enum(['all', 'active', 'past', 'scheduled']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(15),
});

ridesRouter.get('/', validate(listSchema, 'query'), async (req, res) => {
  const { scope, page, pageSize } = q<z.infer<typeof listSchema>>(req);
  const me = req.user!;
  const owner: Prisma.RideWhereInput = me.role === 'DRIVER' ? { driverId: me.id } : { passengerId: me.id };
  const scopeWhere: Prisma.RideWhereInput =
    scope === 'active'
      ? { status: { in: ACTIVE_RIDE_STATUSES }, OR: [{ scheduledAt: null }, { status: { not: 'REQUESTED' } }] }
      : scope === 'scheduled'
        ? { status: 'REQUESTED', scheduledAt: { not: null } }
        : scope === 'past'
          ? { status: { in: [...FINISHED_TRIP_STATUSES, 'CANCELLED', 'EXPIRED', 'NO_DRIVER_AVAILABLE'] } }
          : {};
  const where = { ...owner, ...scopeWhere };
  const [rows, total] = await Promise.all([
    prisma.ride.findMany({ where, include: rideInclude, orderBy: { createdAt: 'desc' }, ...pageArgs(page, pageSize) }),
    prisma.ride.count({ where }),
  ]);
  res.json(paginated(rows.map((r) => toRideDTO(r, me.id, me.role)), total, page, pageSize));
});

/** The caller's current ride (if any) — used to restore state after reload/reconnect. */
ridesRouter.get('/active', async (req, res) => {
  const me = req.user!;
  const ride = await prisma.ride.findFirst({
    where: {
      ...(me.role === 'DRIVER' ? { driverId: me.id } : { passengerId: me.id }),
      OR: [
        { status: { in: ACTIVE_RIDE_STATUSES }, scheduledAt: null },
        { status: { in: ['SEARCHING', 'ACCEPTED', 'DRIVER_ARRIVING', 'ARRIVED', 'IN_PROGRESS'] } },
        // Completed but not yet rated / paid → keep showing the summary screen.
        ...(me.role === 'PASSENGER'
          ? [{ status: { in: ['COMPLETED', 'PAYMENT_PENDING'] as any }, ratings: { none: { raterId: me.id } }, completedAt: { gt: new Date(Date.now() - 6 * 3600_000) } }]
          : []),
      ],
    },
    include: rideInclude,
    orderBy: { createdAt: 'desc' },
  });
  res.json({ ride: ride ? toRideDTO(ride, me.id, me.role) : null });
});

ridesRouter.get('/:id', async (req, res) => {
  const ride = await rideForUser(String(req.params.id), req.user!);
  res.json({ ride: toRideDTO(ride, req.user!.id, req.user!.role) });
});

ridesRouter.get('/:id/history', async (req, res) => {
  await rideForUser(String(req.params.id), req.user!);
  const [statuses, trail] = await Promise.all([
    prisma.rideStatusHistory.findMany({ where: { rideId: String(req.params.id) }, orderBy: { createdAt: 'asc' } }),
    prisma.rideLocation.findMany({ where: { rideId: String(req.params.id) }, orderBy: { recordedAt: 'asc' }, select: { lat: true, lng: true, recordedAt: true } }),
  ]);
  res.json({ statuses, trail });
});

ridesRouter.post('/:id/cancel', validate(cancelRideSchema), async (req, res) => {
  const me = req.user!;
  await rideForUser(String(req.params.id), me);
  const ride = await cancelRide(String(req.params.id), { id: me.id, role: me.role === 'ADMIN' ? 'ADMIN' : me.role }, req.body.reason);
  res.json({ ride: toRideDTO(ride, me.id, me.role) });
});

ridesRouter.post('/:id/rate', validate(rateRideSchema), async (req, res) => {
  const ride = await rateRide(String(req.params.id), req.user!.id, req.body);
  res.json({ ride: toRideDTO(ride, req.user!.id, req.user!.role) });
});

const payRetrySchema = z.object({ paymentType: paymentTypeSchema.exclude(['CASH']), paymentMethodId: z.string().optional() });
/** Retry a failed payment with the same or another method. */
ridesRouter.post('/:id/pay', requireRole('PASSENGER'), validate(payRetrySchema), async (req, res) => {
  const ride = await rideForUser(String(req.params.id), req.user!);
  if (ride.passengerId !== req.user!.id) throw forbidden();
  if (req.body.paymentType === 'CARD') {
    const pm = await prisma.paymentMethod.findFirst({ where: { id: req.body.paymentMethodId, userId: req.user!.id, deletedAt: null } });
    if (!pm) throw badRequest('Choose a saved card');
  }
  const status = await collectRidePayment(ride.id, req.body);
  const fresh = await broadcastRide(ride.id);
  res.json({ status, ride: toRideDTO(fresh, req.user!.id, req.user!.role) });
});

ridesRouter.get('/:id/receipt', async (req, res) => {
  const ride = await rideForUser(String(req.params.id), req.user!);
  const payments = await prisma.payment.findMany({ where: { rideId: ride.id }, include: { paymentMethod: true, refunds: true }, orderBy: { createdAt: 'asc' } });
  res.json({
    ride: toRideDTO(ride, req.user!.id, req.user!.role),
    payments: payments.map((p) => ({
      id: p.id,
      receiptNumber: p.receiptNumber,
      purpose: p.purpose,
      type: p.type,
      provider: p.provider,
      amount: p.amount,
      refundedAmount: p.refundedAmount,
      currency: p.currency,
      status: p.status,
      failureReason: p.failureReason,
      card: p.paymentMethod ? { brand: p.paymentMethod.brand, last4: p.paymentMethod.last4 } : null,
      paidAt: p.paidAt,
      createdAt: p.createdAt,
    })),
  });
});

// ─── In-app chat ───
ridesRouter.get('/:id/messages', async (req, res) => {
  const ride = await rideForUser(String(req.params.id), req.user!);
  const items = await prisma.message.findMany({ where: { rideId: ride.id }, orderBy: { createdAt: 'asc' }, take: 200 });
  await prisma.message.updateMany({ where: { rideId: ride.id, recipientId: req.user!.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ items });
});

ridesRouter.post('/:id/messages', validate(messageSchema), async (req, res) => {
  const ride = await rideForUser(String(req.params.id), req.user!);
  if (!ride.driverId) throw badRequest('You can message once a driver is assigned');
  if (!['ACCEPTED', 'DRIVER_ARRIVING', 'ARRIVED', 'IN_PROGRESS'].includes(ride.status)) throw badRequest('Chat is closed for this ride');
  const me = req.user!.id;
  const recipientId = me === ride.passengerId ? ride.driverId : ride.passengerId;
  const msg = await prisma.message.create({ data: { rideId: ride.id, senderId: me, recipientId, body: req.body.body } });
  const dto = { id: msg.id, rideId: msg.rideId, senderId: msg.senderId, body: msg.body, createdAt: msg.createdAt.toISOString(), readAt: null };
  emitToRide(ride.id, 'ride:message', dto);
  const sender = me === ride.passengerId ? ride.passenger : ride.driver!;
  const recipient = me === ride.passengerId ? ride.driver! : ride.passenger;
  const c = copy.newMessage(recipient.locale === 'ar', sender.firstName);
  await notify(recipientId, 'RIDE_MESSAGE', c.title, req.body.body.slice(0, 120), { rideId: ride.id });
  res.status(201).json(dto);
});

// ─── Safety ───
const sosSchema = z.object({ lat: z.number().optional(), lng: z.number().optional(), note: z.string().max(500).optional() });
/** Emergency button: opens an URGENT safety ticket and alerts every admin dashboard in real time. */
ridesRouter.post('/:id/sos', validate(sosSchema), async (req, res) => {
  const ride = await rideForUser(String(req.params.id), req.user!);
  const me = req.user!;
  const contacts = await prisma.emergencyContact.findMany({ where: { userId: me.id } });
  const ticket = await prisma.supportTicket.create({
    data: {
      userId: me.id,
      rideId: ride.id,
      subject: `SOS — trip ${ride.code}`,
      category: 'SAFETY',
      priority: 'URGENT',
      description: req.body.note || 'Emergency button pressed during trip',
      meta: { lat: req.body.lat, lng: req.body.lng, role: me.role, emergencyContactsNotified: contacts.length },
    },
  });
  emitToAdmins('admin:sos', { rideId: ride.id, userId: me.id, role: me.role, lat: req.body.lat, lng: req.body.lng, ticketId: ticket.id });
  // SMS to emergency contacts would be sent here through the messaging adapter.
  res.status(201).json({ ok: true, ticketId: ticket.id, contactsNotified: contacts.length });
});
