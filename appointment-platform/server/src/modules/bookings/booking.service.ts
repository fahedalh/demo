import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import {
  ACTIVE_BOOKING_STATUSES,
  BOOKING_TRANSITIONS,
  type BookingStatus,
  type CustomField,
  type NotificationEvent,
  type WeeklySchedule,
} from '@bookly/shared';
import { computeSlots, dayBounds, localDate, type Slot } from '../../services/availability.engine';
import { withLocks } from '../../services/bookingLock';
import { notifyBooking } from '../../services/notification.service';
import { assertLimit } from '../../services/planLimits';
import { AppError } from '../../utils/AppError';
import { bookingReference } from '../../utils/crypto';
import { AvailabilityException } from '../availability/exception.model';
import { Branch } from '../branches/branch.model';
import type { BusinessDoc } from '../businesses/business.model';
import { Category } from '../categories/category.model';
import { Customer } from '../customers/customer.model';
import { Resource } from '../resources/resource.model';
import { Service, type ServiceDoc } from '../services/service.model';
import { Staff } from '../staff/staff.model';
import { channels } from '../../integrations/messaging';
import { env } from '../../config/env';
import { Booking, type BookingDoc } from './booking.model';
import { WaitlistEntry } from './waitlist.model';

export interface Actor {
  userId?: string;
  name?: string;
  kind: 'customer' | 'business' | 'system';
}

type Lean<T> = T & { _id: Types.ObjectId };

interface AvailabilityQuery {
  business: BusinessDoc;
  serviceId: string;
  date: string;
  staffId?: string;
  branchId?: string;
  attendees?: number;
  excludeBookingId?: string;
  /** Dashboard bookings ignore min-notice/max-advance rules. */
  ignoreWindows?: boolean;
}

export interface SlotWithStaff extends Slot {
  staff: Array<{ _id: string; name: string }>;
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

async function loadService(business: BusinessDoc, serviceId: string) {
  if (!Types.ObjectId.isValid(serviceId)) throw AppError.notFound('Service');
  const service = await Service.findOne({ _id: serviceId, business: business._id, isActive: true });
  if (!service) throw AppError.notFound('Service');
  return service;
}

async function resolveBranch(business: BusinessDoc, service: ServiceDoc, branchId?: string) {
  const filter: Record<string, unknown> = { business: business._id, isActive: true };
  if (branchId) filter._id = branchId;
  else if (service.branches?.length) filter._id = { $in: service.branches };
  const branch = await Branch.findOne(filter).sort({ createdAt: 1 }).lean();
  if (branchId && !branch) throw AppError.notFound('Branch');
  if (branch && service.branches?.length && !service.branches.some((b) => String(b) === String(branch._id))) {
    throw AppError.badRequest('This service is not offered at the selected branch');
  }
  return branch;
}

/** Eligible staff for a service at a branch. Empty service.staff → the service does not use staff. */
async function eligibleStaff(business: BusinessDoc, service: ServiceDoc, branchId: unknown, staffId?: string) {
  if (!service.staff?.length) {
    if (staffId) throw AppError.badRequest('This service is not assigned to staff');
    return [];
  }
  const filter: Record<string, unknown> = { business: business._id, isActive: true, acceptsBookings: true, _id: { $in: service.staff } };
  const staff = await Staff.find(filter).lean();
  const atBranch = staff.filter((s) => !branchId || !s.branches?.length || s.branches.some((b) => String(b) === String(branchId)));
  if (staffId) {
    const one = atBranch.find((s) => String(s._id) === staffId);
    if (!one) throw AppError.badRequest('The selected provider does not offer this service here');
    return [one];
  }
  return atBranch;
}

export async function computeAvailability(q: AvailabilityQuery): Promise<{ slots: SlotWithStaff[]; timezone: string; service: ServiceDoc }> {
  if (!isoDate.test(q.date)) throw AppError.badRequest('date must be YYYY-MM-DD');
  const { business } = q;
  const service = await loadService(business, q.serviceId);
  const branch = await resolveBranch(business, service, q.branchId);
  const timezone = branch?.timezone || business.timezone;
  const staff = await eligibleStaff(business, service, branch?._id, q.staffId);
  if (service.staff?.length && !staff.length) return { slots: [], timezone, service };
  const resources = service.resources?.length
    ? await Resource.find({ business: business._id, isActive: true, _id: { $in: service.resources }, ...(branch ? { $or: [{ branch: branch._id }, { branch: null }] } : {}) }).lean()
    : [];
  if (service.resources?.length && !resources.length) return { slots: [], timezone, service };

  const { start, end } = dayBounds(q.date, timezone);
  const staffIds = staff.map((s) => s._id);
  const resourceIds = resources.map((r) => r._id);

  const bookingFilter: Record<string, unknown> = {
    business: business._id,
    status: { $in: ACTIVE_BOOKING_STATUSES },
    start: { $lt: end },
    end: { $gt: start },
    $or: [
      ...(staffIds.length ? [{ staff: { $in: staffIds } }] : []),
      ...(resourceIds.length ? [{ resource: { $in: resourceIds } }] : []),
      ...(!staffIds.length ? [{ service: service._id, staff: null }] : []),
    ],
  };
  if (q.excludeBookingId) bookingFilter._id = { $ne: new Types.ObjectId(q.excludeBookingId) };
  const [busy, exceptions] = await Promise.all([
    Booking.find(bookingFilter, { staff: 1, resource: 1, service: 1, start: 1, end: 1, attendees: 1 }).lean(),
    AvailabilityException.find({ business: business._id, start: { $lt: end }, end: { $gt: start } }).lean(),
  ]);
  const busyServices = await Service.find({ _id: { $in: [...new Set(busy.map((b) => String(b.service)))] } }, { bufferBefore: 1, bufferAfter: 1 }).lean();
  const buf = new Map(busyServices.map((s) => [String(s._id), s]));
  const toBusy = (b: (typeof busy)[number]) => ({
    start: b.start,
    end: b.end,
    serviceId: String(b.service),
    attendees: b.attendees,
    bufferBefore: buf.get(String(b.service))?.bufferBefore ?? 0,
    bufferAfter: buf.get(String(b.service))?.bufferAfter ?? 0,
  });
  const exc = (scope: string, ref?: unknown, kind = 'closed') =>
    exceptions.filter((e) => e.scope === scope && e.kind === kind && (ref === undefined || String(e.ref) === String(ref))).map((e) => ({ start: e.start, end: e.end }));

  const branchHours = (branch?.workingHours?.length ? branch.workingHours : null) as WeeklySchedule | null;
  const providers = staff.length
    ? staff.map((s) => ({
        id: String(s._id),
        schedule: s.workingHours as WeeklySchedule,
        closures: exc('staff', s._id),
        openings: exc('staff', s._id, 'open'),
        busy: busy.filter((b) => String(b.staff) === String(s._id)).map(toBusy),
      }))
    : [{ id: 'service', schedule: null, busy: busy.filter((b) => !b.staff && String(b.service) === String(service._id)).map(toBusy) }];

  const slots = computeSlots({
    date: q.date,
    timezone,
    now: new Date(),
    service: { id: String(service._id), duration: service.duration, bufferBefore: service.bufferBefore, bufferAfter: service.bufferAfter, capacity: service.capacity },
    attendees: q.attendees,
    slotInterval: business.settings?.slotInterval ?? 15,
    minNoticeMinutes: q.ignoreWindows ? -24 * 60 * 365 : (business.settings?.minNoticeMinutes ?? 0),
    maxAdvanceDays: q.ignoreWindows ? 730 : (business.settings?.maxAdvanceDays ?? 60),
    branchHours,
    closures: [...exc('business'), ...(branch ? exc('branch', branch._id) : [])],
    openings: [...exc('business', undefined, 'open'), ...(branch ? exc('branch', branch._id, 'open') : [])],
    providers,
    resources: resources.map((r) => ({
      id: String(r._id),
      schedule: r.workingHours as WeeklySchedule,
      closures: exc('resource', r._id),
      busy: busy.filter((b) => String(b.resource) === String(r._id)).map(toBusy),
    })),
  });
  const names = new Map(staff.map((s) => [String(s._id), s.name]));
  return {
    timezone,
    service,
    slots: slots.map((s) => ({ ...s, staff: s.providers.filter((p) => names.has(p)).map((p) => ({ _id: p, name: names.get(p)! })) })),
  };
}

/** Number of available slots per day for a date range (calendar dots / "next available"). */
export async function availabilityByDay(q: Omit<AvailabilityQuery, 'date'> & { from: string; days: number }) {
  const out: Array<{ date: string; slots: number }> = [];
  let d = DateTime.fromISO(q.from);
  for (let i = 0; i < Math.min(q.days, 42); i++, d = d.plus({ days: 1 })) {
    const date = d.toISODate()!;
    const { slots } = await computeAvailability({ ...q, date });
    out.push({ date, slots: slots.length });
  }
  return out;
}

function validateAnswers(fields: CustomField[], answers: Record<string, unknown>) {
  const errors: Record<string, string[]> = {};
  const clean: Record<string, unknown> = {};
  for (const f of fields) {
    const v = answers?.[f.key];
    const empty = v === undefined || v === null || v === '' || (f.type === 'checkbox' && v !== true);
    if (f.required && empty) errors[`answers.${f.key}`] = ['Required'];
    if (empty) continue;
    if (f.type === 'number' && Number.isNaN(Number(v))) errors[`answers.${f.key}`] = ['Must be a number'];
    else if (f.type === 'select' && f.options?.length && !f.options.includes(String(v))) errors[`answers.${f.key}`] = ['Choose one of the options'];
    else if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v))) errors[`answers.${f.key}`] = ['Invalid email'];
    clean[f.key] = f.type === 'number' ? Number(v) : f.type === 'checkbox' ? true : String(v).slice(0, 1000);
  }
  if (Object.keys(errors).length) throw new AppError(422, 'VALIDATION_ERROR', 'Please answer the required questions', { fields: errors });
  return clean;
}

function depositFor(business: BusinessDoc, service: ServiceDoc, amount: number) {
  const mode = business.settings?.payment?.mode ?? 'none';
  if (mode === 'full') return amount;
  if (mode === 'deposit') {
    const pct = service.depositPercent ?? business.settings?.payment?.depositPercent ?? 0;
    return Math.round(amount * pct) / 100;
  }
  return 0;
}

export interface CreateBookingInput {
  service: string;
  start: string; // ISO
  staff?: string;
  branch?: string;
  attendees?: number;
  mode?: 'in_person' | 'online';
  customer: { name: string; email: string; phone?: string };
  answers?: Record<string, unknown>;
  note?: string;
  paymentMethod?: 'online' | 'cash';
  recurrence?: { frequency: 'weekly' | 'biweekly' | 'monthly'; count: number };
  source?: 'web' | 'dashboard' | 'staff' | 'ai';
}

async function upsertCustomer(business: BusinessDoc, c: CreateBookingInput['customer'], userId?: string) {
  const email = c.email.toLowerCase().trim();
  const customer = await Customer.findOneAndUpdate(
    { business: business._id, email },
    { $setOnInsert: { business: business._id, email }, $set: { name: c.name, ...(c.phone ? { phone: c.phone } : {}), ...(userId ? { user: userId } : {}) } },
    { upsert: true, new: true },
  );
  return customer!;
}

const slotKeyFor = (service: ServiceDoc, staff: unknown, resource: unknown, start: Date) =>
  (service.capacity ?? 1) > 1 ? undefined : `${staff ? `st:${staff}` : resource ? `rs:${resource}` : `sv:${service._id}`}|${start.toISOString()}`;

/** Creates a single occurrence under lock, re-validating the slot server-side. */
async function createOne(business: BusinessDoc, input: CreateBookingInput, actor: Actor, start: Date, recurrence?: { groupId: string; index: number; rule: string }) {
  const service = await loadService(business, input.service);
  const branch = await resolveBranch(business, service, input.branch);
  const timezone = branch?.timezone || business.timezone;
  const date = localDate(start, timezone);
  const candidates = await eligibleStaff(business, service, branch?._id, input.staff);
  const lockKeys = candidates.length ? candidates.map((s) => `staff:${s._id}`) : [`service:${service._id}`];
  if (service.resources?.length) lockKeys.push(...service.resources.map((r) => `resource:${r}`));

  return withLocks(lockKeys, async () => {
    const { slots } = await computeAvailability({
      business,
      serviceId: input.service,
      date,
      staffId: input.staff,
      branchId: branch ? String(branch._id) : undefined,
      attendees: input.attendees,
      ignoreWindows: actor.kind === 'business',
    });
    const slot = slots.find((s) => s.start === start.toISOString());
    if (!slot) throw AppError.conflict('This time is no longer available. Please pick another slot.', 'SLOT_UNAVAILABLE');

    // Auto-assign: least busy provider that day keeps workloads balanced.
    let staffId: string | undefined = input.staff;
    if (!staffId && slot.staff.length) {
      const day = dayBounds(date, timezone);
      const counts = await Booking.aggregate([
        { $match: { business: business._id, staff: { $in: slot.staff.map((s) => new Types.ObjectId(s._id)) }, status: { $in: ACTIVE_BOOKING_STATUSES }, start: { $gte: day.start, $lt: day.end } } },
        { $group: { _id: '$staff', n: { $sum: 1 } } },
      ]);
      staffId = [...slot.staff].sort((a, b) => (counts.find((c) => String(c._id) === a._id)?.n ?? 0) - (counts.find((c) => String(c._id) === b._id)?.n ?? 0))[0]._id;
    }
    const resourceId = slot.resources[0];
    const staffDoc = staffId ? candidates.find((s) => String(s._id) === staffId) : undefined;

    const category = await Category.findById(business.category).lean();
    const fields = [...((category?.bookingFlow?.customFields ?? []) as CustomField[]), ...((service.customFields ?? []) as CustomField[])];
    const answers = validateAnswers(fields, input.answers ?? {});

    const customer = await upsertCustomer(business, input.customer, actor.kind === 'customer' ? actor.userId : undefined);
    const attendees = Math.max(1, input.attendees ?? 1);
    const amount = Math.round(service.price * attendees * 100) / 100;
    const deposit = depositFor(business, service, amount);
    const needsApproval = service.requiresApproval ?? business.settings?.requireApproval ?? false;
    const status: BookingStatus = actor.kind === 'business' ? 'confirmed' : needsApproval ? 'pending' : 'confirmed';
    const end = new Date(start.getTime() + service.duration * 60_000);
    const mode = input.mode && service.sessionModes?.includes(input.mode) ? input.mode : (service.sessionModes?.[0] ?? 'in_person');

    const booking = await Booking.create({
      business: business._id,
      branch: branch?._id,
      service: service._id,
      staff: staffId,
      resource: resourceId,
      customer: customer._id,
      user: actor.kind === 'customer' ? actor.userId : customer.user,
      reference: bookingReference(),
      start,
      end,
      timezone,
      attendees,
      status,
      mode,
      source: input.source ?? (actor.kind === 'business' ? 'dashboard' : 'web'),
      answers,
      customerNote: input.note,
      snapshot: { serviceName: service.name, staffName: staffDoc?.name, customerName: customer.name, customerEmail: customer.email, customerPhone: customer.phone, duration: service.duration },
      price: { amount, currency: business.currency, deposit, paid: 0, status: amount === 0 ? 'paid' : 'unpaid', method: input.paymentMethod ?? (amount === 0 ? 'none' : 'cash') },
      recurrence,
      slotKey: slotKeyFor(service, staffId, resourceId, start),
      history: [{ action: 'created', by: actor.userId, byName: actor.name, to: status }],
    }).catch((e: { code?: number }) => {
      if (e?.code === 11000) throw AppError.conflict('This time was just booked by someone else. Please pick another slot.', 'SLOT_UNAVAILABLE');
      throw e;
    });
    await Customer.updateOne({ _id: customer._id }, { $inc: { 'stats.bookings': 1 } });
    return booking;
  });
}

function addRecurrence(start: Date, frequency: 'weekly' | 'biweekly' | 'monthly', i: number, timezone: string) {
  const d = DateTime.fromJSDate(start).setZone(timezone);
  const next = frequency === 'weekly' ? d.plus({ weeks: i }) : frequency === 'biweekly' ? d.plus({ weeks: 2 * i }) : d.plus({ months: i });
  return next.toJSDate();
}

export async function createBooking(business: BusinessDoc, input: CreateBookingInput, actor: Actor) {
  if (business.status !== 'active') throw AppError.forbidden('This business is not accepting bookings right now');
  const start = new Date(input.start);
  if (Number.isNaN(start.getTime())) throw AppError.badRequest('Invalid start time');
  await assertLimit(business._id, 'bookingsPerMonth');

  if (!input.recurrence || input.recurrence.count <= 1) {
    const booking = await createOne(business, input, actor, start);
    void notifyBooking(booking.status === 'pending' ? 'booking.received' : 'booking.confirmed', booking);
    return { bookings: [booking], skipped: [] as string[] };
  }

  const groupId = new Types.ObjectId().toString();
  const rule = `${input.recurrence.frequency}x${input.recurrence.count}`;
  const bookings: BookingDoc[] = [];
  const skipped: string[] = [];
  for (let i = 0; i < Math.min(input.recurrence.count, 12); i++) {
    const s = addRecurrence(start, input.recurrence.frequency, i, business.timezone);
    try {
      bookings.push(await createOne(business, input, actor, s, { groupId, index: i, rule }));
    } catch (e) {
      if (i === 0) throw e; // the first occurrence must succeed
      skipped.push(s.toISOString());
    }
  }
  void notifyBooking(bookings[0].status === 'pending' ? 'booking.received' : 'booking.confirmed', bookings[0]);
  return { bookings, skipped };
}

async function notifyWaitlist(booking: BookingDoc) {
  const date = localDate(booking.start, booking.timezone);
  const entries = await WaitlistEntry.find({ business: booking.business, service: booking.service, date, status: 'waiting' }).limit(5);
  for (const e of entries) {
    await channels.email.send(e.email, {
      subject: 'A slot just opened up',
      text: `Good news ${e.name}! A slot for ${booking.snapshot?.serviceName} opened on ${date}. Book it now: ${env.APP_URL}`,
    });
    e.status = 'notified';
    e.notifiedAt = new Date();
    await e.save();
  }
}

const EVENTS: Partial<Record<BookingStatus, NotificationEvent>> = {
  confirmed: 'booking.confirmed',
  rejected: 'booking.rejected',
  cancelled: 'booking.cancelled',
};

export async function changeStatus(booking: BookingDoc, to: BookingStatus, actor: Actor, reason?: string, opts: { fee?: number } = {}) {
  const from = booking.status as BookingStatus;
  if (from === to) return booking;
  if (!BOOKING_TRANSITIONS[from].includes(to)) throw AppError.badRequest(`A ${from.replace('_', ' ')} booking cannot be marked ${to.replace('_', ' ')}`);
  if ((to === 'completed' || to === 'no_show') && booking.start > new Date()) {
    throw AppError.badRequest('You can only complete or mark no-show after the appointment has started');
  }
  booking.status = to;
  booking.history.push({ action: 'status', by: actor.userId ? new Types.ObjectId(actor.userId) : undefined, byName: actor.name, from, to, note: reason, at: new Date() });
  if (to === 'cancelled' || to === 'rejected') {
    booking.slotKey = undefined;
    if (to === 'cancelled') booking.cancellation = { by: actor.kind, reason, at: new Date(), fee: opts.fee ?? 0 };
  }
  await booking.save();

  const inc: Record<string, number> = {};
  if (to === 'completed') {
    inc['stats.completed'] = 1;
    inc['stats.totalSpent'] = booking.price?.amount ?? 0;
  }
  if (to === 'no_show') inc['stats.noShows'] = 1;
  if (to === 'cancelled') inc['stats.cancelled'] = 1;
  if (Object.keys(inc).length) {
    await Customer.updateOne({ _id: booking.customer }, { $inc: inc, ...(to === 'completed' ? { $set: { 'stats.lastVisitAt': booking.start } } : {}) });
  }
  const event = EVENTS[to];
  if (event) void notifyBooking(event, booking, { reason: reason ? `Reason: ${reason}` : '' });
  if (to === 'cancelled' || to === 'rejected') void notifyWaitlist(booking).catch(() => undefined);
  return booking;
}

function hoursUntil(d: Date) {
  return (d.getTime() - Date.now()) / 3_600_000;
}

/** Customer-initiated cancellation honouring the business cancellation policy. */
export async function cancelByCustomer(business: BusinessDoc, booking: BookingDoc, actor: Actor, reason?: string) {
  const policy = business.settings?.cancellation;
  if (!['pending', 'confirmed'].includes(booking.status)) throw AppError.badRequest('This booking can no longer be cancelled');
  if (policy?.allowed === false) throw AppError.forbidden('Online cancellation is disabled. Please contact the business.');
  const late = hoursUntil(booking.start) < (policy?.cutoffHours ?? 0);
  if (late && booking.status === 'confirmed' && !(policy?.feePercent ?? 0)) {
    throw AppError.forbidden(`Bookings can be cancelled up to ${policy?.cutoffHours} hours before the appointment.`);
  }
  const fee = late ? Math.round((booking.price?.amount ?? 0) * (policy?.feePercent ?? 0)) / 100 : 0;
  return changeStatus(booking, 'cancelled', actor, reason, { fee });
}

export async function reschedule(business: BusinessDoc, booking: BookingDoc, newStart: string, actor: Actor, staffId?: string) {
  if (!['pending', 'confirmed'].includes(booking.status)) throw AppError.badRequest('Only upcoming bookings can be rescheduled');
  if (actor.kind === 'customer') {
    const policy = business.settings?.reschedule;
    if (policy?.allowed === false) throw AppError.forbidden('Online rescheduling is disabled. Please contact the business.');
    if (hoursUntil(booking.start) < (policy?.cutoffHours ?? 0)) throw AppError.forbidden(`Bookings can be rescheduled up to ${policy?.cutoffHours} hours before the appointment.`);
    if (booking.rescheduleCount >= (policy?.maxTimes ?? 99)) throw AppError.forbidden('This booking has reached the maximum number of reschedules.');
  }
  const start = new Date(newStart);
  if (Number.isNaN(start.getTime())) throw AppError.badRequest('Invalid start time');
  const service = await loadService(business, String(booking.service));
  const targetStaff = staffId ?? (booking.staff ? String(booking.staff) : undefined);
  const keys = [targetStaff ? `staff:${targetStaff}` : `service:${service._id}`, ...(booking.resource ? [`resource:${booking.resource}`] : [])];

  const updated = await withLocks(keys, async () => {
    const { slots } = await computeAvailability({
      business,
      serviceId: String(service._id),
      date: localDate(start, booking.timezone),
      staffId: targetStaff,
      branchId: booking.branch ? String(booking.branch) : undefined,
      attendees: booking.attendees,
      excludeBookingId: String(booking._id),
      ignoreWindows: actor.kind === 'business',
    });
    const slot = slots.find((s) => s.start === start.toISOString());
    if (!slot) throw AppError.conflict('That time is not available', 'SLOT_UNAVAILABLE');
    const resource = booking.resource && slot.resources.includes(String(booking.resource)) ? booking.resource : slot.resources[0];
    const from = booking.start.toISOString();
    booking.start = start;
    booking.end = new Date(start.getTime() + service.duration * 60_000);
    if (targetStaff && targetStaff !== String(booking.staff)) {
      booking.staff = new Types.ObjectId(targetStaff);
      booking.snapshot!.staffName = slot.staff.find((s) => s._id === targetStaff)?.name;
    }
    booking.resource = resource ? new Types.ObjectId(String(resource)) : undefined;
    booking.slotKey = slotKeyFor(service, booking.staff, booking.resource, start);
    booking.rescheduleCount += 1;
    booking.reminderSentAt = undefined;
    booking.history.push({ action: 'rescheduled', by: actor.userId ? new Types.ObjectId(actor.userId) : undefined, byName: actor.name, from, to: start.toISOString(), at: new Date() });
    await booking.save().catch((e: { code?: number }) => {
      if (e?.code === 11000) throw AppError.conflict('That time was just taken', 'SLOT_UNAVAILABLE');
      throw e;
    });
    return booking;
  });
  void notifyBooking('booking.rescheduled', updated);
  return updated;
}

/** Populated booking for API responses. */
export function populateBooking<T>(q: T) {
  return (q as unknown as { populate: (p: unknown) => T }).populate([
    { path: 'service', select: 'name duration price color sessionModes' },
    { path: 'staff', select: 'name title avatar color' },
    { path: 'branch', select: 'name address phone' },
    { path: 'resource', select: 'name type' },
    { path: 'customer', select: 'name email phone stats tags' },
    { path: 'business', select: 'name slug logo timezone currency contact address settings.cancellation settings.reschedule branding' },
  ]);
}

export type { Lean };
