import { describe, expect, it } from 'vitest';
import {
  assertTransition,
  calculateFare,
  canTransition,
  couponDiscount,
  createRideSchema,
  haversine,
  pointAlong,
  pointInPolygon,
  registerSchema,
  splitEarnings,
  type PricingRule,
} from './index';

const rule: PricingRule = {
  baseFare: 500,
  perKm: 200,
  perMinute: 50,
  minimumFare: 1200,
  bookingFee: 100,
  cancellationFee: 1000,
  commissionRate: 0.2,
  surgeMultiplier: 1,
  currency: 'AED',
};

describe('ride state machine', () => {
  it('allows the happy path with the right actors', () => {
    expect(canTransition('REQUESTED', 'SEARCHING', 'SYSTEM')).toBe(true);
    expect(canTransition('SEARCHING', 'ACCEPTED', 'DRIVER')).toBe(true);
    expect(canTransition('ACCEPTED', 'DRIVER_ARRIVING', 'DRIVER')).toBe(true);
    expect(canTransition('DRIVER_ARRIVING', 'ARRIVED', 'DRIVER')).toBe(true);
    expect(canTransition('ARRIVED', 'IN_PROGRESS', 'DRIVER')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'COMPLETED', 'DRIVER')).toBe(true);
    expect(canTransition('COMPLETED', 'PAYMENT_COMPLETED', 'SYSTEM')).toBe(true);
  });

  it('rejects illegal or unauthorised transitions', () => {
    expect(canTransition('SEARCHING', 'ACCEPTED', 'PASSENGER')).toBe(false);
    expect(canTransition('IN_PROGRESS', 'CANCELLED', 'PASSENGER')).toBe(false);
    expect(canTransition('REQUESTED', 'COMPLETED', 'ADMIN')).toBe(false);
    expect(canTransition('CANCELLED', 'SEARCHING', 'SYSTEM')).toBe(false);
    expect(() => assertTransition('COMPLETED', 'IN_PROGRESS', 'DRIVER')).toThrow(/cannot move/);
  });
});

describe('pricing', () => {
  it('computes metered fares', () => {
    const f = calculateFare(rule, { distanceMeters: 10_000, durationSeconds: 1200 });
    // 500 + 10*200 + 20*50 + 100 booking
    expect(f.total).toBe(3600);
    expect(f.minimumFareApplied).toBe(false);
  });

  it('applies the minimum fare and surge', () => {
    expect(calculateFare(rule, { distanceMeters: 500, durationSeconds: 60 }).total).toBe(1200);
    const surged = calculateFare(rule, {
      distanceMeters: 10_000,
      durationSeconds: 1200,
      surgeMultiplier: 1.5,
    });
    expect(surged.surgeAmount).toBe(1750);
    expect(surged.total).toBe(5350);
  });

  it('caps discounts at the fare', () => {
    expect(calculateFare(rule, { distanceMeters: 10_000, durationSeconds: 1200 }, 99_999).total).toBe(0);
  });

  it('computes coupon discounts', () => {
    expect(couponDiscount({ type: 'PERCENT', value: 20, maxDiscount: 500 }, 4000)).toBe(500);
    expect(couponDiscount({ type: 'PERCENT', value: 10 }, 4000)).toBe(400);
    expect(couponDiscount({ type: 'FIXED', value: 1000, minFare: 5000 }, 4000)).toBe(0);
    expect(couponDiscount({ type: 'FIXED', value: 1000 }, 600)).toBe(600);
  });

  it('splits driver earnings', () => {
    expect(splitEarnings(5000, 0.2)).toEqual({ gross: 5000, commission: 1000, net: 4000 });
  });
});

describe('geo', () => {
  const dxbMall = { lat: 25.1972, lng: 55.2744 };
  const marina = { lat: 25.0805, lng: 55.1403 };
  it('measures distance', () => {
    const d = haversine(dxbMall, marina);
    expect(d).toBeGreaterThan(18_000);
    expect(d).toBeLessThan(19_000);
  });
  it('interpolates along a path', () => {
    const path = [dxbMall, marina];
    const half = pointAlong(path, haversine(dxbMall, marina) / 2);
    expect(half.done).toBe(false);
    expect(half.point.lat).toBeCloseTo((dxbMall.lat + marina.lat) / 2, 2);
    expect(pointAlong(path, 1e9).done).toBe(true);
  });
  it('tests polygons', () => {
    const square = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 1, lng: 1 },
      { lat: 1, lng: 0 },
    ];
    expect(pointInPolygon({ lat: 0.5, lng: 0.5 }, square)).toBe(true);
    expect(pointInPolygon({ lat: 1.5, lng: 0.5 }, square)).toBe(false);
  });
});

describe('validation', () => {
  it('requires email or phone on registration', () => {
    expect(registerSchema.safeParse({ firstName: 'a', lastName: 'b', password: 'abcdefg1' }).success).toBe(
      false,
    );
    expect(
      registerSchema.safeParse({
        firstName: 'a',
        lastName: 'b',
        password: 'abcdefg1',
        phone: '+971501234567',
      }).success,
    ).toBe(true);
  });
  it('rejects scheduling in the past', () => {
    const base = {
      pickup: { address: 'a', lat: 25, lng: 55 },
      dropoff: { address: 'b', lat: 25.1, lng: 55.1 },
      categoryCode: 'ECONOMY',
      paymentType: 'CASH',
    };
    expect(createRideSchema.safeParse({ ...base, scheduledAt: new Date(Date.now() - 1000) }).success).toBe(
      false,
    );
    expect(createRideSchema.safeParse(base).success).toBe(true);
  });
});
