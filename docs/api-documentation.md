# Masar API reference

Base URL: `http://localhost:4000/api` (in development each web app proxies `/api` and `/socket.io`).

## Conventions

| Topic | Rule |
|---|---|
| Auth | `Authorization: Bearer <accessToken>` (JWT, 15 min). Refresh with `POST /auth/refresh` (httpOnly cookie `masar_rt_<app>` or `refreshToken` in the body for native clients). |
| App header | `X-Client-App: passenger \| driver \| admin` — picks the refresh-cookie name and enforces that each app only signs in its own role. |
| Money | Integers in **minor units** (fils). `2350` = AED 23.50. |
| Errors | `{ "error": { "code": "ACTIVE_RIDE_EXISTS", "message": "…", "details"?: […] } }` with a matching HTTP status (400 validation, 401, 403, 404, 409 state conflict, 422 business rule, 429 rate-limited). |
| Pagination | `?page=1&pageSize=20` → `{ items, page, pageSize, total, totalPages }` |
| Idempotency | `POST /rides` accepts `Idempotency-Key`; repeating a key returns the original ride. |
| Rate limits | 600 req/min/IP overall; 30 auth attempts and 8 OTP requests per 15 min. |

## Auth — `/auth`

| Method | Path | Description |
|---|---|---|
| POST | `/register` | `{ firstName, lastName, email?, phone?, password, role: PASSENGER\|DRIVER, locale }` → session. Sends a verification OTP. |
| POST | `/login` | `{ identifier (email or phone), password }` → `{ user, accessToken }` + refresh cookie |
| POST | `/refresh` | Rotates the refresh token. Re-use of a rotated token revokes the whole session family. |
| POST | `/logout` | Revokes the current refresh token |
| POST | `/logout-all` | Revokes every session and invalidates outstanding access tokens |
| GET | `/me` | Current user |
| POST | `/otp/request` | `{ target, purpose: VERIFY_PHONE\|VERIFY_EMAIL\|RESET_PASSWORD\|LOGIN }` |
| POST | `/otp/verify` | `{ target, purpose, code }` (authenticated) — marks phone/email verified |
| POST | `/otp/login` | Passwordless sign-in with a LOGIN code |
| POST | `/password/forgot` | `{ identifier }` → sends a reset code |
| POST | `/password/reset` | `{ identifier, code, password }` — signs out all devices |
| POST | `/password/change` | `{ currentPassword, newPassword }` |
| POST | `/social/:provider` | Social-login architecture (`google`, `apple`). Returns `501 SOCIAL_LOGIN_NOT_CONFIGURED` until a provider adapter is configured. |

## Account — `/me` (any signed-in user)

`GET /` profile + stats + wallet · `PATCH /` update profile · `DELETE /` erase account (soft delete, keeps financial records)
`GET|POST /places`, `PATCH|DELETE /places/:id` saved places (one HOME, one WORK, many FAVORITE)
`GET|POST /emergency-contacts`, `DELETE /emergency-contacts/:id` (max 5)
`GET /notifications` (+ `unread`), `POST /notifications/read-all`, `POST /notifications/:id/read`

## Catalog — `/catalog` (public)

`GET /categories` · `GET /promotions` (active campaigns + coupon codes) · `GET /service-areas` · `GET /config` (geo/payment provider, support contacts, free-cancellation window)

## Maps — `/geo` (authenticated; keys never leave the server)

`GET /autocomplete?q=&lat=&lng=&locale=` · `GET /reverse?lat=&lng=&locale=` · `GET /route?fromLat=&fromLng=&toLat=&toLng=` → `{ distanceMeters, durationSeconds, geometry: [[lat,lng]…], provider }`

## Rides — `/rides`

| Method | Path | Who | Description |
|---|---|---|---|
| POST | `/estimate` | passenger | `{ pickup, dropoff, couponCode? }` → route + fare/ETA/surge per category |
| GET | `/nearby-cars?lat=&lng=` | any | Anonymised, jittered idle-car positions for the map |
| POST | `/` | passenger | `{ pickup:{address,lat,lng}, dropoff, categoryCode, paymentType: CASH\|CARD\|WALLET, paymentMethodId?, couponCode?, pickupNotes?, scheduledAt? }`. Immediate rides start dispatch at once; scheduled rides dispatch 5 min before pickup. |
| GET | `/?scope=all\|active\|past\|scheduled` | passenger/driver | Own rides |
| GET | `/active` | passenger/driver | Current ride (or unrated finished ride) — used to restore state |
| GET | `/:id` | participant/admin | Ride detail (PIN only for the passenger) |
| GET | `/:id/history` | participant/admin | Status history + GPS trail |
| POST | `/:id/cancel` | passenger/admin | `{ reason? }` — free within the configured window, fee afterwards / once the driver has arrived |
| POST | `/:id/rate` | participant | `{ score 1-5, comment?, tags?, tip? }` (tip: card/wallet rides, 100% to driver) |
| POST | `/:id/pay` | passenger | Retry a failed payment `{ paymentType: CARD\|WALLET, paymentMethodId? }` |
| GET | `/:id/receipt` | participant/admin | Fare breakdown + payment records |
| GET/POST | `/:id/messages` | participant | In-app chat (live while the ride is active) |
| POST | `/:id/sos` | participant | Emergency: URGENT safety ticket + realtime admin alert |

## Driver — `/driver` (role DRIVER)

Onboarding: `GET /profile` (profile, vehicles, documents, checklist) · `PUT /onboarding` · `POST /vehicles` · `DELETE /vehicles/:id` · `POST /vehicles/:id/activate` · `POST /documents` (multipart `type`, `file`; JPG/PNG/WEBP/PDF ≤ 8 MB, magic-byte checked) · `DELETE /documents/:id` · `POST /submit`

Availability: `POST /status { online, lat, lng }` (approved drivers with an approved active vehicle only)

Offers & trips: `GET /offers/current` · `POST /offers/:id/accept` · `POST /offers/:id/reject` · `POST /rides/:id/arriving` · `POST /rides/:id/arrived` · `POST /rides/:id/start { pin }` · `POST /rides/:id/complete` · `POST /rides/:id/cancel` (before arrival: back to dispatch; at pickup: passenger no-show with fee) · `POST /rides/:id/report`

Money: `GET /dashboard` · `GET /earnings?days=7` · `GET /earnings/history` · `GET /wallet` · `GET /payouts` · `POST /payouts { amount, method, destination }` · `GET /reports/weekly` · `GET /reviews`

## Payments — `/payments`

`GET /methods` · `POST /setup-session` (Stripe SetupIntent client secret; `null` in sandbox) · `POST /methods` (sandbox: `{cardNumber, expMonth, expYear}` — PAN validated then discarded; Stripe: `{providerPaymentMethodId}`) · `POST /methods/:id/default` · `DELETE /methods/:id` · `GET /wallet` · `POST /wallet/topup { amount, paymentMethodId }` · `GET /history`

Sandbox test cards: `4242 4242 4242 4242` ✓ · `5555 5555 5555 4444` ✓ · `4000 0000 0000 0002` declined · `4000 0000 0000 9995` insufficient funds.

## Support — `/support`

`GET|POST /tickets` · `GET /tickets/:id` · `POST /tickets/:id/messages`

## Files — `/files`

`GET /documents/:id` — streams a private driver document to its owner, admins with the `drivers` permission, or (profile photo only) passengers who rode with that driver. Accepts `?token=` for `<img>` tags.

## Webhooks — `/webhooks`

`POST /payments` — raw body, signature verified (`Stripe-Signature` or `X-Sandbox-Signature: t=…,v1=hmac`), 5-minute replay window, each event id processed once.

## Admin — `/admin` (role ADMIN, permission in brackets)

| Area | Endpoints |
|---|---|
| Overview | `GET /me` (permissions) · `GET /stats/overview` · `GET /stats/timeseries?period=daily\|weekly\|monthly` |
| Users [users] | `GET /users?role=&status=&q=` · `GET /users/:id` · `PATCH /users/:id/status {status, reason}` (suspension revokes sessions + disconnects sockets) |
| Drivers [drivers] | `GET /drivers?status=` · `GET /drivers/:id` · `POST /drivers/:id/review {decision: APPROVE\|REJECT\|REQUEST_INFO, note}` · `PATCH /documents/:id {status, note}` · `PATCH /vehicles/:id {status}` |
| Rides [rides] | `GET /rides?status=ACTIVE\|FINISHED\|<status>&q=&from=&to=` · `GET /rides/:id` (timeline, offers, trail, payments, chat, tickets) · `POST /rides/:id/cancel {reason}` · `POST /rides/:id/complete` · `GET /live` |
| Finance [finance] | `GET /finance/summary?days=` · `GET /payments` · `POST /payments/:id/refund {amount, reason}` · `GET /payouts` · `POST /payouts/:id/approve\|pay\|reject` |
| Pricing [pricing] | `GET /pricing` · `PUT /pricing/:id` · `POST /pricing` · `GET\|POST /categories` · `PUT /categories/:id` · `GET /service-areas` |
| Areas [settings] | `POST /service-areas` · `PUT /service-areas/:id` |
| Marketing [marketing] | `GET\|POST /coupons` · `PUT\|DELETE /coupons/:id` · `GET\|POST /promotions` · `PUT /promotions/:id` · `POST /notifications/broadcast {audience, title, body}` |
| Support [support] | `GET /tickets` · `GET /tickets/:id` · `POST /tickets/:id/messages {body, isInternal}` · `PATCH /tickets/:id` · `GET /reviews` · `PATCH /reviews/:id {isHidden}` |
| System [settings]/[logs] | `GET\|PUT /settings` · `GET /admins` · `POST /admins` · `PATCH /users/:id/admin-role` · `GET /logs` |

Admin roles: `SUPER_ADMIN` (everything) · `OPERATIONS` (users, drivers, rides, support, pricing, marketing) · `FINANCE` (finance, rides, pricing) · `SUPPORT` (support, rides, users). Every mutating admin action is written to `AdminActivityLog`.

## Socket.IO

Connect to the API origin with `auth: { token: <accessToken> }`. Unauthenticated handshakes are rejected with `UNAUTHORIZED`.

Rooms: `user:<id>` (all of a user's sockets) · `ride:<id>` (passenger + driver; joined server-side on booking/acceptance) · `drivers:online` · `admins`.

| Direction | Event | Payload |
|---|---|---|
| server → client | `ride:updated` | `RideDTO` on every status change |
| server → driver | `ride:offer` | `{ offerId, ride, expiresAt, pickupDistanceMeters, pickupEtaSeconds, estimatedEarning }` |
| server → driver | `ride:offer:cancelled` | `{ offerId, rideId, reason: timeout\|ride_cancelled }` |
| server → ride room | `ride:driver_location` | `{ driverId, rideId, lat, lng, heading, speed, at }` |
| server → ride room | `ride:message`, `ride:typing` | chat |
| server → user | `notification` | `NotificationDTO` |
| server → driver | `driver:status` | `{ isOnline }` |
| server → admins | `admin:driver_location`, `admin:driver_offline`, `admin:ride_event`, `admin:sos` | live operations |
| server → user | `session:revoked` | sign out (suspension / sign-out everywhere) |
| driver → server | `driver:location` | `{ lat, lng, heading?, speed? }` with ack; throttled to 2/s |
| client → server | `ride:subscribe` / `ride:unsubscribe` | `{ rideId }` (participants/admins only) |

The full typed contract is in `packages/shared/src/socket-events.ts`.
