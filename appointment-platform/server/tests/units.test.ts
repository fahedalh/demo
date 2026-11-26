import { describe, expect, it } from 'vitest';
import { renderTemplate, DEFAULT_TEMPLATES } from '../src/services/notification.templates';
import { withLocks } from '../src/services/bookingLock';
import { heuristicProvider } from '../src/integrations/ai/heuristic.provider';
import { noShowRisk } from '../src/integrations/ai';
import { toMinor } from '../src/integrations/payments/stripe.provider';
import { slugify, bookingReference } from '../src/utils/crypto';
import { NOTIFICATION_EVENTS } from '@bookly/shared';

describe('notification templates', () => {
  it('renders placeholders and drops unknown ones', () => {
    expect(renderTemplate('Hi {{customerName}}, ref {{reference}} {{missing}}', { customerName: 'Sara', reference: 'BK-1' })).toBe('Hi Sara, ref BK-1');
  });
  it('has EN and AR defaults for every event', () => {
    for (const e of NOTIFICATION_EVENTS) {
      expect(DEFAULT_TEMPLATES[e].en.body.length).toBeGreaterThan(10);
      expect(DEFAULT_TEMPLATES[e].ar.body.length).toBeGreaterThan(10);
    }
  });
});

describe('booking locks (in-process fallback)', () => {
  it('serialises critical sections on the same key', async () => {
    const order: string[] = [];
    const task = (name: string, ms: number) =>
      withLocks(['staff:1'], async () => {
        order.push(`${name}:start`);
        await new Promise((r) => setTimeout(r, ms));
        order.push(`${name}:end`);
      });
    await Promise.all([task('a', 30), task('b', 1)]);
    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
  });
  it('simulated race: only one of two concurrent bookings for a slot succeeds', async () => {
    const taken = new Set<string>();
    const book = () =>
      withLocks(['staff:9'], async () => {
        await new Promise((r) => setTimeout(r, 5)); // availability check happens here
        if (taken.has('10:00')) throw new Error('SLOT_UNAVAILABLE');
        taken.add('10:00');
        return 'ok';
      });
    const results = await Promise.allSettled([book(), book()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
});

describe('AI heuristics', () => {
  const cats = ['healthcare', 'beauty', 'education', 'professional', 'automotive', 'hospitality', 'government'];
  it('parses a natural language query', async () => {
    const i = await heuristicProvider.parseSearch('haircut tomorrow evening in Dubai under 200', '2030-01-06', cats);
    expect(i).toMatchObject({ category: 'beauty', city: 'Dubai', maxPrice: 200, date: '2030-01-07', partOfDay: 'evening' });
  });
  it('parses Arabic keywords', async () => {
    const i = await heuristicProvider.parseSearch('طبيب اليوم', '2030-01-06', cats);
    expect(i).toMatchObject({ category: 'healthcare', date: '2030-01-06' });
  });
  it('scores no-show risk', () => {
    expect(noShowRisk({ bookings: 4, noShows: 2, cancelled: 1, leadHours: 400, paid: false, isNew: false }).level).toBe('high');
    expect(noShowRisk({ bookings: 10, noShows: 0, cancelled: 0, leadHours: 24, paid: true, isNew: false }).level).toBe('low');
  });
});

describe('utils', () => {
  it('converts to minor units per currency', () => {
    expect(toMinor(12.5, 'USD')).toBe(1250);
    expect(toMinor(12.5, 'KWD')).toBe(12500);
    expect(toMinor(1000, 'JPY')).toBe(1000);
  });
  it('slugifies and generates references', () => {
    expect(slugify('Lumière Hair & Beauty')).toBe('lumiere-hair-beauty');
    expect(bookingReference()).toMatch(/^BK-[A-Z2-9]{6}$/);
  });
});
