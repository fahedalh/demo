import { Router, type Request } from 'express';
import { z } from 'zod';
import { BOOKING_STATUSES, type BookingStatus } from '@bookly/shared';
import { can, tenantId } from '../../middleware/tenant';
import { validate } from '../../middleware/validate';
import { audit } from '../../services/audit';
import { AppError } from '../../utils/AppError';
import { ah } from '../../utils/asyncHandler';
import { objectId } from '../../utils/objectId';
import { escapeRegex, paginate } from '../../utils/pagination';
import { Customer } from '../customers/customer.model';
import { Booking } from './booking.model';
import { availabilityByDay, changeStatus, computeAvailability, createBooking, populateBooking, reschedule, type Actor } from './booking.service';
import { availabilityDaysQuery, availabilityQuery, createBookingBody, listBookingsQuery, rescheduleBody, statusBody } from './booking.schemas';
import { WaitlistEntry } from './waitlist.model';

const actorOf = (req: Request): Actor => ({ userId: req.user?.id, name: req.user?.name, kind: 'business' });

/** Staff-only members are limited to their own bookings. */
function scopeFilter(req: Request): Record<string, unknown> {
  const t = req.tenant!;
  const f: Record<string, unknown> = { business: t.business._id };
  if (!t.permissions.has('bookings:read')) {
    if (!t.staffId) throw AppError.forbidden();
    f.staff = t.staffId;
  }
  return f;
}

async function findScoped(req: Request) {
  const booking = await Booking.findOne({ _id: req.params.bookingId, ...scopeFilter(req) });
  if (!booking) throw AppError.notFound('Booking');
  return booking;
}

export const tenantBookingRouter = Router({ mergeParams: true });
const r = tenantBookingRouter;
const idParams = z.object({ businessId: objectId, bookingId: objectId });

r.get(
  '/availability',
  can('bookings:read', 'bookings:own'),
  validate({ query: availabilityQuery }),
  ah(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof availabilityQuery>;
    const { slots, timezone } = await computeAvailability({ business: req.tenant!.business, serviceId: q.service, date: q.date, staffId: q.staff, branchId: q.branch, attendees: q.attendees, excludeBookingId: q.exclude, ignoreWindows: true });
    res.json({ slots, timezone });
  }),
);

r.get(
  '/availability/days',
  can('bookings:read', 'bookings:own'),
  validate({ query: availabilityDaysQuery }),
  ah(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof availabilityDaysQuery>;
    res.json({ days: await availabilityByDay({ business: req.tenant!.business, serviceId: q.service, from: q.from, days: q.days, staffId: q.staff, branchId: q.branch, attendees: q.attendees, ignoreWindows: true }) });
  }),
);

r.get(
  '/',
  can('bookings:read', 'bookings:own'),
  validate({ query: listBookingsQuery }),
  ah(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listBookingsQuery>;
    const filter = scopeFilter(req);
    if (q.from || q.to) filter.start = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lt: q.to } : {}) };
    if (q.status) {
      const statuses = q.status.split(',').filter((s): s is BookingStatus => (BOOKING_STATUSES as readonly string[]).includes(s));
      if (statuses.length) filter.status = { $in: statuses };
    }
    for (const k of ['staff', 'branch', 'service', 'customer'] as const) if (q[k] && !(k === 'staff' && filter.staff)) filter[k] = q[k];
    if (q.q) {
      const rx = new RegExp(escapeRegex(q.q), 'i');
      filter.$or = [{ reference: rx }, { 'snapshot.customerName': rx }, { 'snapshot.customerEmail': rx }, { 'snapshot.serviceName': rx }];
    }
    const sort: Record<string, 1 | -1> = q.sort === 'start' ? { start: 1 } : q.sort === '-start' ? { start: -1 } : { createdAt: -1 };
    const [items, total] = await Promise.all([
      populateBooking(Booking.find(filter).sort(sort).skip((q.page - 1) * q.limit).limit(q.limit)).lean(),
      Booking.countDocuments(filter),
    ]);
    res.json(paginate(items, total, q.page, q.limit));
  }),
);

r.get(
  '/:bookingId',
  can('bookings:read', 'bookings:own'),
  validate({ params: idParams }),
  ah(async (req, res) => {
    const booking = await populateBooking(Booking.findOne({ _id: req.params.bookingId, ...scopeFilter(req) })).lean();
    if (!booking) throw AppError.notFound('Booking');
    res.json(booking);
  }),
);

r.post(
  '/',
  can('bookings:manage', 'bookings:own'),
  validate({ body: createBookingBody }),
  ah(async (req, res) => {
    const body = req.body as z.infer<typeof createBookingBody>;
    const t = req.tenant!;
    if (!t.permissions.has('bookings:manage')) body.staff = t.staffId; // staff book for themselves
    const result = await createBooking(t.business, { ...body, customer: { ...body.customer, phone: body.customer.phone || undefined }, source: t.permissions.has('bookings:manage') ? 'dashboard' : 'staff' }, actorOf(req));
    await audit(req, 'booking.created', { type: 'Booking', id: result.bookings[0]._id });
    res.status(201).json(result);
  }),
);

r.patch(
  '/:bookingId/status',
  can('bookings:manage', 'bookings:own'),
  validate({ params: idParams, body: statusBody }),
  ah(async (req, res) => {
    const booking = await findScoped(req);
    await changeStatus(booking, req.body.status, actorOf(req), req.body.reason);
    await audit(req, `booking.${req.body.status}`, { type: 'Booking', id: booking._id });
    res.json(await populateBooking(Booking.findById(booking._id)).lean());
  }),
);

r.post(
  '/:bookingId/reschedule',
  can('bookings:manage', 'bookings:own'),
  validate({ params: idParams, body: rescheduleBody }),
  ah(async (req, res) => {
    const booking = await findScoped(req);
    const t = req.tenant!;
    const staff = t.permissions.has('bookings:manage') ? req.body.staff : undefined;
    await reschedule(t.business, booking, req.body.start, actorOf(req), staff);
    await audit(req, 'booking.rescheduled', { type: 'Booking', id: booking._id }, { start: req.body.start });
    res.json(await populateBooking(Booking.findById(booking._id)).lean());
  }),
);

r.patch(
  '/:bookingId/notes',
  can('bookings:manage', 'bookings:own'),
  validate({ params: idParams, body: z.object({ internalNotes: z.string().max(4000) }) }),
  ah(async (req, res) => {
    const booking = await findScoped(req);
    booking.internalNotes = req.body.internalNotes;
    await booking.save();
    res.json({ ok: true });
  }),
);

/** Waitlist management */
export const waitlistRouter = Router({ mergeParams: true });
waitlistRouter.get(
  '/',
  can('bookings:read'),
  ah(async (req, res) => {
    const items = await WaitlistEntry.find({ business: tenantId(req), status: { $in: ['waiting', 'notified'] } }).populate('service', 'name').populate('staff', 'name').sort({ date: 1, createdAt: 1 }).limit(200).lean();
    res.json({ items });
  }),
);
waitlistRouter.patch(
  '/:entryId',
  can('bookings:manage'),
  validate({ params: z.object({ businessId: objectId, entryId: objectId }), body: z.object({ status: z.enum(['waiting', 'notified', 'booked', 'removed']) }) }),
  ah(async (req, res) => {
    const e = await WaitlistEntry.findOneAndUpdate({ _id: req.params.entryId, business: tenantId(req) }, { $set: { status: req.body.status } }, { new: true });
    if (!e) throw AppError.notFound('Waitlist entry');
    res.json(e);
  }),
);

/** Customers (CRM) */
export const customerRouter = Router({ mergeParams: true });
customerRouter.get(
  '/',
  can('customers:read'),
  validate({ query: z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25), q: z.string().trim().max(100).optional(), sort: z.enum(['recent', 'name', 'value']).default('recent') }) }),
  ah(async (req, res) => {
    const { page, limit, q, sort } = req.query as unknown as { page: number; limit: number; q?: string; sort: string };
    const filter: Record<string, unknown> = { business: tenantId(req) };
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
    }
    const s: Record<string, 1 | -1> = sort === 'name' ? { name: 1 } : sort === 'value' ? { 'stats.totalSpent': -1 } : { updatedAt: -1 };
    const [items, total] = await Promise.all([Customer.find(filter).sort(s).skip((page - 1) * limit).limit(limit).lean(), Customer.countDocuments(filter)]);
    res.json(paginate(items, total, page, limit));
  }),
);
customerRouter.get(
  '/:customerId',
  can('customers:read'),
  validate({ params: z.object({ businessId: objectId, customerId: objectId }) }),
  ah(async (req, res) => {
    const customer = await Customer.findOne({ _id: req.params.customerId, business: tenantId(req) }).lean();
    if (!customer) throw AppError.notFound('Customer');
    const bookings = await Booking.find({ business: tenantId(req), customer: customer._id }).sort({ start: -1 }).limit(50).populate('service', 'name').populate('staff', 'name').lean();
    res.json({ customer, bookings });
  }),
);
customerRouter.patch(
  '/:customerId',
  can('customers:manage'),
  validate({ params: z.object({ businessId: objectId, customerId: objectId }), body: z.object({ name: z.string().trim().min(2).max(120), phone: z.string().max(30), notes: z.string().max(4000), tags: z.array(z.string().trim().min(1).max(30)).max(20) }).partial() }),
  ah(async (req, res) => {
    const c = await Customer.findOneAndUpdate({ _id: req.params.customerId, business: tenantId(req) }, { $set: req.body }, { new: true, runValidators: true });
    if (!c) throw AppError.notFound('Customer');
    await audit(req, 'customer.updated', { type: 'Customer', id: c._id });
    res.json(c);
  }),
);
