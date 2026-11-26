import { Router } from 'express';
import { z } from 'zod';
import type { Types } from 'mongoose';
import { can, tenantId } from '../../middleware/tenant';
import { validate } from '../../middleware/validate';
import { audit } from '../../services/audit';
import { invalidate } from '../../services/cache';
import { AppError } from '../../utils/AppError';
import { ah } from '../../utils/asyncHandler';
import { objectId } from '../../utils/objectId';
import { paginate } from '../../utils/pagination';
import { Business } from '../businesses/business.model';
import { Staff } from '../staff/staff.model';
import { Review } from './review.model';

export async function recomputeRatings(businessId: Types.ObjectId, staffId?: unknown) {
  const [b] = await Review.aggregate([{ $match: { business: businessId, status: 'published' } }, { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } }]);
  await Business.updateOne({ _id: businessId }, { $set: { rating: { average: Math.round((b?.avg ?? 0) * 10) / 10, count: b?.n ?? 0 } } });
  if (staffId) {
    const [s] = await Review.aggregate([{ $match: { staff: staffId, status: 'published' } }, { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } }]);
    await Staff.updateOne({ _id: staffId }, { $set: { rating: { average: Math.round((s?.avg ?? 0) * 10) / 10, count: s?.n ?? 0 } } });
  }
  await invalidate(`biz:${businessId}`);
}

export const tenantReviewRouter = Router({ mergeParams: true });

tenantReviewRouter.get(
  '/',
  can('business:read'),
  validate({ query: z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20), rating: z.coerce.number().int().min(1).max(5).optional() }) }),
  ah(async (req, res) => {
    const { page, limit, rating } = req.query as unknown as { page: number; limit: number; rating?: number };
    const filter: Record<string, unknown> = { business: tenantId(req) };
    if (rating) filter.rating = rating;
    const [items, total, dist] = await Promise.all([
      Review.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('service', 'name').populate('staff', 'name').lean(),
      Review.countDocuments(filter),
      Review.aggregate([{ $match: { business: tenantId(req) } }, { $group: { _id: '$rating', n: { $sum: 1 } } }]),
    ]);
    res.json({ ...paginate(items, total, page, limit), distribution: Object.fromEntries([1, 2, 3, 4, 5].map((r) => [r, dist.find((d) => d._id === r)?.n ?? 0])) });
  }),
);

tenantReviewRouter.patch(
  '/:reviewId',
  can('reviews:manage'),
  validate({ params: z.object({ businessId: objectId, reviewId: objectId }), body: z.object({ reply: z.string().trim().max(1000).optional(), status: z.enum(['published', 'hidden']).optional() }) }),
  ah(async (req, res) => {
    const review = await Review.findOne({ _id: req.params.reviewId, business: tenantId(req) });
    if (!review) throw AppError.notFound('Review');
    if (req.body.reply !== undefined) review.reply = req.body.reply ? { text: req.body.reply, at: new Date() } : undefined;
    if (req.body.status) review.status = req.body.status;
    await review.save();
    await recomputeRatings(review.business, review.staff);
    await audit(req, 'review.updated', { type: 'Review', id: review._id });
    res.json(review);
  }),
);
