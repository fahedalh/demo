import { Router } from 'express';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { PAYMENT_MODES, SUPPORTED_CURRENCIES, SUPPORTED_LOCALES, defaultWeeklySchedule } from '@bookly/shared';
import { requireAuth } from '../../middleware/auth';
import { can, loadTenant } from '../../middleware/tenant';
import { validate } from '../../middleware/validate';
import { audit } from '../../services/audit';
import { invalidate } from '../../services/cache';
import { assertFeature, usageSummary } from '../../services/planLimits';
import { AppError } from '../../utils/AppError';
import { ah } from '../../utils/asyncHandler';
import { slugify } from '../../utils/crypto';
import { objectId } from '../../utils/objectId';
import { Branch } from '../branches/branch.model';
import { Category } from '../categories/category.model';
import { addressZ, hexColor, toAddress } from '../common/zod';
import { Plan, Subscription } from '../plans/plan.model';
import { getSettings } from '../settings/settings.model';
import { User } from '../users/user.model';
import { Business } from './business.model';

const tz = z.string().refine((v) => DateTime.local().setZone(v).isValid, 'Unknown timezone');

const createBody = z.object({
  name: z.string().trim().min(2).max(120),
  category: objectId,
  tagline: z.string().trim().max(160).optional(),
  description: z.string().max(4000).optional(),
  timezone: tz.default('Asia/Riyadh'),
  currency: z.enum(SUPPORTED_CURRENCIES).default('USD'),
  locale: z.enum(SUPPORTED_LOCALES).default('en'),
  contact: z.object({ email: z.string().email().optional().or(z.literal('')), phone: z.string().max(30).optional(), website: z.string().url().optional().or(z.literal('')), whatsapp: z.string().max(30).optional() }).optional(),
  address: addressZ.optional(),
});

const updateBody = createBody
  .omit({ category: true })
  .partial()
  .extend({
    category: objectId.optional(),
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,60}$/, 'Lowercase letters, numbers and dashes').optional(),
    logo: z.string().url().optional().or(z.literal('')),
    cover: z.string().url().optional().or(z.literal('')),
    gallery: z.array(z.string().url()).max(20).optional(),
    branding: z.object({ primaryColor: hexColor, accentColor: hexColor, customDomain: z.string().max(200).optional(), hidePlatformBranding: z.boolean() }).partial().optional(),
    settings: z
      .object({
        slotInterval: z.number().int().min(5).max(240),
        minNoticeMinutes: z.number().int().min(0).max(60 * 24 * 30),
        maxAdvanceDays: z.number().int().min(1).max(730),
        requireApproval: z.boolean(),
        allowGuestBooking: z.boolean(),
        allowStaffSelection: z.boolean(),
        waitlistEnabled: z.boolean(),
        payment: z.object({ mode: z.enum(PAYMENT_MODES), depositPercent: z.number().min(0).max(100), acceptCash: z.boolean() }).partial(),
        cancellation: z.object({ allowed: z.boolean(), cutoffHours: z.number().min(0).max(720), feePercent: z.number().min(0).max(100) }).partial(),
        reschedule: z.object({ allowed: z.boolean(), cutoffHours: z.number().min(0).max(720), maxTimes: z.number().int().min(0).max(20) }).partial(),
        notifications: z.object({ email: z.boolean(), whatsapp: z.boolean(), sms: z.boolean(), reminderHours: z.array(z.number().int().min(1).max(168)).max(3) }).partial(),
      })
      .partial()
      .optional(),
  });

async function uniqueSlug(name: string, excludeId?: unknown) {
  const base = slugify(name);
  let slug = base;
  for (let i = 2; await Business.exists({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }); i++) slug = `${base}-${i}`;
  return slug;
}

export const businessRouter = Router();

/** Create a business (onboarding). The caller becomes its owner. */
businessRouter.post(
  '/',
  requireAuth,
  validate({ body: createBody }),
  ah(async (req, res) => {
    const body = req.body as z.infer<typeof createBody>;
    const [category, settings, user] = await Promise.all([Category.findById(body.category), getSettings(), User.findById(req.user!.id)]);
    if (!category || !category.isActive) throw new AppError(422, 'VALIDATION_ERROR', 'Choose a category', { fields: { category: ['Unknown category'] } });
    if (!user) throw AppError.unauthorized();
    if (!settings.allowBusinessSignup && user.role !== 'super_admin') throw AppError.forbidden('Business sign-ups are currently closed');
    if (user.role === 'staff') throw AppError.forbidden('Staff accounts cannot create businesses');

    const business = await Business.create({
      ...body,
      contact: { ...body.contact, email: body.contact?.email || user.email },
      address: toAddress(body.address),
      owner: user._id,
      slug: await uniqueSlug(body.name),
      status: settings.requireBusinessApproval ? 'pending' : 'active',
    });
    await Branch.create({ business: business._id, name: body.address?.city ? `${body.address.city} — Main` : 'Main branch', address: business.address, workingHours: defaultWeeklySchedule() });
    const free = await Plan.findOne({ key: 'free' });
    if (free) await Subscription.create({ business: business._id, plan: free._id, status: 'active' });
    if (user.role === 'customer') user.role = 'business_owner';
    user.memberships.push({ business: business._id, role: 'owner' });
    await user.save();
    await audit(req, 'business.created', { type: 'Business', id: business._id, business: business._id });
    res.status(201).json(business);
  }),
);

const tenant = Router({ mergeParams: true });
tenant.use(requireAuth, loadTenant);

tenant.get(
  '/',
  can('business:read'),
  ah(async (req, res) => {
    const business = await req.tenant!.business.populate('category');
    res.json({ business, memberRole: req.tenant!.memberRole, permissions: [...req.tenant!.permissions], staffId: req.tenant!.staffId ?? null });
  }),
);

tenant.patch(
  '/',
  can('business:update'),
  validate({ body: updateBody }),
  ah(async (req, res) => {
    const business = req.tenant!.business;
    const body = req.body as z.infer<typeof updateBody>;
    if (body.branding && (body.branding.primaryColor || body.branding.accentColor || body.branding.hidePlatformBranding || body.branding.customDomain)) {
      await assertFeature(business._id, 'customBranding');
    }
    if (body.slug && body.slug !== business.slug && (await Business.exists({ slug: body.slug }))) {
      throw AppError.conflict('This booking URL is taken', 'SLUG_TAKEN', { fields: { slug: ['Already taken'] } });
    }
    if (body.category && !(await Category.exists({ _id: body.category, isActive: true }))) throw AppError.badRequest('Unknown category');
    const { settings, branding, address, contact, ...rest } = body;
    business.set(rest);
    for (const k of ['logo', 'cover'] as const) if (rest[k] === '') business.set(k, undefined);
    if (address) business.set('address', toAddress(address));
    if (contact) for (const [k, v] of Object.entries(contact)) business.set(`contact.${k}`, v || undefined);
    if (branding) for (const [k, v] of Object.entries(branding)) business.set(`branding.${k}`, v);
    if (settings) {
      for (const [k, v] of Object.entries(settings)) {
        if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k2, v2] of Object.entries(v)) business.set(`settings.${k}.${k2}`, v2);
        else business.set(`settings.${k}`, v);
      }
    }
    await business.save();
    await invalidate(`biz:${business._id}`);
    await audit(req, 'business.updated', { type: 'Business', id: business._id }, { fields: Object.keys(body) });
    res.json({ business: await business.populate('category') });
  }),
);

tenant.get('/usage', can('business:read'), ah(async (req, res) => res.json(await usageSummary(req.tenant!.business._id))));

/** Team (users with a membership in this business). */
tenant.get(
  '/team',
  can('staff:manage'),
  ah(async (req, res) => {
    const users = await User.find({ 'memberships.business': req.tenant!.business._id }, { name: 1, email: 1, memberships: 1, lastLoginAt: 1 }).lean();
    res.json({
      items: users.map((u) => ({ _id: u._id, name: u.name, email: u.email, lastLoginAt: u.lastLoginAt, role: u.memberships.find((m) => String(m.business) === String(req.tenant!.business._id))?.role })),
    });
  }),
);

tenant.post(
  '/team',
  can('settings:manage'),
  validate({ body: z.object({ email: z.string().trim().toLowerCase().email(), role: z.enum(['manager', 'staff']) }) }),
  ah(async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    if (!user) throw new AppError(404, 'NOT_FOUND', 'No account with this email. Ask them to sign up first.', { fields: { email: ['No account found'] } });
    const b = req.tenant!.business._id;
    const m = user.memberships.find((x) => String(x.business) === String(b));
    if (m?.role === 'owner') throw AppError.badRequest('The owner role cannot be changed');
    if (m) m.role = req.body.role;
    else user.memberships.push({ business: b, role: req.body.role });
    await user.save();
    await audit(req, 'team.member_set', { type: 'User', id: user._id }, { role: req.body.role });
    res.status(201).json({ ok: true });
  }),
);

tenant.delete(
  '/team/:userId',
  can('settings:manage'),
  validate({ params: z.object({ businessId: objectId, userId: objectId }) }),
  ah(async (req, res) => {
    const b = req.tenant!.business._id;
    const user = await User.findById(req.params.userId);
    const m = user?.memberships.find((x) => String(x.business) === String(b));
    if (!user || !m) throw AppError.notFound('Team member');
    if (m.role === 'owner') throw AppError.badRequest('The owner cannot be removed');
    user.memberships = user.memberships.filter((x) => String(x.business) !== String(b)) as typeof user.memberships;
    await user.save();
    await audit(req, 'team.member_removed', { type: 'User', id: user._id });
    res.status(204).end();
  }),
);

export const businessTenantRouter = tenant;
