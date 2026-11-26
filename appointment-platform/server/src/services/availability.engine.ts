/**
 * Pure slot-generation engine. No I/O: every input is passed in, which makes it deterministic and
 * unit-testable, and lets the same code power the booking wizard, the dashboard and search.
 *
 * Model:
 *   working time = provider hours ∩ branch hours  ∪ "open" exceptions  − "closed" exceptions
 *   a candidate slot [s, s+duration] must lie inside working time, respect notice/advance windows,
 *   and its buffered footprint [s−bufferBefore, e+bufferAfter] must not overlap any busy footprint.
 *   Group services (capacity > 1) share a slot when the existing booking is for the same service
 *   at the same start time.
 */
import { DateTime } from 'luxon';
import { hmToMinutes, type WeeklySchedule } from '@bookly/shared';

export interface Interval {
  start: number; // epoch ms
  end: number; // epoch ms
}

export interface BusyBooking {
  start: Date | number;
  end: Date | number;
  bufferBefore?: number;
  bufferAfter?: number;
  serviceId?: string;
  attendees?: number;
}

export interface ProviderInput {
  id: string;
  schedule?: WeeklySchedule | null; // empty → follows branch hours
  closures?: Array<{ start: Date | number; end: Date | number }>;
  openings?: Array<{ start: Date | number; end: Date | number }>;
  busy: BusyBooking[];
}

export interface ResourceInput extends ProviderInput {
  capacity?: number;
}

export interface EngineInput {
  date: string; // YYYY-MM-DD in `timezone`
  timezone: string;
  now: Date;
  service: { id: string; duration: number; bufferBefore?: number; bufferAfter?: number; capacity?: number };
  attendees?: number;
  slotInterval: number;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  branchHours?: WeeklySchedule | null;
  closures?: Array<{ start: Date | number; end: Date | number }>; // business/branch scope
  openings?: Array<{ start: Date | number; end: Date | number }>;
  providers: ProviderInput[];
  /** When non-empty, at least one of these must be free for the slot. */
  resources?: ResourceInput[];
}

export interface Slot {
  start: string; // ISO UTC
  end: string;
  providers: string[];
  resources: string[];
  remaining: number; // seats left (capacity services); 1 for 1:1 services
}

const MIN = 60_000;
const ms = (d: Date | number) => (typeof d === 'number' ? d : d.getTime());

/** Working intervals of a weekly schedule on a given local date, as absolute epoch-ms intervals. */
export function scheduleIntervalsForDate(schedule: WeeklySchedule, date: string, timezone: string): Interval[] {
  const day = DateTime.fromISO(date, { zone: timezone }).startOf('day');
  if (!day.isValid) throw new Error(`Invalid date/timezone: ${date} ${timezone}`);
  const weekday = day.weekday % 7; // luxon: Mon=1..Sun=7 → Sun=0
  const entry = schedule.find((d) => d.day === weekday);
  if (!entry || !entry.enabled) return [];
  return entry.intervals
    .map((iv) => {
      const s = hmToMinutes(iv.start);
      const e = hmToMinutes(iv.end);
      return {
        start: day.set({ hour: Math.floor(s / 60), minute: s % 60 }).toMillis(),
        end: e >= 24 * 60 ? day.plus({ days: 1 }).toMillis() : day.set({ hour: Math.floor(e / 60), minute: e % 60 }).toMillis(),
      };
    })
    .filter((iv) => iv.end > iv.start)
    .sort((a, b) => a.start - b.start);
}

export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end);
    else out.push({ ...iv });
  }
  return out;
}

export function intersectIntervals(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  let i = 0;
  let j = 0;
  const A = mergeIntervals(a);
  const B = mergeIntervals(b);
  while (i < A.length && j < B.length) {
    const start = Math.max(A[i].start, B[j].start);
    const end = Math.min(A[i].end, B[j].end);
    if (end > start) out.push({ start, end });
    if (A[i].end < B[j].end) i++;
    else j++;
  }
  return out;
}

export function subtractIntervals(base: Interval[], remove: Interval[]): Interval[] {
  let result = mergeIntervals(base);
  for (const r of mergeIntervals(remove)) {
    const next: Interval[] = [];
    for (const iv of result) {
      if (r.end <= iv.start || r.start >= iv.end) {
        next.push(iv);
        continue;
      }
      if (r.start > iv.start) next.push({ start: iv.start, end: r.start });
      if (r.end < iv.end) next.push({ start: r.end, end: iv.end });
    }
    result = next;
  }
  return result;
}

const toIntervals = (list?: Array<{ start: Date | number; end: Date | number }>): Interval[] =>
  (list ?? []).map((x) => ({ start: ms(x.start), end: ms(x.end) }));

function workingTime(
  input: EngineInput,
  own: { schedule?: WeeklySchedule | null; closures?: ProviderInput['closures']; openings?: ProviderInput['openings'] },
): Interval[] {
  const branch = input.branchHours?.length ? scheduleIntervalsForDate(input.branchHours, input.date, input.timezone) : null;
  const mine = own.schedule?.length ? scheduleIntervalsForDate(own.schedule, input.date, input.timezone) : null;
  let base: Interval[];
  if (mine && branch) base = intersectIntervals(mine, branch);
  else base = mine ?? branch ?? [];
  base = mergeIntervals([...base, ...toIntervals(input.openings), ...toIntervals(own.openings)]);
  return subtractIntervals(base, [...toIntervals(input.closures), ...toIntervals(own.closures)]);
}

/**
 * Seats already taken at `start` by the same group service, or -1 if the slot is blocked by any
 * other overlapping booking.
 */
function occupancy(busy: BusyBooking[], fp: Interval, start: number, serviceId: string, groupable: boolean): number {
  let used = 0;
  for (const b of busy) {
    const bs = ms(b.start);
    const be = ms(b.end);
    const bfp = { start: bs - (b.bufferBefore ?? 0) * MIN, end: be + (b.bufferAfter ?? 0) * MIN };
    if (bfp.end <= fp.start || bfp.start >= fp.end) continue;
    if (groupable && b.serviceId === serviceId && bs === start) {
      used += b.attendees ?? 1;
      continue;
    }
    return -1;
  }
  return used;
}

function fits(iv: Interval[], s: number, e: number) {
  return iv.some((w) => s >= w.start && e <= w.end);
}

export function computeSlots(input: EngineInput): Slot[] {
  const { service } = input;
  const duration = service.duration * MIN;
  const bufBefore = (service.bufferBefore ?? 0) * MIN;
  const bufAfter = (service.bufferAfter ?? 0) * MIN;
  const capacity = Math.max(1, service.capacity ?? 1);
  const attendees = Math.max(1, input.attendees ?? 1);
  const groupable = capacity > 1;
  const step = Math.max(5, input.slotInterval) * MIN;
  const earliest = input.now.getTime() + input.minNoticeMinutes * MIN;
  const latest = DateTime.fromJSDate(input.now).setZone(input.timezone).plus({ days: input.maxAdvanceDays }).endOf('day').toMillis();
  if (attendees > capacity) return [];

  const resourceWindows = (input.resources ?? []).map((r) => ({ r, windows: workingTime(input, r) }));
  const slots = new Map<number, Slot>();

  for (const provider of input.providers) {
    const windows = workingTime(input, provider);
    for (const w of windows) {
      // Align candidate starts to the step grid measured from the window start.
      for (let s = w.start; s + duration <= w.end; s += step) {
        const e = s + duration;
        if (s < earliest || s > latest) continue;
        const fp = { start: s - bufBefore, end: e + bufAfter };
        const used = occupancy(provider.busy, fp, s, service.id, groupable);
        if (used < 0) continue;
        const remaining = capacity - used;
        if (remaining < attendees) continue;

        let freeResources: string[] = [];
        if (resourceWindows.length) {
          freeResources = resourceWindows
            .filter(({ r, windows: rw }) => fits(rw, s, e) && occupancy(r.busy, fp, s, service.id, groupable) >= 0)
            .map(({ r }) => r.id);
          if (!freeResources.length) continue;
        }

        const existing = slots.get(s);
        if (existing) {
          existing.providers.push(provider.id);
          existing.remaining = Math.max(existing.remaining, remaining);
          for (const id of freeResources) if (!existing.resources.includes(id)) existing.resources.push(id);
        } else {
          slots.set(s, {
            start: new Date(s).toISOString(),
            end: new Date(e).toISOString(),
            providers: [provider.id],
            resources: freeResources,
            remaining,
          });
        }
      }
    }
  }
  return [...slots.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
}

/** Local calendar date (YYYY-MM-DD) of an instant in a timezone. */
export function localDate(d: Date, timezone: string) {
  return DateTime.fromJSDate(d).setZone(timezone).toISODate()!;
}

/** UTC bounds of a local day (with ±1 day padding for buffers/timezone edges). */
export function dayBounds(date: string, timezone: string) {
  const start = DateTime.fromISO(date, { zone: timezone }).startOf('day');
  return { start: start.minus({ days: 1 }).toJSDate(), end: start.plus({ days: 2 }).toJSDate() };
}
