# API Reference

Base URL: `/api`. Interactive docs: `GET /api/docs` (Swagger UI), raw spec `GET /api/docs.json`.

Conventions:
- Auth: `Authorization: Bearer <accessToken>`; refresh token in httpOnly cookie `bk_rt` (path `/api/auth`).
- Errors: `{ "error": { "code", "message", "details" } }` — 401 `UNAUTHORIZED`/`TOKEN_INVALID`, 402 `PLAN_LIMIT`/`PLAN_FEATURE`, 403 `FORBIDDEN`, 404 `NOT_FOUND`, 409 `SLOT_UNAVAILABLE`/`SLOT_BUSY`/`DUPLICATE`, 422 `VALIDATION_ERROR` (`details.fields`), 429 `RATE_LIMITED`.
- Lists: `{ items, total, page, limit, pages }`.
- Times: ISO-8601 UTC; dates `YYYY-MM-DD` in the business timezone.


## AI

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/ai/status` |  | Active AI provider |
| POST | `/ai/search-intent` |  | Natural-language search → filters |
| POST | `/businesses/{businessId}/ai/description` | ✓ | Generate business description (plan feature: ai) |
| GET | `/businesses/{businessId}/ai/insights` | ✓ | No-show risk + recommendations |

## Admin

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/admin/analytics` | ✓ | Platform analytics |
| GET | `/admin/users` | ✓ | Users |
| PATCH | `/admin/users/{id}` | ✓ | Change role/status |
| GET | `/admin/businesses` | ✓ | Businesses |
| PATCH | `/admin/businesses/{id}` | ✓ | Approve/suspend/feature |
| GET | `/admin/categories` | ✓ | All categories |
| POST | `/admin/categories` | ✓ | Create category |
| PATCH | `/admin/categories/{id}` | ✓ | Update category & booking flow |
| DELETE | `/admin/categories/{id}` | ✓ | Delete unused category |
| GET | `/admin/plans` | ✓ | Plans with subscriber counts |
| POST | `/admin/plans` | ✓ | Create plan |
| PATCH | `/admin/plans/{id}` | ✓ | Update plan |
| GET | `/admin/plans/subscriptions` | ✓ | Subscriptions |
| PATCH | `/admin/plans/subscriptions/{id}` | ✓ | Change subscription |
| GET | `/admin/payments` | ✓ | All payments |
| GET | `/admin/audit-logs` | ✓ | Audit logs |
| GET | `/admin/settings` | ✓ | Platform settings |
| PATCH | `/admin/settings` | ✓ | Update settings |
| GET | `/admin/roles` | ✓ | Business roles & permissions |
| PATCH | `/admin/roles/{id}` | ✓ | Update role permissions |

## Analytics

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/businesses/{businessId}/analytics` | ✓ | Business KPIs, series, top services, staff load, heatmap |

## Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` |  | Register (accountType customer|business); sets refresh cookie |
| POST | `/auth/login` |  | Log in; returns access token + profile |
| POST | `/auth/refresh` |  | Rotate refresh token (cookie) and get a new access token |
| POST | `/auth/logout` |  | Revoke current refresh token |
| POST | `/auth/logout-all` | ✓ | Revoke all sessions |
| GET | `/auth/me` | ✓ | Current user + memberships |
| PATCH | `/auth/me` | ✓ | Update profile, locale, notification preferences |
| POST | `/auth/change-password` | ✓ | Change password (revokes sessions) |

## Availability

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/businesses/{businessId}/exceptions` | ✓ | List exceptions (page, limit, q, active) |
| POST | `/businesses/{businessId}/exceptions` | ✓ | Create exception |
| GET | `/businesses/{businessId}/exceptions/{id}` | ✓ | Get one |
| PATCH | `/businesses/{businessId}/exceptions/{id}` | ✓ | Update |
| DELETE | `/businesses/{businessId}/exceptions/{id}` | ✓ | Delete / deactivate |

## Billing

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/businesses/{businessId}/billing` | ✓ | Plan, usage and invoices |
| POST | `/businesses/{businessId}/billing/change` | ✓ | Change plan (checkout for paid plans) |

## Booking

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/public/businesses/{slug}/availability` |  | Available slots for a service on a date (service, date, staff?, branch?, attendees?) |
| GET | `/public/businesses/{slug}/availability/days` |  | Slot counts per day (service, from, days) |
| POST | `/public/businesses/{slug}/bookings` |  | Create booking (guest or authenticated); optional recurrence and online checkout |
| POST | `/public/businesses/{slug}/waitlist` |  | Join the waiting list for a date |
| GET | `/public/bookings/track` |  | Guest lookup by reference + email |
| POST | `/public/bookings/track/cancel` |  | Guest cancellation (policy enforced) |
| POST | `/public/bookings/track/reschedule` |  | Guest reschedule (policy enforced) |
| POST | `/public/bookings/track/pay` |  | Guest online payment checkout |

## Branches

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/businesses/{businessId}/branches` | ✓ | List branches (page, limit, q, active) |
| POST | `/businesses/{businessId}/branches` | ✓ | Create branche |
| GET | `/businesses/{businessId}/branches/{id}` | ✓ | Get one |
| PATCH | `/businesses/{businessId}/branches/{id}` | ✓ | Update |
| DELETE | `/businesses/{businessId}/branches/{id}` | ✓ | Delete / deactivate |

## Business

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/businesses` | ✓ | Create a business (caller becomes owner) |
| GET | `/businesses/{businessId}` | ✓ | Business detail + caller's role/permissions |
| PATCH | `/businesses/{businessId}` | ✓ | Update profile, branding, settings/policies |
| GET | `/businesses/{businessId}/usage` | ✓ | Plan + usage |
| GET | `/businesses/{businessId}/team` | ✓ | Team members |
| POST | `/businesses/{businessId}/team` | ✓ | Add/change member (manager|staff) |
| DELETE | `/businesses/{businessId}/team/{userId}` | ✓ | Remove member |

## Customer

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/me/overview` | ✓ | Customer dashboard overview |
| GET | `/me/bookings` | ✓ | My bookings (scope upcoming|past|all) |
| GET | `/me/bookings/{id}` | ✓ | Booking detail with payments and review |
| POST | `/me/bookings/{id}/cancel` | ✓ | Cancel (policy enforced) |
| POST | `/me/bookings/{id}/reschedule` | ✓ | Reschedule (policy enforced) |
| POST | `/me/bookings/{id}/pay` | ✓ | Start online payment |
| POST | `/me/bookings/{id}/review` | ✓ | Review a completed booking |
| GET | `/me/favorites` | ✓ | Favourite businesses |
| PUT | `/me/favorites/{businessId}` | ✓ | Add favourite |
| DELETE | `/me/favorites/{businessId}` | ✓ | Remove favourite |
| GET | `/me/payments` | ✓ | Payment history |

## Customers

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/businesses/{businessId}/customers` | ✓ | Customer database |
| GET | `/businesses/{businessId}/customers/{customerId}` | ✓ | Customer profile with history |
| PATCH | `/businesses/{businessId}/customers/{customerId}` | ✓ | Update notes/tags |

## Notifications

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/notifications` | ✓ | In-app notifications (unread count included) |
| POST | `/notifications/read-all` | ✓ | Mark all read |
| POST | `/notifications/{id}/read` | ✓ | Mark one read |
| GET | `/businesses/{businessId}/templates` | ✓ | Notification templates (defaults + overrides) |
| PUT | `/businesses/{businessId}/templates` | ✓ | Upsert template override |

## Payments

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/businesses/{businessId}/payments` | ✓ | Transactions + totals |
| POST | `/businesses/{businessId}/payments/cash` | ✓ | Record cash payment |
| POST | `/businesses/{businessId}/payments/{paymentId}/refund` | ✓ | Refund (full or partial) |
| GET | `/businesses/{businessId}/payments/{paymentId}/invoice` | ✓ | Invoice data |
| POST | `/payments/webhooks/stripe` |  | Stripe webhook (signature verified) |
| GET | `/payments/test/{paymentId}` |  | Sandbox checkout details |
| POST | `/payments/test/{paymentId}/{action}` |  | Approve/decline sandbox payment |

## Public

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/settings` |  | Public platform settings and enabled features |
| GET | `/categories` |  | Active business categories with booking-flow config |
| GET | `/plans` |  | Active subscription plans |
| GET | `/public/businesses/{slug}` |  | Public business page (services, staff, branches, reviews, payment options) |

## Reservations

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/businesses/{businessId}/bookings` | ✓ | List bookings (from, to, status, staff, branch, service, customer, q, sort, page, limit) |
| POST | `/businesses/{businessId}/bookings` | ✓ | Create booking from dashboard |
| GET | `/businesses/{businessId}/bookings/availability` | ✓ | Availability (ignores notice windows) |
| GET | `/businesses/{businessId}/bookings/{bookingId}` | ✓ | Booking detail |
| PATCH | `/businesses/{businessId}/bookings/{bookingId}/status` | ✓ | Change status (confirm, reject, cancel, complete, no_show) |
| POST | `/businesses/{businessId}/bookings/{bookingId}/reschedule` | ✓ | Reschedule / reassign (calendar drag-and-drop) |
| PATCH | `/businesses/{businessId}/bookings/{bookingId}/notes` | ✓ | Internal notes |
| GET | `/businesses/{businessId}/waitlist` | ✓ | Waiting list |

## Resources

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/businesses/{businessId}/resources` | ✓ | List resources (page, limit, q, active) |
| POST | `/businesses/{businessId}/resources` | ✓ | Create resource |
| GET | `/businesses/{businessId}/resources/{id}` | ✓ | Get one |
| PATCH | `/businesses/{businessId}/resources/{id}` | ✓ | Update |
| DELETE | `/businesses/{businessId}/resources/{id}` | ✓ | Delete / deactivate |

## Reviews

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/businesses/{businessId}/reviews` | ✓ | Reviews + rating distribution |
| PATCH | `/businesses/{businessId}/reviews/{reviewId}` | ✓ | Reply / hide |

## Search

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/search/businesses` |  | Search businesses (q, category, city, minPrice, maxPrice, minRating, lat, lng, radiusKm, availableOn, sort, page, limit) |
| GET | `/search/services/popular` |  | Popular services |

## Services

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/businesses/{businessId}/services` | ✓ | List services (page, limit, q, active) |
| POST | `/businesses/{businessId}/services` | ✓ | Create service |
| GET | `/businesses/{businessId}/services/{id}` | ✓ | Get one |
| PATCH | `/businesses/{businessId}/services/{id}` | ✓ | Update |
| DELETE | `/businesses/{businessId}/services/{id}` | ✓ | Delete / deactivate |

## Staff

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/businesses/{businessId}/staff` | ✓ | List staff (page, limit, q, active) |
| POST | `/businesses/{businessId}/staff` | ✓ | Create staff member |
| GET | `/businesses/{businessId}/staff/{id}` | ✓ | Get one |
| PATCH | `/businesses/{businessId}/staff/{id}` | ✓ | Update |
| DELETE | `/businesses/{businessId}/staff/{id}` | ✓ | Delete / deactivate |

## Uploads

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/uploads/image` | ✓ | Upload image (multipart field `file`; Cloudinary) |
