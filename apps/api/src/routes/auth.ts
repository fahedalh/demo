/**
 * Authentication: email/phone + password, JWT access tokens (15 min) and rotating refresh
 * tokens (30 days) with reuse detection. Browsers get the refresh token as an httpOnly,
 * SameSite=Strict cookie scoped to /api/auth (one cookie per app so a passenger and a driver
 * session can coexist on localhost); native clients may send `X-Client-Type: native` to
 * receive it in the body instead.
 */
import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { User } from '@prisma/client';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  otpRequestSchema,
  otpVerifySchema,
  registerSchema,
  resetPasswordSchema,
} from '@masar/shared';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { hashPassword, verifyPassword } from '../lib/password';
import { hashToken, newRefreshToken, signAccessToken } from '../lib/jwt';
import { AppError, badRequest, forbidden, unauthorized } from '../lib/errors';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { authLimiter, otpLimiter } from '../middleware/rate-limit';
import { toUserDTO } from '../services/serializers';
import { consumeOtp, issueOtp } from '../services/otp';
import { disconnectUser } from '../realtime/io';

export const authRouter = Router();

const APPS = ['passenger', 'driver', 'admin'] as const;
type App = (typeof APPS)[number];
const APP_ROLE: Record<App, User['role']> = { passenger: 'PASSENGER', driver: 'DRIVER', admin: 'ADMIN' };

function clientApp(req: Request): App {
  const h = String(req.headers['x-client-app'] ?? 'passenger');
  return (APPS as readonly string[]).includes(h) ? (h as App) : 'passenger';
}
const cookieName = (app: App) => `masar_rt_${app}`;
const isNative = (req: Request) => req.headers['x-client-type'] === 'native';

async function issueSession(req: Request, res: Response, user: User, familyId: string = randomUUID()) {
  const app = clientApp(req);
  const { token, hash } = newRefreshToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hash,
      familyId,
      app,
      userAgent: req.headers['user-agent']?.slice(0, 250),
      ip: req.ip,
      expiresAt,
    },
  });
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    adminRole: user.adminRole,
    tv: user.tokenVersion,
  });
  res.cookie(cookieName(app), token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'strict',
    path: '/api/auth',
    expires: expiresAt,
  });
  return { user: toUserDTO(user), accessToken, ...(isNative(req) ? { refreshToken: token } : {}) };
}

function assertAppRole(req: Request, user: User) {
  const app = clientApp(req);
  if (APP_ROLE[app] !== user.role) {
    const where = {
      PASSENGER: 'the Masar rider app',
      DRIVER: 'the Masar Driver app',
      ADMIN: 'the admin console',
    }[user.role];
    throw forbidden(`This account can't sign in here. Please use ${where}.`);
  }
}

async function ensureSideRecords(user: User) {
  await prisma.wallet.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });
  if (user.role === 'PASSENGER')
    await prisma.passengerProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });
  if (user.role === 'DRIVER')
    await prisma.driverProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });
}

function findByIdentifier(identifier: string) {
  const id = identifier.trim().toLowerCase();
  return prisma.user.findFirst({
    where: { deletedAt: null, OR: [{ email: id }, { phone: identifier.replace(/[\s-]/g, '') }] },
  });
}

authRouter.post('/register', authLimiter, validate(registerSchema), async (req, res) => {
  const { firstName, lastName, email, phone, password, role, locale } = req.body;
  const app = clientApp(req);
  if (app === 'admin') throw forbidden('Admin accounts are created by an administrator');
  if (APP_ROLE[app] !== role) throw badRequest(`Register as a ${role.toLowerCase()} from the matching app`);
  const exists = await prisma.user.findFirst({
    where: { OR: [email ? { email } : {}, phone ? { phone } : {}].filter((o) => Object.keys(o).length) },
  });
  if (exists) throw new AppError(409, 'ACCOUNT_EXISTS', 'An account with this email or phone already exists');
  const user = await prisma.user.create({
    data: {
      firstName,
      lastName,
      email: email ?? null,
      phone: phone ?? null,
      passwordHash: await hashPassword(password),
      role,
      locale,
    },
  });
  await ensureSideRecords(user);
  // Kick off verification for whichever contact was provided.
  if (phone) await issueOtp(phone, 'VERIFY_PHONE', user.id).catch(() => undefined);
  else if (email) await issueOtp(email, 'VERIFY_EMAIL', user.id).catch(() => undefined);
  res.status(201).json(await issueSession(req, res, user));
});

authRouter.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
  const user = await findByIdentifier(req.body.identifier);
  // Same error for unknown user and bad password to avoid account enumeration.
  if (!user || !(await verifyPassword(user.passwordHash, req.body.password)))
    throw unauthorized('Incorrect email/phone or password');
  if (user.status === 'SUSPENDED') throw forbidden('This account is suspended. Contact support.');
  assertAppRole(req, user);
  await ensureSideRecords(user);
  const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  res.json(await issueSession(req, res, updated));
});

authRouter.post('/refresh', async (req, res) => {
  const app = clientApp(req);
  const token: string | undefined = req.cookies?.[cookieName(app)] ?? req.body?.refreshToken;
  if (!token) throw unauthorized('No session');
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!record) throw unauthorized('Session expired');
  if (record.revokedAt) {
    // A rotated token was presented again → likely stolen. Revoke the whole family.
    await prisma.refreshToken.updateMany({
      where: { familyId: record.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw unauthorized('Session expired');
  }
  if (record.expiresAt < new Date() || record.user.deletedAt) throw unauthorized('Session expired');
  if (record.user.status === 'SUSPENDED') throw forbidden('This account is suspended. Contact support.');
  const session = await issueSession(req, res, record.user, record.familyId);
  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revokedAt: new Date(), replacedBy: 'rotated' },
  });
  res.json(session);
});

authRouter.post('/logout', async (req, res) => {
  const app = clientApp(req);
  const token: string | undefined = req.cookies?.[cookieName(app)] ?? req.body?.refreshToken;
  if (token)
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  res.clearCookie(cookieName(app), { path: '/api/auth' });
  res.json({ ok: true });
});

/** Signs out every device: revokes refresh tokens and invalidates outstanding access tokens. */
authRouter.post('/logout-all', requireAuth, async (req, res) => {
  await prisma.$transaction([
    prisma.refreshToken.updateMany({
      where: { userId: req.user!.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.user.update({ where: { id: req.user!.id }, data: { tokenVersion: { increment: 1 } } }),
  ]);
  disconnectUser(req.user!.id);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  res.json({ user: toUserDTO(user) });
});

// ─── OTP verification ───
authRouter.post('/otp/request', otpLimiter, validate(otpRequestSchema), async (req, res) => {
  const { target, purpose } = req.body;
  const user = await findByIdentifier(target);
  // For LOGIN/RESET we answer the same way whether or not the account exists.
  if (user || purpose.startsWith('VERIFY'))
    await issueOtp(target, purpose, user?.id).catch((e) => {
      if (purpose.startsWith('VERIFY')) throw e;
    });
  res.json({ ok: true, message: 'If the account exists, a code has been sent' });
});

authRouter.post('/otp/verify', otpLimiter, requireAuth, validate(otpVerifySchema), async (req, res) => {
  const { target, purpose, code } = req.body;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (purpose === 'VERIFY_PHONE' && user.phone !== target)
    throw badRequest('This phone is not on your account');
  if (purpose === 'VERIFY_EMAIL' && user.email !== target)
    throw badRequest('This email is not on your account');
  await consumeOtp(target, purpose, code);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: purpose === 'VERIFY_PHONE' ? { phoneVerifiedAt: new Date() } : { emailVerifiedAt: new Date() },
  });
  res.json({ user: toUserDTO(updated) });
});

/** Passwordless sign-in with an SMS/email code. */
authRouter.post('/otp/login', otpLimiter, validate(otpVerifySchema), async (req, res) => {
  const { target, code } = req.body;
  await consumeOtp(target, 'LOGIN', code);
  const user = await findByIdentifier(target);
  if (!user) throw unauthorized('Incorrect code');
  if (user.status === 'SUSPENDED') throw forbidden('This account is suspended. Contact support.');
  assertAppRole(req, user);
  res.json(await issueSession(req, res, user));
});

// ─── Password recovery ───
authRouter.post('/password/forgot', otpLimiter, validate(forgotPasswordSchema), async (req, res) => {
  const user = await findByIdentifier(req.body.identifier);
  if (user)
    await issueOtp(req.body.identifier.trim().toLowerCase(), 'RESET_PASSWORD', user.id).catch(
      () => undefined,
    );
  res.json({ ok: true, message: 'If an account exists, we sent a reset code' });
});

authRouter.post('/password/reset', otpLimiter, validate(resetPasswordSchema), async (req, res) => {
  const identifier = req.body.identifier.trim().toLowerCase();
  await consumeOtp(identifier, 'RESET_PASSWORD', req.body.code);
  const user = await findByIdentifier(identifier);
  if (!user) throw badRequest('Code is invalid or has expired');
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(req.body.password), tokenVersion: { increment: 1 } },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  disconnectUser(user.id);
  res.json({ ok: true });
});

authRouter.post('/password/change', requireAuth, validate(changePasswordSchema), async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await verifyPassword(user.passwordHash, req.body.currentPassword)))
    throw badRequest('Current password is incorrect');
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(req.body.newPassword), tokenVersion: { increment: 1 } },
  });
  await prisma.refreshToken.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  // Keep the current device signed in with a fresh session.
  res.json(await issueSession(req, res, updated));
});

/**
 * Social login architecture. A provider adapter verifies the ID token (Google / Apple) and
 * returns a stable subject + email; accounts are linked through SocialAccount.
 * No provider is configured in this build, so the endpoint reports that clearly.
 */
authRouter.post('/social/:provider', async (req, res) => {
  const provider = req.params.provider;
  if (!['google', 'apple'].includes(provider)) throw badRequest('Unknown provider');
  res.status(501).json({
    error: {
      code: 'SOCIAL_LOGIN_NOT_CONFIGURED',
      message: `${provider} sign-in is not configured on this server. Add the provider's client id and an ID-token verifier adapter to enable it.`,
    },
  });
});
