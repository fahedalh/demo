import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { env } from '../../config/env';
import { signAccessToken } from '../../middleware/auth';
import { AppError } from '../../utils/AppError';
import { randomToken, sha256 } from '../../utils/crypto';
import { User, type UserDoc } from '../users/user.model';
import { Business } from '../businesses/business.model';
import { RefreshToken } from './refreshToken.model';

export const REFRESH_COOKIE = 'bk_rt';

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
  });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}

async function issueRefresh(req: Request, res: Response, userId: unknown, family = randomToken(12)) {
  const token = randomToken();
  await RefreshToken.create({
    user: userId,
    tokenHash: sha256(token),
    family,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
    userAgent: req.headers['user-agent']?.slice(0, 200),
    ip: req.ip,
  });
  setRefreshCookie(res, token);
  return token;
}

/** Public user profile including business memberships (with business name/slug). */
export async function profile(userId: unknown) {
  const user = await User.findById(userId).lean();
  if (!user) throw AppError.unauthorized();
  const businesses = await Business.find({ _id: { $in: user.memberships.map((m) => m.business) } }, { name: 1, slug: 1, logo: 1, status: 1, category: 1 }).lean();
  const { passwordHash: _ph, ...rest } = user as typeof user & { passwordHash?: string };
  return {
    ...rest,
    memberships: user.memberships.map((m) => ({ ...m, businessInfo: businesses.find((b) => String(b._id) === String(m.business)) ?? null })),
  };
}

export async function startSession(req: Request, res: Response, user: UserDoc) {
  await issueRefresh(req, res, user._id);
  user.lastLoginAt = new Date();
  await user.save();
  return {
    accessToken: signAccessToken({ sub: String(user._id), role: user.role, email: user.email, name: user.name }),
    user: await profile(user._id),
  };
}

/** Rotates the refresh token. Reuse of a revoked token revokes the whole family (theft detection). */
export async function rotate(req: Request, res: Response) {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (!raw) throw AppError.unauthorized('No session');
  const stored = await RefreshToken.findOne({ tokenHash: sha256(raw) });
  if (!stored || stored.expiresAt < new Date()) {
    clearRefreshCookie(res);
    throw AppError.unauthorized('Session expired');
  }
  if (stored.revokedAt) {
    await RefreshToken.updateMany({ family: stored.family }, { $set: { revokedAt: new Date() } });
    clearRefreshCookie(res);
    throw new AppError(401, 'TOKEN_REUSE', 'Session invalidated, please sign in again');
  }
  const user = await User.findById(stored.user);
  if (!user || user.status !== 'active') {
    clearRefreshCookie(res);
    throw AppError.unauthorized();
  }
  const next = await issueRefresh(req, res, user._id, stored.family);
  stored.revokedAt = new Date();
  stored.replacedBy = sha256(next);
  await stored.save();
  return {
    accessToken: signAccessToken({ sub: String(user._id), role: user.role, email: user.email, name: user.name }),
    user: await profile(user._id),
  };
}

export async function revoke(req: Request, res: Response) {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (raw) await RefreshToken.updateOne({ tokenHash: sha256(raw) }, { $set: { revokedAt: new Date() } });
  clearRefreshCookie(res);
}
