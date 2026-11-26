# Bookly — multipurpose appointment booking SaaS

One configurable booking engine for clinics, salons, tutors, consultants, garages, meeting rooms,
venues and public-service counters. Multi-tenant, bilingual (English / Arabic with full RTL),
white-label, with payments, notifications, analytics and an optional AI layer.

**Stack:** React 18 + Vite + TypeScript + Tailwind + Radix (shadcn/ui pattern) + Framer Motion +
TanStack Query + React Hook Form/Zod + Recharts + Leaflet · Node.js + Express + TypeScript +
MongoDB/Mongoose + Redis (optional) + Socket.IO · Stripe/SMTP/WhatsApp/Twilio/Cloudinary/Claude adapters.

```
appointment-platform/
├── client/          React SPA (public site, customer area, business dashboard, admin)
├── server/          Express API (modules/*, services/*, integrations/*, jobs/*)
├── shared/          Constants & types used by both (roles, permissions, statuses, events)
├── docs/            PRD, architecture, ERD, API reference, design system, roadmap
├── docker-compose.yml
└── PROJECT_CONTEXT.md   Living status document — read this first
```

## Try the MVP in one command

```bash
cd appointment-platform
npm install
npm run demo        # → http://localhost:4000  (throwaway MongoDB + demo data, nothing to install)
```

Everything runs in memory and resets when you stop it. Log in with the demo accounts below.

## Quick start (local)

Requirements: Node 20+, MongoDB 6+ (local or Atlas — or run `npm run db:dev` for a throwaway local replica set). Redis is optional.

```bash
cd appointment-platform
npm install
cp server/.env.example server/.env      # adjust MONGODB_URI if needed
npm run seed                            # DESTRUCTIVE: resets the database with demo data
npm run dev                             # API :4000 (docs at /api/docs) + web :5173
```

Demo accounts (after seeding):

| Role | Email | Password |
|------|-------|----------|
| Super admin | admin@bookly.dev | Admin123! |
| Business owner (clinic) | clinic@bookly.dev | Owner123! (also salon@, tutor@, legal@, auto@, hive@, civic@) |
| Staff | layla@bookly.dev | Staff123! |
| Customer | sara@example.com | Customer123! |

Seeded businesses cover all 7 industries: *Nour Family Clinic*, *Lumière Hair & Beauty*,
*Bright Minds Tutoring* (group workshop), *Al Faris Legal* (manual approval + full prepayment),
*QuickFix Auto Care* (resource/bay based, no staff), *The Hive Workspace* (meeting rooms),
*Civic Services Center* (counter capacity 3), plus a pending business awaiting approval.

Online payments use a clearly-labelled **sandbox checkout** in development (`PAYMENTS_TEST_PROVIDER=true`).
Set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` to use Stripe; webhook: `POST /api/payments/webhooks/stripe`.

## Docker

```bash
cp server/.env.example server/.env   # set JWT_ACCESS_SECRET, PAYMENTS_TEST_PROVIDER=false, providers…
docker compose up --build            # web http://localhost:8080, API http://localhost:4000
docker compose exec -e SEED_FORCE=true server node server/dist/scripts/seed.js   # optional demo data (destructive)
```

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | API (tsx watch) + Vite dev server with proxy |
| `npm run build` | Compiles shared + server (`server/dist`) and client (`client/dist`) |
| `npm start` | Production API; also serves `client/dist` when present |
| `npm run seed` | Drops and seeds the database |
| `npm test` | Server unit + smoke tests, client tests |
| `npm run test:integration` | API tests against a throwaway MongoDB (concurrency, isolation, auth) |
| `npm run test:e2e` | Seeds a throwaway DB, serves API + built client, drives Chromium through 13 user flows, saves screenshots |
| `npm run demo` | Builds the web app and runs the full MVP on :4000 with a throwaway database and demo data |
| `npm run db:dev` | Starts a local throwaway MongoDB replica set on :27017 |
| `npm run typecheck` | Type-checks server and client |

## Documentation

* [docs/PRD.md](docs/PRD.md) — product requirements
* [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design & key decisions
* [docs/ERD.md](docs/ERD.md) — database schema
* [docs/API.md](docs/API.md) — endpoint reference (interactive: `/api/docs`)
* [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) — UI tokens, components, patterns
* [docs/ROADMAP.md](docs/ROADMAP.md) — milestones
* [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) — current status, known issues, next steps
