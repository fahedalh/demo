/**
 * Zod schemas shared by the API (request validation) and the web apps (form validation),
 * so both sides always agree on what a valid payload is.
 */
import { z } from 'zod';

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{7,14}$/, 'Enter a valid phone number in international format, e.g. +971501234567');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address');

export const latSchema = z.number().min(-90).max(90);
export const lngSchema = z.number().min(-180).max(180);
export const pointSchema = z.object({ lat: latSchema, lng: lngSchema });

export const registerSchema = z
  .object({
    firstName: z.string().trim().min(1, 'First name is required').max(60),
    lastName: z.string().trim().min(1, 'Last name is required').max(60),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    password: passwordSchema,
    role: z.enum(['PASSENGER', 'DRIVER']).default('PASSENGER'),
    locale: z.enum(['en', 'ar']).default('en'),
  })
  .refine((v) => v.email || v.phone, { message: 'Email or phone is required', path: ['email'] });
export type RegisterInput = z.input<typeof registerSchema>;

export const loginSchema = z.object({
  identifier: z.string().trim().min(3, 'Enter your email or phone'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const otpRequestSchema = z.object({
  target: z.string().trim().min(3),
  purpose: z.enum(['VERIFY_PHONE', 'VERIFY_EMAIL', 'RESET_PASSWORD', 'LOGIN']),
});
export const otpVerifySchema = otpRequestSchema.extend({ code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') });

export const forgotPasswordSchema = z.object({ identifier: z.string().trim().min(3) });
export const resetPasswordSchema = z.object({
  identifier: z.string().trim().min(3),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  password: passwordSchema,
});
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema });

export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  locale: z.enum(['en', 'ar']).optional(),
  avatarUrl: z.string().url().max(500).nullable().optional(),
});

export const savedPlaceSchema = z.object({
  label: z.string().trim().min(1, 'Give this place a name').max(60),
  type: z.enum(['HOME', 'WORK', 'FAVORITE']).default('FAVORITE'),
  address: z.string().trim().min(1).max(300),
  lat: latSchema,
  lng: lngSchema,
});

export const emergencyContactSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  phone: phoneSchema,
  relationship: z.string().trim().max(40).optional(),
});

export const placeSchema = z.object({
  address: z.string().trim().min(1).max(300),
  lat: latSchema,
  lng: lngSchema,
});

export const estimateSchema = z.object({
  pickup: pointSchema,
  dropoff: pointSchema,
  couponCode: z.string().trim().max(40).optional(),
});

export const paymentTypeSchema = z.enum(['CASH', 'CARD', 'WALLET']);

export const createRideSchema = z.object({
  pickup: placeSchema,
  dropoff: placeSchema,
  categoryCode: z.string().min(2).max(30),
  paymentType: paymentTypeSchema,
  paymentMethodId: z.string().optional(),
  couponCode: z.string().trim().max(40).optional(),
  pickupNotes: z.string().trim().max(280).optional(),
  scheduledAt: z.coerce
    .date()
    .optional()
    .refine((d) => !d || d.getTime() > Date.now() + 10 * 60_000, 'Schedule at least 10 minutes ahead')
    .refine((d) => !d || d.getTime() < Date.now() + 30 * 86_400_000, 'Schedule within the next 30 days'),
});
export type CreateRideInput = z.input<typeof createRideSchema>;

export const cancelRideSchema = z.object({ reason: z.string().trim().max(280).optional() });

export const rateRideSchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
  tags: z.array(z.string().max(40)).max(8).optional(),
  tip: z.number().int().min(0).max(100_000).optional(),
});

export const messageSchema = z.object({ body: z.string().trim().min(1).max(1000) });

export const locationUpdateSchema = z.object({
  lat: latSchema,
  lng: lngSchema,
  heading: z.number().min(0).max(360).optional(),
  speed: z.number().min(0).max(100).optional(),
});

export const vehicleSchema = z.object({
  categoryCode: z.string().min(2).max(30),
  make: z.string().trim().min(1, 'Make is required').max(40),
  model: z.string().trim().min(1, 'Model is required').max(40),
  year: z.coerce.number().int().min(2005).max(new Date().getFullYear() + 1),
  color: z.string().trim().min(1, 'Color is required').max(30),
  plateNumber: z.string().trim().min(2, 'Plate number is required').max(20).toUpperCase(),
  seats: z.coerce.number().int().min(2).max(8),
  isElectric: z.boolean().default(false),
});

export const driverOnboardingSchema = z.object({
  licenseNumber: z.string().trim().min(4, 'License number is required').max(40),
  licenseExpiry: z.coerce.date().refine((d) => d.getTime() > Date.now(), 'License must not be expired'),
  dateOfBirth: z.coerce
    .date()
    .refine((d) => Date.now() - d.getTime() > 21 * 365.25 * 86_400_000, 'Drivers must be at least 21'),
  nationalId: z.string().trim().min(4, 'ID number is required').max(40),
});

export const DOCUMENT_TYPES = [
  'PROFILE_PHOTO',
  'DRIVING_LICENSE',
  'NATIONAL_ID',
  'VEHICLE_REGISTRATION',
  'INSURANCE',
  'VEHICLE_PHOTO',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const payoutRequestSchema = z.object({
  amount: z.number().int().positive('Amount must be positive'),
  method: z.enum(['BANK_TRANSFER', 'WALLET']).default('BANK_TRANSFER'),
  destination: z.string().trim().min(4).max(60),
});

export const addCardSchema = z.object({
  // Sandbox only: the raw number is validated and discarded — only brand/last4 are kept.
  // With Stripe configured, the client sends a Stripe PaymentMethod id instead.
  cardNumber: z.string().regex(/^\d{12,19}$/).optional(),
  expMonth: z.number().int().min(1).max(12).optional(),
  expYear: z.number().int().min(new Date().getFullYear()).max(new Date().getFullYear() + 20).optional(),
  providerPaymentMethodId: z.string().optional(),
  makeDefault: z.boolean().default(false),
});

export const walletTopupSchema = z.object({
  amount: z.number().int().min(1000).max(500_000),
  paymentMethodId: z.string(),
});

export const supportTicketSchema = z.object({
  subject: z.string().trim().min(3, 'Subject is required').max(120),
  category: z.enum(['RIDE_ISSUE', 'PAYMENT', 'ACCOUNT', 'SAFETY', 'LOST_ITEM', 'DRIVER_ONBOARDING', 'OTHER']),
  description: z.string().trim().min(10, 'Please describe the issue (10+ characters)').max(4000),
  rideId: z.string().optional(),
});

export const ticketReplySchema = z.object({ body: z.string().trim().min(1).max(4000), isInternal: z.boolean().optional() });

// ---------- Admin ----------
export const pricingUpdateSchema = z.object({
  baseFare: z.number().int().min(0),
  perKm: z.number().int().min(0),
  perMinute: z.number().int().min(0),
  minimumFare: z.number().int().min(0),
  bookingFee: z.number().int().min(0),
  cancellationFee: z.number().int().min(0),
  commissionRate: z.number().min(0).max(0.6),
  surgeMultiplier: z.number().min(1).max(5),
  surgeEnabled: z.boolean(),
});

export const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, '3–30 letters, digits, - or _'),
  description: z.string().trim().max(200).optional(),
  type: z.enum(['PERCENT', 'FIXED']),
  value: z.number().int().positive(),
  maxDiscount: z.number().int().positive().nullable().optional(),
  minFare: z.number().int().min(0).nullable().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  perUserLimit: z.number().int().positive().default(1),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  isActive: z.boolean().default(true),
});

export const categorySchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z_]{2,30}$/),
  name: z.string().trim().min(1).max(40),
  nameAr: z.string().trim().min(1).max(40),
  description: z.string().trim().max(200).optional(),
  descriptionAr: z.string().trim().max(200).optional(),
  capacity: z.number().int().min(1).max(12),
  icon: z.string().max(30).default('car'),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const serviceAreaSchema = z.object({
  name: z.string().trim().min(1).max(80),
  nameAr: z.string().trim().min(1).max(80),
  city: z.string().trim().min(1).max(80),
  country: z.string().trim().length(2),
  currency: z.string().trim().length(3).toUpperCase(),
  centerLat: latSchema,
  centerLng: lngSchema,
  radiusKm: z.number().positive().max(200),
  timezone: z.string().default('Asia/Dubai'),
  isActive: z.boolean().default(true),
});

export const broadcastSchema = z.object({
  audience: z.enum(['ALL', 'PASSENGERS', 'DRIVERS']),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(1000),
});

export const refundSchema = z.object({ amount: z.number().int().positive(), reason: z.string().trim().min(3).max(300) });

export const driverReviewSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT', 'REQUEST_INFO']),
  note: z.string().trim().max(500).optional(),
});

export const documentReviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().trim().max(500).optional(),
});

export const userStatusSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']), reason: z.string().max(300).optional() });
export const adminRoleSchema = z.object({ adminRole: z.enum(['SUPER_ADMIN', 'OPERATIONS', 'FINANCE', 'SUPPORT']) });

export const settingsSchema = z.object({
  dispatchRadiusKm: z.number().min(1).max(50),
  offerTimeoutSeconds: z.number().int().min(5).max(120),
  maxDispatchAttempts: z.number().int().min(1).max(20),
  freeCancellationSeconds: z.number().int().min(0).max(1800),
  supportPhone: z.string().max(30),
  supportEmail: z.string().email(),
  maintenanceMode: z.boolean(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
});
