import { Router } from 'express';
import { z } from 'zod';
import { MEMBER_ROLES, PERMISSIONS, PLATFORM_ROLES } from '@bookly/shared';
import { requireAuth, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { audit } from '../services/audit';
import { invalidate } from '../services/cache';
import { AppError } from '../utils/AppError';
import { ah } from '../utils/asyncHandler';
import { objectId } from '../utils/objectId';
import { escapeRegex, paginate } from '../utils/pagination';
import { AuditLog } from './audit/audit.model';
import { RefreshToken } from './auth/refreshToken.model';
import { Business } from './businesses/business.model';
import { Payment } from './payments/payment.model';
import { Subscription } from './plans/plan.model';
import { getSettings } from './settings/settings.model';
import { ContactMessage } from './settings/contact.model';
import { Role } from './users/role.model';
import { User } from './users/user.model';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('super_admin'));

const page = { page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25), q: z.string().trim().max(100).optional() };

adminRouter.get(
  '/users',
  validate({ query: z.object({ ...page, role: z.enum(PLATFORM_ROLES).optional(), status: z.enum(['active', 'suspended']).optional() }) }),
  ah(async (req, res) => {
    const { page: p, limit, q, role, status } = req.query as unknown as { page: number; limit: number; q?: string; role?: string; status?: string };
    const filter: Record<string, unknown> = {};
    if (role) filter.role = role;
    if (status) filter.status = status;
    if (q) filter.$or = [{ name: new RegExp(escapeRegex(q), 'i') }, { email: new RegExp(escapeRegex(q), 'i') }];
    const [items, total] = await Promise.all([User.find(filter).sort({ createdAt: -1 }).skip((p - 1) * limit).limit(limit).lean(), User.countDocuments(filter)]);
    res.json(paginate(items.map(({ passwordHash: _ph, ...u }) => u), total, p, limit));
  }),
);

adminRouter.patch(
  '/users/:id',
  validate({ params: z.object({ id: objectId }), body: z.object({ role: z.enum(PLATFORM_ROLES).optional(), status: z.enum(['active', 'suspended']).optional() }) }),
  ah(async (req, res) => {
    if (req.params.id === req.user!.id) throw AppError.badRequest('You cannot change your own role or status');
    const user = await User.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!user) throw AppError.notFound('User');
    if (req.body.status === 'suspended') await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    await audit(req, 'admin.user_updated', { type: 'User', id: user._id }, req.body);
    res.json(user);
  }),
);

adminRouter.get(
  '/businesses',
  validate({ query: z.object({ ...page, status: z.enum(['pending', 'active', 'suspended']).optional(), category: objectId.optional() }) }),
  ah(async (req, res) => {
    const { page: p, limit, q, status, category } = req.query as unknown as { page: number; limit: number; q?: string; status?: string; category?: string };
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (q) filter.$or = [{ name: new RegExp(escapeRegex(q), 'i') }, { slug: new RegExp(escapeRegex(q), 'i') }];
    const [items, total] = await Promise.all([
      Business.find(filter, { name: 1, slug: 1, status: 1, featured: 1, createdAt: 1, rating: 1, address: 1, logo: 1 }).sort({ createdAt: -1 }).skip((p - 1) * limit).limit(limit).populate('category', 'name').populate('owner', 'name email').lean(),
      Business.countDocuments(filter),
    ]);
    const subs = await Subscription.find({ business: { $in: items.map((b) => b._id) } }).populate('plan', 'name').lean();
    res.json(paginate(items.map((b) => ({ ...b, plan: (subs.find((s) => String(s.business) === String(b._id))?.plan as { name?: string } | undefined)?.name ?? 'Free' })), total, p, limit));
  }),
);

adminRouter.patch(
  '/businesses/:id',
  validate({ params: z.object({ id: objectId }), body: z.object({ status: z.enum(['pending', 'active', 'suspended']).optional(), featured: z.boolean().optional() }) }),
  ah(async (req, res) => {
    const b = await Business.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    if (!b) throw AppError.notFound('Business');
    await invalidate(`biz:${b._id}`);
    await invalidate('categories');
    await audit(req, 'admin.business_updated', { type: 'Business', id: b._id, business: b._id }, req.body);
    res.json(b);
  }),
);

adminRouter.get(
  '/payments',
  validate({ query: z.object({ ...page, purpose: z.enum(['booking', 'subscription']).optional(), status: z.string().optional() }) }),
  ah(async (req, res) => {
    const { page: p, limit, purpose, status } = req.query as unknown as { page: number; limit: number; purpose?: string; status?: string };
    const filter: Record<string, unknown> = { status: { $ne: 'cancelled' } };
    if (purpose) filter.purpose = purpose;
    if (status) filter.status = status;
    const [items, total] = await Promise.all([
      Payment.find(filter).sort({ createdAt: -1 }).skip((p - 1) * limit).limit(limit).populate('business', 'name slug').populate('booking', 'reference').lean(),
      Payment.countDocuments(filter),
    ]);
    res.json(paginate(items, total, p, limit));
  }),
);

adminRouter.get(
  '/audit-logs',
  validate({ query: z.object({ ...page, action: z.string().max(60).optional(), business: objectId.optional() }) }),
  ah(async (req, res) => {
    const { page: p, limit, q, action, business } = req.query as unknown as { page: number; limit: number; q?: string; action?: string; business?: string };
    const filter: Record<string, unknown> = {};
    if (action) filter.action = new RegExp(`^${escapeRegex(action)}`);
    if (business) filter.business = business;
    if (q) filter.$or = [{ actorName: new RegExp(escapeRegex(q), 'i') }, { action: new RegExp(escapeRegex(q), 'i') }];
    const [items, total] = await Promise.all([AuditLog.find(filter).sort({ createdAt: -1 }).skip((p - 1) * limit).limit(limit).populate('business', 'name').lean(), AuditLog.countDocuments(filter)]);
    res.json(paginate(items, total, p, limit));
  }),
);

adminRouter.get('/settings', ah(async (_req, res) => res.json(await getSettings())));
adminRouter.patch(
  '/settings',
  validate({
    body: z.object({
      platformName: z.string().trim().min(2).max(60),
      supportEmail: z.string().email(),
      defaultCurrency: z.string().length(3),
      defaultLocale: z.enum(['en', 'ar']),
      defaultTimezone: z.string().max(60),
      allowBusinessSignup: z.boolean(),
      requireBusinessApproval: z.boolean(),
      maintenanceMode: z.boolean(),
      commissionPercent: z.number().min(0).max(50),
    }).partial(),
  }),
  ah(async (req, res) => {
    const s = await getSettings();
    s.set(req.body);
    await s.save();
    await invalidate('settings');
    await audit(req, 'admin.settings_updated', { type: 'PlatformSettings' }, req.body);
    res.json(s);
  }),
);

adminRouter.get('/roles', ah(async (_req, res) => res.json({ items: await Role.find().sort({ key: 1 }).lean(), permissions: PERMISSIONS, memberRoles: MEMBER_ROLES })));
adminRouter.patch(
  '/roles/:id',
  validate({ params: z.object({ id: objectId }), body: z.object({ permissions: z.array(z.enum(PERMISSIONS)) }) }),
  ah(async (req, res) => {
    const role = await Role.findById(req.params.id);
    if (!role) throw AppError.notFound('Role');
    if (role.key === 'business:owner') throw AppError.badRequest('Owner permissions cannot be reduced');
    role.permissions = req.body.permissions;
    await role.save();
    await audit(req, 'admin.role_updated', { type: 'Role', id: role._id }, { permissions: req.body.permissions });
    res.json(role);
  }),
);

adminRouter.get(
  '/messages',
  validate({ query: z.object({ ...page, status: z.enum(['new', 'handled']).optional() }) }),
  ah(async (req, res) => {
    const { page: p, limit, status } = req.query as unknown as { page: number; limit: number; status?: string };
    const filter = status ? { status } : {};
    const [items, total] = await Promise.all([ContactMessage.find(filter).sort({ createdAt: -1 }).skip((p - 1) * limit).limit(limit).lean(), ContactMessage.countDocuments(filter)]);
    res.json(paginate(items, total, p, limit));
  }),
);
adminRouter.patch(
  '/messages/:id',
  validate({ params: z.object({ id: objectId }), body: z.object({ status: z.enum(['new', 'handled']) }) }),
  ah(async (req, res) => {
    const m = await ContactMessage.findByIdAndUpdate(req.params.id, { $set: { status: req.body.status } }, { new: true });
    if (!m) throw AppError.notFound('Message');
    res.json(m);
  }),
);
