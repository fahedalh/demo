# Database

PostgreSQL 16 via Prisma 6. Schema: [`prisma/schema.prisma`](../prisma/schema.prisma). Migrations: `prisma/migrations`.

Conventions: `cuid` string ids · `createdAt` on every table, `updatedAt` where rows change · money as `Int` minor units · soft deletion (`deletedAt`) on user-owned records that other rows reference (users, places, vehicles, documents, payment methods, coupons).

## Model map

| Domain | Models |
|---|---|
| Identity | `User` (role, adminRole, status, tokenVersion), `RefreshToken` (hashed, rotation family), `OtpCode` (hashed, attempts), `SocialAccount` |
| Passenger | `PassengerProfile`, `SavedPlace`, `EmergencyContact` |
| Driver | `DriverProfile` (verification, last location, rating, offer counters), `Vehicle`, `DriverDocument`, `VehicleCategory` |
| Pricing | `ServiceArea` (radius or polygon geofence), `PricingConfiguration` (unique per category × area) |
| Rides | `Ride`, `RideOffer` (dispatch attempts), `RideLocation` (GPS trail), `RideStatusHistory` |
| Money | `PaymentMethod`, `Payment` (receipt number, provider ref, refunds), `Refund`, `Wallet`, `WalletTransaction` (signed ledger with balanceAfter), `DriverEarning` (gross/commission/net/tip per ride), `DriverPayout` |
| Feedback | `Rating` (unique per ride × rater), `Review` (comment, tags, moderation flag) |
| Marketing | `Promotion`, `Coupon`, `CouponRedemption` (unique per ride) |
| Communication | `Notification`, `Message` (ride chat), `SupportTicket`, `TicketMessage` (internal notes) |
| Admin | `AdminActivityLog`, `SystemSetting` |

## Notable constraints & indexes

* `User.email`, `User.phone` unique; `Vehicle.plateNumber` unique; `Ride.code`, `Payment.receiptNumber`, `Coupon.code` unique.
* `Ride.idempotencyKey` unique (namespaced by passenger).
* `PricingConfiguration (categoryId, serviceAreaId)` unique; `Rating (rideId, raterId)` unique; `DriverEarning.rideId` unique.
* Indexes for hot paths: rides by passenger/driver + createdAt, by status, by scheduledAt; offers by driver + status; locations by ride + time; payments by user/status/providerRef; notifications by user + readAt; audit log by admin/entity/time.

## Data that is *not* in Postgres

Live driver positions, availability, pending-offer locks, route cache, rate-limit counters and webhook idempotency keys live in Redis (all reconstructible). Postgres keeps a throttled last location per driver and the per-ride trail.

## Workflows

```bash
pnpm db:migrate         # create/apply a migration in development (prisma migrate dev)
pnpm db:deploy          # apply migrations in CI/production (non-destructive)
pnpm db:seed            # wipe + load demo data (refuses when NODE_ENV=production)
pnpm db:reset           # drop and recreate the dev database (destructive; run it yourself)
```

## Backups

Production: enable continuous archiving / PITR on managed Postgres (RDS, Cloud SQL, Neon) or run `pg_dump -Fc` nightly with 30-day retention plus weekly restore drills. Redis holds only reconstructible state (AOF enabled in compose for faster recovery). Driver documents: back the storage bucket up with versioning enabled.
