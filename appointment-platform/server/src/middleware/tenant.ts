import type { NextFunction, Request, Response } from 'express';
import { MEMBER_ROLE_PERMISSIONS, PERMISSIONS, type MemberRole, type Permission } from '@bookly/shared';
import { Business } from '../modules/businesses/business.model';
import { User } from '../modules/users/user.model';
import { Role } from '../modules/users/role.model';
import { AppError } from '../utils/AppError';
import { ah } from '../utils/asyncHandler';

const roleCache = new Map<string, { perms: Permission[]; at: number }>();

async function permissionsFor(role: MemberRole): Promise<Permission[]> {
  const cached = roleCache.get(role);
  if (cached && Date.now() - cached.at < 60_000) return cached.perms;
  const doc = await Role.findOne({ key: `business:${role}` }).lean();
  const perms = (doc?.permissions as Permission[]) ?? MEMBER_ROLE_PERMISSIONS[role];
  roleCache.set(role, { perms, at: Date.now() });
  return perms;
}

/**
 * Loads `:businessId` and verifies the caller belongs to it (or is a super admin).
 * Must be mounted after requireAuth on a router with mergeParams.
 */
export const loadTenant = ah(async (req: Request, _res: Response, next: NextFunction) => {
  const { businessId } = req.params;
  if (!/^[a-f\d]{24}$/i.test(businessId ?? '')) throw AppError.notFound('Business');
  const business = await Business.findById(businessId);
  if (!business) throw AppError.notFound('Business');
  const u = req.user!;

  if (u.role === 'super_admin') {
    req.tenant = { business, memberRole: 'super_admin', permissions: new Set(PERMISSIONS) };
    return next();
  }
  const user = await User.findById(u.id, { memberships: 1, status: 1 }).lean();
  if (!user || user.status !== 'active') throw AppError.unauthorized();
  const membership = user.memberships?.find((m) => String(m.business) === String(business._id));
  if (!membership) throw AppError.forbidden('You are not a member of this business');
  if (business.status === 'suspended' && membership.role !== 'owner') {
    throw AppError.forbidden('This business is suspended');
  }
  req.tenant = {
    business,
    memberRole: membership.role as MemberRole,
    permissions: new Set(await permissionsFor(membership.role as MemberRole)),
    staffId: membership.staff ? String(membership.staff) : undefined,
  };
  next();
});

/** Requires at least one of the given permissions inside the current tenant. */
export const can =
  (...perms: Permission[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const t = req.tenant;
    if (!t) return next(AppError.forbidden());
    if (perms.some((p) => t.permissions.has(p))) return next();
    next(AppError.forbidden());
  };

export const tenantId = (req: Request) => req.tenant!.business._id;
