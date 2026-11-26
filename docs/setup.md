# Local setup

## Prerequisites

* Node.js ≥ 20.19 (22 recommended) and pnpm 10 (`corepack enable`)
* PostgreSQL 16 and Redis 7 — install locally **or** start just the data services with Docker:
  ```bash
  docker compose up -d postgres redis
  ```

## First run

```bash
pnpm install
cp .env.example .env
# put real secrets in .env:  openssl rand -hex 48   (JWT_ACCESS_SECRET, JWT_REFRESH_SECRET)

# create the database user/db if you use a local Postgres:
#   createuser -P masar   (password: masar)   &&   createdb -O masar masar

pnpm db:generate
pnpm db:deploy          # apply migrations
pnpm db:seed            # demo accounts + 60 days of history
pnpm dev                # API :4000 · passenger :5173 · driver :5174 · admin :5175
```

## Demo accounts

| App | URL | Login | Password |
|---|---|---|---|
| Passenger | http://localhost:5173 | `passenger@masar.demo` | `Passenger123!` |
| Driver (approved) | http://localhost:5174 | `driver@masar.demo` | `Driver123!` |
| Driver (pending review) | http://localhost:5174 | `newdriver@masar.demo` | `Driver123!` |
| Admin (super) | http://localhost:5175 | `admin@masar.demo` | `Admin123!` |
| Admin (finance / support) | http://localhost:5175 | `finance@masar.demo` / `support@masar.demo` | `Admin123!` |

Each app keeps its own session (separate refresh cookies), so you can be signed in to all three in one browser.

## Testing the complete workflow by hand

1. **Driver app** → sign in as Omar → *Go online*. In development the **Demo GPS simulation** is on, so the car starts near Downtown Dubai and drives itself along routes (toggle it off to use the device GPS).
2. **Passenger app** → sign in as Sara → *Where to?* → e.g. "City Walk" → pick a category, payment (card `4242…`, wallet or cash), optional promo `MASAR10` → **Confirm**.
3. The driver receives the request with a countdown → **Accept**.
4. The passenger sees the driver's photo, car, plate, live position and ETA, plus the **trip PIN**. Chat, call, share and SOS are available.
5. The simulated car drives to the pickup → driver taps **I've arrived** → passenger sees "Your driver is here".
6. Driver taps **Start trip** and enters the passenger's PIN.
7. The car drives the route → driver taps **Complete trip**.
8. Payment is charged (card/wallet) or recorded as cash; the driver sees the fare / Masar fee / net breakdown.
9. Passenger rates the driver (+ optional tip).
10. **Admin console** → Overview / Rides / Finance show the trip, its timeline, GPS trail, payment and commission.

Optional: `pnpm simulate:drivers` puts 8 more simulated drivers on the road (they decline offers unless started with `-- --accept`).

## Automated tests

```bash
pnpm test                 # shared unit tests + API integration tests (uses database masar_test)
pnpm test:e2e             # browser test across passenger + driver apps (needs `pnpm dev` running)
```

API integration tests need a `masar_test` database (`createdb -O masar masar_test`, or set `TEST_DATABASE_URL`) and Redis. They apply migrations, load the seed and run real HTTP + Socket.IO flows, with dispatch timers scaled down 20×.

## Configuration

See `.env.example` — every variable is documented there. Highlights:

| Variable | Default | Notes |
|---|---|---|
| `GEO_PROVIDER` | `local` | `osm`, `mapbox` (`MAPBOX_TOKEN`), `google` (`GOOGLE_MAPS_API_KEY`) |
| `PAYMENT_PROVIDER` | `sandbox` | `stripe` needs `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` |
| `VITE_MAP_TILE_URL` | CARTO basemaps | Any XYZ raster tile URL (Mapbox, MapTiler, self-hosted) |
| `SOCKET_REDIS_ADAPTER` | `false` | `true` when running several API instances |
| `OTP_DELIVERY` | `console` | Codes are printed in the API log during development |

## Troubleshooting

* **"Sorry, we don't operate at this pickup location"** — your browser location is outside the seeded service areas (Dubai, Abu Dhabi). The passenger app falls back to central Dubai automatically when location is denied or out of area; add your own city under *Admin → Pricing & areas*.
* **No drivers found** — the driver must be online, approved, with an approved vehicle of the requested category, and within the dispatch radius (default 10 km, *Admin → Settings*).
* **Map tiles missing** — the browser can't reach `basemaps.cartocdn.com`; set `VITE_MAP_TILE_URL` to a reachable tile server.
