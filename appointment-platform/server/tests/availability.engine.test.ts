import { describe, expect, it } from 'vitest';
import { defaultWeeklySchedule, type WeeklySchedule } from '@bookly/shared';
import { computeSlots, intersectIntervals, scheduleIntervalsForDate, subtractIntervals, type EngineInput } from '../src/services/availability.engine';

const TZ = 'Asia/Riyadh'; // UTC+3, no DST
const DATE = '2030-01-06'; // a Sunday
const NOW = new Date('2030-01-01T00:00:00Z');
const at = (hm: string) => new Date(`${DATE}T${hm}:00+03:00`);

const nineToFive: WeeklySchedule = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, enabled: true, intervals: [{ start: '09:00', end: '17:00' }] }));

function base(over: Partial<EngineInput> = {}): EngineInput {
  return {
    date: DATE,
    timezone: TZ,
    now: NOW,
    service: { id: 'svc', duration: 60 },
    slotInterval: 60,
    minNoticeMinutes: 0,
    maxAdvanceDays: 60,
    branchHours: nineToFive,
    providers: [{ id: 'A', busy: [] }],
    ...over,
  };
}

describe('interval helpers', () => {
  it('intersects and subtracts', () => {
    expect(intersectIntervals([{ start: 0, end: 10 }], [{ start: 5, end: 20 }])).toEqual([{ start: 5, end: 10 }]);
    expect(subtractIntervals([{ start: 0, end: 10 }], [{ start: 3, end: 5 }])).toEqual([
      { start: 0, end: 3 },
      { start: 5, end: 10 },
    ]);
  });

  it('maps weekly schedule to local day in timezone', () => {
    const [iv] = scheduleIntervalsForDate(nineToFive, DATE, TZ);
    expect(new Date(iv.start).toISOString()).toBe('2030-01-06T06:00:00.000Z');
    expect(new Date(iv.end).toISOString()).toBe('2030-01-06T14:00:00.000Z');
  });

  it('respects disabled days (default schedule is Sun–Thu)', () => {
    const fridaySchedule = defaultWeeklySchedule();
    expect(scheduleIntervalsForDate(fridaySchedule, '2030-01-11', TZ)).toEqual([]);
    expect(scheduleIntervalsForDate(fridaySchedule, DATE, TZ)).toHaveLength(2); // break splits the day
  });
});

describe('computeSlots', () => {
  it('generates hourly slots inside working hours', () => {
    const slots = computeSlots(base());
    expect(slots).toHaveLength(8);
    expect(slots[0].start).toBe(at('09:00').toISOString());
    expect(slots.at(-1)!.end).toBe(at('17:00').toISOString());
  });

  it('removes slots overlapping existing bookings including buffers', () => {
    const slots = computeSlots(
      base({
        service: { id: 'svc', duration: 60, bufferAfter: 15 },
        slotInterval: 15,
        providers: [{ id: 'A', busy: [{ start: at('11:00'), end: at('12:00'), bufferAfter: 15 }] }],
      }),
    );
    const starts = slots.map((s) => s.start);
    expect(starts).not.toContain(at('10:00').toISOString()); // its after-buffer hits 11:00
    expect(starts).toContain(at('09:45').toISOString()); // ends 10:45 + 15 = 11:00 ok
    expect(starts).not.toContain(at('12:00').toISOString()); // existing after-buffer until 12:15
    expect(starts).toContain(at('12:15').toISOString());
  });

  it('intersects staff hours with branch hours and applies closures', () => {
    const staffHours: WeeklySchedule = [{ day: 0, enabled: true, intervals: [{ start: '07:00', end: '12:00' }] }];
    const slots = computeSlots(
      base({ providers: [{ id: 'A', schedule: staffHours, busy: [], closures: [{ start: at('10:00'), end: at('11:00') }] }] }),
    );
    expect(slots.map((s) => s.start)).toEqual([at('09:00').toISOString(), at('11:00').toISOString()]);
  });

  it('applies min notice and max advance windows', () => {
    expect(computeSlots(base({ now: at('12:30'), minNoticeMinutes: 60 })).map((s) => s.start)[0]).toBe(at('14:00').toISOString());
    expect(computeSlots(base({ maxAdvanceDays: 1 }))).toEqual([]);
  });

  it('merges providers and shares group capacity for the same service', () => {
    const group = base({
      service: { id: 'yoga', duration: 60, capacity: 3 },
      attendees: 2,
      providers: [{ id: 'A', busy: [{ start: at('09:00'), end: at('10:00'), serviceId: 'yoga', attendees: 1 }] }],
    });
    const first = computeSlots(group)[0];
    expect(first.start).toBe(at('09:00').toISOString());
    expect(first.remaining).toBe(2);
    const full = computeSlots({ ...group, attendees: 3 });
    expect(full[0].start).toBe(at('10:00').toISOString());

    const multi = computeSlots(base({ providers: [{ id: 'A', busy: [{ start: at('09:00'), end: at('10:00') }] }, { id: 'B', busy: [] }] }));
    expect(multi[0].providers).toEqual(['B']);
    expect(multi[1].providers).toEqual(['A', 'B']);
  });

  it('requires a free resource when resources are configured', () => {
    const slots = computeSlots(
      base({
        resources: [
          { id: 'room1', busy: [{ start: at('09:00'), end: at('11:00') }] },
          { id: 'room2', busy: [{ start: at('09:00'), end: at('10:00') }] },
        ],
      }),
    );
    expect(slots[0].start).toBe(at('10:00').toISOString());
    expect(slots[0].resources).toEqual(['room2']);
    expect(slots[1].resources).toEqual(['room1', 'room2']);
  });

  it('handles DST transitions (Europe/London spring forward)', () => {
    const slots = computeSlots(
      base({ date: '2030-03-31', timezone: 'Europe/London', now: new Date('2030-03-01T00:00:00Z') }),
    );
    expect(slots[0].start).toBe('2030-03-31T08:00:00.000Z'); // 09:00 BST
    expect(slots).toHaveLength(8);
  });
});
