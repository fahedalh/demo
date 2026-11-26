import type { BookingStatus, CustomField, LocalizedText, MemberRole, Permission, PlatformRole, WeeklySchedule } from '@bookly/shared';

export type ID = string;

export interface Membership {
  business: ID;
  role: MemberRole;
  staff?: ID;
  businessInfo: { _id: ID; name: string; slug: string; logo?: string; status: string } | null;
}

export interface User {
  _id: ID;
  name: string;
  email: string;
  phone?: string;
  role: PlatformRole;
  locale: 'en' | 'ar';
  avatar?: string;
  memberships: Membership[];
  favorites: ID[];
  notificationPrefs?: { email: boolean; whatsapp: boolean; sms: boolean };
  status?: string;
  createdAt?: string;
  lastLoginAt?: string;
}

export interface Category {
  _id: ID;
  slug: string;
  name: LocalizedText;
  description?: LocalizedText;
  icon: string;
  color: string;
  terminology: { staff: LocalizedText; service: LocalizedText; resource: LocalizedText };
  bookingFlow: { steps: string[]; requireStaff: boolean; resourceFirst: boolean; sessionModes: string[]; customFields: CustomField[] };
  subcategories?: LocalizedText[];
  isActive: boolean;
  sortOrder: number;
  businessCount?: number;
}

export interface Address {
  line1?: string;
  city?: string;
  country?: string;
  postalCode?: string;
  location?: { type: 'Point'; coordinates: [number, number] };
}

export interface BusinessSettings {
  slotInterval: number;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  requireApproval: boolean;
  allowGuestBooking: boolean;
  allowStaffSelection: boolean;
  waitlistEnabled: boolean;
  payment: { mode: 'none' | 'optional' | 'deposit' | 'full'; depositPercent: number; acceptCash: boolean };
  cancellation: { allowed: boolean; cutoffHours: number; feePercent: number };
  reschedule: { allowed: boolean; cutoffHours: number; maxTimes: number };
  notifications: { email: boolean; whatsapp: boolean; sms: boolean; reminderHours: number[] };
}

export interface Business {
  _id: ID;
  name: string;
  slug: string;
  tagline?: string;
  description?: string;
  logo?: string;
  cover?: string;
  gallery?: string[];
  category: Category | ID;
  branding: { primaryColor: string; accentColor: string; customDomain?: string; hidePlatformBranding?: boolean };
  contact?: { email?: string; phone?: string; website?: string; whatsapp?: string };
  address?: Address;
  timezone: string;
  currency: string;
  locale: 'en' | 'ar';
  settings: BusinessSettings;
  status: 'pending' | 'active' | 'suspended';
  featured: boolean;
  rating: { average: number; count: number };
  priceRange: { min: number; max: number };
  distance?: number;
  nextSlot?: string;
  createdAt: string;
}

export interface Branch {
  _id: ID;
  name: string;
  address?: Address;
  phone?: string;
  timezone?: string;
  workingHours: WeeklySchedule;
  isActive: boolean;
}

export interface Staff {
  _id: ID;
  name: string;
  title?: string;
  bio?: string;
  avatar?: string;
  email?: string;
  phone?: string;
  color: string;
  branches: ID[];
  workingHours: WeeklySchedule;
  acceptsBookings: boolean;
  isActive: boolean;
  user?: ID;
  rating?: { average: number; count: number };
}

export interface Service {
  _id: ID;
  name: string;
  description?: string;
  group?: string;
  image?: string;
  duration: number;
  bufferBefore: number;
  bufferAfter: number;
  price: number;
  depositPercent?: number;
  capacity: number;
  staff: ID[];
  branches: ID[];
  resources: ID[];
  sessionModes: Array<'in_person' | 'online'>;
  requiresApproval?: boolean;
  customFields: CustomField[];
  color: string;
  isActive: boolean;
  sortOrder: number;
}

export interface Resource {
  _id: ID;
  name: string;
  type: string;
  branch?: ID;
  description?: string;
  capacity: number;
  workingHours: WeeklySchedule;
  isActive: boolean;
}

export interface Customer {
  _id: ID;
  name: string;
  email: string;
  phone?: string;
  notes?: string;
  tags: string[];
  user?: ID;
  stats: { bookings: number; completed: number; cancelled: number; noShows: number; totalSpent: number; lastVisitAt?: string };
  createdAt: string;
}

export interface Booking {
  _id: ID;
  reference: string;
  business: Pick<Business, '_id' | 'name' | 'slug' | 'logo' | 'timezone' | 'currency' | 'contact' | 'address' | 'branding'> & { settings?: Pick<BusinessSettings, 'cancellation' | 'reschedule'> };
  service: Pick<Service, '_id' | 'name' | 'duration' | 'price' | 'color' | 'sessionModes'> | null;
  staff: Pick<Staff, '_id' | 'name' | 'title' | 'avatar' | 'color'> | null;
  branch: Pick<Branch, '_id' | 'name' | 'address' | 'phone'> | null;
  resource: Pick<Resource, '_id' | 'name' | 'type'> | null;
  customer: Pick<Customer, '_id' | 'name' | 'email' | 'phone' | 'stats' | 'tags'> | null;
  start: string;
  end: string;
  timezone: string;
  attendees: number;
  status: BookingStatus;
  mode: 'in_person' | 'online';
  source: string;
  answers: Record<string, string | number | boolean>;
  customerNote?: string;
  internalNotes?: string;
  snapshot: { serviceName?: string; staffName?: string; customerName?: string; customerEmail?: string; customerPhone?: string; duration?: number };
  price: { amount: number; currency: string; deposit: number; paid: number; status: string; method: string };
  recurrence?: { groupId: string; index: number; rule: string };
  rescheduleCount: number;
  cancellation?: { by: string; reason?: string; at: string; fee?: number };
  history: Array<{ action: string; at: string; byName?: string; from?: string; to?: string; note?: string }>;
  createdAt: string;
  review?: Review | null;
  payments?: Payment[];
}

export interface Payment {
  _id: ID;
  amount: number;
  currency: string;
  kind: 'deposit' | 'full' | 'balance' | 'refund';
  method: 'online' | 'cash';
  provider: string;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'cancelled';
  invoiceNumber?: string;
  purpose?: string;
  paidAt?: string;
  createdAt: string;
  booking?: { _id: ID; reference: string; snapshot?: Booking['snapshot']; start?: string } | null;
  business?: { _id: ID; name: string; slug: string; logo?: string } | null;
  customer?: { _id: ID; name: string; email: string } | null;
}

export interface Review {
  _id: ID;
  rating: number;
  comment?: string;
  reply?: { text: string; at: string };
  authorName?: string;
  status?: 'published' | 'hidden';
  createdAt: string;
  service?: { name: string } | null;
  staff?: { name: string } | null;
}

export interface Plan {
  _id: ID;
  key: string;
  name: string;
  description?: string;
  price: { monthly: number; annual: number };
  currency: string;
  limits: { staff: number; branches: number; bookingsPerMonth: number; customBranding: boolean; integrations: boolean; ai: boolean; advancedAnalytics: boolean; whatsapp: boolean };
  features: string[];
  highlighted: boolean;
  isActive: boolean;
  sortOrder: number;
  subscribers?: number;
}

export interface Notification {
  _id: ID;
  event: string;
  title: string;
  body?: string;
  link?: string;
  readAt?: string;
  createdAt: string;
}

export interface Slot {
  start: string;
  end: string;
  providers: string[];
  staff: Array<{ _id: ID; name: string }>;
  remaining: number;
  resources?: string[];
}

export interface TenantInfo {
  business: Business & { category: Category };
  memberRole: MemberRole | 'super_admin';
  permissions: Permission[];
  staffId: ID | null;
}

export type { BookingStatus, CustomField, WeeklySchedule };
