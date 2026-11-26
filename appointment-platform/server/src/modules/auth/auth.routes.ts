import { Router } from 'express';
import { z } from 'zod';
import { SUPPORTED_LOCALES } from '@bookly/shared';
import { requireAuth } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import { audit } from '../../services/audit';
import { AppError } from '../../utils/AppError';
import { ah } from '../../utils/asyncHandler';
import { User } from '../users/user.model';
import { getSettings } from '../settings/settings.model';
import { hashPassword, profile, revoke, rotate, startSession, verifyPassword } from './auth.service';
import { RefreshToken } from './refreshToken.model';

const password = z
  .string()
  .min(8, 'At least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Must contain a letter')
  .regex(/\d/, 'Must contain a number');

const registerBody = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password,
  phone: z.string().trim().max(30).optional(),
  locale: z.enum(SUPPORTED_LOCALES).optional(),
  accountType: z.enum(['customer', 'business']).default('customer'),
});

const loginBody = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(128) });

const updateMeBody = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(30).optional(),
  locale: z.enum(SUPPORTED_LOCALES).optional(),
  avatar: z.string().url().optional().or(z.literal('')),
  notificationPrefs: z.object({ email: z.boolean(), whatsapp: z.boolean(), sms: z.boolean() }).partial().optional(),
});

export const authRouter = Router();

authRouter.post(
  '/register',
  authLimiter,
  validate({ body: registerBody }),
  ah(async (req, res) => {
    const body = req.body as z.infer<typeof registerBody>;
    if (body.accountType === 'business' && !(await getSettings()).allowBusinessSignup) {
      throw AppError.forbidden('Business sign-ups are currently closed');
    }
    if (await User.exists({ email: body.email })) {
      throw AppError.conflict('An account with this email already exists', 'EMAIL_TAKEN', { fields: { email: ['Already registered'] } });
    }
    const user = await User.create({
      name: body.name,
      email: body.email,
      phone: body.phone,
      locale: body.locale ?? 'en',
      passwordHash: await hashPassword(body.password),
      role: body.accountType === 'business' ? 'business_owner' : 'customer',
    });
    req.user = { id: String(user._id), role: user.role, email: user.email, name: user.name };
    await audit(req, 'auth.register', { type: 'User', id: user._id });
    res.status(201).json(await startSession(req, res, user));
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  validate({ body: loginBody }),
  ah(async (req, res) => {
    const { email, password: pw } = req.body as z.infer<typeof loginBody>;
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !(await verifyPassword(pw, user.passwordHash))) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');
    }
    if (user.status !== 'active') throw AppError.forbidden('This account is suspended');
    req.user = { id: String(user._id), role: user.role, email: user.email, name: user.name };
    await audit(req, 'auth.login', { type: 'User', id: user._id });
    res.json(await startSession(req, res, user));
  }),
);

authRouter.post('/refresh', ah(async (req, res) => res.json(await rotate(req, res))));

authRouter.post(
  '/logout',
  ah(async (req, res) => {
    await revoke(req, res);
    res.status(204).end();
  }),
);

authRouter.post(
  '/logout-all',
  requireAuth,
  ah(async (req, res) => {
    await RefreshToken.updateMany({ user: req.user!.id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    await revoke(req, res);
    res.status(204).end();
  }),
);

authRouter.get('/me', requireAuth, ah(async (req, res) => res.json({ user: await profile(req.user!.id) })));

authRouter.patch(
  '/me',
  requireAuth,
  validate({ body: updateMeBody }),
  ah(async (req, res) => {
    const body = req.body as z.infer<typeof updateMeBody>;
    const user = await User.findById(req.user!.id);
    if (!user) throw AppError.unauthorized();
    if (body.name !== undefined) user.name = body.name;
    if (body.phone !== undefined) user.phone = body.phone;
    if (body.locale !== undefined) user.locale = body.locale;
    if (body.avatar !== undefined) user.avatar = body.avatar || undefined;
    if (body.notificationPrefs) Object.assign(user.notificationPrefs ?? {}, body.notificationPrefs);
    await user.save();
    res.json({ user: await profile(user._id) });
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  authLimiter,
  validate({ body: z.object({ currentPassword: z.string().min(1), newPassword: password }) }),
  ah(async (req, res) => {
    const user = await User.findById(req.user!.id).select('+passwordHash');
    if (!user || !(await verifyPassword(req.body.currentPassword, user.passwordHash))) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Current password is incorrect', { fields: { currentPassword: ['Incorrect password'] } });
    }
    user.passwordHash = await hashPassword(req.body.newPassword);
    await user.save();
    await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    await audit(req, 'auth.password_changed', { type: 'User', id: user._id });
    res.json({ ok: true });
  }),
);
