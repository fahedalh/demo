# Technical Architecture

## 1. Overview

```
┌──────────────┐  HTTPS/JSON + cookies   ┌───────────────────────────┐      ┌──────────┐
│ React SPA    │ ──────────────────────▶ │ Express API (TypeScript)  │ ───▶ │ MongoDB  │
│ Vite + TS    │ ◀── Socket.IO (wss) ─── │  modules/* · services/*   │      └──────────┘
└──────────────┘                         │  jobs/* (reminders)       │ ───▶ ┌──────────┐
                                         │  integrations/* adapters  │      │ Redis    │ locks, cache,
                                         └───────────────────────────┘      └──────────┘ rate limits
                                            │ Stripe · SMTP · WhatsApp · Twilio · Cloudinary · LLM
```

* **Monorepo** (`npm workspaces`): `client`, `server`, `shared` (constants & types used by both).
* **Shared database, tenant-scoped documents.** Every tenant document carries `business`.
  Tenant routes are mounted under `/api/businesses/:businessId/...`; the `tenant` middleware loads
  the business and checks that the caller is its owner, a member (manager/staff) or a super admin.
  Repositories never query tenant collections without the business filter.

## 2. Backend layout (`server/src`)

| Folder | Purpose |
|--------|---------|
| `config/` | env parsing (Zod — the process refuses to start on invalid config), Mongo, Redis, logger |
| `middleware/` | `auth` (JWT), `authorize` (roles/permissions), `tenant`, `validate` (Zod), `rateLimit`, `error` |
| `modules/<feature>/` | `*.model.ts`, `*.schema.ts` (Zod), `*.service.ts`, `*.routes.ts` per feature |
| `services/` | cross-cutting domain services: `availability` (pure slot engine), `bookingLock`, `notification`, `planLimits`, `audit`, `cache` |
| `integrations/` | provider adapters: `payments/` (stripe, cash, test), `messaging/` (email, whatsapp, sms, push), `storage/` (cloudinary), `ai/` (heuristic, anthropic) |
| `jobs/` | in-process scheduler: reminders, review requests, lock cleanup |
| `realtime/` | Socket.IO server; rooms `user:<id>`, `business:<id>` |
| `docs/openapi.yaml` | OpenAPI 3.1 served at `/api/docs` |

### Request pipeline
`helmet → cors → json(1mb) → cookieParser → sanitize → pino-http → rateLimit → routes → 404 → errorHandler`

Errors are thrown as `AppError(status, code, message, details)` and serialised as
`{ error: { code, message, details } }`.

### Auth
* Access token: JWT (15 min) in `Authorization: Bearer`.
* Refresh token: random 48-byte token in an httpOnly, `SameSite=Lax` cookie scoped to `/api/auth`,
  stored **hashed** in `refreshtokens` with a `family`. Rotation on every refresh; reuse of a
  revoked token revokes the whole family.
* Roles: `super_admin`, `business_owner`, `staff`, `customer`. Business-level membership roles:
  `owner`, `manager`, `staff`, each mapped to a permission set (see `shared/src/permissions.ts`).

### Booking engine
1. `availability.service.ts` — **pure** function `computeSlots(input)`; no I/O, fully unit tested.
2. `bookings.service.ts` gathers inputs (business settings, branch, staff, exceptions, bookings in
   window), calls the engine, and on create:
   * acquires `bookingLock.withLocks(["staff:<id>", "resource:<id>"])` (Redis `SET NX PX` + Lua
     release; in-process mutex fallback when Redis is absent),
   * recomputes availability for the exact slot (never trusts the client),
   * writes the booking with `slotKey` (`staff|start` for 1:1 services) protected by a **unique
     sparse index** — a second line of defence if locks are misconfigured,
   * emits domain events → notification service.

### Configurable industries
`BusinessCategory.bookingFlow` drives the booking wizard on the client (`steps`, `labels`,
`customFields`, `sessionModes`). The wizard is a single component that renders steps from config —
there are no per-industry code paths.

### Plan limits
`planLimits.assert(businessId, 'staff' | 'branches' | 'bookingsPerMonth' | feature)` runs before
create operations and returns `402 PLAN_LIMIT` with upgrade info.

### Notifications
`notificationService.emit(event, payload)` → resolves recipients → for each enabled channel picks
the template (business override → global default, locale fallback to `en`) → renders
`{{placeholders}}` → sends via adapter. In-app notifications are persisted and pushed over Socket.IO.
Adapters without credentials log to the console (development) and record `status: "skipped"`.

### AI layer
`integrations/ai/index.ts` exposes `getAI()` returning an `AIProvider`. The heuristic provider is
always available; when `ANTHROPIC_API_KEY` is set, the LLM provider handles description generation
and NL query parsing, falling back to heuristics on error.

## 3. Frontend layout (`client/src`)

| Folder | Purpose |
|--------|---------|
| `components/ui` | design-system primitives (shadcn/ui pattern on Radix) |
| `components/` | shared composites (DataTable, PageHeader, EmptyState, StatCard, ...) |
| `features/<area>` | feature hooks + components: `auth`, `booking`, `calendar`, `business`, `admin`, `customer`, `search` |
| `layouts/` | `PublicLayout`, `DashboardLayout` (role-aware sidebar) |
| `pages/` | route components (lazy loaded) |
| `services/` | `api.ts` (fetch wrapper with refresh-on-401), `socket.ts` |
| `contexts/` | `AuthContext`, `ThemeContext` |
| `locales/` | `en/*.json`, `ar/*.json` |

Server state lives in TanStack Query; forms use React Hook Form + Zod resolvers; theme and
direction are applied on `<html>` (`class="dark"`, `dir="rtl"`, `lang`).

### Route map
```
/                         landing            /explore           search + map
/b/:slug                  business page + booking wizard
/track                    guest booking lookup             /pricing, /contact, /login, /register
/account/*                customer: overview, bookings, favorites, payments, notifications, profile
/dashboard/:businessId/*  business: overview, calendar, bookings, services, staff, branches,
                          resources, customers, payments, reviews, settings
/staff/*                  staff: my calendar, requests
/admin/*                  overview, businesses, users, categories, plans, payments, settings, audit
/onboarding               create a business
```

## 4. Deployment
`docker-compose.yml` runs `mongo` (single-node replica set), `redis`, `server` and `client`
(nginx serving the static build and proxying `/api` + `/socket.io`). All secrets are environment
variables; see `server/.env.example`.

## 5. Key decisions (ADR summary)
| # | Decision | Why |
|---|----------|-----|
| 1 | Shared DB + `business` field, not DB-per-tenant | Simpler ops; indexes start with `business` |
| 2 | Weekly schedules embedded in Branch/Staff/Resource (`WorkingHours` is a sub-schema) | Always read with the owner; exceptions live in their own `availabilityexceptions` collection |
| 3 | Custom fields & booking policies embedded (`Category`, `Service`, `Business.settings`) | Read on every booking; versioning not required for MVP |
| 4 | Pure availability engine | Deterministic, unit-testable, reusable for search "available on" |
| 5 | Lock + unique slot key | Defence in depth against race conditions without requiring Mongo transactions |
| 6 | Provider adapters for payments/messaging/AI | No hard-coded vendors or credentials |
| 7 | CommonJS server build, `shared/` compiled alongside | No runtime path-alias loaders in production |
| 8 | Industry themes are presets (data), resolved business → category → default | Industry-specific look without per-industry code; admins add/assign presets |
