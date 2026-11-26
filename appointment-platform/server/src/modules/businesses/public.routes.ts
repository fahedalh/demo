import { Router } from 'express';
import { z } from 'zod';
import { onlineProvider } from '../../integrations/payments';
import { optionalAuth } from '../../middleware/auth';
import { bookingLimiter } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import { cached } from '../../services/cache';
import { AppError } from '../../utils/AppError';
import { ah } from '../../utils/asyncHandler';
import { Booking } from '../bookings/booking.model';
import { availabilityByDay, cancelByCustomer, computeAvailability, createBooking, populateBooking, reschedule } from '../bookings/booking.service';
import { availabilityDaysQuery, availabilityQuery, cancelBody, createBookingBody, rescheduleBody, trackQuery } from '../bookings/booking.schemas';
import { WaitlistEntry } from '../bookings/waitlist.model';
import { Branch } from '../branches/branch.model';
import { startCheckout } from '../payments/payment.service';
import { Resource } from '../resources/resource.model';
import { Review } from '../reviews/review.model';
import { Service } from '../services/service.model';
import { Staff } from '../staff/staff.model';
import { objectId } from '../../utils/objectId';
import { Business } from './business.model';

async function activeBusiness(slug: string) {
  const business = await Business.findOne({ slug: slug.toLowerCase(), status: 'active' });
  if (!business) throw AppError.notFound('Business');
  return business;
}

export const publicRouter = Router();

publicRouter.get(
  '/businesses/:slug',
  ah(async (req, res) => {
    const business = await activeBusiness(req.params.slug);
    const payload = await cached(`biz:${business._id}:public`, 60, async () => {
      const [services, staff, branches, resources, reviews] = await Promise.all([
        Service.find({ business: business._id, isActive: true }).sort({ sortOrder: 1, name: 1 }).lean(),
        Staff.find({ business: business._id, isActive: true, acceptsBookings: true }, { name: 1, title: 1, bio: 1, avatar: 1, color: 1, branches: 1, rating: 1 }).lean(),
        Branch.find({ business: business._id, isActive: true }, { name: 1, address: 1, phone: 1, workingHours: 1, timezone: 1 }).lean(),
        Resource.find({ business: business._id, isActive: true }, { name: 1, type: 1, capacity: 1, branch: 1, description: 1 }).lean(),
        Review.find({ business: business._id, status: 'published' }).sort({ createdAt: -1 }).limit(30).lean(),
      ]);
      const b = (await business.populate('category')).toObject();
      return {
        business: { ...b, invoiceSeq: undefined, owner: undefined },
        services,
        staff,
        branches,
        resources,
        reviews: reviews.map((r) => ({ _id: r._id, staff: r.staff, service: r.service, rating: r.rating, comment: r.comment, reply: r.reply, authorName: r.authorName, createdAt: r.createdAt })),
      };
    });
    const provider = onlineProvider();
    res.json({ ...payload, payments: { online: !!provider, provider: provider?.key ?? null } });
  }),
);

publicRouter.get(
  '/businesses/:slug/availability',
  validate({ query: availabilityQuery }),
  ah(async (req, res) => {
    const business = await activeBusiness(req.params.slug);
    const q = req.query as unknown as z.infer<typeof availabilityQuery>;
    const { slots, timezone } = await computeAvailability({ business, serviceId: q.service, date: q.date, staffId: q.staff, branchId: q.branch, attendees: q.attendees });
    res.json({ slots: slots.map(({ resources: _r, ...s }) => s), timezone });
  }),
);

publicRouter.get(
  '/businesses/:slug/availability/days',
  validate({ query: availabilityDaysQuery }),
  ah(async (req, res) => {
    const business = await activeBusiness(req.params.slug);
    const q = req.query as unknown as z.infer<typeof availabilityDaysQuery>;
    res.json({ days: await availabilityByDay({ business, serviceId: q.service, from: q.from, days: q.days, staffId: q.staff, branchId: q.branch, attendees: q.attendees }) });
  }),
);

publicRouter.post(
  '/businesses/:slug/bookings',
  bookingLimiter,
  optionalAuth,
  validate({ body: createBookingBody }),
  ah(async (req, res) => {
    const business = await activeBusiness(req.params.slug);
    const body = req.body as z.infer<typeof createBookingBody>;
    if (!req.user && !business.settings?.allowGuestBooking) throw new AppError(401, 'LOGIN_REQUIRED', 'Please sign in to book with this business');
    if (req.user && req.user.role !== 'customer' && req.user.role !== 'business_owner' && req.user.role !== 'super_admin' && req.user.role !== 'staff') throw AppError.forbidden();
    const result = await createBooking(
      business,
      { ...body, customer: { ...body.customer, phone: body.customer.phone || undefined }, source: 'web' },
      { userId: req.user?.id, name: req.user?.name ?? body.customer.name, kind: 'customer' },
    );
    let checkout = null;
    const first = result.bookings[0];
    if (body.paymentMethod === 'online' && (first.price?.amount ?? 0) > 0) {
      checkout = await startCheckout(first, { userId: req.user?.id, returnPath: req.user ? `/account/bookings/${first._id}` : `/track?ref=${first.reference}` }).catch(() => null);
    }
    const bookings = await populateBooking(Booking.find({ _id: { $in: result.bookings.map((b) => b._id) } }).sort({ start: 1 })).lean();
    res.status(201).json({ bookings, skipped: result.skipped, checkout });
  }),
);

publicRouter.post(
  '/businesses/:slug/waitlist',
  bookingLimiter,
  optionalAuth,
  validate({ body: z.object({ service: objectId, staff: objectId.optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), name: z.string().trim().min(2).max(120), email: z.string().trim().toLowerCase().email(), phone: z.string().max(30).optional(), note: z.string().max(500).optional() }) }),
  ah(async (req, res) => {
    const business = await activeBusiness(req.params.slug);
    if (!business.settings?.waitlistEnabled) throw AppError.forbidden('This business does not use a waiting list');
    if (!(await Service.exists({ _id: req.body.service, business: business._id, isActive: true }))) throw AppError.notFound('Service');
    const exists = await WaitlistEntry.findOne({ business: business._id, service: req.body.service, date: req.body.date, email: req.body.email, status: 'waiting' });
    if (exists) return res.json(exists);
    const entry = await WaitlistEntry.create({ ...req.body, business: business._id, user: req.user?.id });
    res.status(201).json(entry);
  }),
);

/** Guest booking tracking (reference + email). */
async function trackedBooking(reference: string, email: string) {
  const booking = await Booking.findOne({ reference, 'snapshot.customerEmail': email });
  if (!booking) throw new AppError(404, 'NOT_FOUND', 'No booking matches this reference and email');
  return booking;
}

publicRouter.get(
  '/bookings/track',
  validate({ query: trackQuery }),
  ah(async (req, res) => {
    const { reference, email } = req.query as unknown as z.infer<typeof trackQuery>;
    const booking = await trackedBooking(reference, email);
    const doc = await populateBooking(Booking.findById(booking._id)).lean();
    const { internalNotes: _n, customer: _c, ...safe } = doc as Record<string, unknown>;
    res.json(safe);
  }),
);

publicRouter.post(
  '/bookings/track/cancel',
  bookingLimiter,
  validate({ body: trackQuery.merge(cancelBody) }),
  ah(async (req, res) => {
    const booking = await trackedBooking(req.body.reference, req.body.email);
    const business = await Business.findById(booking.business);
    await cancelByCustomer(business!, booking, { kind: 'customer', name: booking.snapshot?.customerName ?? undefined }, req.body.reason);
    res.json({ ok: true, status: booking.status, fee: booking.cancellation?.fee ?? 0 });
  }),
);

publicRouter.post(
  '/bookings/track/reschedule',
  bookingLimiter,
  validate({ body: trackQuery.merge(rescheduleBody.omit({ staff: true })) }),
  ah(async (req, res) => {
    const booking = await trackedBooking(req.body.reference, req.body.email);
    const business = await Business.findById(booking.business);
    await reschedule(business!, booking, req.body.start, { kind: 'customer', name: booking.snapshot?.customerName ?? undefined });
    res.json({ ok: true, start: booking.start });
  }),
);

publicRouter.post(
  '/bookings/track/pay',
  bookingLimiter,
  validate({ body: trackQuery }),
  ah(async (req, res) => {
    const booking = await trackedBooking(req.body.reference, req.body.email);
    res.json(await startCheckout(booking, { returnPath: `/track?ref=${booking.reference}` }));
  }),
);
