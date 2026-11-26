import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth';
import { can, tenantId } from '../../middleware/tenant';
import { validate } from '../../middleware/validate';
import { audit } from '../../services/audit';
import { cached, invalidate } from '../../services/cache';
import { usageSummary } from '../../services/planLimits';
import { AppError } from '../../utils/AppError';
import { ah } from '../../utils/asyncHandler';
import { objectId } from '../../utils/objectId';
import { paginate } from '../../utils/pagination';
import { Payment } from '../payments/payment.model';
import { startSubscriptionCheckout } from '../payments/payment.service';
import { Plan, Subscription } from './plan.model';

export const planRouter = Router();
planRouter.get('/', ah(async (_req, res) => res.json({ items: await cached('plans:active', 300, () => Plan.find({ isActive: true }).sort({ sortOrder: 1 }).lean()) })));

const planBody = z.object({
  key: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,30}$/),
  name: z.string().trim().min(2).max(60),
  description: z.string().max(300).optional(),
  price: z.object({ monthly: z.number().min(0), annual: z.number().min(0) }),
  currency: z.string().length(3).default('USD'),
  limits: z.object({
    staff: z.number().int().min(-1),
    branches: z.number().int().min(-1),
    bookingsPerMonth: z.number().int().min(-1),
    customBranding: z.boolean(),
    integrations: z.boolean(),
    ai: z.boolean(),
    advancedAnalytics: z.boolean(),
    whatsapp: z.boolean(),
  }),
  features: z.array(z.string().max(120)).max(20).default([]),
  highlighted: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const adminPlanRouter = Router();
adminPlanRouter.use(requireAuth, requireRole('super_admin'));
adminPlanRouter.get('/', ah(async (_req, res) => {
  const [plans, subs] = await Promise.all([Plan.find().sort({ sortOrder: 1 }).lean(), Subscription.aggregate([{ $group: { _id: '$plan', n: { $sum: 1 } } }])]);
  res.json({ items: plans.map((p) => ({ ...p, subscribers: subs.find((s) => String(s._id) === String(p._id))?.n ?? 0 })) });
}));
adminPlanRouter.post('/', validate({ body: planBody }), ah(async (req, res) => {
  const plan = await Plan.create(req.body);
  await invalidate('plans');
  await audit(req, 'plan.created', { type: 'Plan', id: plan._id });
  res.status(201).json(plan);
}));
adminPlanRouter.patch('/:id', validate({ params: z.object({ id: objectId }), body: planBody.partial() }), ah(async (req, res) => {
  const plan = await Plan.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
  if (!plan) throw AppError.notFound('Plan');
  await invalidate('plans');
  await audit(req, 'plan.updated', { type: 'Plan', id: plan._id });
  res.json(plan);
}));

adminPlanRouter.get('/subscriptions', validate({ query: z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) }) }), ah(async (req, res) => {
  const { page, limit } = req.query as unknown as { page: number; limit: number };
  const [items, total] = await Promise.all([
    Subscription.find().sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).populate('business', 'name slug status').populate('plan', 'name key price').lean(),
    Subscription.countDocuments(),
  ]);
  res.json(paginate(items, total, page, limit));
}));

adminPlanRouter.patch('/subscriptions/:id', validate({ params: z.object({ id: objectId }), body: z.object({ plan: objectId.optional(), status: z.enum(['trialing', 'active', 'past_due', 'cancelled']).optional(), interval: z.enum(['monthly', 'annual']).optional(), currentPeriodEnd: z.coerce.date().optional() }) }), ah(async (req, res) => {
  if (req.body.plan && !(await Plan.exists({ _id: req.body.plan }))) throw AppError.notFound('Plan');
  const sub = await Subscription.findByIdAndUpdate(req.params.id, { $set: { ...req.body, provider: 'manual' } }, { new: true });
  if (!sub) throw AppError.notFound('Subscription');
  await audit(req, 'subscription.updated', { type: 'Subscription', id: sub._id, business: sub.business }, req.body);
  res.json(sub);
}));

/** Business billing */
export const billingRouter = Router({ mergeParams: true });
billingRouter.get('/', can('business:read'), ah(async (req, res) => {
  const [summary, invoices] = await Promise.all([
    usageSummary(tenantId(req)),
    Payment.find({ business: tenantId(req), purpose: 'subscription', status: { $in: ['succeeded', 'refunded'] } }).sort({ createdAt: -1 }).limit(24).populate('subscriptionChange.plan', 'name').lean(),
  ]);
  res.json({ ...summary, invoices });
}));
billingRouter.post('/change', can('subscription:manage'), validate({ body: z.object({ plan: objectId, interval: z.enum(['monthly', 'annual']) }) }), ah(async (req, res) => {
  const plan = await Plan.findOne({ _id: req.body.plan, isActive: true }).lean();
  if (!plan) throw AppError.notFound('Plan');
  const price = req.body.interval === 'annual' ? plan.price!.annual : plan.price!.monthly;
  if (price === 0) {
    await Subscription.findOneAndUpdate({ business: tenantId(req) }, { $set: { plan: plan._id, interval: req.body.interval, status: 'active', currentPeriodStart: new Date(), currentPeriodEnd: undefined, provider: 'manual' } }, { upsert: true });
    await audit(req, 'subscription.changed', { type: 'Plan', id: plan._id }, { interval: req.body.interval });
    return res.json({ activated: true });
  }
  const checkout = await startSubscriptionCheckout(tenantId(req), { _id: plan._id, name: plan.name, price: { monthly: plan.price!.monthly, annual: plan.price!.annual }, currency: plan.currency ?? 'USD' }, req.body.interval, req.user!.id, req.user!.email);
  await audit(req, 'subscription.checkout_started', { type: 'Plan', id: plan._id }, { interval: req.body.interval });
  res.json(checkout);
}));
