# Product Requirements Document — Bookly

> Working product name: **Bookly** (white-label friendly; every business sees its own brand).

## 1. Vision

One configurable booking engine that serves any industry that sells time: clinics, salons, tutors,
consultants, garages, meeting rooms, venues and public-service counters. Each business gets its own
dashboard, data, staff, branding and public booking URL (`/b/:slug`). The platform is bilingual
(English / Arabic with full RTL) from day one and has an optional AI layer.

Positioning: Calendly's simplicity + SimplyBook.me's configurability + Booksy's marketplace discovery,
with broader industry coverage and Arabic-first support.

## 2. Personas & roles

| Role | Goal | Key jobs |
|------|------|----------|
| Super Administrator | Run the platform | Approve/suspend businesses, manage categories & their booking flows, plans, users, global settings, audit logs, platform revenue |
| Business Owner (and Manager) | Fill the calendar, get paid | Profile & branding, branches, staff, services, hours, reservations, customers, payments, reviews, notifications, policies |
| Staff / Service Provider | Run their day | Personal calendar, accept/reject requests, mark complete/no-show, notes, availability & time off |
| Customer | Book quickly, manage bookings | Discover, book, pay, reschedule, cancel, review, favourites, notifications |
| Guest | Book without an account | Book (if the business allows it), track by booking reference + email |

## 3. Functional scope

### 3.1 Multi-industry configuration (no code changes per industry)
A **BusinessCategory** defines, per industry:
- terminology (e.g. staff → "Doctor" / "Stylist" / "Tutor" / "Advisor"; service → "Consultation" / "Treatment" / "Session"), localized EN/AR;
- the booking flow steps and which are required (`service`, `staff`, `resource`, `datetime`, `details`, `payment`);
- supported session modes (in person / online);
- default custom fields asked at booking time (e.g. vehicle plate for automotive, date of birth for medical);
- whether resource booking (rooms, bays, equipment) is the primary entity.

Super admins create new categories from the admin UI; businesses inherit the flow and can add
service-level custom fields.

### 3.2 Booking engine
- Real-time availability computed from: branch hours ∩ staff hours − breaks − exceptions (holidays,
  time off) − existing bookings (with buffers) − notice/advance windows. Resource and capacity aware.
- Configurable slot interval, durations, buffers before/after, minimum notice, max days in advance.
- Group / capacity bookings (e.g. workshop for 12), resource bookings (room, bay, vehicle).
- Approval workflow (pending → confirmed / rejected) configurable at business and service level.
- Deposits, full or partial payment, pay at location.
- Cancellation & reschedule policies (cut-off hours, max reschedules, fees).
- Recurring appointments (weekly / bi-weekly / monthly, N occurrences; each occurrence validated).
- Waiting list when no slot is available on a date.
- Double-booking prevention: distributed lock (Redis, in-process fallback) + unique DB slot key.
- Timezones: everything stored in UTC; business/branch timezone drives slot generation; the client
  shows times in the business timezone with a clear label.
- Custom booking questions (text, textarea, number, select, checkbox, date, phone, email).

### 3.3 Interfaces
Public website, customer dashboard, business dashboard, staff workspace, admin dashboard
(see `DESIGN_SYSTEM.md` and the route map in `ARCHITECTURE.md`).

### 3.4 Notifications
Events: booking received, confirmed, rejected, cancelled, reminder, payment received, rescheduled,
review request. Channels: in-app (real-time via Socket.IO), email (SMTP), WhatsApp (Cloud API),
SMS (Twilio), push (adapter interface). Businesses override templates per event/channel/locale.

### 3.5 Payments & monetization
Provider adapter interface (Stripe implemented; cash/manual built-in; a clearly-labelled *test*
provider for development). Deposits, partial payments, refunds, invoices (sequential numbers per
business), transaction history, revenue reports.

SaaS plans: Free, Starter, Professional, Enterprise — monthly/annual prices and configurable limits
(staff, branches, bookings/month, custom branding, integrations, AI, advanced analytics). Limits are
enforced server-side.

### 3.6 Discovery
Search by text, category, city, price range, rating, provider name, "available on date",
and geo radius (MongoDB `2dsphere`), with an interactive map.

### 3.7 Internationalization
EN + AR with mirrored RTL layouts (logical CSS properties, mirrored icons, Arabic typeface),
translation files per namespace, per-business currency and timezone, localized date formatting,
localized notification templates.

### 3.8 AI layer (optional, modular)
`AIProvider` interface with a dependency-free heuristic provider (always on) and an LLM provider
(enabled when an API key is set). Features: natural-language search, recommendations, no-show risk,
AI business descriptions. Further features (assistant chat, schedule optimisation, follow-ups) plug
into the same interface.

## 4. Non-functional requirements
- Security: bcrypt, short-lived JWT access + rotating refresh tokens (httpOnly cookie, reuse
  detection), RBAC + permissions, tenant isolation, rate limiting, validation (Zod), Mongo operator
  sanitisation, Helmet, strict CORS, audit logs, upload type/size limits.
- Performance: indexes on all tenant/date queries, pagination everywhere, Redis cache for public
  catalog reads, lean queries, code-split client routes.
- Accessibility: keyboard reachable, focus rings, labelled inputs, contrast ≥ 4.5:1, reduced motion.
- SEO: semantic HTML, per-page titles/meta, business pages with JSON-LD `LocalBusiness`.
- Runnable after every milestone; documented in `PROJECT_CONTEXT.md`.

## 5. MVP definition (Milestone 1)
Everything needed for a business to sign up, configure services/staff/hours, take real bookings
(registered or guest), manage them on a calendar, get notified, and for customers to discover,
book, cancel/reschedule and review — in EN and AR. Admin can manage businesses, categories, plans,
users and see audit logs. See `ROADMAP.md` for what follows.

## 6. Success metrics
Booking conversion (slot view → booking), no-show rate, time-to-first-booking for new businesses,
monthly active businesses, MRR.
