/**
 * Fare calculation. All money values are integers in minor units (fils/cents)
 * to avoid floating point drift. Rates (surge, commission) are plain numbers.
 */
export interface PricingRule {
  baseFare: number;
  perKm: number;
  perMinute: number;
  minimumFare: number;
  bookingFee: number;
  cancellationFee: number;
  commissionRate: number; // 0..1
  surgeMultiplier: number; // >= 1
  currency: string;
}

export interface FareInput {
  distanceMeters: number;
  durationSeconds: number;
  surgeMultiplier?: number;
}

export interface FareBreakdown {
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  bookingFee: number;
  surgeMultiplier: number;
  surgeAmount: number;
  subtotal: number;
  minimumFareApplied: boolean;
  discount: number;
  total: number;
  currency: string;
}

const round = (n: number) => Math.round(n);

export function calculateFare(rule: PricingRule, input: FareInput, discount = 0): FareBreakdown {
  const km = Math.max(0, input.distanceMeters) / 1000;
  const minutes = Math.max(0, input.durationSeconds) / 60;
  const surge = Math.max(1, input.surgeMultiplier ?? rule.surgeMultiplier ?? 1);

  const baseFare = rule.baseFare;
  const distanceFare = round(km * rule.perKm);
  const timeFare = round(minutes * rule.perMinute);
  const metered = baseFare + distanceFare + timeFare;
  const surgeAmount = round(metered * (surge - 1));
  let subtotal = metered + surgeAmount + rule.bookingFee;
  const minimumFareApplied = subtotal < rule.minimumFare;
  if (minimumFareApplied) subtotal = rule.minimumFare;

  const appliedDiscount = Math.min(Math.max(0, round(discount)), subtotal);
  return {
    baseFare,
    distanceFare,
    timeFare,
    bookingFee: rule.bookingFee,
    surgeMultiplier: surge,
    surgeAmount,
    subtotal,
    minimumFareApplied,
    discount: appliedDiscount,
    total: subtotal - appliedDiscount,
    currency: rule.currency,
  };
}

export interface CouponRule {
  type: 'PERCENT' | 'FIXED';
  value: number; // percent (0-100) or minor units
  maxDiscount?: number | null;
  minFare?: number | null;
}

/** Returns the discount in minor units a coupon gives on a fare (0 when not applicable). */
export function couponDiscount(coupon: CouponRule, fare: number): number {
  if (coupon.minFare && fare < coupon.minFare) return 0;
  let d = coupon.type === 'PERCENT' ? round((fare * coupon.value) / 100) : coupon.value;
  if (coupon.maxDiscount) d = Math.min(d, coupon.maxDiscount);
  return Math.max(0, Math.min(d, fare));
}

export interface EarningSplit {
  gross: number;
  commission: number;
  net: number;
}

/**
 * Driver/platform split. Commission is taken on the fare *before* passenger discounts:
 * promotions are funded by the platform, so drivers are not penalised by them.
 */
export function splitEarnings(grossBeforeDiscount: number, commissionRate: number): EarningSplit {
  const commission = round(grossBeforeDiscount * commissionRate);
  return { gross: grossBeforeDiscount, commission, net: grossBeforeDiscount - commission };
}
