# Architecture

## System overview

```
 ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
 │ passenger-web│  │  driver-web  │  │ admin-dashboard  │   React 19 + Vite, PWA, EN/AR
 └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘
        │ REST /api + Socket.IO (same origin via Vite proxy / nginx)
        └─────────────────┼───────────────────┘
                   ┌──────▼──────┐
                   │  apps/api   │  Express 5 · Socket.IO · zod · JWT
                   │             │  services: ride, dispatch, pricing, payments, geo, wallet
                   └──┬───────┬──┘
           Prisma ORM │       │ ioredis
              ┌───────▼─┐   ┌─▼──────┐        ┌──────────────────────────────┐
              │Postgres │   │ Redis  │        │ External (adapters):          │
              │ 16      │   │ 7      │        │ Stripe · Mapbox/Google/OSM    │
              └─────────┘   └────────┘        │ SMS/email OTP · object storage│
                                              └──────────────────────────────┘
```

## Monorepo

| Path | Purpose |
|---|---|
| `apps/api` | Express API + Socket.IO server, bundled with esbuild for production |
| `apps/passenger-web` | Rider app: map-first booking, live tracking, wallet, account |
| `apps/driver-web` | Driver app: onboarding, online toggle, offers, trip flow, earnings |
| `apps/admin-dashboard` | Operations console: analytics, live map, verification, finance, pricing |
| `packages/shared` | Ride state machine, fare engine, geo math, zod schemas, DTO + socket types — used by API **and** apps |
| `packages/ui` | Design system (Tailwind v4 tokens, shadcn-style components), Leaflet map, i18n, API/auth/socket clients |
| `packages/config` | Shared TypeScript configs |
| `prisma` | Schema, migrations, demo seed |
| `infrastructure/docker` | Dockerfiles + nginx config |

Workspace packages are consumed as TypeScript source (no build step); Vite and tsx compile them, esbuild bundles them into the API artefact.

## Key design decisions

**Money as integers.** All amounts are minor units (fils). Fares, commission, discounts and wallet balances never touch floating point.

**One state machine, shared.** `packages/shared/src/ride-state.ts` defines legal transitions *and which actor may trigger each one*. The API enforces it in `ride.service.transition()` with an optimistic-concurrency guard (`UPDATE … WHERE status = <expected>`), so racing actions (passenger cancels as driver starts) cannot both succeed. Every change is appended to `RideStatusHistory` and broadcast.

```
REQUESTED → SEARCHING → ACCEPTED → DRIVER_ARRIVING → ARRIVED → IN_PROGRESS → COMPLETED → (PAYMENT_PENDING →) PAYMENT_COMPLETED
     ↘ CANCELLED / EXPIRED / NO_DRIVER_AVAILABLE (search ends)      ↖ driver backs out: ACCEPTED/DRIVER_ARRIVING → SEARCHING
```

**Dispatch.** Live driver positions live in a Redis GEO set (+ per-driver hash: category, busy flag, last seen). Matching offers the ride to the **nearest eligible driver** (online, approved, approved active vehicle, same category, fresh location, idle, no pending offer, not previously offered). Each offer has a timeout (default 20 s); reject/timeout moves to the next driver. If nobody is available the search retries for 90 s, then ends as `NO_DRIVER_AVAILABLE` (never offered) or `EXPIRED` (offered, not accepted). Acceptance is a conditional update — two drivers can never win the same ride. Timers are in-process and re-armed on boot (`dispatch.recover()`); for multiple API instances enable `SOCKET_REDIS_ADAPTER=true` and move timers to a delayed job queue (BullMQ) — the service API stays the same.

**Duplicate-request protection.** Redis `SET NX` lock per passenger during creation + DB check for an existing active ride + optional `Idempotency-Key`.

**Pricing.** Per category × service area: base, per-km, per-minute, minimum, booking fee, cancellation fee, commission, surge cap. Dynamic surge (when enabled) follows open requests ÷ idle drivers, capped by the configured multiplier. Passengers get **upfront prices**; the fare is re-metered only if the driven distance deviates more than 25 % from the estimate.

**Earnings & commission.** Commission is taken on the pre-discount fare (promotions are platform-funded). Card/wallet trips credit the driver's net earnings to their wallet; cash trips debit the commission (and credit the promo reimbursement), so drivers can hold a negative balance that later card earnings offset. Withdrawals reserve funds immediately and are returned if an admin rejects them.

**Payments.** `PaymentGateway` interface with `SandboxGateway` (default; deterministic test cards, HMAC-signed webhooks) and `StripeGateway`. Ride logic never calls a provider SDK directly, so regional providers (Checkout.com, Tap, PayTabs…) are a new adapter. Failed card charges leave the ride `PAYMENT_PENDING`; the passenger settles with another method.

**Maps.** `GeoProvider` interface with `local` (offline, curated Dubai places, curved-path routing — deterministic for tests), `osm` (Photon + OSRM), `mapbox` and `google`. Network providers fall back to `local` on failure, and routes are cached in Redis. Keys stay server-side; browsers render Leaflet with CARTO tiles (or any `VITE_MAP_TILE_URL`).

**Real time.** Socket.IO with JWT handshake auth. Server-side room joins (`ride:<id>`) on booking/acceptance mean clients cannot miss events even if they never subscribe. Driver location: validated, throttled to 2/s/socket, written to Redis every ping, Postgres every 5 s, and the per-ride trail table while on a trip. Clients refetch over REST after reconnecting (`/rides/active`), and `connectionStateRecovery` replays missed packets for 2 minutes.

## Security

* Argon2id password hashing (OWASP parameters); constant-time login responses for unknown users.
* JWT access tokens (15 min) carry a `tokenVersion`; suspensions, password changes and "sign out everywhere" bump it, invalidating outstanding tokens immediately. Refresh tokens are opaque, stored hashed, rotated on use with family-wide revocation on reuse.
* Refresh cookie: `httpOnly`, `SameSite=Strict`, path-scoped to `/api/auth`, `Secure` in production.
* zod validation on every body/query; Prisma parameterised queries (raw SQL only with bound parameters for analytics).
* helmet security headers, CORS allow-list, Redis-backed rate limiting (stricter on auth/OTP).
* RBAC: role per app + admin permission matrix; every admin mutation audited.
* Uploads: MIME allow-list + magic-byte sniffing, random names, private storage outside any static root, authorised streaming only.
* Payment webhooks: signature verification, timestamp tolerance, idempotent processing. Card numbers never stored (sandbox discards PAN after Luhn check; Stripe tokens only).
* Socket events authorised per room; driver-only events checked by role.
* Contact numbers only shared while a ride is live; passenger sees driver initial only; trip PIN prevents wrong-passenger pickups.
