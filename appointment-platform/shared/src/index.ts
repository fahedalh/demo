/**
 * Constants and types shared by the API and the web client.
 * Pure TypeScript only — no runtime dependencies.
 */

export const PLATFORM_ROLES = ['super_admin', 'business_owner', 'staff', 'customer'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const MEMBER_ROLES = ['owner', 'manager', 'staff'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const PERMISSIONS = [
  'business:read',
  'business:update',
  'branches:manage',
  'staff:manage',
  'services:manage',
  'resources:manage',
  'bookings:read',
  'bookings:manage',
  'bookings:own',
  'customers:read',
  'customers:manage',
  'payments:read',
  'payments:manage',
  'reviews:manage',
  'analytics:read',
  'settings:manage',
  'subscription:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Default permission sets per business membership role. Seeded into the `roles` collection. */
export const MEMBER_ROLE_PERMISSIONS: Record<MemberRole, Permission[]> = {
  owner: [...PERMISSIONS],
  manager: [
    'business:read',
    'branches:manage',
    'staff:manage',
    'services:manage',
    'resources:manage',
    'bookings:read',
    'bookings:manage',
    'customers:read',
    'customers:manage',
    'payments:read',
    'reviews:manage',
    'analytics:read',
  ],
  staff: ['business:read', 'bookings:own', 'customers:read'],
};

export const BOOKING_STATUSES = [
  'pending',
  'confirmed',
  'rejected',
  'cancelled',
  'completed',
  'no_show',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Statuses that occupy a slot. */
export const ACTIVE_BOOKING_STATUSES: BookingStatus[] = ['pending', 'confirmed'];

/** Allowed manual status transitions (performed by business members). */
export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ['confirmed', 'rejected', 'cancelled'],
  confirmed: ['completed', 'no_show', 'cancelled'],
  rejected: [],
  cancelled: [],
  completed: [],
  no_show: [],
};

export const PAYMENT_MODES = ['none', 'optional', 'deposit', 'full'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const PAYMENT_STATUSES = ['unpaid', 'partially_paid', 'paid', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const SESSION_MODES = ['in_person', 'online'] as const;
export type SessionMode = (typeof SESSION_MODES)[number];

export const BOOKING_FLOW_STEPS = ['service', 'staff', 'resource', 'datetime', 'details', 'payment'] as const;
export type BookingFlowStep = (typeof BOOKING_FLOW_STEPS)[number];

export const CUSTOM_FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'select',
  'checkbox',
  'date',
  'phone',
  'email',
] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export interface LocalizedText {
  en: string;
  ar?: string;
}

export interface CustomField {
  key: string;
  label: LocalizedText;
  type: CustomFieldType;
  required: boolean;
  options?: string[];
  placeholder?: string;
}

export interface TimeInterval {
  start: string; // "HH:mm"
  end: string; // "HH:mm"
}

export interface DaySchedule {
  day: number; // 0 = Sunday … 6 = Saturday
  enabled: boolean;
  intervals: TimeInterval[];
}

export type WeeklySchedule = DaySchedule[];

export const NOTIFICATION_EVENTS = [
  'booking.received',
  'booking.confirmed',
  'booking.rejected',
  'booking.cancelled',
  'booking.rescheduled',
  'booking.reminder',
  'payment.received',
  'review.request',
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const NOTIFICATION_CHANNELS = ['in_app', 'email', 'whatsapp', 'sms', 'push'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const TEMPLATE_PLACEHOLDERS = [
  'customerName',
  'businessName',
  'serviceName',
  'staffName',
  'date',
  'time',
  'reference',
  'amount',
  'link',
  'reason',
] as const;

export const PLAN_LIMIT_KEYS = ['staff', 'branches', 'bookingsPerMonth'] as const;
export type PlanLimitKey = (typeof PLAN_LIMIT_KEYS)[number];

export const PLAN_FEATURE_KEYS = [
  'customBranding',
  'integrations',
  'ai',
  'advancedAnalytics',
  'whatsapp',
] as const;
export type PlanFeatureKey = (typeof PLAN_FEATURE_KEYS)[number];

/** Industry theme presets: drive public page layout, typography and palette (see DESIGN_SYSTEM.md). */
export const THEME_PRESETS = ['default', 'clinical', 'luxe', 'academic', 'professional', 'automotive', 'hospitality', 'civic'] as const;
export type ThemePreset = (typeof THEME_PRESETS)[number];

export const SUPPORTED_LOCALES = ['en', 'ar'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const RTL_LOCALES: Locale[] = ['ar'];

export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'SAR', 'AED', 'KWD', 'QAR', 'EGP', 'JOD'] as const;

/** Default weekly schedule: Sunday–Thursday 09:00–17:00 with a 13:00–14:00 break. */
export function defaultWeeklySchedule(workDays: number[] = [0, 1, 2, 3, 4]): WeeklySchedule {
  return [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day,
    enabled: workDays.includes(day),
    intervals: workDays.includes(day)
      ? [
          { start: '09:00', end: '13:00' },
          { start: '14:00', end: '17:00' },
        ]
      : [],
  }));
}

/** "HH:mm" → minutes since midnight. */
export function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToHm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function localized(text: LocalizedText | string | undefined, locale: string): string {
  if (!text) return '';
  if (typeof text === 'string') return text;
  return (locale === 'ar' && text.ar) || text.en;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}
