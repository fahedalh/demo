import { Router } from 'express';
import { DateTime } from 'luxon';
import { z } from 'zod';
import type { PipelineStage } from 'mongoose';
import { validate } from '../../middleware/validate';
import { ah } from '../../utils/asyncHandler';
import { escapeRegex } from '../../utils/pagination';
import { Business } from '../businesses/business.model';
import { Category } from '../categories/category.model';
import { Service } from '../services/service.model';
import { Staff } from '../staff/staff.model';
import { computeAvailability } from '../bookings/booking.service';

const query = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(60).optional(), // slug
  city: z.string().trim().max(80).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(1).max(500).default(25),
  availableOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sort: z.enum(['relevance', 'rating', 'price', 'distance', 'newest']).default('relevance'),
  featured: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(12),
});

export const searchRouter = Router();

searchRouter.get(
  '/businesses',
  validate({ query }),
  ah(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof query>;
    const match: Record<string, unknown> = { status: 'active' };
    if (q.featured === 'true') match.featured = true;
    if (q.category) {
      const cat = await Category.findOne({ slug: q.category }, { _id: 1 }).lean();
      match.category = cat?._id ?? null;
    }
    if (q.city) match['address.city'] = new RegExp(`^${escapeRegex(q.city)}`, 'i');
    if (q.minRating) match['rating.average'] = { $gte: q.minRating };
    if (q.maxPrice !== undefined) match['priceRange.min'] = { $lte: q.maxPrice };
    if (q.minPrice !== undefined) match['priceRange.max'] = { $gte: q.minPrice };
    if (q.q) {
      // Match on business text OR on service/provider names (provider search).
      const rx = new RegExp(escapeRegex(q.q), 'i');
      const [svc, stf] = await Promise.all([Service.distinct('business', { isActive: true, $or: [{ name: rx }, { group: rx }] }), Staff.distinct('business', { isActive: true, $or: [{ name: rx }, { title: rx }] })]);
      match.$or = [{ name: rx }, { tagline: rx }, { description: rx }, { _id: { $in: [...svc, ...stf] } }];
    }

    const pipeline: PipelineStage[] = [];
    const geo = q.lat !== undefined && q.lng !== undefined;
    if (geo) {
      pipeline.push({ $geoNear: { near: { type: 'Point', coordinates: [q.lng!, q.lat!] }, distanceField: 'distance', maxDistance: q.radiusKm * 1000, spherical: true, key: 'address.location', query: match } });
    } else pipeline.push({ $match: match });

    const sort: Record<string, 1 | -1> =
      q.sort === 'rating' ? { 'rating.average': -1, 'rating.count': -1 } : q.sort === 'price' ? { 'priceRange.min': 1 } : q.sort === 'newest' ? { createdAt: -1 } : q.sort === 'distance' && geo ? { distance: 1 } : { featured: -1, 'rating.average': -1, 'rating.count': -1 };
    pipeline.push({ $sort: sort });

    // `availableOn` is evaluated after the cheaper filters; capped to keep latency bounded.
    if (q.availableOn) {
      const candidates = await Business.aggregate([...pipeline, { $limit: 60 }]);
      const today = DateTime.now().toISODate()!;
      const available = [];
      for (const b of candidates) {
        if (q.availableOn < today) break;
        const doc = Business.hydrate(b);
        const services = await Service.find({ business: b._id, isActive: true }, { _id: 1 }).limit(5).lean();
        for (const s of services) {
          const { slots } = await computeAvailability({ business: doc, serviceId: String(s._id), date: q.availableOn });
          if (slots.length) {
            available.push({ ...b, nextSlot: slots[0].start });
            break;
          }
        }
      }
      const items = await Business.populate(available.slice((q.page - 1) * q.limit, q.page * q.limit), { path: 'category', select: 'name slug icon color' });
      return res.json({ items, total: available.length, page: q.page, limit: q.limit, pages: Math.max(1, Math.ceil(available.length / q.limit)) });
    }

    const [items, count] = await Promise.all([
      Business.aggregate([...pipeline, { $skip: (q.page - 1) * q.limit }, { $limit: q.limit }, { $project: { invoiceSeq: 0, settings: 0, owner: 0 } }]),
      Business.aggregate([...pipeline, { $count: 'n' }]),
    ]);
    const populated = await Business.populate(items, { path: 'category', select: 'name slug icon color' });
    const total = count[0]?.n ?? 0;
    res.json({ items: populated, total, page: q.page, limit: q.limit, pages: Math.max(1, Math.ceil(total / q.limit)) });
  }),
);

/** Popular services across the marketplace. */
searchRouter.get(
  '/services/popular',
  ah(async (_req, res) => {
    const rows = await Service.aggregate([
      { $match: { isActive: true } },
      { $lookup: { from: 'businesses', localField: 'business', foreignField: '_id', as: 'b' } },
      { $unwind: '$b' },
      { $match: { 'b.status': 'active' } },
      { $sort: { 'b.rating.average': -1, 'b.featured': -1 } },
      { $limit: 12 },
      { $project: { name: 1, price: 1, duration: 1, image: 1, business: { _id: '$b._id', name: '$b.name', slug: '$b.slug', currency: '$b.currency', rating: '$b.rating', city: '$b.address.city' } } },
    ]);
    res.json({ items: rows });
  }),
);
