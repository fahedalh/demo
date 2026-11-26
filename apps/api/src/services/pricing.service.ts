import {
  haversine,
  pointInPolygon,
  calculateFare,
  couponDiscount,
  type LatLng,
  type PricingRule,
} from '@masar/shared';
import type { Coupon, PricingConfiguration, ServiceArea } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { unprocessable } from '../lib/errors';
import { driverLocations } from './driver-locations';
import { getSettings } from '../lib/settings';

export function toRule(p: PricingConfiguration, surgeMultiplier = 1): PricingRule {
  return {
    baseFare: p.baseFare,
    perKm: p.perKm,
    perMinute: p.perMinute,
    minimumFare: p.minimumFare,
    bookingFee: p.bookingFee,
    cancellationFee: p.cancellationFee,
    commissionRate: p.commissionRate,
    surgeMultiplier,
    currency: p.currency,
  };
}

export async function findServiceArea(point: LatLng): Promise<ServiceArea | null> {
  const areas = await prisma.serviceArea.findMany({ where: { isActive: true } });
  const inside = areas.filter((a) => {
    const poly = a.polygon as LatLng[] | null;
    if (poly && Array.isArray(poly) && poly.length >= 3) return pointInPolygon(point, poly);
    return haversine(point, { lat: a.centerLat, lng: a.centerLng }) <= a.radiusKm * 1000;
  });
  inside.sort(
    (a, b) =>
      haversine(point, { lat: a.centerLat, lng: a.centerLng }) -
      haversine(point, { lat: b.centerLat, lng: b.centerLng }),
  );
  return inside[0] ?? null;
}

export async function requireServiceArea(
  point: LatLng,
  which: 'pickup' | 'dropoff' = 'pickup',
): Promise<ServiceArea> {
  const area = await findServiceArea(point);
  if (!area)
    throw unprocessable(`Sorry, we don't operate at this ${which} location yet`, 'OUTSIDE_SERVICE_AREA');
  return area;
}

/**
 * Dynamic surge: when enabled for a category/area, the multiplier follows the ratio of
 * open requests to idle drivers nearby, capped by the configured `surgeMultiplier`.
 */
export async function surgeFor(
  cfg: PricingConfiguration,
  area: ServiceArea,
  categoryCode: string,
): Promise<number> {
  if (!cfg.surgeEnabled || cfg.surgeMultiplier <= 1) return 1;
  const [demand, supply] = await Promise.all([
    prisma.ride.count({
      where: {
        serviceAreaId: area.id,
        status: 'SEARCHING',
        category: { code: categoryCode },
        createdAt: { gt: new Date(Date.now() - 15 * 60_000) },
      },
    }),
    driverLocations
      .findNearby(area.centerLat, area.centerLng, area.radiusKm, categoryCode, 200)
      .then((d) => d.length),
  ]);
  const ratio = (demand + 1) / Math.max(1, supply);
  const dynamic = ratio <= 1 ? 1 : 1 + (ratio - 1) * 0.25;
  return Math.round(Math.min(cfg.surgeMultiplier, Math.max(1, dynamic)) * 10) / 10 || 1;
}

export interface CouponCheck {
  coupon: Coupon | null;
  valid: boolean;
  message?: string;
}

export async function checkCoupon(code: string | undefined, userId: string | null): Promise<CouponCheck> {
  if (!code) return { coupon: null, valid: false };
  const coupon = await prisma.coupon.findFirst({ where: { code: code.toUpperCase(), deletedAt: null } });
  const now = new Date();
  if (!coupon || !coupon.isActive)
    return { coupon: null, valid: false, message: 'This promo code is not valid' };
  if (coupon.startsAt > now || (coupon.endsAt && coupon.endsAt < now))
    return { coupon: null, valid: false, message: 'This promo code has expired' };
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit)
    return { coupon: null, valid: false, message: 'This promo code has reached its usage limit' };
  if (userId) {
    const used = await prisma.couponRedemption.count({ where: { couponId: coupon.id, userId } });
    if (used >= coupon.perUserLimit)
      return { coupon: null, valid: false, message: 'You have already used this promo code' };
  }
  return { coupon, valid: true };
}

export function couponAmount(coupon: Coupon | null, fare: number) {
  if (!coupon) return 0;
  return couponDiscount(
    { type: coupon.type, value: coupon.value, maxDiscount: coupon.maxDiscount, minFare: coupon.minFare },
    fare,
  );
}

export async function estimateEtaToPickup(point: LatLng, categoryCode: string) {
  const settings = await getSettings();
  const near = await driverLocations.findNearby(
    point.lat,
    point.lng,
    settings.dispatchRadiusKm,
    categoryCode,
    10,
  );
  const etaSeconds = near.length ? Math.round(((near[0].distanceM * 1.3) / 1000 / 25) * 3600) + 60 : null;
  return { etaSeconds, nearbyDrivers: near.length };
}

export { calculateFare };
