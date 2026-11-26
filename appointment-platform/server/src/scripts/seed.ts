/* eslint-disable no-console */
/**
 * Seeds a realistic multi-industry dataset. DESTRUCTIVE: drops the configured database first.
 *   npm run seed            (refuses to run when NODE_ENV=production unless SEED_FORCE=true)
 */
import { DateTime } from 'luxon';
import mongoose, { Types } from 'mongoose';
import { MEMBER_ROLE_PERMISSIONS, defaultWeeklySchedule, type WeeklySchedule } from '@bookly/shared';
import { connectDb } from '../config/db';
import { env } from '../config/env';
import { hashPassword } from '../modules/auth/auth.service';
import { AvailabilityException } from '../modules/availability/exception.model';
import { Booking } from '../modules/bookings/booking.model';
import { Branch } from '../modules/branches/branch.model';
import { Business } from '../modules/businesses/business.model';
import { Category } from '../modules/categories/category.model';
import { Customer } from '../modules/customers/customer.model';
import { Payment } from '../modules/payments/payment.model';
import { Plan, Subscription } from '../modules/plans/plan.model';
import { Resource } from '../modules/resources/resource.model';
import { Review } from '../modules/reviews/review.model';
import { Service } from '../modules/services/service.model';
import { PlatformSettings } from '../modules/settings/settings.model';
import { Staff } from '../modules/staff/staff.model';
import { Role } from '../modules/users/role.model';
import { User } from '../modules/users/user.model';
import { bookingReference, slugify } from '../utils/crypto';

const L = (en: string, ar: string) => ({ en, ar });
const sched = (days: number[], intervals: Array<[string, string]>): WeeklySchedule =>
  [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, enabled: days.includes(day), intervals: days.includes(day) ? intervals.map(([start, end]) => ({ start, end })) : [] }));
const SUN_THU = [0, 1, 2, 3, 4];
const SAT_THU = [6, 0, 1, 2, 3, 4];

// Deterministic pseudo-random for reproducible seeds.
let rngState = 42;
const rnd = () => ((rngState = (rngState * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

const CATEGORIES = [
  {
    slug: 'healthcare', icon: 'Stethoscope', color: '#0ea5e9', sortOrder: 1, theme: 'clinical',
    name: L('Medical & Healthcare', 'الطب والرعاية الصحية'),
    description: L('Doctors, clinics, dentists, physiotherapy and labs', 'أطباء، عيادات، أسنان، علاج طبيعي ومختبرات'),
    terminology: { staff: L('Doctor', 'الطبيب'), service: L('Consultation', 'الاستشارة'), resource: L('Room', 'الغرفة') },
    bookingFlow: { steps: ['service', 'staff', 'datetime', 'details', 'payment'], requireStaff: true, resourceFirst: false, sessionModes: ['in_person', 'online'], customFields: [
      { key: 'dateOfBirth', label: L('Date of birth', 'تاريخ الميلاد'), type: 'date', required: true },
      { key: 'insurance', label: L('Insurance provider', 'شركة التأمين'), type: 'select', required: false, options: ['None', 'Bupa', 'Tawuniya', 'MedGulf', 'Other'] },
      { key: 'symptoms', label: L('Reason for visit', 'سبب الزيارة'), type: 'textarea', required: false },
    ] },
    subcategories: [L('Doctors', 'أطباء'), L('Dentists', 'أطباء أسنان'), L('Physiotherapy', 'علاج طبيعي'), L('Laboratories', 'مختبرات')],
  },
  {
    slug: 'beauty', icon: 'Scissors', color: '#ec4899', sortOrder: 2, theme: 'luxe',
    name: L('Beauty & Personal Care', 'التجميل والعناية الشخصية'),
    description: L('Salons, barbershops, spas and massage', 'صالونات، حلاقة، سبا ومساج'),
    terminology: { staff: L('Stylist', 'الأخصائية'), service: L('Treatment', 'الخدمة'), resource: L('Chair', 'الكرسي') },
    bookingFlow: { steps: ['service', 'staff', 'datetime', 'details', 'payment'], requireStaff: false, resourceFirst: false, sessionModes: ['in_person'], customFields: [] },
    subcategories: [L('Hair salons', 'صالونات شعر'), L('Barbershops', 'حلاقة'), L('Spas', 'سبا')],
  },
  {
    slug: 'education', icon: 'GraduationCap', color: '#8b5cf6', sortOrder: 3, theme: 'academic',
    name: L('Education & Training', 'التعليم والتدريب'),
    description: L('Tutors, training centers, workshops', 'مدرسون، مراكز تدريب وورش عمل'),
    terminology: { staff: L('Tutor', 'المدرّس'), service: L('Session', 'الحصة'), resource: L('Classroom', 'القاعة') },
    bookingFlow: { steps: ['service', 'staff', 'datetime', 'details', 'payment'], requireStaff: false, resourceFirst: false, sessionModes: ['in_person', 'online'], customFields: [
      { key: 'studentLevel', label: L('Student level', 'المرحلة الدراسية'), type: 'select', required: true, options: ['Primary', 'Middle school', 'High school', 'University', 'Adult'] },
    ] },
    subcategories: [L('Private tutors', 'دروس خصوصية'), L('Workshops', 'ورش عمل')],
  },
  {
    slug: 'professional', icon: 'Briefcase', color: '#0f766e', sortOrder: 4, theme: 'professional',
    name: L('Professional Services', 'الخدمات المهنية'),
    description: L('Lawyers, consultants, accountants, advisors', 'محامون، مستشارون، محاسبون'),
    terminology: { staff: L('Advisor', 'المستشار'), service: L('Consultation', 'الاستشارة'), resource: L('Office', 'المكتب') },
    bookingFlow: { steps: ['service', 'staff', 'datetime', 'details', 'payment'], requireStaff: false, resourceFirst: false, sessionModes: ['in_person', 'online'], customFields: [
      { key: 'company', label: L('Company (optional)', 'الشركة (اختياري)'), type: 'text', required: false },
      { key: 'matter', label: L('Briefly describe your matter', 'صف موضوعك باختصار'), type: 'textarea', required: true },
    ] },
    subcategories: [L('Legal', 'قانوني'), L('Accounting', 'محاسبة'), L('Business advisory', 'استشارات أعمال')],
  },
  {
    slug: 'automotive', icon: 'Car', color: '#f97316', sortOrder: 5, theme: 'automotive',
    name: L('Automotive', 'السيارات'),
    description: L('Maintenance, inspection, detailing and repairs', 'صيانة، فحص، تلميع وإصلاح'),
    terminology: { staff: L('Technician', 'الفني'), service: L('Service', 'الخدمة'), resource: L('Service bay', 'منصة الخدمة') },
    bookingFlow: { steps: ['service', 'datetime', 'details', 'payment'], requireStaff: false, resourceFirst: false, sessionModes: ['in_person'], customFields: [
      { key: 'vehicle', label: L('Vehicle make & model', 'نوع وطراز السيارة'), type: 'text', required: true, placeholder: 'Toyota Camry 2021' },
      { key: 'plate', label: L('Plate number', 'رقم اللوحة'), type: 'text', required: true },
    ] },
    subcategories: [L('Maintenance', 'صيانة'), L('Detailing', 'تلميع')],
  },
  {
    slug: 'hospitality', icon: 'Building2', color: '#eab308', sortOrder: 6, theme: 'hospitality',
    name: L('Hospitality & Events', 'الضيافة والفعاليات'),
    description: L('Meeting rooms, venues, events and photo sessions', 'قاعات اجتماعات، أماكن فعاليات وجلسات تصوير'),
    terminology: { staff: L('Host', 'المضيف'), service: L('Reservation', 'الحجز'), resource: L('Room', 'القاعة') },
    bookingFlow: { steps: ['service', 'datetime', 'details', 'payment'], requireStaff: false, resourceFirst: true, sessionModes: ['in_person'], customFields: [
      { key: 'guests', label: L('Number of guests', 'عدد الضيوف'), type: 'number', required: true },
    ] },
    subcategories: [L('Meeting rooms', 'قاعات اجتماعات'), L('Venues', 'أماكن فعاليات'), L('Photography', 'تصوير')],
  },
  {
    slug: 'government', icon: 'Landmark', color: '#64748b', sortOrder: 7, theme: 'civic',
    name: L('Government & Public Services', 'الخدمات الحكومية والعامة'),
    description: L('Document processing and service-desk appointments', 'معاملات ومواعيد خدمة العملاء'),
    terminology: { staff: L('Officer', 'الموظف'), service: L('Transaction', 'المعاملة'), resource: L('Counter', 'الشباك') },
    bookingFlow: { steps: ['service', 'datetime', 'details'], requireStaff: false, resourceFirst: false, sessionModes: ['in_person'], customFields: [
      { key: 'nationalId', label: L('National ID / Iqama', 'رقم الهوية / الإقامة'), type: 'text', required: true },
    ] },
    subcategories: [L('Documents', 'وثائق'), L('Licensing', 'تراخيص')],
  },
];

const PLANS = [
  { key: 'free', name: 'Free', description: 'For solo professionals getting started', price: { monthly: 0, annual: 0 }, sortOrder: 1, limits: { staff: 1, branches: 1, bookingsPerMonth: 50, customBranding: false, integrations: false, ai: false, advancedAnalytics: false, whatsapp: false }, features: ['1 staff member', '50 bookings / month', 'Online booking page', 'Email notifications'] },
  { key: 'starter', name: 'Starter', description: 'For growing small teams', price: { monthly: 19, annual: 190 }, sortOrder: 2, limits: { staff: 3, branches: 1, bookingsPerMonth: 500, customBranding: true, integrations: false, ai: false, advancedAnalytics: false, whatsapp: false }, features: ['Up to 3 staff', '500 bookings / month', 'Custom brand colours', 'Online payments & deposits'] },
  { key: 'professional', name: 'Professional', description: 'Everything a busy business needs', price: { monthly: 49, annual: 490 }, sortOrder: 3, highlighted: true, limits: { staff: 15, branches: 5, bookingsPerMonth: -1, customBranding: true, integrations: true, ai: true, advancedAnalytics: true, whatsapp: true }, features: ['Up to 15 staff & 5 branches', 'Unlimited bookings', 'WhatsApp reminders', 'AI assistant & insights', 'Advanced analytics'] },
  { key: 'enterprise', name: 'Enterprise', description: 'Multi-location brands and institutions', price: { monthly: 149, annual: 1490 }, sortOrder: 4, limits: { staff: -1, branches: -1, bookingsPerMonth: -1, customBranding: true, integrations: true, ai: true, advancedAnalytics: true, whatsapp: true }, features: ['Unlimited staff & branches', 'White-label & custom domain', 'Priority support & SLA', 'All integrations'] },
];

const CUSTOMERS = [
  ['Sara Al-Qahtani', 'sara@example.com', '+966500000001'],
  ['Yousef Haddad', 'yousef@example.com', '+962790000002'],
  ['Emily Carter', 'emily@example.com', '+447700900003'],
  ['Ahmed Mansour', 'ahmed@example.com', '+971500000004'],
  ['Lina Khoury', 'lina@example.com', '+962790000005'],
  ['Omar Farouk', 'omar.f@example.com', '+966500000006'],
  ['Noura Al-Mutairi', 'noura@example.com', '+966500000007'],
  ['Daniel Brooks', 'daniel@example.com', '+447700900008'],
  ['Fatima Zahra', 'fatima@example.com', '+971500000009'],
  ['Khalid Rahman', 'khalid@example.com', '+966500000010'],
];

const COMMENTS = [
  [5, 'Excellent experience from booking to the appointment itself. Highly recommended!'],
  [5, 'On time, professional and friendly. Will definitely come back.'],
  [4, 'Very good service, a short wait but worth it.'],
  [5, 'خدمة ممتازة وتعامل راقٍ جداً'],
  [4, 'Easy online booking and great staff.'],
  [3, 'Good overall, parking was a bit difficult.'],
  [5, 'Best in town. The reminders were really helpful.'],
];

interface BizSpec {
  name: string; category: string; owner: [string, string]; tagline: string; description: string;
  city: string; country: string; lat: number; lng: number; timezone: string; currency: string; locale: 'en' | 'ar';
  hours: WeeklySchedule; plan: string; featured?: boolean; primaryColor: string; accentColor: string;
  settings?: Record<string, unknown>;
  staff: Array<{ name: string; title: string; color: string; bio?: string; login?: string }>;
  resources?: Array<{ name: string; type: string; capacity?: number }>;
  services: Array<{ name: string; group?: string; duration: number; price: number; bufferAfter?: number; capacity?: number; staffIdx?: number[]; resourceIdx?: number[]; modes?: string[]; description: string; color?: string }>;
}

const BUSINESSES: BizSpec[] = [
  {
    name: 'Nour Family Clinic', category: 'healthcare', owner: ['Dr. Rania Nour', 'clinic@bookly.dev'], featured: true,
    tagline: 'Family medicine, paediatrics and dermatology under one roof',
    description: 'Nour Family Clinic provides compassionate, evidence-based care for the whole family. Book same-week consultations with our general practitioners, paediatricians and dermatologists, in person or online.',
    city: 'Riyadh', country: 'Saudi Arabia', lat: 24.7136, lng: 46.6753, timezone: 'Asia/Riyadh', currency: 'SAR', locale: 'en',
    hours: sched(SUN_THU, [['08:00', '13:00'], ['16:00', '21:00']]), plan: 'professional', primaryColor: '#0284c7', accentColor: '#14b8a6',
    settings: { 'payment.mode': 'deposit', 'payment.depositPercent': 20 },
    staff: [
      { name: 'Dr. Layla Haddad', title: 'General Practitioner', color: '#0ea5e9', bio: '12 years in family medicine with a focus on preventive care.', login: 'layla@bookly.dev' },
      { name: 'Dr. Omar Saleh', title: 'Paediatrician', color: '#22c55e', bio: 'Board-certified paediatrician, gentle with little patients.' },
      { name: 'Dr. Hana Yusuf', title: 'Dermatologist', color: '#a855f7', bio: 'Medical and cosmetic dermatology.' },
    ],
    services: [
      { name: 'General Consultation', group: 'Family medicine', duration: 20, price: 150, staffIdx: [0], modes: ['in_person'], description: 'Assessment, diagnosis and treatment plan for common health concerns.' },
      { name: 'Paediatric Check-up', group: 'Paediatrics', duration: 30, price: 200, staffIdx: [1], description: 'Growth, development and vaccination review for children.' },
      { name: 'Dermatology Consultation', group: 'Dermatology', duration: 30, price: 250, staffIdx: [2], description: 'Skin, hair and nail assessment.', bufferAfter: 5 },
      { name: 'Online Follow-up', group: 'Telehealth', duration: 15, price: 100, staffIdx: [0, 1, 2], modes: ['online'], description: 'Video follow-up for existing patients.' },
    ],
  },
  {
    name: 'Lumière Hair & Beauty', category: 'beauty', owner: ['Maya Laurent', 'salon@bookly.dev'], featured: true,
    tagline: 'Quiet luxury for every strand',
    description: 'A calm, light-filled studio for cuts, colour, styling and nails. Our senior stylists tailor every look to you.',
    city: 'Dubai', country: 'United Arab Emirates', lat: 25.1972, lng: 55.2744, timezone: 'Asia/Dubai', currency: 'AED', locale: 'en',
    hours: sched([1, 2, 3, 4, 5, 6, 0], [['10:00', '22:00']]), plan: 'starter', primaryColor: '#b4746c', accentColor: '#e8cfc4',
    staff: [
      { name: 'Maya Laurent', title: 'Creative Director', color: '#db2777', login: 'maya@bookly.dev' },
      { name: 'Rami Aziz', title: 'Senior Stylist', color: '#7c3aed' },
      { name: 'Aisha Bello', title: 'Nail Technician', color: '#f59e0b' },
    ],
    services: [
      { name: "Women's Haircut & Blow-dry", group: 'Hair', duration: 60, price: 220, bufferAfter: 10, staffIdx: [0, 1], description: 'Consultation, wash, precision cut and blow-dry.' },
      { name: "Men's Haircut", group: 'Hair', duration: 30, price: 120, bufferAfter: 5, staffIdx: [1], description: 'Classic or modern cut with hot towel finish.' },
      { name: 'Full Colour', group: 'Colour', duration: 120, price: 450, bufferAfter: 15, staffIdx: [0], description: 'Root-to-tip colour with gloss treatment.' },
      { name: 'Gel Manicure', group: 'Nails', duration: 45, price: 110, staffIdx: [2], description: 'Shaping, cuticle care and long-lasting gel polish.' },
    ],
  },
  {
    name: 'Bright Minds Tutoring', category: 'education', owner: ['Kareem Odeh', 'tutor@bookly.dev'], featured: true,
    tagline: 'Math, English and SAT prep — online or in Amman',
    description: 'Experienced tutors helping students build confidence and results, from primary school to university entrance.',
    city: 'Amman', country: 'Jordan', lat: 31.9539, lng: 35.9106, timezone: 'Asia/Amman', currency: 'JOD', locale: 'ar',
    hours: sched(SAT_THU, [['14:00', '21:00']]), plan: 'professional', primaryColor: '#7c3aed', accentColor: '#06b6d4',
    staff: [
      { name: 'Kareem Odeh', title: 'Mathematics Tutor', color: '#7c3aed' },
      { name: 'Rana Saeed', title: 'English Tutor', color: '#06b6d4' },
    ],
    services: [
      { name: 'Math Private Lesson', group: 'Private lessons', duration: 60, price: 25, staffIdx: [0], modes: ['in_person', 'online'], description: 'One-to-one lesson tailored to the curriculum.' },
      { name: 'English Conversation', group: 'Private lessons', duration: 60, price: 20, staffIdx: [1], modes: ['online', 'in_person'], description: 'Speaking and listening practice with a native-level tutor.' },
      { name: 'SAT Math Workshop', group: 'Workshops', duration: 120, price: 40, capacity: 12, staffIdx: [0], description: 'Small-group strategy workshop (max 12 students).' },
    ],
  },
  {
    name: 'Al Faris Legal Consultants', category: 'professional', owner: ['Faisal Al Faris', 'legal@bookly.dev'],
    tagline: 'Corporate, commercial and family law advisory',
    description: 'Licensed legal advisors offering confidential consultations for individuals and companies.',
    city: 'Riyadh', country: 'Saudi Arabia', lat: 24.6911, lng: 46.6853, timezone: 'Asia/Riyadh', currency: 'SAR', locale: 'ar',
    hours: sched(SUN_THU, [['09:00', '17:00']]), plan: 'starter', primaryColor: '#0f766e', accentColor: '#ca8a04',
    settings: { requireApproval: true, 'payment.mode': 'full', 'cancellation.cutoffHours': 24, 'cancellation.feePercent': 50 },
    staff: [
      { name: 'Faisal Al Faris', title: 'Senior Partner', color: '#0f766e' },
      { name: 'Reem Al Harbi', title: 'Commercial Lawyer', color: '#ca8a04' },
    ],
    services: [
      { name: 'Initial Legal Consultation', duration: 60, price: 500, staffIdx: [0, 1], modes: ['in_person', 'online'], description: 'Review of your situation and recommended next steps.', bufferAfter: 15 },
      { name: 'Contract Review Session', duration: 90, price: 900, staffIdx: [1], modes: ['online', 'in_person'], description: 'Clause-by-clause review of a commercial contract.' },
    ],
  },
  {
    name: 'QuickFix Auto Care', category: 'automotive', owner: ['Hassan Qureshi', 'auto@bookly.dev'],
    tagline: 'Fast, transparent car maintenance in North Riyadh',
    description: 'Oil changes, inspections and detailing with real-time updates. Two service bays, no waiting in line.',
    city: 'Riyadh', country: 'Saudi Arabia', lat: 24.7742, lng: 46.7385, timezone: 'Asia/Riyadh', currency: 'SAR', locale: 'en',
    hours: sched(SAT_THU, [['08:00', '20:00']]), plan: 'starter', primaryColor: '#ea580c', accentColor: '#0ea5e9',
    staff: [],
    resources: [{ name: 'Bay 1', type: 'Service bay' }, { name: 'Bay 2', type: 'Service bay' }],
    services: [
      { name: 'Oil & Filter Change', group: 'Maintenance', duration: 45, price: 180, bufferAfter: 15, resourceIdx: [0, 1], description: 'Synthetic oil, filter and 20-point check.' },
      { name: 'Full Vehicle Inspection', group: 'Maintenance', duration: 90, price: 300, resourceIdx: [0, 1], description: 'Brakes, suspension, battery, fluids and diagnostics.' },
      { name: 'Interior & Exterior Detailing', group: 'Detailing', duration: 150, price: 450, resourceIdx: [1], description: 'Hand wash, polish, vacuum and upholstery clean.' },
    ],
  },
  {
    name: 'The Hive Workspace', category: 'hospitality', owner: ['Zara Ahmed', 'hive@bookly.dev'], featured: true,
    tagline: 'Bookable meeting rooms in Dubai Marina',
    description: 'Beautifully designed meeting rooms with screens, fast Wi-Fi and coffee. Book by the hour.',
    city: 'Dubai', country: 'United Arab Emirates', lat: 25.0805, lng: 55.1403, timezone: 'Asia/Dubai', currency: 'AED', locale: 'en',
    hours: sched([1, 2, 3, 4, 5, 6, 0], [['07:00', '22:00']]), plan: 'professional', primaryColor: '#ca8a04', accentColor: '#334155',
    staff: [],
    resources: [{ name: 'Board Room', type: 'Meeting room', capacity: 12 }, { name: 'Focus Room A', type: 'Meeting room', capacity: 4 }, { name: 'Focus Room B', type: 'Meeting room', capacity: 4 }],
    services: [
      { name: 'Board Room — 1 hour', group: 'Rooms', duration: 60, price: 250, resourceIdx: [0], description: 'Seats 12 · 85" screen · video conferencing.' },
      { name: 'Focus Room — 1 hour', group: 'Rooms', duration: 60, price: 90, resourceIdx: [1, 2], description: 'Seats 4 · whiteboard · screen.' },
      { name: 'Board Room — Half day', group: 'Rooms', duration: 240, price: 850, resourceIdx: [0], description: 'Four hours including coffee service.' },
    ],
  },
  {
    name: 'Civic Services Center — Abdali', category: 'government', owner: ['Service Desk Admin', 'civic@bookly.dev'],
    tagline: 'Book your document-processing appointment and skip the queue',
    description: 'Appointments for document certification, renewals and general enquiries. Please bring original documents.',
    city: 'Amman', country: 'Jordan', lat: 31.9632, lng: 35.9104, timezone: 'Asia/Amman', currency: 'JOD', locale: 'ar',
    hours: sched(SUN_THU, [['08:30', '15:00']]), plan: 'enterprise', primaryColor: '#475569', accentColor: '#16a34a',
    settings: { 'payment.mode': 'none', slotInterval: 15 },
    staff: [],
    services: [
      { name: 'Document Certification', duration: 15, price: 0, capacity: 3, description: 'Certification of official documents (3 counters).' },
      { name: 'ID Renewal Appointment', duration: 20, price: 0, capacity: 2, description: 'Renewal of national ID cards.' },
    ],
  },
];

/** Drops the connected database and inserts the demo dataset. Exported for E2E tests. */
export async function seed(log: (msg: string) => void = console.log) {
  rngState = 42;
  await mongoose.connection.dropDatabase();
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).syncIndexes()));
  log('Database reset');

  await PlatformSettings.create({ key: 'global', platformName: 'Bookly' });
  await Role.insertMany([
    { key: 'business:owner', name: 'Owner', description: 'Full access to the business', permissions: MEMBER_ROLE_PERMISSIONS.owner },
    { key: 'business:manager', name: 'Manager', description: 'Runs day-to-day operations', permissions: MEMBER_ROLE_PERMISSIONS.manager },
    { key: 'business:staff', name: 'Staff', description: 'Sees and manages own appointments', permissions: MEMBER_ROLE_PERMISSIONS.staff },
  ]);
  const plans = await Plan.insertMany(PLANS);
  const cats = await Category.insertMany(CATEGORIES);
  const pw = {
    admin: await hashPassword('Admin123!'),
    owner: await hashPassword('Owner123!'),
    staff: await hashPassword('Staff123!'),
    customer: await hashPassword('Customer123!'),
  };
  await User.create({ name: 'Platform Admin', email: 'admin@bookly.dev', passwordHash: pw.admin, role: 'super_admin' });
  const customerUsers = await User.insertMany(CUSTOMERS.slice(0, 5).map(([name, email, phone]) => ({ name, email, phone, passwordHash: pw.customer, role: 'customer', locale: email === 'sara@example.com' ? 'ar' : 'en' })));

  const now = DateTime.now();
  let bookingCount = 0;
  for (const spec of BUSINESSES) {
    const cat = cats.find((c) => c.slug === spec.category)!;
    const owner = await User.create({ name: spec.owner[0], email: spec.owner[1], passwordHash: pw.owner, role: 'business_owner' });
    const settings: Record<string, unknown> = {};
    const business = new Business({
      owner: owner._id, category: cat._id, name: spec.name, slug: slugify(spec.name),
      tagline: spec.tagline, description: spec.description, featured: !!spec.featured,
      branding: { primaryColor: spec.primaryColor, accentColor: spec.accentColor },
      contact: { email: spec.owner[1], phone: '+000 000 0000' },
      address: { line1: 'Main Street', city: spec.city, country: spec.country, location: { type: 'Point', coordinates: [spec.lng, spec.lat] } },
      timezone: spec.timezone, currency: spec.currency, locale: spec.locale,
      settings: { notifications: { email: true, whatsapp: spec.plan !== 'free' && spec.plan !== 'starter', reminderHours: [24, 2] } },
    });
    for (const [k, v] of Object.entries(spec.settings ?? {})) business.set(`settings.${k}`, v);
    void settings;
    await business.save();
    owner.memberships.push({ business: business._id, role: 'owner' });
    await owner.save();
    const plan = plans.find((p) => p.key === spec.plan)!;
    await Subscription.create({ business: business._id, plan: plan._id, interval: 'monthly', status: 'active', currentPeriodEnd: now.plus({ days: 20 }).toJSDate(), provider: 'manual' });

    const branch = await Branch.create({ business: business._id, name: `${spec.city} — Main`, address: business.address, workingHours: spec.hours });
    const staff: Array<InstanceType<typeof Staff>> = [];
    for (const s of spec.staff) {
      const doc = await Staff.create({ business: business._id, name: s.name, title: s.title, color: s.color, bio: s.bio, email: s.login, branches: [branch._id], workingHours: [] });
      if (s.login) {
        const u = await User.create({ name: s.name, email: s.login, passwordHash: pw.staff, role: 'staff', memberships: [{ business: business._id, role: 'staff', staff: doc._id }] });
        doc.user = u._id;
        await doc.save();
      }
      staff.push(doc);
    }
    const resources = await Resource.insertMany((spec.resources ?? []).map((r) => ({ ...r, business: business._id, branch: branch._id })));
    const services: Array<InstanceType<typeof Service>> = [];
    for (const [i, s] of spec.services.entries()) {
      services.push(
        await Service.create({
          business: business._id, name: s.name, group: s.group, description: s.description, duration: s.duration, price: s.price,
          bufferAfter: s.bufferAfter ?? 0, capacity: s.capacity ?? 1, sortOrder: i, color: s.color ?? pick(['#6366f1', '#0ea5e9', '#14b8a6', '#f59e0b', '#ec4899']),
          staff: (s.staffIdx ?? []).map((x) => staff[x]._id), resources: (s.resourceIdx ?? []).map((x) => resources[x]._id),
          branches: [branch._id], sessionModes: s.modes ?? ['in_person'],
        }),
      );
    }
    const prices = services.map((s) => s.price);
    business.priceRange = { min: Math.min(...prices), max: Math.max(...prices) };
    await business.save();

    // A public holiday next week + one staff day off.
    const holiday = now.setZone(spec.timezone).plus({ days: 9 }).startOf('day');
    await AvailabilityException.create({ business: business._id, scope: 'business', start: holiday.toJSDate(), end: holiday.plus({ days: 1 }).toJSDate(), kind: 'closed', reason: 'Public holiday' });
    if (staff[0]) {
      const off = now.setZone(spec.timezone).plus({ days: 4 }).startOf('day');
      await AvailabilityException.create({ business: business._id, scope: 'staff', ref: staff[0]._id, start: off.toJSDate(), end: off.plus({ days: 1 }).toJSDate(), kind: 'closed', reason: 'Annual leave' });
    }

    // Customers (shared people across businesses, linked to user accounts when they have one).
    const customers: Array<InstanceType<typeof Customer>> = [];
    for (const [name, email, phone] of CUSTOMERS) {
      const user = customerUsers.find((u) => u.email === email);
      customers.push(await Customer.create({ business: business._id, name, email, phone, user: user?._id }));
    }

    // Bookings: 30 days back, 14 days forward, generated on the working-hours grid without overlaps.
    const taken = new Set<string>();
    const reviewsToCreate: Array<Record<string, unknown>> = [];
    for (let d = -30; d <= 14; d++) {
      const day = now.setZone(spec.timezone).plus({ days: d }).startOf('day');
      if (d === 9) continue; // holiday
      const dayHours = spec.hours.find((h) => h.day === day.weekday % 7);
      if (!dayHours?.enabled) continue;
      const perDay = Math.floor(rnd() * 4) + (d < 0 ? 2 : 1);
      for (let n = 0; n < perDay; n++) {
        const service = pick(services);
        const iv = pick(dayHours.intervals);
        const [sh, sm] = iv.start.split(':').map(Number);
        const [eh, em] = iv.end.split(':').map(Number);
        const slots = Math.floor(((eh * 60 + em) - (sh * 60 + sm) - service.duration) / 30);
        if (slots < 0) continue;
        const start = day.set({ hour: sh, minute: sm }).plus({ minutes: 30 * Math.floor(rnd() * (slots + 1)) });
        const staffId = service.staff.length ? pick(service.staff) : undefined;
        const resourceId = service.resources.length ? pick(service.resources) : undefined;
        const unit = String(staffId ?? resourceId ?? service._id);
        // Reject overlaps on the same unit (30-minute granularity is enough for seed data).
        const blocks = Array.from({ length: Math.ceil((service.duration + service.bufferAfter) / 30) }, (_, k) => `${unit}|${start.plus({ minutes: 30 * k }).toISO()}`);
        if (blocks.some((b) => taken.has(b))) continue;
        blocks.forEach((b) => taken.add(b));
        const customer = pick(customers);
        const past = d < 0 || (d === 0 && start < now);
        const status = past ? (rnd() < 0.8 ? 'completed' : rnd() < 0.5 ? 'no_show' : 'cancelled') : spec.settings?.requireApproval && rnd() < 0.5 ? 'pending' : 'confirmed';
        const attendees = service.capacity > 1 ? Math.ceil(rnd() * Math.min(3, service.capacity)) : 1;
        const amount = service.price * attendees;
        const paid = status === 'completed' ? amount : status === 'confirmed' && rnd() < 0.4 ? Math.round(amount * 0.2) : 0;
        const staffDoc = staff.find((s) => String(s._id) === String(staffId));
        const booking = await Booking.create({
          business: business._id, branch: branch._id, service: service._id, staff: staffId, resource: resourceId, customer: customer._id, user: customer.user,
          reference: bookingReference(), start: start.toJSDate(), end: start.plus({ minutes: service.duration }).toJSDate(), timezone: spec.timezone,
          attendees, status, mode: service.sessionModes[0], source: pick(['web', 'web', 'web', 'dashboard']),
          snapshot: { serviceName: service.name, staffName: staffDoc?.name, customerName: customer.name, customerEmail: customer.email, customerPhone: customer.phone, duration: service.duration },
          price: { amount, currency: spec.currency, deposit: 0, paid, status: amount === 0 ? 'paid' : paid >= amount ? 'paid' : paid > 0 ? 'partially_paid' : 'unpaid', method: amount === 0 ? 'none' : rnd() < 0.5 ? 'online' : 'cash' },
          slotKey: service.capacity > 1 || !['pending', 'confirmed'].includes(status) ? undefined : `${staffId ? `st:${staffId}` : resourceId ? `rs:${resourceId}` : `sv:${service._id}`}|${start.toUTC().toISO()}`,
          cancellation: status === 'cancelled' ? { by: 'customer', reason: 'Change of plans', at: start.minus({ days: 1 }).toJSDate(), fee: 0 } : undefined,
          history: [{ action: 'created', to: 'confirmed', at: start.minus({ days: 3 }).toJSDate() }],
          reminderSentAt: past ? start.minus({ days: 1 }).toJSDate() : undefined,
          reviewRequestedAt: status === 'completed' ? start.plus({ hours: 3 }).toJSDate() : undefined,
          createdAt: start.minus({ days: Math.ceil(rnd() * 10) }).toJSDate(),
        });
        bookingCount++;
        if (paid > 0) {
          await Payment.create({ business: business._id, booking: booking._id, customer: customer._id, user: customer.user, amount: paid, currency: spec.currency, kind: paid >= amount ? 'full' : 'deposit', method: booking.price!.method === 'cash' ? 'cash' : 'online', provider: booking.price!.method === 'cash' ? 'cash' : 'test', status: 'succeeded', paidAt: start.minus({ days: past ? 0 : 1 }).toJSDate(), invoiceNumber: `INV-${business.slug.slice(0, 6).toUpperCase()}-${String(++business.invoiceSeq).padStart(5, '0')}` });
        }
        const inc: Record<string, number> = { 'stats.bookings': 1 };
        if (status === 'completed') Object.assign(inc, { 'stats.completed': 1, 'stats.totalSpent': amount });
        if (status === 'no_show') inc['stats.noShows'] = 1;
        if (status === 'cancelled') inc['stats.cancelled'] = 1;
        await Customer.updateOne({ _id: customer._id }, { $inc: inc, ...(status === 'completed' ? { $max: { 'stats.lastVisitAt': start.toJSDate() } } : {}) });
        if (status === 'completed' && customer.user && rnd() < 0.55) {
          const [rating, comment] = pick(COMMENTS);
          reviewsToCreate.push({ business: business._id, booking: booking._id, user: customer.user, customer: customer._id, staff: staffId, service: service._id, authorName: customer.name.split(' ')[0], rating, comment, createdAt: start.plus({ hours: 5 }).toJSDate(), ...(rnd() < 0.3 ? { reply: { text: 'Thank you for your kind words — see you soon!', at: start.plus({ days: 1 }).toJSDate() } } : {}) });
        }
      }
    }
    await business.save();
    if (reviewsToCreate.length) await Review.insertMany(reviewsToCreate);
    const [agg] = await Review.aggregate([{ $match: { business: business._id } }, { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } }]);
    await Business.updateOne({ _id: business._id }, { $set: { rating: { average: Math.round((agg?.avg ?? 0) * 10) / 10, count: agg?.n ?? 0 } } });
    for (const s of staff) {
      const [sa] = await Review.aggregate([{ $match: { staff: s._id } }, { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } }]);
      await Staff.updateOne({ _id: s._id }, { $set: { rating: { average: Math.round((sa?.avg ?? 0) * 10) / 10, count: sa?.n ?? 0 } } });
    }
    log(`  ✓ ${spec.name} (${spec.category})`);
  }

  // A pending business to demo the approval queue.
  const pendingOwner = await User.create({ name: 'New Owner', email: 'pending@bookly.dev', passwordHash: pw.owner, role: 'business_owner' });
  const pending = await Business.create({ owner: pendingOwner._id, category: cats[1]._id, name: 'Velvet Barber Lounge', slug: 'velvet-barber-lounge', tagline: 'Classic cuts & hot-towel shaves', status: 'pending', address: { city: 'Jeddah', country: 'Saudi Arabia', location: { type: 'Point', coordinates: [39.1925, 21.4858] } }, currency: 'SAR' });
  pendingOwner.memberships.push({ business: pending._id, role: 'owner' });
  await pendingOwner.save();
  await Branch.create({ business: pending._id, name: 'Main branch', workingHours: defaultWeeklySchedule() });
  await Subscription.create({ business: pending._id, plan: plans[0]._id });

  log(`\nSeeded ${BUSINESSES.length + 1} businesses, ${bookingCount} bookings.`);
  log('\nDemo accounts:');
  log('  Super admin     admin@bookly.dev    / Admin123!');
  log('  Business owner  clinic@bookly.dev   / Owner123!   (also salon@, tutor@, legal@, auto@, hive@, civic@)');
  log('  Staff           layla@bookly.dev    / Staff123!   (also maya@bookly.dev)');
  log('  Customer        sara@example.com    / Customer123! (also yousef@, emily@, ahmed@, lina@)');
}

async function main() {
  if (env.NODE_ENV === 'production' && process.env.SEED_FORCE !== 'true') throw new Error('Refusing to seed in production');
  await connectDb();
  await seed();
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error(err);
    await mongoose.disconnect();
    process.exit(1);
  });
}

export { Types };
