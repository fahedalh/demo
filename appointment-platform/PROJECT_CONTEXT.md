# PROJECT_CONTEXT

> Living document. Update at the end of every development session.
> Last updated: 2026-11-26 (session 1).

## 1. Vision
A premium, multi-tenant, multipurpose appointment booking SaaS — one configurable booking engine for
every industry that sells time (healthcare, beauty, education, professional services, automotive,
hospitality, public services). Arabic/English with real RTL, white-label booking pages, payments,
notifications, analytics and an optional AI layer. Details: `docs/PRD.md`.

## 2. Technology stack
* **Client:** React 18.3, Vite 5, TypeScript, Tailwind 3 (+ tailwindcss-animate), Radix primitives
  (shadcn/ui pattern, components in `client/src/components/ui`), Framer Motion, React Router 6,
  TanStack Query 5, React Hook Form + Zod, Recharts, react-leaflet (OSM tiles), i18next, luxon, sonner.
* **Server:** Node 20+, Express 4, TypeScript (CommonJS build), Mongoose 8, Zod, JWT + rotating
  refresh tokens, ioredis (optional), Socket.IO, pino, swagger-ui-express, Stripe SDK, nodemailer,
  Cloudinary SDK, multer, @anthropic-ai/sdk (optional).
* **Shared:** `shared/src/index.ts` (roles, permissions, statuses, events, schedule helpers),
  compiled to `shared/dist` for the server; the client imports the TS source via a Vite alias.
* **Ops:** Dockerfiles for server and client (nginx), `docker-compose.yml` (mongo replica set, redis).

## 3. Architecture decisions (see `docs/ARCHITECTURE.md` §5 for rationale)
1. Shared DB, tenant field `business` on every tenant document; tenant routes under
   `/api/businesses/:businessId/*` guarded by `loadTenant` + `can(permission)`.
2. Pure availability engine (`server/src/services/availability.engine.ts`) — no I/O, unit-tested.
3. Double booking prevention: lock (`bookingLock.ts`: Redis `SET NX PX`, in-process fallback) **and**
   unique sparse `slotKey` index on bookings (1:1 services).
4. Industry behaviour is data: `BusinessCategory.bookingFlow` (steps, custom fields, session modes,
   terminology). The single `BookingWizard` renders from it.
5. Weekly schedules embedded in Branch/Staff/Resource; exceptions (holidays, time off, extra hours)
   in `availabilityexceptions`.
6. Provider adapters for payments (Stripe, sandbox, cash), messaging (SMTP, WhatsApp Cloud API,
   Twilio SMS, push stub), storage (Cloudinary) and AI (heuristic + Claude). Missing credentials →
   adapter reports `skipped`, never crashes.
7. Plan limits enforced server-side (`planLimits.ts`): staff, branches, bookings/month, features
   (customBranding, ai, advancedAnalytics, whatsapp, integrations) → HTTP 402.
8. Staff workspace = the business dashboard filtered by permissions (`bookings:own`), not a
   separate app.
9. Subscriptions are paid through the same payment-provider checkout as bookings (Payment with
   `purpose: 'subscription'`); Stripe Billing (recurring) is a roadmap item.

## 4. Completed features
**Backend**
- Auth: register (customer/business), login, refresh rotation with reuse detection, logout(-all),
  profile, change password, rate limiting.
- RBAC: platform roles + business membership roles with editable permission sets (`roles` collection).
- Catalog CRUD: categories (admin), businesses (onboarding, settings, branding, policies), branches,
  staff (+ optional staff login), services (custom fields, buffers, capacity, deposits, approval
  override, resources), resources, availability exceptions (staff can manage their own time off).
- Booking engine: availability per day and per range, create (guest / customer / dashboard), auto
  staff assignment (least busy), resource assignment, group capacity, recurring (weekly, bi-weekly,
  monthly; skips unavailable occurrences), approval workflow, status transitions, reschedule
  (dashboard drag-and-drop + customer policy-checked), cancellation with policy & late fee,
  waiting list with auto email on cancellation, guest tracking by reference + email.
- Payments: sandbox + Stripe checkout, webhooks, cash recording, partial/full refunds, sequential
  invoice numbers, revenue summaries; subscription checkout & activation.
- Notifications: in-app (persisted + Socket.IO), email/WhatsApp/SMS adapters, EN/AR default
  templates, per-business template overrides, delivery log, reminder & review-request jobs.
- Analytics: business KPIs/series/top services/staff load/status/heatmap (plan-gated); platform
  analytics (MRR, GMV, sign-ups, categories, plans, top businesses).
- Admin: users (role/status), businesses (approve/suspend/feature), categories with flow editor,
  plans & subscriptions, payments, settings, roles/permissions, audit logs, contact inbox.
- Search: text + service/provider name, category, city, price, rating, geo radius ($geoNear),
  availability on a date, sorting, pagination; popular services.
- AI: provider interface; heuristic NL search parsing (EN/AR), no-show risk scoring,
  recommendations, business description generator; Claude provider when `ANTHROPIC_API_KEY` is set
  (server-side refusal fallback enabled, falls back to heuristics on error).
- Security: helmet, CORS allow-list, Mongo operator sanitisation + `sanitizeFilter`, Zod validation
  everywhere, rate limits (global/auth/booking/AI), upload MIME + magic-byte checks, audit logging.
- OpenAPI 3.1 spec served at `/api/docs` (+ `docs/API.md`).

**Frontend**
- Public: landing (hero with AI search, categories, featured, how it works, popular services,
  testimonials, pricing teaser, FAQ), explore (filters, URL state, map view, near me), business page
  (brand-tinted, JSON-LD, services/team/reviews/hours/map, booking wizard), track booking, pricing,
  contact, login/register (customer or business), sandbox checkout page, 404.
- Booking wizard: config-driven steps, staff choice/any, date strip with availability dots, grouped
  slots, attendees, session mode, custom questions, recurrence, payment choice, summary & policy,
  waitlist, success screen, conflict recovery.
- Customer area: overview, bookings (upcoming/past), booking detail (cancel, reschedule, pay,
  review, .ics, directions, history), favourites, payments, notifications, profile/password/prefs.
- Business dashboard: overview analytics + today + AI insights, calendar (day by staff / week /
  month, drag-and-drop move & reassign, closed-hours shading, now line), reservations (tabs, search,
  detail sheet with status actions, notes, cash payments, reschedule; new booking dialog), services,
  staff (+ hours, login), branches (+ hours, geo), resources, time off & holidays, customers (CRM
  notes/tags/history), payments (refunds, printable invoices), reviews (reply/hide), waiting list,
  settings (profile + AI description + uploads, branding preview, booking rules, payment &
  cancellation/reschedule policies, notifications, message templates, team access), plan & billing.
- Admin: overview, businesses, users, industries (flow/terminology/custom field editor), plans,
  subscriptions, payments, roles matrix, messages, audit logs, system settings.
- i18n: EN + AR (full translations, RTL via logical properties, Arabic typeface, mirrored icons),
  parity test; dark mode; real-time toasts; skeletons/empty/error states everywhere.

## 5. Current status
- Server: typechecks; 27 tests pass (engine incl. DST & capacity, locks/race, templates, AI
  heuristics, money units, HTTP smoke). 7 API integration tests are written but **skipped** here.
- Client: typechecks; production build OK (route-level code splitting); 6 tests pass.
- **Not yet verified end-to-end against a live MongoDB** — the development container could not
  download a MongoDB binary (network policy). Run `MONGODB_TEST_URI=… npm test -w server` and
  `npm run seed && npm run dev` locally to verify.

## 6. Known issues / limitations
- End-to-end flows have not been exercised against a real database in this environment (see above).
- Client main chunk ~490 kB (i18n JSON + Radix + luxon); locales could be lazy-loaded.
- Background jobs run in-process (idempotent); move to a worker/queue for large deployments.
- Push notifications and calendar sync (Google/Outlook) are interfaces only.
- Subscription renewals are not automated (no Stripe Billing yet); admins can adjust subscriptions.
- Custom domains are stored but routing/TLS for them is not implemented.
- `availableOn` search evaluates at most 60 candidates (latency bound).

## 7. Pending tasks (next session)
1. Run the integration suite and a manual pass against MongoDB; fix anything found.
2. Playwright E2E: guest booking, customer cancel/reschedule, owner confirm & drag-and-drop, admin approve.
3. Stripe Billing for recurring subscriptions; Stripe Connect for payouts to businesses.
4. Google/Outlook calendar sync; web push; WhatsApp template messages.
5. Lazy-load locale bundles; image optimisation; SSR/prerender for business pages (SEO).
6. AI assistant chat & schedule optimisation on top of `integrations/ai`.

## 8. Database structure
See `docs/ERD.md`. Collections: users, roles, refreshtokens, businesscategories, businesses,
branches, staff, services, resources, availabilityexceptions, customers, bookings, waitlistentries,
payments, plans, subscriptions, reviews, notifications, notificationtemplates,
notificationdeliveries, auditlogs, platformsettings, contactmessages.

## 9. API changes
Initial version (v0.1). Full list in `docs/API.md` / `/api/docs`. Notable conventions: errors
`{ error: { code, message, details.fields } }`, lists `{ items, total, page, limit, pages }`,
402 for plan limits, 409 `SLOT_UNAVAILABLE` for booking conflicts.

## 10. Important implementation notes
- Never trust client slot data: `createOne()` recomputes availability inside the lock.
- Dashboard bookings (`actor.kind === 'business'`) ignore notice/advance windows and auto-confirm.
- Times: stored UTC; local schedule strings interpreted in branch (or business) timezone via luxon.
- Customer bookings are linked by `user` **or** by matching email (guest bookings before sign-up).
- `PAYMENTS_TEST_PROVIDER` must be `false` in production unless explicitly wanted.
- Seed script refuses to run with `NODE_ENV=production` unless `SEED_FORCE=true`.
