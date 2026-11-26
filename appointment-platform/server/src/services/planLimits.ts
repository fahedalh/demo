import { DateTime } from 'luxon';
import type { Types } from 'mongoose';
import type { PlanFeatureKey, PlanLimitKey } from '@bookly/shared';
import { Plan, Subscription } from '../modules/plans/plan.model';
import { Staff } from '../modules/staff/staff.model';
import { Branch } from '../modules/branches/branch.model';
import { Booking } from '../modules/bookings/booking.model';
import { AppError } from '../utils/AppError';

export async function getBusinessPlan(businessId: Types.ObjectId | string) {
  const sub = await Subscription.findOne({ business: businessId }).populate('plan').lean();
  const plan = (sub?.plan as unknown as InstanceType<typeof Plan> | undefined) ?? (await Plan.findOne({ key: 'free' }).lean());
  return { subscription: sub, plan };
}

async function usage(businessId: Types.ObjectId | string, key: PlanLimitKey) {
  if (key === 'staff') return Staff.countDocuments({ business: businessId, isActive: true });
  if (key === 'branches') return Branch.countDocuments({ business: businessId, isActive: true });
  const monthStart = DateTime.utc().startOf('month').toJSDate();
  return Booking.countDocuments({ business: businessId, createdAt: { $gte: monthStart } });
}

/** Throws 402 PLAN_LIMIT when creating one more `key` would exceed the plan. */
export async function assertLimit(businessId: Types.ObjectId | string, key: PlanLimitKey) {
  const { plan } = await getBusinessPlan(businessId);
  const limit = (plan?.limits as Record<string, number> | undefined)?.[key];
  if (limit === undefined || limit < 0) return;
  const used = await usage(businessId, key);
  if (used >= limit) {
    throw new AppError(402, 'PLAN_LIMIT', `Your ${plan?.name ?? 'current'} plan allows ${limit} ${key === 'bookingsPerMonth' ? 'bookings per month' : key}. Upgrade to add more.`, { key, limit, used });
  }
}

export async function hasFeature(businessId: Types.ObjectId | string, feature: PlanFeatureKey) {
  const { plan } = await getBusinessPlan(businessId);
  return !!(plan?.limits as Record<string, unknown> | undefined)?.[feature];
}

export async function assertFeature(businessId: Types.ObjectId | string, feature: PlanFeatureKey) {
  if (!(await hasFeature(businessId, feature))) {
    throw new AppError(402, 'PLAN_FEATURE', `This feature (${feature}) is not included in your plan.`, { feature });
  }
}

export async function usageSummary(businessId: Types.ObjectId | string) {
  const { plan, subscription } = await getBusinessPlan(businessId);
  const [staff, branches, bookingsPerMonth] = await Promise.all([usage(businessId, 'staff'), usage(businessId, 'branches'), usage(businessId, 'bookingsPerMonth')]);
  return { plan, subscription, usage: { staff, branches, bookingsPerMonth } };
}
