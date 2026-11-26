import { Router, type Request } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { AppError } from '../../utils/AppError';
import { ah } from '../../utils/asyncHandler';
import { objectId } from '../../utils/objectId';
import { paginate } from '../../utils/pagination';
import { Booking } from '../bookings/booking.model';
import { cancelByCustomer, populateBooking, reschedule } from '../bookings/booking.service';
import { cancelBody, rescheduleBody } from '../bookings/booking.schemas';
import { Business } from '../businesses/business.model';
import { Payment } from '../payments/payment.model';
import { startCheckout } from '../payments/payment.service';
import { Review } from '../reviews/review.model';
import { recomputeRatings } from '../reviews/review.routes';
import { User } from './user.model';

export const meRouter = Router();
meRouter.use(requireAuth);

/** Bookings that belong to the caller: linked to their user id, or made with their email as a guest. */
const mine = (req: Request) => ({ $or: [{ user: req.user!.id }, { user: null, 'snapshot.customerEmail': req.user!.email }] });

async function myBooking(req: Request) {
  const b = await Booking.findOne({ _id: req.params.id, ...mine(req) });
  if (!b) throw AppError.notFound('Booking');
  return b;
}

meRouter.get(
  '/overview',
  ah(async (req, res) => {
    const now = new Date();
    const [upcoming, counts, favorites, spent] = await Promise.all([
      populateBooking(Booking.find({ ...mine(req), start: { $gte: now }, status: { $in: ['pending', 'confirmed'] } }).sort({ start: 1 }).limit(3)).lean(),
      Booking.aggregate([{ $match: { $or: [{ user: new Types.ObjectId(req.user!.id) }, { user: null, 'snapshot.customerEmail': req.user!.email }] } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      User.findById(req.user!.id, { favorites: 1 }).lean(),
      Payment.aggregate([{ $match: { user: new Types.ObjectId(req.user!.id), status: 'succeeded', kind: { $ne: 'refund' } } }, { $group: { _id: '$currency', sum: { $sum: '$amount' } } }]),
    ]);
    res.json({
      upcoming,
      stats: Object.fromEntries(counts.map((c) => [c._id, c.n])),
      favoritesCount: favorites?.favorites?.length ?? 0,
      spent,
    });
  }),
);

meRouter.get(
  '/bookings',
  validate({ query: z.object({ scope: z.enum(['upcoming', 'past', 'all']).default('upcoming'), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(10) }) }),
  ah(async (req, res) => {
    const { scope, page, limit } = req.query as unknown as { scope: string; page: number; limit: number };
    const now = new Date();
    const filter: Record<string, unknown> = { ...mine(req) };
    if (scope === 'upcoming') Object.assign(filter, { end: { $gte: now }, status: { $in: ['pending', 'confirmed'] } });
    if (scope === 'past') Object.assign(filter, { $and: [{ $or: [{ end: { $lt: now } }, { status: { $nin: ['pending', 'confirmed'] } }] }] });
    const sort: Record<string, 1 | -1> = scope === 'upcoming' ? { start: 1 } : { start: -1 };
    const [items, total] = await Promise.all([populateBooking(Booking.find(filter).sort(sort).skip((page - 1) * limit).limit(limit)).lean(), Booking.countDocuments(filter)]);
    const reviewed = await Review.find({ booking: { $in: items.map((b) => b._id) } }, { booking: 1, rating: 1 }).lean();
    res.json(paginate(items.map((b) => ({ ...b, internalNotes: undefined, review: reviewed.find((r) => String(r.booking) === String(b._id)) ?? null })), total, page, limit));
  }),
);

meRouter.get(
  '/bookings/:id',
  validate({ params: z.object({ id: objectId }) }),
  ah(async (req, res) => {
    const b = await populateBooking(Booking.findOne({ _id: req.params.id, ...mine(req) })).lean();
    if (!b) throw AppError.notFound('Booking');
    const review = await Review.findOne({ booking: b._id }).lean();
    const payments = await Payment.find({ booking: b._id, status: { $in: ['succeeded', 'refunded'] } }).sort({ createdAt: 1 }).lean();
    res.json({ ...b, internalNotes: undefined, review, payments });
  }),
);

meRouter.post(
  '/bookings/:id/cancel',
  validate({ params: z.object({ id: objectId }), body: cancelBody }),
  ah(async (req, res) => {
    const booking = await myBooking(req);
    const business = await Business.findById(booking.business);
    await cancelByCustomer(business!, booking, { userId: req.user!.id, name: req.user!.name, kind: 'customer' }, req.body.reason);
    res.json({ ok: true, fee: booking.cancellation?.fee ?? 0 });
  }),
);

meRouter.post(
  '/bookings/:id/reschedule',
  validate({ params: z.object({ id: objectId }), body: rescheduleBody.omit({ staff: true }) }),
  ah(async (req, res) => {
    const booking = await myBooking(req);
    const business = await Business.findById(booking.business);
    await reschedule(business!, booking, req.body.start, { userId: req.user!.id, name: req.user!.name, kind: 'customer' });
    res.json({ ok: true });
  }),
);

meRouter.post(
  '/bookings/:id/pay',
  validate({ params: z.object({ id: objectId }) }),
  ah(async (req, res) => {
    const booking = await myBooking(req);
    res.json(await startCheckout(booking, { userId: req.user!.id, returnPath: `/account/bookings/${booking._id}` }));
  }),
);

meRouter.post(
  '/bookings/:id/review',
  validate({ params: z.object({ id: objectId }), body: z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(2000).optional() }) }),
  ah(async (req, res) => {
    const booking = await myBooking(req);
    if (booking.status !== 'completed') throw AppError.badRequest('You can review a booking after the appointment is completed');
    if (await Review.exists({ booking: booking._id })) throw AppError.conflict('You already reviewed this booking', 'ALREADY_REVIEWED');
    const review = await Review.create({
      business: booking.business,
      booking: booking._id,
      user: req.user!.id,
      customer: booking.customer,
      staff: booking.staff,
      service: booking.service,
      authorName: req.user!.name.split(' ')[0],
      rating: req.body.rating,
      comment: req.body.comment,
    });
    await recomputeRatings(booking.business, booking.staff);
    res.status(201).json(review);
  }),
);

meRouter.get(
  '/favorites',
  ah(async (req, res) => {
    const user = await User.findById(req.user!.id, { favorites: 1 }).lean();
    const items = await Business.find({ _id: { $in: user?.favorites ?? [] }, status: 'active' }).populate('category', 'name slug icon color').lean();
    res.json({ items });
  }),
);

meRouter.put(
  '/favorites/:businessId',
  validate({ params: z.object({ businessId: objectId }) }),
  ah(async (req, res) => {
    if (!(await Business.exists({ _id: req.params.businessId }))) throw AppError.notFound('Business');
    await User.updateOne({ _id: req.user!.id }, { $addToSet: { favorites: req.params.businessId } });
    res.json({ favorite: true });
  }),
);

meRouter.delete(
  '/favorites/:businessId',
  validate({ params: z.object({ businessId: objectId }) }),
  ah(async (req, res) => {
    await User.updateOne({ _id: req.user!.id }, { $pull: { favorites: req.params.businessId } });
    res.json({ favorite: false });
  }),
);

meRouter.get(
  '/payments',
  validate({ query: z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(20) }) }),
  ah(async (req, res) => {
    const { page, limit } = req.query as unknown as { page: number; limit: number };
    const filter = { user: req.user!.id, purpose: 'booking', status: { $in: ['succeeded', 'refunded', 'failed'] } };
    const [items, total] = await Promise.all([
      Payment.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('business', 'name slug logo').populate('booking', 'reference snapshot start').lean(),
      Payment.countDocuments(filter),
    ]);
    res.json(paginate(items, total, page, limit));
  }),
);
