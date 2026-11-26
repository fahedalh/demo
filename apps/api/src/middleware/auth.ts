import type { NextFunction, Request, Response } from 'express';
import type { AdminRole, Role } from '@masar/shared';
import { verifyAccessToken } from '../lib/jwt';
import { forbidden, unauthorized } from '../lib/errors';
import { prisma } from '../lib/prisma';

export interface AuthUser {
  id: string;
  role: Role;
  adminRole: AdminRole | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Verifies the Bearer access token. Besides the signature we check the user's status and
 * token version in the DB, so suspensions and password changes take effect immediately.
 * (A single indexed primary-key lookup; cache in Redis if this ever shows up in profiles.)
 */
export async function authenticate(token: string): Promise<AuthUser> {
  let claims;
  try {
    claims = verifyAccessToken(token);
  } catch {
    throw unauthorized('Session expired, please sign in again');
  }
  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, role: true, adminRole: true, status: true, tokenVersion: true, deletedAt: true },
  });
  if (!user || user.deletedAt || user.tokenVersion !== claims.tv) throw unauthorized('Session is no longer valid');
  if (user.status === 'SUSPENDED') throw forbidden('This account is suspended. Contact support.');
  return { id: user.id, role: user.role, adminRole: user.adminRole };
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(unauthorized());
  try {
    req.user = await authenticate(header.slice(7));
    next();
  } catch (e) {
    next(e);
  }
}

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };

/**
 * Admin RBAC. SUPER_ADMIN can do everything; other admin roles get the listed areas.
 */
export type AdminPermission =
  | 'users'
  | 'drivers'
  | 'rides'
  | 'finance'
  | 'pricing'
  | 'marketing'
  | 'support'
  | 'settings'
  | 'logs';

const ADMIN_PERMISSIONS: Record<AdminRole, AdminPermission[] | '*'> = {
  SUPER_ADMIN: '*',
  OPERATIONS: ['users', 'drivers', 'rides', 'support', 'pricing', 'marketing'],
  FINANCE: ['finance', 'rides', 'pricing'],
  SUPPORT: ['support', 'rides', 'users'],
};

export function adminCan(role: AdminRole | null, perm: AdminPermission): boolean {
  if (!role) return false;
  const p = ADMIN_PERMISSIONS[role];
  return p === '*' || p.includes(perm);
}

export const requireAdmin =
  (perm?: AdminPermission) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== 'ADMIN') return next(forbidden());
    if (perm && !adminCan(req.user.adminRole, perm)) return next(forbidden(`Your admin role cannot manage ${perm}`));
    next();
  };

export function adminPermissions(role: AdminRole | null): AdminPermission[] {
  const all: AdminPermission[] = ['users', 'drivers', 'rides', 'finance', 'pricing', 'marketing', 'support', 'settings', 'logs'];
  return all.filter((p) => adminCan(role, p));
}
