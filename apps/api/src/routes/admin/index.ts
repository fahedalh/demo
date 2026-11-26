/** Admin console API. Every route requires an ADMIN user; areas are gated by admin role (RBAC). */
import { Router } from 'express';
import { z } from 'zod';
import type { Prisma, RideStatus } from '@prisma/client';
import {
  ACTIVE_RIDE_STATUSES,
  FINISHED_TRIP_STATUSES,
  adminRoleSchema,
  broadcastSchema,
  categorySchema,
  couponSchema,
  documentReviewSchema,
  driverReviewSchema,
  pricingUpdateSchema,
  refundSchema,
  serviceAreaSchema,
  settingsSchema,
  ticketReplySchema,
  userStatusSchema,
  registerSchema,
} from '@masar/shared';
import { prisma } from '../../lib/prisma';
import { requireAuth, requireAdmin, adminPermissions } from '../../middleware/auth';
import { q, validate } from '../../middleware/validate';
import { audit } from '../../middleware/audit';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../../lib/errors';
import { pageArgs, paginated } from '../../lib/pagination';
import { getSettings, saveSettings } from '../../lib/settings';
import { hashPassword } from '../../lib/password';
import {
  rideInclude,
  toCategoryDTO,
  toRideDTO,
  toUserDTO,
  toVehicleDTO,
  vehicleInclude,
} from '../../services/serializers';
import { cancelRide, completeTrip, loadRide } from '../../services/ride.service';
import { driverLocations } from '../../services/driver-locations';
import { gateway } from '../../services/payments';
import { postWalletTx } from '../../services/wallet.service';
import { notify } from '../../services/notifications';
import { disconnectUser } from '../../realtime/io';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin());

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  status: z.string().max(40).optional(),
  role: z.string().max(20).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
type ListQuery = z.infer<typeof listQuery>;

const DAY = 86_400_000;
const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// ───────────────────────── Overview ─────────────────────────
adminRouter.get('/me', async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  res.json({ user: toUserDTO(user), permissions: adminPermissions(user.adminRole) });
});

adminRouter.get('/stats/overview', async (_req, res) => {
  const today = startOfDay();
  const [
    passengers,
    drivers,
    approvedDrivers,
    pendingDrivers,
    onlineDrivers,
    active,
    completed,
    cancelled,
    revenue,
    todayRevenue,
    todayRides,
    openTickets,
  ] = await Promise.all([
    prisma.user.count({ where: { role: 'PASSENGER', deletedAt: null } }),
    prisma.user.count({ where: { role: 'DRIVER', deletedAt: null } }),
    prisma.driverProfile.count({ where: { verificationStatus: 'APPROVED' } }),
    prisma.driverProfile.count({ where: { verificationStatus: { in: ['UNDER_REVIEW'] } } }),
    prisma.driverProfile.count({ where: { isOnline: true } }),
    prisma.ride.count({
      where: {
        status: { in: ACTIVE_RIDE_STATUSES },
        OR: [{ scheduledAt: null }, { status: { not: 'REQUESTED' } }],
      },
    }),
    prisma.ride.count({ where: { status: { in: FINISHED_TRIP_STATUSES } } }),
    prisma.ride.count({ where: { status: { in: ['CANCELLED', 'EXPIRED', 'NO_DRIVER_AVAILABLE'] } } }),
    prisma.driverEarning.aggregate({ _sum: { grossFare: true, commission: true } }),
    prisma.driverEarning.aggregate({
      where: { createdAt: { gte: today } },
      _sum: { grossFare: true, commission: true },
    }),
    prisma.ride.count({ where: { createdAt: { gte: today } } }),
    prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
  ]);
  const live = await driverLocations.allOnline();
  res.json({
    passengers,
    drivers,
    approvedDrivers,
    pendingDrivers,
    onlineDrivers: live.length || onlineDrivers,
    busyDrivers: live.filter((d) => d.busy).length,
    activeRides: active,
    completedRides: completed,
    cancelledRides: cancelled,
    totalRevenue: revenue._sum.grossFare ?? 0,
    platformCommission: revenue._sum.commission ?? 0,
    today: {
      revenue: todayRevenue._sum.grossFare ?? 0,
      commission: todayRevenue._sum.commission ?? 0,
      rides: todayRides,
    },
    openTickets,
    currency: 'AED',
  });
});

const seriesQuery = z.object({ period: z.enum(['daily', 'weekly', 'monthly']).default('daily') });
adminRouter.get('/stats/timeseries', validate(seriesQuery, 'query'), async (req, res) => {
  const { period } = q<{ period: 'daily' | 'weekly' | 'monthly' }>(req);
  const buckets = period === 'daily' ? 14 : period === 'weekly' ? 12 : 12;
  const trunc = period === 'daily' ? 'day' : period === 'weekly' ? 'week' : 'month';
  const since =
    period === 'daily'
      ? new Date(startOfDay().getTime() - (buckets - 1) * DAY)
      : period === 'weekly'
        ? new Date(startOfDay().getTime() - (buckets - 1) * 7 * DAY)
        : new Date(new Date().getFullYear(), new Date().getMonth() - (buckets - 1), 1);
  // Aggregated in SQL so it scales with the rides table.
  const rides = await prisma.$queryRawUnsafe<
    { bucket: Date; total: bigint; completed: bigint; cancelled: bigint }[]
  >(
    `SELECT date_trunc('${trunc}', "createdAt") AS bucket,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status IN ('COMPLETED','PAYMENT_PENDING','PAYMENT_COMPLETED')) AS completed,
            COUNT(*) FILTER (WHERE status IN ('CANCELLED','EXPIRED','NO_DRIVER_AVAILABLE')) AS cancelled
       FROM "Ride" WHERE "createdAt" >= $1 GROUP BY 1 ORDER BY 1`,
    since,
  );
  const money = await prisma.$queryRawUnsafe<{ bucket: Date; gross: bigint; commission: bigint }[]>(
    `SELECT date_trunc('${trunc}', "createdAt") AS bucket, SUM("grossFare") AS gross, SUM(commission) AS commission
       FROM "DriverEarning" WHERE "createdAt" >= $1 GROUP BY 1 ORDER BY 1`,
    since,
  );
  const signups = await prisma.$queryRawUnsafe<{ bucket: Date; passengers: bigint; drivers: bigint }[]>(
    `SELECT date_trunc('${trunc}', "createdAt") AS bucket,
            COUNT(*) FILTER (WHERE role = 'PASSENGER') AS passengers,
            COUNT(*) FILTER (WHERE role = 'DRIVER') AS drivers
       FROM "User" WHERE "createdAt" >= $1 GROUP BY 1 ORDER BY 1`,
    since,
  );
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const map = new Map<string, any>();
  for (let i = 0; i < buckets; i++) {
    const d =
      period === 'daily'
        ? new Date(since.getTime() + i * DAY)
        : period === 'weekly'
          ? new Date(since.getTime() + i * 7 * DAY)
          : new Date(since.getFullYear(), since.getMonth() + i, 1);
    map.set(key(d), {
      date: key(d),
      rides: 0,
      completed: 0,
      cancelled: 0,
      revenue: 0,
      commission: 0,
      passengers: 0,
      drivers: 0,
    });
  }
  const findBucket = (d: Date) => {
    const k = key(d);
    if (map.has(k)) return map.get(k);
    // date_trunc('week') starts Monday; align to the nearest generated bucket.
    let best: any = null;
    for (const v of map.values()) if (v.date <= k) best = v;
    return best;
  };
  rides.forEach((r) =>
    Object.assign(findBucket(r.bucket) ?? {}, {
      rides: Number(r.total),
      completed: Number(r.completed),
      cancelled: Number(r.cancelled),
    }),
  );
  money.forEach((m) =>
    Object.assign(findBucket(m.bucket) ?? {}, {
      revenue: Number(m.gross ?? 0),
      commission: Number(m.commission ?? 0),
    }),
  );
  signups.forEach((s) =>
    Object.assign(findBucket(s.bucket) ?? {}, {
      passengers: Number(s.passengers),
      drivers: Number(s.drivers),
    }),
  );
  const byCategory = await prisma.$queryRawUnsafe<{ name: string; rides: bigint }[]>(
    `SELECT c.name, COUNT(r.id) AS rides FROM "VehicleCategory" c LEFT JOIN "Ride" r ON r."categoryId" = c.id AND r."createdAt" >= $1
      GROUP BY c.name, c."sortOrder" ORDER BY c."sortOrder"`,
    since,
  );
  res.json({
    period,
    series: [...map.values()],
    byCategory: byCategory.map((c) => ({ name: c.name, rides: Number(c.rides) })),
  });
});

// ───────────────────────── Users ─────────────────────────
adminRouter.get('/users', requireAdmin('users'), validate(listQuery, 'query'), async (req, res) => {
  const { page, pageSize, q: search, status, role } = q<ListQuery>(req);
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(role ? { role: role as any } : {}),
    ...(status ? { status: status as any } : {}),
    ...(search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search } },
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { passengerProfile: true, driverProfile: true, wallet: true },
      orderBy: { createdAt: 'desc' },
      ...pageArgs(page, pageSize),
    }),
    prisma.user.count({ where }),
  ]);
  res.json(
    paginated(
      rows.map((u) => ({
        ...toUserDTO(u),
        lastLoginAt: u.lastLoginAt,
        rating: u.driverProfile?.rating ?? u.passengerProfile?.rating ?? null,
        rides: u.driverProfile?.completedRides ?? u.passengerProfile?.totalRides ?? 0,
        verificationStatus: u.driverProfile?.verificationStatus ?? null,
        isOnline: u.driverProfile?.isOnline ?? false,
        walletBalance: u.wallet?.balance ?? 0,
      })),
      total,
      page,
      pageSize,
    ),
  );
});

adminRouter.get('/users/:id', requireAdmin('users'), async (req, res) => {
  const u = await prisma.user.findUnique({
    where: { id: String(req.params.id) },
    include: {
      passengerProfile: true,
      driverProfile: { include: { vehicles: { where: { deletedAt: null }, include: vehicleInclude } } },
      wallet: { include: { transactions: { orderBy: { createdAt: 'desc' }, take: 20 } } },
      emergencyContacts: true,
      savedPlaces: { where: { deletedAt: null } },
      paymentMethods: { where: { deletedAt: null } },
    },
  });
  if (!u) throw notFound('User');
  const rides = await prisma.ride.findMany({
    where: { OR: [{ passengerId: u.id }, { driverId: u.id }] },
    include: rideInclude,
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  const tickets = await prisma.supportTicket.findMany({
    where: { userId: u.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  res.json({
    user: toUserDTO(u),
    lastLoginAt: u.lastLoginAt,
    passengerProfile: u.passengerProfile,
    driverProfile: u.driverProfile
      ? { ...u.driverProfile, vehicles: u.driverProfile.vehicles.map(toVehicleDTO) }
      : null,
    wallet: u.wallet,
    emergencyContacts: u.emergencyContacts,
    savedPlaces: u.savedPlaces,
    paymentMethods: u.paymentMethods.map((p) => ({
      id: p.id,
      brand: p.brand,
      last4: p.last4,
      isDefault: p.isDefault,
    })),
    rides: rides.map((r) => toRideDTO(r, req.user!.id, 'ADMIN')),
    tickets,
  });
});

adminRouter.patch(
  '/users/:id/status',
  requireAdmin('users'),
  validate(userStatusSchema),
  async (req, res) => {
    const id = String(req.params.id);
    if (id === req.user!.id) throw badRequest('You cannot change your own status');
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw notFound('User');
    if (target.role === 'ADMIN' && req.user!.adminRole !== 'SUPER_ADMIN')
      throw forbidden('Only a super admin can suspend admins');
    const user = await prisma.user.update({
      where: { id },
      data: {
        status: req.body.status,
        ...(req.body.status === 'SUSPENDED' ? { tokenVersion: { increment: 1 } } : {}),
      },
    });
    if (req.body.status === 'SUSPENDED') {
      await prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (user.role === 'DRIVER') {
        await prisma.driverProfile.updateMany({ where: { userId: id }, data: { isOnline: false } });
        await driverLocations.goOffline(id);
      }
      disconnectUser(id);
    }
    await audit(req, `user.${req.body.status.toLowerCase()}`, 'User', id, { reason: req.body.reason });
    res.json({ user: toUserDTO(user) });
  },
);

adminRouter.patch(
  '/users/:id/admin-role',
  requireAdmin('settings'),
  validate(adminRoleSchema),
  async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: String(req.params.id) } });
    if (!user || user.role !== 'ADMIN') throw notFound('Admin');
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { adminRole: req.body.adminRole, tokenVersion: { increment: 1 } },
    });
    await audit(req, 'admin.role_changed', 'User', user.id, { from: user.adminRole, to: req.body.adminRole });
    res.json({ user: toUserDTO(updated) });
  },
);

const createAdminSchema = registerSchema.safeExtend({ adminRole: adminRoleSchema.shape.adminRole });
adminRouter.post('/admins', requireAdmin('settings'), async (req, res) => {
  const parsed = createAdminSchema.safeParse({ ...req.body, role: 'PASSENGER' });
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Invalid admin');
  const d = parsed.data;
  const user = await prisma.user.create({
    data: {
      firstName: d.firstName,
      lastName: d.lastName,
      email: d.email ?? null,
      phone: d.phone ?? null,
      passwordHash: await hashPassword(d.password),
      role: 'ADMIN',
      adminRole: d.adminRole,
      emailVerifiedAt: new Date(),
    },
  });
  await audit(req, 'admin.created', 'User', user.id, { adminRole: d.adminRole });
  res.status(201).json({ user: toUserDTO(user) });
});

// ───────────────────────── Driver verification ─────────────────────────
adminRouter.get('/drivers', requireAdmin('drivers'), validate(listQuery, 'query'), async (req, res) => {
  const { page, pageSize, q: search, status } = q<ListQuery>(req);
  const where: Prisma.DriverProfileWhereInput = {
    user: {
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    ...(status ? { verificationStatus: status as any } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.driverProfile.findMany({
      where,
      include: {
        user: true,
        activeVehicle: { include: vehicleInclude },
        _count: { select: { documents: { where: { deletedAt: null, status: 'PENDING' } } } },
      },
      orderBy: [{ submittedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      ...pageArgs(page, pageSize),
    }),
    prisma.driverProfile.count({ where }),
  ]);
  res.json(
    paginated(
      rows.map((d) => ({
        id: d.userId,
        user: toUserDTO(d.user),
        verificationStatus: d.verificationStatus,
        submittedAt: d.submittedAt,
        isOnline: d.isOnline,
        rating: d.rating,
        completedRides: d.completedRides,
        acceptanceRate: d.offersReceived ? Math.round((d.offersAccepted / d.offersReceived) * 100) : null,
        vehicle: d.activeVehicle ? toVehicleDTO(d.activeVehicle) : null,
        pendingDocuments: d._count.documents,
      })),
      total,
      page,
      pageSize,
    ),
  );
});

adminRouter.get('/drivers/:id', requireAdmin('drivers'), async (req, res) => {
  const d = await prisma.driverProfile.findUnique({
    where: { userId: String(req.params.id) },
    include: {
      user: true,
      vehicles: { where: { deletedAt: null }, include: vehicleInclude },
      documents: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!d) throw notFound('Driver');
  const earnings = await prisma.driverEarning.aggregate({
    where: { driverId: d.userId },
    _sum: { grossFare: true, netEarning: true, commission: true },
  });
  const wallet = await prisma.wallet.findUnique({ where: { userId: d.userId } });
  res.json({
    user: toUserDTO(d.user),
    profile: { ...d, user: undefined, vehicles: undefined, documents: undefined },
    vehicles: d.vehicles.map(toVehicleDTO),
    documents: d.documents.map((doc) => ({
      id: doc.id,
      type: doc.type,
      vehicleId: doc.vehicleId,
      status: doc.status,
      reviewNote: doc.reviewNote,
      mimeType: doc.mimeType,
      originalName: doc.originalName,
      sizeBytes: doc.sizeBytes,
      createdAt: doc.createdAt,
      reviewedAt: doc.reviewedAt,
    })),
    earnings: earnings._sum,
    wallet: wallet ? { balance: wallet.balance, currency: wallet.currency } : null,
  });
});

adminRouter.patch(
  '/documents/:id',
  requireAdmin('drivers'),
  validate(documentReviewSchema),
  async (req, res) => {
    const doc = await prisma.driverDocument.update({
      where: { id: String(req.params.id) },
      data: {
        status: req.body.status,
        reviewNote: req.body.note ?? null,
        reviewedById: req.user!.id,
        reviewedAt: new Date(),
      },
    });
    await audit(req, `document.${req.body.status.toLowerCase()}`, 'DriverDocument', doc.id, {
      note: req.body.note,
    });
    res.json(doc);
  },
);

adminRouter.patch(
  '/vehicles/:id',
  requireAdmin('drivers'),
  validate(z.object({ status: z.enum(['APPROVED', 'REJECTED', 'PENDING']) })),
  async (req, res) => {
    const v = await prisma.vehicle.update({
      where: { id: String(req.params.id) },
      data: { status: req.body.status },
      include: vehicleInclude,
    });
    await audit(req, `vehicle.${req.body.status.toLowerCase()}`, 'Vehicle', v.id);
    res.json(toVehicleDTO(v));
  },
);

adminRouter.post(
  '/drivers/:id/review',
  requireAdmin('drivers'),
  validate(driverReviewSchema),
  async (req, res) => {
    const userId = String(req.params.id);
    const d = await prisma.driverProfile.findUnique({
      where: { userId },
      include: {
        user: true,
        documents: { where: { deletedAt: null } },
        vehicles: { where: { deletedAt: null } },
      },
    });
    if (!d) throw notFound('Driver');
    const { decision, note } = req.body;
    const ar = d.user.locale === 'ar';
    if (decision === 'APPROVE') {
      await prisma.$transaction([
        prisma.driverProfile.update({
          where: { id: d.id },
          data: {
            verificationStatus: 'APPROVED',
            approvedAt: new Date(),
            approvedById: req.user!.id,
            verificationNote: note ?? null,
          },
        }),
        prisma.driverDocument.updateMany({
          where: { driverId: d.id, deletedAt: null, status: 'PENDING' },
          data: { status: 'APPROVED', reviewedAt: new Date(), reviewedById: req.user!.id },
        }),
        prisma.vehicle.updateMany({
          where: { driverId: d.id, deletedAt: null, status: 'PENDING' },
          data: { status: 'APPROVED' },
        }),
      ]);
      await notify(
        userId,
        'DRIVER_APPROVED',
        ar ? 'تمت الموافقة على حسابك 🎉' : "You're approved 🎉",
        ar ? 'يمكنك الآن الاتصال واستقبال الرحلات.' : 'You can now go online and start receiving trips.',
      );
    } else if (decision === 'REJECT') {
      await prisma.driverProfile.update({
        where: { id: d.id },
        data: { verificationStatus: 'REJECTED', verificationNote: note ?? null, isOnline: false },
      });
      await driverLocations.goOffline(userId);
      await notify(
        userId,
        'DRIVER_REJECTED',
        ar ? 'تعذّر قبول طلبك' : 'Application not approved',
        note ?? (ar ? 'تواصل مع الدعم لمزيد من التفاصيل.' : 'Contact support for details.'),
      );
    } else {
      if (!note) throw badRequest('Tell the driver what is missing');
      await prisma.driverProfile.update({
        where: { id: d.id },
        data: { verificationStatus: 'NEEDS_INFO', verificationNote: note },
      });
      await notify(
        userId,
        'DRIVER_NEEDS_INFO',
        ar ? 'مطلوب مستندات إضافية' : 'More information needed',
        note,
      );
    }
    await audit(req, `driver.${decision.toLowerCase()}`, 'DriverProfile', userId, { note });
    res.json({ ok: true });
  },
);

// ───────────────────────── Rides ─────────────────────────
adminRouter.get('/rides', requireAdmin('rides'), validate(listQuery, 'query'), async (req, res) => {
  const { page, pageSize, q: search, status, from, to } = q<ListQuery>(req);
  const statusFilter: Prisma.RideWhereInput =
    status === 'ACTIVE'
      ? { status: { in: ACTIVE_RIDE_STATUSES } }
      : status === 'FINISHED'
        ? { status: { in: FINISHED_TRIP_STATUSES } }
        : status
          ? { status: status as RideStatus }
          : {};
  const where: Prisma.RideWhereInput = {
    ...statusFilter,
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(search
      ? {
          OR: [
            { code: { contains: search, mode: 'insensitive' } },
            { pickupAddress: { contains: search, mode: 'insensitive' } },
            { dropoffAddress: { contains: search, mode: 'insensitive' } },
            { passenger: { firstName: { contains: search, mode: 'insensitive' } } },
            { driver: { firstName: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.ride.findMany({
      where,
      include: rideInclude,
      orderBy: { createdAt: 'desc' },
      ...pageArgs(page, pageSize),
    }),
    prisma.ride.count({ where }),
  ]);
  res.json(
    paginated(
      rows.map((r) => toRideDTO(r, req.user!.id, 'ADMIN')),
      total,
      page,
      pageSize,
    ),
  );
});

adminRouter.get('/rides/:id', requireAdmin('rides'), async (req, res) => {
  const ride = await loadRide(String(req.params.id));
  const [history, offers, trail, payments, messages, tickets] = await Promise.all([
    prisma.rideStatusHistory.findMany({ where: { rideId: ride.id }, orderBy: { createdAt: 'asc' } }),
    prisma.rideOffer.findMany({
      where: { rideId: ride.id },
      include: { driver: { select: { firstName: true, lastName: true } } },
      orderBy: { offeredAt: 'asc' },
    }),
    prisma.rideLocation.findMany({
      where: { rideId: ride.id },
      orderBy: { recordedAt: 'asc' },
      select: { lat: true, lng: true, recordedAt: true },
    }),
    prisma.payment.findMany({
      where: { rideId: ride.id },
      include: { refunds: true, paymentMethod: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.message.findMany({ where: { rideId: ride.id }, orderBy: { createdAt: 'asc' } }),
    prisma.supportTicket.findMany({ where: { rideId: ride.id } }),
  ]);
  res.json({
    ride: toRideDTO(ride, req.user!.id, 'ADMIN'),
    history,
    offers,
    trail,
    payments,
    messages,
    tickets,
  });
});

adminRouter.post(
  '/rides/:id/cancel',
  requireAdmin('rides'),
  validate(z.object({ reason: z.string().trim().min(3).max(280) })),
  async (req, res) => {
    const ride = await cancelRide(
      String(req.params.id),
      { id: req.user!.id, role: 'ADMIN' },
      req.body.reason,
    );
    await audit(req, 'ride.cancelled', 'Ride', ride.id, { reason: req.body.reason });
    res.json({ ride: toRideDTO(ride, req.user!.id, 'ADMIN') });
  },
);

adminRouter.post('/rides/:id/complete', requireAdmin('rides'), async (req, res) => {
  const ride = await completeTrip(String(req.params.id), { id: req.user!.id, role: 'ADMIN' });
  await audit(req, 'ride.force_completed', 'Ride', ride.id);
  res.json({ ride: toRideDTO(ride, req.user!.id, 'ADMIN') });
});

/** Live operations map: online drivers (from Redis) + rides in progress. */
adminRouter.get('/live', requireAdmin('rides'), async (req, res) => {
  const online = await driverLocations.allOnline();
  const users = await prisma.user.findMany({
    where: { id: { in: online.map((d) => d.driverId) } },
    select: { id: true, firstName: true, lastName: true },
  });
  const names = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  const rides = await prisma.ride.findMany({
    where: {
      status: { in: ACTIVE_RIDE_STATUSES },
      OR: [{ scheduledAt: null }, { status: { not: 'REQUESTED' } }],
    },
    include: rideInclude,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  res.json({
    drivers: online.map((d) => ({ ...d, name: names.get(d.driverId) ?? 'Driver' })),
    rides: rides.map((r) => toRideDTO(r, req.user!.id, 'ADMIN')),
  });
});

// ───────────────────────── Finance ─────────────────────────
adminRouter.get(
  '/finance/summary',
  requireAdmin('finance'),
  validate(z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }), 'query'),
  async (req, res) => {
    const { days } = q<{ days: number }>(req);
    const since = new Date(Date.now() - days * DAY);
    const [earn, byType, refunds, payoutsPending, payoutsPaid, topDrivers, failed] = await Promise.all([
      prisma.driverEarning.aggregate({
        where: { createdAt: { gte: since } },
        _sum: { grossFare: true, commission: true, netEarning: true, tip: true },
        _count: true,
      }),
      prisma.payment.groupBy({
        by: ['type'],
        where: { createdAt: { gte: since }, status: 'SUCCEEDED', purpose: 'RIDE' },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.refund.aggregate({
        where: { createdAt: { gte: since }, status: 'SUCCEEDED' },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.driverPayout.aggregate({
        where: { status: { in: ['REQUESTED', 'APPROVED'] } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.driverPayout.aggregate({
        where: { status: 'PAID', processedAt: { gte: since } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.driverEarning.groupBy({
        by: ['driverId'],
        where: { createdAt: { gte: since } },
        _sum: { netEarning: true },
        _count: true,
        orderBy: { _sum: { netEarning: 'desc' } },
        take: 5,
      }),
      prisma.payment.count({ where: { createdAt: { gte: since }, status: 'FAILED' } }),
    ]);
    const drivers = await prisma.user.findMany({
      where: { id: { in: topDrivers.map((t) => t.driverId) } },
      select: { id: true, firstName: true, lastName: true },
    });
    const dn = new Map(drivers.map((d) => [d.id, `${d.firstName} ${d.lastName}`]));
    const discounts = await prisma.couponRedemption.aggregate({
      where: { createdAt: { gte: since } },
      _sum: { discount: true },
    });
    res.json({
      days,
      grossBookings: earn._sum.grossFare ?? 0,
      commission: earn._sum.commission ?? 0,
      driverEarnings: earn._sum.netEarning ?? 0,
      tips: earn._sum.tip ?? 0,
      trips: earn._count,
      promoCost: discounts._sum.discount ?? 0,
      refunds: { amount: refunds._sum.amount ?? 0, count: refunds._count },
      failedPayments: failed,
      byPaymentType: byType.map((b) => ({ type: b.type, amount: b._sum.amount ?? 0, count: b._count })),
      payouts: {
        pendingAmount: payoutsPending._sum.amount ?? 0,
        pendingCount: payoutsPending._count,
        paidAmount: payoutsPaid._sum.amount ?? 0,
        paidCount: payoutsPaid._count,
      },
      topDrivers: topDrivers.map((t) => ({
        driverId: t.driverId,
        name: dn.get(t.driverId) ?? '—',
        net: t._sum.netEarning ?? 0,
        trips: t._count,
      })),
      currency: 'AED',
    });
  },
);

adminRouter.get('/payments', requireAdmin('finance'), validate(listQuery, 'query'), async (req, res) => {
  const { page, pageSize, q: search, status } = q<ListQuery>(req);
  const where: Prisma.PaymentWhereInput = {
    ...(status ? { status: status as any } : {}),
    ...(search
      ? {
          OR: [
            { receiptNumber: { contains: search, mode: 'insensitive' } },
            { ride: { code: { contains: search, mode: 'insensitive' } } },
            { user: { email: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        ride: { select: { code: true } },
        paymentMethod: true,
        refunds: true,
      },
      orderBy: { createdAt: 'desc' },
      ...pageArgs(page, pageSize),
    }),
    prisma.payment.count({ where }),
  ]);
  res.json(paginated(rows, total, page, pageSize));
});

adminRouter.post(
  '/payments/:id/refund',
  requireAdmin('finance'),
  validate(refundSchema),
  async (req, res) => {
    const payment = await prisma.payment.findUnique({ where: { id: String(req.params.id) } });
    if (!payment) throw notFound('Payment');
    if (!['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(payment.status))
      throw conflict('Only successful payments can be refunded');
    const refundable = payment.amount - payment.refundedAmount;
    if (req.body.amount > refundable) throw unprocessable(`At most ${refundable} can be refunded`);

    let status: 'SUCCEEDED' | 'FAILED' | 'PENDING' = 'SUCCEEDED';
    let providerRef: string | null = null;
    if (payment.provider === 'SANDBOX' || payment.provider === 'STRIPE') {
      if (!payment.providerRef) throw conflict('Payment has no provider reference');
      const r = await gateway.refund(payment.providerRef, req.body.amount);
      status = r.status;
      providerRef = r.providerRef;
      if (r.status === 'FAILED') throw unprocessable(r.failureReason ?? 'Refund failed at the provider');
    }
    const refund = await prisma.$transaction(async (tx) => {
      const rf = await tx.refund.create({
        data: {
          paymentId: payment.id,
          amount: req.body.amount,
          reason: req.body.reason,
          status,
          providerRef,
          createdById: req.user!.id,
        },
      });
      const refunded = payment.refundedAmount + req.body.amount;
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          refundedAmount: refunded,
          status: refunded >= payment.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        },
      });
      // Wallet and cash payments are refunded as wallet credit.
      if (payment.provider === 'WALLET' || payment.provider === 'CASH') {
        await postWalletTx(tx, payment.userId, req.body.amount, 'REFUND', {
          referenceType: 'refund',
          referenceId: rf.id,
          description: `Refund ${payment.receiptNumber}`,
        });
      }
      return rf;
    });
    await notify(
      payment.userId,
      'REFUND_ISSUED',
      'Refund issued',
      `A refund for receipt ${payment.receiptNumber} has been issued.`,
      { paymentId: payment.id },
    );
    await audit(req, 'payment.refunded', 'Payment', payment.id, {
      amount: req.body.amount,
      reason: req.body.reason,
    });
    res.status(201).json(refund);
  },
);

adminRouter.get('/payouts', requireAdmin('finance'), validate(listQuery, 'query'), async (req, res) => {
  const { page, pageSize, status } = q<ListQuery>(req);
  const where: Prisma.DriverPayoutWhereInput = status ? { status: status as any } : {};
  const [rows, total] = await Promise.all([
    prisma.driverPayout.findMany({
      where,
      include: { driver: { select: { id: true, firstName: true, lastName: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
      ...pageArgs(page, pageSize),
    }),
    prisma.driverPayout.count({ where }),
  ]);
  res.json(paginated(rows, total, page, pageSize));
});

adminRouter.post(
  '/payouts/:id/:action',
  requireAdmin('finance'),
  validate(z.object({ note: z.string().max(300).optional() })),
  async (req, res) => {
    const action = String(req.params.action);
    if (!['approve', 'pay', 'reject'].includes(action)) throw notFound('Action');
    const payout = await prisma.driverPayout.findUnique({ where: { id: String(req.params.id) } });
    if (!payout) throw notFound('Payout');
    const next = { approve: 'APPROVED', pay: 'PAID', reject: 'REJECTED' }[action] as
      'APPROVED' | 'PAID' | 'REJECTED';
    const allowed = {
      approve: ['REQUESTED'],
      pay: ['REQUESTED', 'APPROVED'],
      reject: ['REQUESTED', 'APPROVED'],
    }[action as 'approve'];
    if (!allowed.includes(payout.status)) throw conflict(`Payout is already ${payout.status.toLowerCase()}`);
    const updated = await prisma.$transaction(async (tx) => {
      const p = await tx.driverPayout.update({
        where: { id: payout.id },
        data: { status: next, note: req.body.note, processedById: req.user!.id, processedAt: new Date() },
      });
      if (next === 'REJECTED') {
        await postWalletTx(tx, payout.driverId, payout.amount, 'ADJUSTMENT', {
          referenceType: 'payout',
          referenceId: payout.id,
          description: 'Withdrawal rejected — funds returned',
        });
      }
      return p;
    });
    await notify(
      payout.driverId,
      `PAYOUT_${next}`,
      `Withdrawal ${next.toLowerCase()}`,
      req.body.note ?? `Your withdrawal request is ${next.toLowerCase()}.`,
      { payoutId: payout.id },
    );
    await audit(req, `payout.${action}`, 'DriverPayout', payout.id, { amount: payout.amount });
    res.json(updated);
  },
);

// ───────────────────────── Pricing, categories, areas ─────────────────────────
adminRouter.get('/pricing', requireAdmin('pricing'), async (_req, res) => {
  const items = await prisma.pricingConfiguration.findMany({
    include: { category: true, serviceArea: true },
    orderBy: [{ serviceArea: { name: 'asc' } }, { category: { sortOrder: 'asc' } }],
  });
  res.json({ items: items.map((p) => ({ ...p, category: toCategoryDTO(p.category) })) });
});

adminRouter.put('/pricing/:id', requireAdmin('pricing'), validate(pricingUpdateSchema), async (req, res) => {
  const before = await prisma.pricingConfiguration.findUnique({ where: { id: String(req.params.id) } });
  if (!before) throw notFound('Pricing');
  if (req.body.minimumFare < req.body.baseFare)
    throw badRequest('Minimum fare cannot be lower than the base fare');
  const p = await prisma.pricingConfiguration.update({ where: { id: before.id }, data: req.body });
  await audit(req, 'pricing.updated', 'PricingConfiguration', p.id, { before, after: req.body });
  res.json(p);
});

adminRouter.post(
  '/pricing',
  requireAdmin('pricing'),
  validate(pricingUpdateSchema.extend({ categoryId: z.string(), serviceAreaId: z.string() })),
  async (req, res) => {
    const area = await prisma.serviceArea.findUnique({ where: { id: req.body.serviceAreaId } });
    if (!area) throw notFound('Service area');
    const p = await prisma.pricingConfiguration.create({ data: { ...req.body, currency: area.currency } });
    await audit(req, 'pricing.created', 'PricingConfiguration', p.id);
    res.status(201).json(p);
  },
);

adminRouter.get('/categories', requireAdmin('pricing'), async (_req, res) => {
  const items = await prisma.vehicleCategory.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { vehicles: true, rides: true } } },
  });
  res.json({
    items: items.map((c) => ({ ...toCategoryDTO(c), vehicles: c._count.vehicles, rides: c._count.rides })),
  });
});

adminRouter.post('/categories', requireAdmin('pricing'), validate(categorySchema), async (req, res) => {
  const c = await prisma.vehicleCategory.create({ data: req.body });
  // New categories get default pricing in every area so they are immediately bookable.
  const areas = await prisma.serviceArea.findMany();
  for (const a of areas) {
    await prisma.pricingConfiguration.create({
      data: {
        categoryId: c.id,
        serviceAreaId: a.id,
        baseFare: 500,
        perKm: 200,
        perMinute: 40,
        minimumFare: 1200,
        bookingFee: 100,
        cancellationFee: 1000,
        currency: a.currency,
      },
    });
  }
  await audit(req, 'category.created', 'VehicleCategory', c.id);
  res.status(201).json(toCategoryDTO(c));
});

adminRouter.put(
  '/categories/:id',
  requireAdmin('pricing'),
  validate(categorySchema.partial()),
  async (req, res) => {
    const c = await prisma.vehicleCategory.update({ where: { id: String(req.params.id) }, data: req.body });
    await audit(req, 'category.updated', 'VehicleCategory', c.id, req.body);
    res.json(toCategoryDTO(c));
  },
);

adminRouter.get('/service-areas', requireAdmin('pricing'), async (_req, res) => {
  res.json({
    items: await prisma.serviceArea.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { rides: true } } },
    }),
  });
});
adminRouter.post(
  '/service-areas',
  requireAdmin('settings'),
  validate(serviceAreaSchema),
  async (req, res) => {
    const a = await prisma.serviceArea.create({ data: req.body });
    const cats = await prisma.vehicleCategory.findMany();
    for (const c of cats) {
      await prisma.pricingConfiguration.create({
        data: {
          categoryId: c.id,
          serviceAreaId: a.id,
          baseFare: 500,
          perKm: 200,
          perMinute: 40,
          minimumFare: 1200,
          bookingFee: 100,
          cancellationFee: 1000,
          currency: a.currency,
        },
      });
    }
    await audit(req, 'service_area.created', 'ServiceArea', a.id);
    res.status(201).json(a);
  },
);
adminRouter.put(
  '/service-areas/:id',
  requireAdmin('settings'),
  validate(serviceAreaSchema.partial()),
  async (req, res) => {
    const a = await prisma.serviceArea.update({ where: { id: String(req.params.id) }, data: req.body });
    await audit(req, 'service_area.updated', 'ServiceArea', a.id, req.body);
    res.json(a);
  },
);

// ───────────────────────── Marketing ─────────────────────────
adminRouter.get('/coupons', requireAdmin('marketing'), async (_req, res) => {
  res.json({
    items: await prisma.coupon.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { redemptions: true } } },
    }),
  });
});
adminRouter.post('/coupons', requireAdmin('marketing'), validate(couponSchema), async (req, res) => {
  if (req.body.type === 'PERCENT' && req.body.value > 100) throw badRequest('Percentage cannot exceed 100');
  const c = await prisma.coupon.create({ data: req.body });
  await audit(req, 'coupon.created', 'Coupon', c.id, { code: c.code });
  res.status(201).json(c);
});
adminRouter.put(
  '/coupons/:id',
  requireAdmin('marketing'),
  validate(couponSchema.partial()),
  async (req, res) => {
    const c = await prisma.coupon.update({ where: { id: String(req.params.id) }, data: req.body });
    await audit(req, 'coupon.updated', 'Coupon', c.id, req.body);
    res.json(c);
  },
);
adminRouter.delete('/coupons/:id', requireAdmin('marketing'), async (req, res) => {
  await prisma.coupon.update({
    where: { id: String(req.params.id) },
    data: { deletedAt: new Date(), isActive: false },
  });
  await audit(req, 'coupon.deleted', 'Coupon', String(req.params.id));
  res.json({ ok: true });
});

const promotionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  titleAr: z.string().trim().min(1).max(120),
  description: z.string().max(400).optional(),
  descriptionAr: z.string().max(400).optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  isActive: z.boolean().default(true),
});
adminRouter.get('/promotions', requireAdmin('marketing'), async (_req, res) => {
  res.json({
    items: await prisma.promotion.findMany({
      orderBy: { createdAt: 'desc' },
      include: { coupons: { select: { code: true } } },
    }),
  });
});
adminRouter.post('/promotions', requireAdmin('marketing'), validate(promotionSchema), async (req, res) => {
  const p = await prisma.promotion.create({ data: req.body });
  await audit(req, 'promotion.created', 'Promotion', p.id);
  res.status(201).json(p);
});
adminRouter.put(
  '/promotions/:id',
  requireAdmin('marketing'),
  validate(promotionSchema.partial()),
  async (req, res) => {
    const p = await prisma.promotion.update({ where: { id: String(req.params.id) }, data: req.body });
    await audit(req, 'promotion.updated', 'Promotion', p.id);
    res.json(p);
  },
);

adminRouter.post(
  '/notifications/broadcast',
  requireAdmin('marketing'),
  validate(broadcastSchema),
  async (req, res) => {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      status: 'ACTIVE',
      role:
        req.body.audience === 'ALL'
          ? { in: ['PASSENGER', 'DRIVER'] }
          : req.body.audience === 'PASSENGERS'
            ? 'PASSENGER'
            : 'DRIVER',
    };
    const users = await prisma.user.findMany({ where, select: { id: true } });
    // Batched so a large audience doesn't hold one huge transaction.
    for (let i = 0; i < users.length; i += 200) {
      await Promise.all(
        users.slice(i, i + 200).map((u) => notify(u.id, 'BROADCAST', req.body.title, req.body.body)),
      );
    }
    await audit(req, 'notification.broadcast', 'Notification', null, {
      audience: req.body.audience,
      recipients: users.length,
      title: req.body.title,
    });
    res.json({ recipients: users.length });
  },
);

// ───────────────────────── Support ─────────────────────────
adminRouter.get('/tickets', requireAdmin('support'), validate(listQuery, 'query'), async (req, res) => {
  const { page, pageSize, status, q: search } = q<ListQuery>(req);
  const where: Prisma.SupportTicketWhereInput = {
    ...(status ? { status: status as any } : {}),
    ...(search
      ? {
          OR: [
            { subject: { contains: search, mode: 'insensitive' } },
            { user: { firstName: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, role: true } },
        assignedTo: { select: { firstName: true } },
        ride: { select: { code: true } },
      },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      ...pageArgs(page, pageSize),
    }),
    prisma.supportTicket.count({ where }),
  ]);
  res.json(paginated(rows, total, page, pageSize));
});

adminRouter.get('/tickets/:id', requireAdmin('support'), async (req, res) => {
  const t = await prisma.supportTicket.findUnique({
    where: { id: String(req.params.id) },
    include: {
      user: true,
      ride: { select: { id: true, code: true, status: true } },
      messages: {
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { firstName: true, lastName: true, role: true } } },
      },
      assignedTo: { select: { id: true, firstName: true } },
    },
  });
  if (!t) throw notFound('Ticket');
  res.json({ ...t, user: toUserDTO(t.user) });
});

adminRouter.post(
  '/tickets/:id/messages',
  requireAdmin('support'),
  validate(ticketReplySchema),
  async (req, res) => {
    const t = await prisma.supportTicket.findUnique({ where: { id: String(req.params.id) } });
    if (!t) throw notFound('Ticket');
    const msg = await prisma.$transaction(async (tx) => {
      const m = await tx.ticketMessage.create({
        data: {
          ticketId: t.id,
          authorId: req.user!.id,
          body: req.body.body,
          isInternal: !!req.body.isInternal,
        },
      });
      if (!req.body.isInternal)
        await tx.supportTicket.update({
          where: { id: t.id },
          data: { status: 'WAITING_ON_USER', assignedToId: t.assignedToId ?? req.user!.id },
        });
      return m;
    });
    if (!req.body.isInternal)
      await notify(
        t.userId,
        'SUPPORT_REPLY',
        `Support replied to #${t.number}`,
        req.body.body.slice(0, 140),
        { ticketId: t.id },
      );
    res.status(201).json(msg);
  },
);

adminRouter.patch(
  '/tickets/:id',
  requireAdmin('support'),
  validate(
    z.object({
      status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED']).optional(),
      priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
      assignToMe: z.boolean().optional(),
    }),
  ),
  async (req, res) => {
    const t = await prisma.supportTicket.update({
      where: { id: String(req.params.id) },
      data: {
        ...(req.body.status
          ? {
              status: req.body.status,
              resolvedAt: ['RESOLVED', 'CLOSED'].includes(req.body.status) ? new Date() : null,
            }
          : {}),
        ...(req.body.priority ? { priority: req.body.priority } : {}),
        ...(req.body.assignToMe ? { assignedToId: req.user!.id } : {}),
      },
    });
    await audit(req, 'ticket.updated', 'SupportTicket', t.id, req.body);
    res.json(t);
  },
);

adminRouter.get('/reviews', requireAdmin('support'), async (_req, res) => {
  const items = await prisma.rating.findMany({
    include: {
      review: true,
      rater: { select: { firstName: true, lastName: true, role: true } },
      ratee: { select: { firstName: true, lastName: true, role: true } },
      ride: { select: { code: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ items });
});
adminRouter.patch(
  '/reviews/:id',
  requireAdmin('support'),
  validate(z.object({ isHidden: z.boolean() })),
  async (req, res) => {
    const r = await prisma.review.update({
      where: { id: String(req.params.id) },
      data: { isHidden: req.body.isHidden },
    });
    await audit(req, req.body.isHidden ? 'review.hidden' : 'review.shown', 'Review', r.id);
    res.json(r);
  },
);

// ───────────────────────── Settings & logs ─────────────────────────
adminRouter.get('/settings', requireAdmin('settings'), async (_req, res) => {
  res.json(await getSettings());
});
adminRouter.put('/settings', requireAdmin('settings'), validate(settingsSchema), async (req, res) => {
  const before = await getSettings();
  const after = await saveSettings(req.body);
  await audit(req, 'settings.updated', 'SystemSetting', 'platform', { before, after });
  res.json(after);
});

adminRouter.get('/logs', requireAdmin('logs'), validate(listQuery, 'query'), async (req, res) => {
  const { page, pageSize, q: search } = q<ListQuery>(req);
  const where: Prisma.AdminActivityLogWhereInput = search
    ? {
        OR: [
          { action: { contains: search } },
          { entityType: { contains: search } },
          { entityId: { contains: search } },
        ],
      }
    : {};
  const [rows, total] = await Promise.all([
    prisma.adminActivityLog.findMany({
      where,
      include: { admin: { select: { firstName: true, lastName: true, adminRole: true } } },
      orderBy: { createdAt: 'desc' },
      ...pageArgs(page, pageSize),
    }),
    prisma.adminActivityLog.count({ where }),
  ]);
  res.json(paginated(rows, total, page, pageSize));
});

adminRouter.get('/admins', requireAdmin('settings'), async (_req, res) => {
  const items = await prisma.user.findMany({
    where: { role: 'ADMIN', deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ items: items.map((u) => ({ ...toUserDTO(u), lastLoginAt: u.lastLoginAt })) });
});
