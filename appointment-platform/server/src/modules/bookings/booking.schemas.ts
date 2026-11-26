import { z } from 'zod';
import { BOOKING_STATUSES } from '@bookly/shared';
import { objectId } from '../../utils/objectId';

export const availabilityQuery = z.object({
  service: objectId,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  staff: objectId.optional(),
  branch: objectId.optional(),
  attendees: z.coerce.number().int().min(1).max(1000).optional(),
  exclude: objectId.optional(),
});

export const availabilityDaysQuery = z.object({
  service: objectId,
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.coerce.number().int().min(1).max(42).default(14),
  staff: objectId.optional(),
  branch: objectId.optional(),
  attendees: z.coerce.number().int().min(1).max(1000).optional(),
});

export const createBookingBody = z.object({
  service: objectId,
  start: z.string().datetime({ offset: true }),
  staff: objectId.optional(),
  branch: objectId.optional(),
  attendees: z.number().int().min(1).max(1000).optional(),
  mode: z.enum(['in_person', 'online']).optional(),
  customer: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email(),
    phone: z.string().trim().max(30).optional().or(z.literal('')),
  }),
  answers: z.record(z.union([z.string().max(1000), z.number(), z.boolean()])).optional(),
  note: z.string().trim().max(1000).optional(),
  paymentMethod: z.enum(['online', 'cash']).optional(),
  recurrence: z.object({ frequency: z.enum(['weekly', 'biweekly', 'monthly']), count: z.number().int().min(1).max(12) }).optional(),
});

export const listBookingsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(25),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  status: z.string().optional(), // comma separated
  staff: objectId.optional(),
  branch: objectId.optional(),
  service: objectId.optional(),
  customer: objectId.optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(['start', '-start', '-createdAt']).default('start'),
});

export const statusBody = z.object({ status: z.enum(BOOKING_STATUSES), reason: z.string().trim().max(500).optional() });
export const rescheduleBody = z.object({ start: z.string().datetime({ offset: true }), staff: objectId.optional() });
export const cancelBody = z.object({ reason: z.string().trim().max(500).optional() });
export const trackQuery = z.object({ reference: z.string().trim().toUpperCase().regex(/^BK-[A-Z0-9]{6}$/, 'Invalid reference'), email: z.string().trim().toLowerCase().email() });
