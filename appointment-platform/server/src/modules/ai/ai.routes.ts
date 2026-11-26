import { Router } from 'express';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { getAI, noShowRisk } from '../../integrations/ai';
import { optionalAuth, requireAuth } from '../../middleware/auth';
import { can, loadTenant, tenantId } from '../../middleware/tenant';
import { validate } from '../../middleware/validate';
import { assertFeature } from '../../services/planLimits';
import { ah } from '../../utils/asyncHandler';
import { Booking } from '../bookings/booking.model';
import { Category } from '../categories/category.model';
import { Customer } from '../customers/customer.model';
import { Service } from '../services/service.model';
import rateLimit from 'express-rate-limit';
import { isTest } from '../../config/env';

const aiLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, skip: () => isTest });

export const aiRouter = Router();

aiRouter.get('/status', (_req, res) => res.json({ provider: getAI().key }));

/** Natural-language search → structured filters (public). */
aiRouter.post(
  '/search-intent',
  aiLimiter,
  optionalAuth,
  validate({ body: z.object({ text: z.string().trim().min(2).max(300) }) }),
  ah(async (req, res) => {
    const cats = await Category.find({ isActive: true }, { slug: 1 }).lean();
    const intent = await getAI().parseSearch(req.body.text, DateTime.now().toISODate()!, cats.map((c) => c.slug));
    res.json({ intent, provider: getAI().key });
  }),
);

/** Business-side AI tools (plan feature `ai`). */
const t = Router({ mergeParams: true });
t.use(requireAuth, loadTenant);

t.post(
  '/description',
  aiLimiter,
  can('business:update'),
  validate({ body: z.object({ tone: z.enum(['professional', 'friendly', 'luxury']).default('professional'), locale: z.enum(['en', 'ar']).default('en') }) }),
  ah(async (req, res) => {
    const b = req.tenant!.business;
    await assertFeature(b._id, 'ai');
    const [category, services] = await Promise.all([Category.findById(b.category).lean(), Service.find({ business: b._id, isActive: true }, { name: 1 }).limit(8).lean()]);
    const text = await getAI().describeBusiness({ name: b.name, category: category?.name?.en ?? 'services', city: b.address?.city ?? undefined, services: services.map((s) => s.name), tone: req.body.tone, locale: req.body.locale });
    res.json({ description: text, provider: getAI().key });
  }),
);

/** No-show risk for upcoming bookings + simple recommendations. */
t.get(
  '/insights',
  can('analytics:read'),
  ah(async (req, res) => {
    const b = tenantId(req);
    const upcoming = await Booking.find({ business: b, status: { $in: ['pending', 'confirmed'] }, start: { $gte: new Date(), $lte: new Date(Date.now() + 7 * 86_400_000) } }).sort({ start: 1 }).limit(100).lean();
    const customers = await Customer.find({ _id: { $in: upcoming.map((x) => x.customer) } }).lean();
    const risks = upcoming
      .map((bk) => {
        const c = customers.find((x) => String(x._id) === String(bk.customer));
        const risk = noShowRisk({
          bookings: Math.max(0, (c?.stats?.bookings ?? 1) - 1),
          noShows: c?.stats?.noShows ?? 0,
          cancelled: c?.stats?.cancelled ?? 0,
          leadHours: (bk.start.getTime() - bk.createdAt.getTime()) / 3_600_000,
          paid: (bk.price?.paid ?? 0) > 0,
          isNew: (c?.stats?.bookings ?? 1) <= 1,
        });
        return { booking: { _id: bk._id, reference: bk.reference, start: bk.start, customerName: bk.snapshot?.customerName, serviceName: bk.snapshot?.serviceName }, ...risk };
      })
      .sort((a, z2) => z2.score - a.score);

    const recommendations: string[] = [];
    const high = risks.filter((r) => r.level === 'high').length;
    if (high) recommendations.push(`${high} upcoming booking(s) have a high no-show risk — consider requesting a deposit or sending a personal reminder.`);
    const biz = req.tenant!.business;
    if (biz.settings?.payment?.mode === 'none' || biz.settings?.payment?.mode === 'optional') recommendations.push('Enable deposits to reduce no-shows; businesses typically see fewer missed appointments with prepayment.');
    if ((biz.settings?.notifications?.reminderHours ?? []).length < 2) recommendations.push('Add a second reminder (e.g. 2 hours before) to further cut no-shows.');
    if (!biz.description) recommendations.push('Add a business description — use "Generate with AI" in Settings.');
    res.json({ risks: risks.slice(0, 20), recommendations });
  }),
);

export const aiTenantRouter = t;
