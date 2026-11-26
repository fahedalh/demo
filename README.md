# Masar · مسار

A complete ride-hailing platform: a **passenger app**, a **driver app** and an **operations console**, all on one Node.js backend with real-time dispatch, live tracking, payments and full Arabic/English support.

| | |
|---|---|
| **Frontend** | React 19 · Vite 7 · TypeScript · Tailwind CSS v4 · shadcn-style components (Radix) · Framer Motion · React Router 7 · TanStack Query · Zustand · React Hook Form + Zod · Leaflet · Recharts |
| **Backend** | Node.js · Express 5 · TypeScript · Socket.IO · JWT + rotating refresh tokens · Argon2id · Zod |
| **Data** | PostgreSQL 16 · Prisma 6 (migrations + seed) · Redis 7 (live locations, dispatch locks, caching, rate limits) |
| **Integrations** | Payment gateway layer (Sandbox · Stripe) · Map layer (offline · OSM · Mapbox · Google) · OTP delivery layer |
| **Ops** | pnpm monorepo · Docker / Compose / nginx · GitHub Actions CI · ESLint · Prettier · Vitest · Playwright |

## Quick start

```bash
pnpm install
cp .env.example .env                   # then set JWT secrets: openssl rand -hex 48
docker compose up -d postgres redis    # or use local Postgres 16 + Redis 7
pnpm db:generate && pnpm db:deploy && pnpm db:seed
pnpm dev
```

| App | URL | Demo login |
|---|---|---|
| Passenger | http://localhost:5173 | `passenger@masar.demo` / `Passenger123!` |
| Driver | http://localhost:5174 | `driver@masar.demo` / `Driver123!` |
| Admin | http://localhost:5175 | `admin@masar.demo` / `Admin123!` |
| API | http://localhost:4000/api/health | |

The demo city is Dubai. Everything works **without any API keys**: maps use an offline provider plus free CARTO tiles, payments use a built-in sandbox (test card `4242 4242 4242 4242`), and OTP codes are printed in the API log. Each simulated part is labelled and has a real adapter behind the same interface (Stripe, Mapbox/Google/OSM, SMS/email).

**Try the full flow:** in the driver app go online (the *Demo GPS simulation* drives the car for you) → book a ride in the passenger app → accept the request → watch the car approach → *I've arrived* → *Start trip* with the passenger's PIN → *Complete* → rate the driver → see the trip and money in the admin console. Step-by-step in [docs/setup.md](docs/setup.md).

Full stack in containers: `docker compose up -d --build` → passenger :8080, driver :8081, admin :8082 ([docs/deployment.md](docs/deployment.md)).

## What's inside

**Passenger** — email/phone sign-up, OTP verification, password reset, social-login hooks · map-first booking with autocomplete, current location, pin-on-map and saved places · six categories (Economy, Comfort, Premium, XL, Business, Electric) with upfront fares, ETA and surge · cash/card/wallet, promo codes, scheduled rides, pickup notes · animated driver search · live driver tracking, trip PIN, chat, call, share, SOS · rating, tags and tips · receipts, ride history, wallet top-ups, saved cards · emergency contacts, notifications, help centre and issue reports.

**Driver** — application flow with personal details, vehicle and document uploads, review status · online/offline with live location · full-screen request card with countdown and estimated earnings · navigation hand-off, arrived → PIN-verified start → complete, no-show handling, problem reports, SOS · today/week earnings, acceptance rate, rating · earnings charts, commission breakdown, cash vs. card, weekly reports, wallet, withdrawals and payout history · vehicles, documents, reviews.

**Admin** — KPIs and daily/weekly/monthly charts · live operations map · ride search, filters, CSV export and full ride forensics (timeline, dispatch offers, GPS trail, payments, chat) with cancel/force-complete · user management with suspension · driver verification with document preview and per-document review · finance (bookings, commission, refunds, payouts, top drivers) · pricing per category and area, surge caps, categories, service areas · coupons, campaigns, broadcast notifications · support tickets with internal notes, review moderation · platform settings, admin roles (RBAC) and an activity log.

**Platform** — validated ride state machine with optimistic locking · nearest-driver dispatch with offer timeouts, retries and restart recovery · duplicate-request protection and idempotency keys · Socket.IO with JWT auth, reconnection recovery and server-side room joins · integer money, ledgered wallets, commission and promo accounting · signed, idempotent payment webhooks · PWA install + offline shell · dark/light themes · RTL Arabic.

## Repository layout

```
apps/
  api/               Express + Socket.IO API (src/routes, src/services, src/realtime, test/, scripts/)
  passenger-web/     Rider app
  driver-web/        Driver app
  admin-dashboard/   Operations console
packages/
  shared/            State machine, pricing, geo, zod schemas, DTO + socket types (+ unit tests)
  ui/                Design system, map, i18n, API/auth/socket clients
  config/            TypeScript base configs
prisma/              schema.prisma, migrations/, seed.ts
infrastructure/      Dockerfiles, nginx
docs/                architecture, API, database, setup, deployment
scripts/             end-to-end browser test
PROJECT_CONTEXT.md   Living project status for contributors
```

## Scripts

| Command | |
|---|---|
| `pnpm dev` | API + all three apps with hot reload |
| `pnpm test` | Unit + API integration tests (real Postgres/Redis/Socket.IO) |
| `pnpm test:e2e` | Browser test of the whole booking flow across two apps |
| `pnpm lint` · `pnpm typecheck` · `pnpm format` | Code quality |
| `pnpm build` | Production builds (API bundle + three static apps) |
| `pnpm db:deploy` · `pnpm db:seed` · `pnpm db:migrate` | Database |
| `pnpm simulate:drivers` | Extra simulated drivers moving around the city |

## Documentation

* [Architecture](docs/architecture.md) — system design, dispatch, pricing, payments, security
* [API reference](docs/api-documentation.md) — REST endpoints and Socket.IO events
* [Database](docs/database.md) — data model, constraints, backups
* [Setup](docs/setup.md) — local development, demo walkthrough, troubleshooting
* [Deployment](docs/deployment.md) — Docker, cloud, production checklist, monitoring
* [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) — current status, known issues, next steps
