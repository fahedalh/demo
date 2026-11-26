# PROJECT_CONTEXT — Masar ride-hailing platform

> Living status file. Update it at every significant milestone. When resuming work, read this **and** verify the real state (`pnpm typecheck && pnpm test`, run the apps) — never assume a feature works because it is listed here.

_Last updated: 2026-11-26_

## Architecture (summary)

pnpm monorepo. `apps/api` (Express 5 + Socket.IO + Prisma/Postgres + Redis) serves three React/Vite apps: `passenger-web` (:5173), `driver-web` (:5174), `admin-dashboard` (:5175). Shared code: `packages/shared` (state machine, pricing, geo, zod schemas, DTO/socket types) and `packages/ui` (design system, Leaflet map, i18n EN/AR, API/auth/socket clients). Details: [docs/architecture.md](docs/architecture.md).

## Technology decisions

| Decision | Why |
|---|---|
| pnpm workspaces, packages consumed as TS source | No build step for shared code; esbuild bundles it into the API artefact |
| Express 5 + zod | Native async error handling; one schema set shared with the frontends |
| Prisma 6 (not 7) | Stable, well-known API; migration to 7 is straightforward later |
| Money as Int minor units | No floating-point drift in fares/ledgers |
| Redis GEO for live positions | Sub-ms nearest-driver queries; Postgres keeps throttled copies + trails |
| In-process dispatch timers + `recover()` | Simple and correct for one instance; documented path to BullMQ for many |
| Leaflet + CARTO tiles (not Mapbox GL / Google JS) | No browser key needed; tile URL configurable; server-side geo adapters for Mapbox/Google |
| Sandbox payment gateway as default | Full payment flow testable offline; Stripe adapter behind the same interface |
| Refresh token in httpOnly cookie per app | XSS can't read it; apps on different localhost ports don't clobber each other's sessions |
| Tailwind v4 + hand-written shadcn-style components | Tokens in CSS, no generator dependency; Radix for accessible primitives |
| React Router 7, TypeScript 5.9, Vite 7, Vitest 3 | Latest versions with stable, known APIs (newer majors existed but were skipped deliberately) |

## Implementation status

| Area | Status |
|---|---|
| Monorepo, tooling, ESLint/Prettier, CI workflow | ✅ |
| Prisma schema (all required models + RefreshToken, OtpCode, RideOffer, Refund, CouponRedemption, TicketMessage, SystemSetting), migrations, deterministic seed | ✅ |
| Auth: register/login/refresh rotation + reuse detection/logout/logout-all, OTP verify/login, password reset/change, app-role enforcement, social-login architecture (501 until configured) | ✅ |
| Ride state machine + transitions with optimistic locking + history | ✅ |
| Dispatch: nearest eligible driver, sequential offers, timeout/reject, retry window, NO_DRIVER_AVAILABLE/EXPIRED, restart recovery, scheduled-ride dispatcher | ✅ |
| Pricing: per category × area, dynamic surge with cap, minimum fare, coupons, upfront pricing with deviation re-metering | ✅ |
| Payments: sandbox + Stripe gateways, cash/card/wallet, retries, tips, cancellation fees, refunds, signed idempotent webhooks, receipts | ✅ (Stripe adapter not exercised against live Stripe here) |
| Driver money: earnings, commission (cash = owed), wallet ledger, payouts with admin approval | ✅ |
| Realtime: JWT socket auth, rooms, live location, chat, notifications, admin live feed, SOS alerts | ✅ |
| Passenger app (all screens in README) | ✅ |
| Driver app incl. onboarding + document upload + GPS simulation | ✅ |
| Admin console (overview, live map, rides, users, verification, finance, pricing/areas/categories, promotions, support/reviews, settings/admins, logs) | ✅ |
| i18n EN/AR with RTL, dark/light theme, PWA manifest + service worker | ✅ |
| Docker (api, web/nginx), docker-compose, deployment docs | ✅ written; **not built here** (no Docker daemon in the dev sandbox) |

## Tests (last run 2026-11-26)

* `packages/shared` — 12 unit tests (state machine, fares, coupons, earnings split, geo, validation) ✅
* `apps/api` — 30 integration tests over real HTTP + Socket.IO + Postgres + Redis ✅: full workflow (estimate → book → realtime offer → accept → live location → chat → PIN start → complete → card charge → rating + tip → admin timeline/finance), duplicate/idempotent booking, reject → next driver, offer timeout → EXPIRED, NO_DRIVER_AVAILABLE, cancel while searching, cash commission accounting, declined card → PAYMENT_PENDING → retry, auth (OTP, refresh rotation + reuse revocation, role per app, password reset), RBAC, suspension, socket auth, upload sniffing, private documents, sandbox cards, wallet top-up, webhook signatures/idempotency, refunds.
* `scripts/e2e-flow.cjs` — Playwright, passenger + driver apps in two browsers, full trip ✅
* Manual visual checks (screenshots): desktop + iPhone viewport, English + Arabic RTL, all admin pages.
* `pnpm lint`, `pnpm typecheck`, `pnpm build` ✅

## Database structure

See [docs/database.md](docs/database.md). 35 models; money in fils; soft deletes on user-owned records.

## API endpoints

See [docs/api-documentation.md](docs/api-documentation.md) (REST + Socket.IO contract).

## Important configuration

`.env` at the repo root is read by the API (`tsx --env-file`) and by Vite (`envDir: ../..`). Key switches: `GEO_PROVIDER`, `PAYMENT_PROVIDER`, `SOCKET_REDIS_ADAPTER`, `OTP_DELIVERY`, `VITE_MAP_TILE_URL`. Platform settings (dispatch radius, offer timeout, free-cancel window, maintenance mode) are edited in *Admin → Settings* and stored in `SystemSetting`.

## Known issues / limitations

* Dispatch timers are per process: run one API instance, or move timers to a queue before scaling out (Socket.IO Redis adapter is already supported).
* OTP delivery and social login are architecture-only (console delivery; social endpoint returns 501).
* Stripe card entry UI uses the sandbox form; with `PAYMENT_PROVIDER=stripe` the web apps still need Stripe Elements wired to `POST /payments/setup-session` (the API side is implemented).
* Push notifications (FCM/APNs) are not implemented — notifications are in-app (persisted + realtime).
* The offline `local` geo provider approximates roads with curved paths; use `osm`/`mapbox`/`google` for real routing.
* Seeded driver documents are 1×1 placeholder images.
* Main JS bundles are ~340–365 KB gzipped; further splitting (e.g. lazy Framer Motion, `zod/mini`) is possible.
* The `LICENSE` file (MIT, 2017, no copyright holder named) is inherited from the repository's previous content; the owner should confirm or replace it.

## Pending tasks / next steps

1. Stripe Elements card form + 3-D Secure (`REQUIRES_ACTION`) handling in the passenger app.
2. SMS/email OTP adapters (Twilio, SES) and Google/Apple ID-token verifiers.
3. BullMQ (or similar) for dispatch timers and scheduled rides → horizontal scaling.
4. S3/GCS document storage with signed URLs.
5. Push notifications (web push + mobile).
6. Driver heat-map / demand forecasting in the admin console; surge zones per polygon.
7. Multi-stop trips and ride sharing.
8. Native mobile apps (React Native) reusing `packages/shared`.
