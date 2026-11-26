import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { PlatformRole } from '@bookly/shared';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

interface AccessPayload {
  sub: string;
  role: PlatformRole;
  email: string;
  name: string;
}

export function signAccessToken(p: AccessPayload) {
  return jwt.sign(p, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'] });
}

function readUser(req: Request) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const p = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET) as AccessPayload;
    return { id: p.sub, role: p.role, email: p.email, name: p.name };
  } catch {
    throw new AppError(401, 'TOKEN_INVALID', 'Session expired, please sign in again');
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const user = readUser(req);
    if (!user) return next(AppError.unauthorized());
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

/** Attaches req.user when a valid token is present; never fails for anonymous requests. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const user = readUser(req);
    if (user) req.user = user;
  } catch {
    /* anonymous */
  }
  next();
}

export const requireRole =
  (...roles: PlatformRole[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) return next(AppError.forbidden());
    next();
  };
