/** Driver app API: onboarding, documents, vehicles, availability, offers, trip actions, earnings, payouts. */
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import {
  DOCUMENT_TYPES,
  cancelRideSchema,
  driverOnboardingSchema,
  payoutRequestSchema,
  vehicleSchema,
  FINISHED_TRIP_STATUSES,
} from '@masar/shared';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { requireAuth, requireRole } from '../middleware/auth';
import { q, validate } from '../middleware/validate';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../lib/errors';
import { pageArgs, paginated } from '../lib/pagination';
import { rideInclude, toRideDTO, toVehicleDTO, vehicleInclude } from '../services/serializers';
import { ALLOWED_MIME, deleteStoredFile, saveFile, sniffMime } from '../services/storage';
import { driverLocations } from '../services/driver-locations';
import { dispatch } from '../services/dispatch.service';
import {
  cancelRide,
  completeTrip,
  driverArrived,
  loadRide,
  markDriverArriving,
  startTrip,
} from '../services/ride.service';
import { postWalletTx } from '../services/wallet.service';
import { emitToAdmins, emitToUser, getIO } from '../realtime/io';

export const driverRouter = Router();
driverRouter.use(requireAuth, requireRole('DRIVER'));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype in ALLOWED_MIME),
});

async function profileOf(userId: string) {
  const p = await prisma.driverProfile.findUnique({ where: { userId } });
  if (!p) throw notFound('Driver profile');
  return p;
}

const REQUIRED_DOCS = [
  'PROFILE_PHOTO',
  'DRIVING_LICENSE',
  'NATIONAL_ID',
  'VEHICLE_REGISTRATION',
  'INSURANCE',
  'VEHICLE_PHOTO',
] as const;

driverRouter.get('/profile', async (req, res) => {
  const p = await prisma.driverProfile.findUnique({
    where: { userId: req.user!.id },
    include: {
      user: true,
      vehicles: { where: { deletedAt: null }, include: vehicleInclude, orderBy: { createdAt: 'asc' } },
      documents: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!p) throw notFound('Driver profile');
  const uploaded = new Set(p.documents.filter((d) => d.status !== 'REJECTED').map((d) => d.type));
  res.json({
    profile: {
      licenseNumber: p.licenseNumber,
      licenseExpiry: p.licenseExpiry,
      dateOfBirth: p.dateOfBirth,
      nationalId: p.nationalId,
      verificationStatus: p.verificationStatus,
      verificationNote: p.verificationNote,
      submittedAt: p.submittedAt,
      approvedAt: p.approvedAt,
      isOnline: p.isOnline,
      rating: p.rating,
      ratingCount: p.ratingCount,
      completedRides: p.completedRides,
      activeVehicleId: p.activeVehicleId,
      lastLocation: p.lastLat != null ? { lat: p.lastLat, lng: p.lastLng } : null,
    },
    vehicles: p.vehicles.map(toVehicleDTO),
    documents: p.documents.map((d) => ({
      id: d.id,
      type: d.type,
      vehicleId: d.vehicleId,
      originalName: d.originalName,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      status: d.status,
      reviewNote: d.reviewNote,
      createdAt: d.createdAt,
    })),
    checklist: {
      personalInfo: !!(p.licenseNumber && p.nationalId && p.dateOfBirth),
      vehicle: p.vehicles.length > 0,
      documents: REQUIRED_DOCS.map((t) => ({ type: t, uploaded: uploaded.has(t) })),
    },
  });
});

driverRouter.put('/onboarding', validate(driverOnboardingSchema), async (req, res) => {
  const p = await profileOf(req.user!.id);
  if (p.verificationStatus === 'APPROVED') throw conflict('Approved profiles are changed through support');
  await prisma.driverProfile.update({ where: { id: p.id }, data: req.body });
  res.json({ ok: true });
});

driverRouter.post('/submit', async (req, res) => {
  const p = await prisma.driverProfile.findUniqueOrThrow({
    where: { userId: req.user!.id },
    include: {
      vehicles: { where: { deletedAt: null } },
      documents: { where: { deletedAt: null, status: { not: 'REJECTED' } } },
    },
  });
  if (!['PENDING', 'NEEDS_INFO', 'REJECTED'].includes(p.verificationStatus))
    throw conflict('Your application is already submitted');
  if (!p.licenseNumber || !p.nationalId) throw unprocessable('Complete your personal information first');
  if (!p.vehicles.length) throw unprocessable('Add your vehicle first');
  const have = new Set(p.documents.map((d) => d.type));
  const missing = REQUIRED_DOCS.filter((t) => !have.has(t));
  if (missing.length)
    throw unprocessable(
      `Missing documents: ${missing.join(', ').toLowerCase().replace(/_/g, ' ')}`,
      'MISSING_DOCUMENTS',
    );
  await prisma.driverProfile.update({
    where: { id: p.id },
    data: { verificationStatus: 'UNDER_REVIEW', submittedAt: new Date(), verificationNote: null },
  });
  res.json({ ok: true, status: 'UNDER_REVIEW' });
});

// ─── Vehicles ───
driverRouter.post('/vehicles', validate(vehicleSchema), async (req, res) => {
  const p = await profileOf(req.user!.id);
  const { categoryCode, ...data } = req.body;
  const category = await prisma.vehicleCategory.findUnique({ where: { code: categoryCode } });
  if (!category) throw badRequest('Unknown vehicle category');
  if (data.seats < category.capacity)
    throw badRequest(`${category.name} requires at least ${category.capacity} passenger seats`);
  if (category.code === 'ELECTRIC' && !data.isElectric)
    throw badRequest('Only electric vehicles can join the Electric category');
  const v = await prisma.vehicle.create({
    data: { ...data, driverId: p.id, categoryId: category.id },
    include: vehicleInclude,
  });
  if (!p.activeVehicleId)
    await prisma.driverProfile.update({ where: { id: p.id }, data: { activeVehicleId: v.id } });
  res.status(201).json(toVehicleDTO(v));
});

driverRouter.delete('/vehicles/:id', async (req, res) => {
  const p = await profileOf(req.user!.id);
  if (p.isOnline && p.activeVehicleId === req.params.id)
    throw conflict('Go offline before removing your active vehicle');
  const r = await prisma.vehicle.updateMany({
    where: { id: String(req.params.id), driverId: p.id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (!r.count) throw notFound('Vehicle');
  if (p.activeVehicleId === req.params.id)
    await prisma.driverProfile.update({ where: { id: p.id }, data: { activeVehicleId: null } });
  res.json({ ok: true });
});

driverRouter.post('/vehicles/:id/activate', async (req, res) => {
  const p = await profileOf(req.user!.id);
  if (p.isOnline) throw conflict('Go offline before switching vehicles');
  const v = await prisma.vehicle.findFirst({
    where: { id: String(req.params.id), driverId: p.id, deletedAt: null },
  });
  if (!v) throw notFound('Vehicle');
  await prisma.driverProfile.update({ where: { id: p.id }, data: { activeVehicleId: v.id } });
  res.json({ ok: true });
});

// ─── Documents ───
driverRouter.post('/documents', upload.single('file'), async (req, res) => {
  const p = await profileOf(req.user!.id);
  const type = z.enum(DOCUMENT_TYPES).safeParse(req.body.type);
  if (!type.success) throw badRequest('Choose a document type');
  if (!req.file) throw badRequest('Attach a JPG, PNG, WEBP or PDF file');
  const sniffed = sniffMime(req.file.buffer);
  if (!sniffed || sniffed !== req.file.mimetype) throw badRequest('File content does not match its type');
  const vehicleId = typeof req.body.vehicleId === 'string' && req.body.vehicleId ? req.body.vehicleId : null;
  if (vehicleId && !(await prisma.vehicle.findFirst({ where: { id: vehicleId, driverId: p.id } })))
    throw badRequest('Unknown vehicle');
  const key = await saveFile(`drivers/${p.id}`, req.file.buffer, sniffed);
  // Re-uploading a document type replaces the previous (non-approved) version.
  if (type.data !== 'VEHICLE_PHOTO') {
    await prisma.driverDocument.updateMany({
      where: { driverId: p.id, type: type.data, deletedAt: null, status: { not: 'APPROVED' } },
      data: { deletedAt: new Date() },
    });
  }
  const doc = await prisma.driverDocument.create({
    data: {
      driverId: p.id,
      vehicleId,
      type: type.data,
      storageKey: key,
      originalName: req.file.originalname.slice(0, 200),
      mimeType: sniffed,
      sizeBytes: req.file.size,
    },
  });
  if (type.data === 'PROFILE_PHOTO') {
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { avatarUrl: `/api/files/documents/${doc.id}` },
    });
  }
  if (p.verificationStatus === 'NEEDS_INFO') {
    await prisma.driverProfile.update({ where: { id: p.id }, data: { verificationStatus: 'UNDER_REVIEW' } });
  }
  res.status(201).json({ id: doc.id, type: doc.type, status: doc.status, originalName: doc.originalName });
});

driverRouter.delete('/documents/:id', async (req, res) => {
  const p = await profileOf(req.user!.id);
  const doc = await prisma.driverDocument.findFirst({
    where: { id: String(req.params.id), driverId: p.id, deletedAt: null },
  });
  if (!doc) throw notFound('Document');
  if (doc.status === 'APPROVED') throw conflict('Approved documents cannot be removed');
  await prisma.driverDocument.update({ where: { id: doc.id }, data: { deletedAt: new Date() } });
  await deleteStoredFile(doc.storageKey);
  res.json({ ok: true });
});

// ─── Availability ───
const statusSchema = z.object({
  online: z.boolean(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});
driverRouter.post('/status', validate(statusSchema), async (req, res) => {
  const me = req.user!.id;
  const p = await prisma.driverProfile.findUniqueOrThrow({
    where: { userId: me },
    include: { activeVehicle: { include: { category: true } } },
  });
  if (req.body.online) {
    if (p.verificationStatus !== 'APPROVED')
      throw forbidden('Your account must be approved before you can go online');
    if (!p.activeVehicle || p.activeVehicle.status !== 'APPROVED' || p.activeVehicle.deletedAt)
      throw unprocessable('Select an approved vehicle before going online', 'NO_ACTIVE_VEHICLE');
    const lat = req.body.lat ?? p.lastLat;
    const lng = req.body.lng ?? p.lastLng;
    if (lat == null || lng == null)
      throw badRequest('Location is required to go online — enable location access');
    await prisma.driverProfile.update({
      where: { id: p.id },
      data: { isOnline: true, lastLat: lat, lastLng: lng, lastLocationAt: new Date() },
    });
    await driverLocations.goOnline(me, p.activeVehicle.category.code, lat, lng);
    const engaged = await prisma.ride.findFirst({
      where: { driverId: me, status: { in: ['ACCEPTED', 'DRIVER_ARRIVING', 'ARRIVED', 'IN_PROGRESS'] } },
    });
    if (engaged) await driverLocations.setBusy(me, engaged.id);
    getIO()?.in(`user:${me}`).socketsJoin('drivers:online');
    emitToAdmins('admin:driver_location', {
      driverId: me,
      lat,
      lng,
      at: new Date().toISOString(),
      isOnline: true,
      busy: !!engaged,
    });
  } else {
    const engaged = await prisma.ride.findFirst({
      where: { driverId: me, status: { in: ['ACCEPTED', 'DRIVER_ARRIVING', 'ARRIVED', 'IN_PROGRESS'] } },
    });
    if (engaged) throw conflict('Finish your current trip before going offline');
    await prisma.driverProfile.update({ where: { id: p.id }, data: { isOnline: false } });
    await driverLocations.goOffline(me);
    // Withdraw a pending offer so the passenger isn't left waiting.
    const pending = await prisma.rideOffer.findFirst({ where: { driverId: me, status: 'PENDING' } });
    if (pending) await dispatch.reject(pending.id, me);
    getIO()?.in(`user:${me}`).socketsLeave('drivers:online');
    emitToAdmins('admin:driver_offline', { driverId: me });
  }
  emitToUser(me, 'driver:status', { isOnline: req.body.online });
  res.json({ isOnline: req.body.online });
});

// ─── Offers & trip actions ───
driverRouter.get('/offers/current', async (req, res) => {
  const offer = await prisma.rideOffer.findFirst({
    where: { driverId: req.user!.id, status: 'PENDING', expiresAt: { gt: new Date() } },
    orderBy: { offeredAt: 'desc' },
  });
  if (!offer) return res.json({ offer: null });
  const ride = await loadRide(offer.rideId);
  const gross = ((ride.fareBreakdown as any)?.subtotal as number | undefined) ?? ride.estimatedFare;
  res.json({
    offer: {
      offerId: offer.id,
      ride: toRideDTO(ride, req.user!.id, 'DRIVER'),
      expiresAt: offer.expiresAt.toISOString(),
      pickupDistanceMeters: offer.distanceM,
      pickupEtaSeconds: Math.round(((offer.distanceM * 1.3) / 1000 / 25) * 3600) + 60,
      estimatedEarning: Math.round(gross * (1 - ride.commissionRate)),
    },
  });
});

driverRouter.post('/offers/:id/accept', async (req, res) => {
  const ride = await dispatch.accept(String(req.params.id), req.user!.id);
  res.json({ ride: toRideDTO(ride, req.user!.id, 'DRIVER') });
});

driverRouter.post('/offers/:id/reject', async (req, res) => {
  await dispatch.reject(String(req.params.id), req.user!.id);
  res.json({ ok: true });
});

driverRouter.post('/rides/:id/arriving', async (req, res) => {
  await markDriverArriving(String(req.params.id), req.user!.id);
  res.json({ ride: toRideDTO(await loadRide(String(req.params.id)), req.user!.id, 'DRIVER') });
});

driverRouter.post('/rides/:id/arrived', async (req, res) => {
  const ride = await driverArrived(String(req.params.id), req.user!.id);
  res.json({ ride: toRideDTO(ride, req.user!.id, 'DRIVER') });
});

driverRouter.post(
  '/rides/:id/start',
  validate(z.object({ pin: z.string().regex(/^\d{4}$/, 'Enter the 4-digit PIN') })),
  async (req, res) => {
    const ride = await startTrip(String(req.params.id), req.user!.id, req.body.pin);
    res.json({ ride: toRideDTO(ride, req.user!.id, 'DRIVER') });
  },
);

driverRouter.post('/rides/:id/complete', async (req, res) => {
  const ride = await completeTrip(String(req.params.id), { id: req.user!.id, role: 'DRIVER' });
  res.json({ ride: toRideDTO(ride, req.user!.id, 'DRIVER') });
});

driverRouter.post('/rides/:id/cancel', validate(cancelRideSchema), async (req, res) => {
  const ride = await cancelRide(String(req.params.id), { id: req.user!.id, role: 'DRIVER' }, req.body.reason);
  res.json({ ride: toRideDTO(ride, req.user!.id, 'DRIVER') });
});

const reportSchema = z.object({
  category: z.enum(['RIDE_ISSUE', 'SAFETY', 'LOST_ITEM', 'PAYMENT', 'OTHER']).default('RIDE_ISSUE'),
  description: z.string().trim().min(5).max(2000),
});
driverRouter.post('/rides/:id/report', validate(reportSchema), async (req, res) => {
  const ride = await prisma.ride.findFirst({ where: { id: String(req.params.id), driverId: req.user!.id } });
  if (!ride) throw notFound('Ride');
  const ticket = await prisma.supportTicket.create({
    data: {
      userId: req.user!.id,
      rideId: ride.id,
      subject: `Driver report — trip ${ride.code}`,
      category: req.body.category,
      description: req.body.description,
      priority: req.body.category === 'SAFETY' ? 'HIGH' : 'NORMAL',
    },
  });
  res.status(201).json({ ticketId: ticket.id, number: ticket.number });
});

// ─── Performance & earnings ───
function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfWeek(d = new Date()) {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // Monday start
  x.setDate(x.getDate() - day);
  return x;
}

driverRouter.get('/dashboard', async (req, res) => {
  const me = req.user!.id;
  const p = await prisma.driverProfile.findUniqueOrThrow({ where: { userId: me } });
  const [today, week, wallet, recent] = await Promise.all([
    prisma.driverEarning.aggregate({
      where: { driverId: me, createdAt: { gte: startOfDay() } },
      _sum: { netEarning: true, tip: true },
      _count: true,
    }),
    prisma.driverEarning.aggregate({
      where: { driverId: me, createdAt: { gte: startOfWeek() } },
      _sum: { netEarning: true, tip: true },
      _count: true,
    }),
    prisma.wallet.findUnique({ where: { userId: me } }),
    prisma.ride.findMany({
      where: { driverId: me, status: { in: FINISHED_TRIP_STATUSES } },
      include: rideInclude,
      orderBy: { completedAt: 'desc' },
      take: 5,
    }),
  ]);
  res.json({
    isOnline: p.isOnline,
    verificationStatus: p.verificationStatus,
    rating: Math.round(p.rating * 100) / 100,
    ratingCount: p.ratingCount,
    completedRides: p.completedRides,
    cancelledRides: p.cancelledRides,
    acceptanceRate: p.offersReceived ? Math.round((p.offersAccepted / p.offersReceived) * 100) : 100,
    today: { earnings: (today._sum.netEarning ?? 0) + (today._sum.tip ?? 0), trips: today._count },
    week: { earnings: (week._sum.netEarning ?? 0) + (week._sum.tip ?? 0), trips: week._count },
    wallet: { balance: wallet?.balance ?? 0, currency: wallet?.currency ?? 'AED' },
    recentTrips: recent.map((r) => toRideDTO(r, me, 'DRIVER')),
  });
});

const periodSchema = z.object({ days: z.coerce.number().int().min(1).max(90).default(7) });
driverRouter.get('/earnings', validate(periodSchema, 'query'), async (req, res) => {
  const { days } = q<{ days: number }>(req);
  const me = req.user!.id;
  const since = startOfDay(new Date(Date.now() - (days - 1) * 86_400_000));
  const rows = await prisma.driverEarning.findMany({
    where: { driverId: me, createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
  });
  const byDay = new Map<
    string,
    {
      date: string;
      net: number;
      gross: number;
      commission: number;
      tips: number;
      trips: number;
      cash: number;
      online: number;
    }
  >();
  for (let i = 0; i < days; i++) {
    const d = new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    byDay.set(d, { date: d, net: 0, gross: 0, commission: 0, tips: 0, trips: 0, cash: 0, online: 0 });
  }
  for (const r of rows) {
    const k = r.createdAt.toISOString().slice(0, 10);
    const b = byDay.get(k);
    if (!b) continue;
    b.net += r.netEarning + r.tip;
    b.gross += r.grossFare;
    b.commission += r.commission;
    b.tips += r.tip;
    b.trips += 1;
    if (r.paymentType === 'CASH') b.cash += r.grossFare;
    else b.online += r.grossFare;
  }
  const series = [...byDay.values()];
  const totals = series.reduce(
    (a, b) => ({
      net: a.net + b.net,
      gross: a.gross + b.gross,
      commission: a.commission + b.commission,
      tips: a.tips + b.tips,
      trips: a.trips + b.trips,
      cash: a.cash + b.cash,
      online: a.online + b.online,
    }),
    { net: 0, gross: 0, commission: 0, tips: 0, trips: 0, cash: 0, online: 0 },
  );
  res.json({ days, series, totals });
});

driverRouter.get(
  '/earnings/history',
  validate(
    z.object({ page: z.coerce.number().default(1), pageSize: z.coerce.number().max(50).default(20) }),
    'query',
  ),
  async (req, res) => {
    const { page, pageSize } = q<{ page: number; pageSize: number }>(req);
    const where = { driverId: req.user!.id };
    const [items, total] = await Promise.all([
      prisma.driverEarning.findMany({
        where,
        include: {
          ride: {
            select: {
              code: true,
              pickupAddress: true,
              dropoffAddress: true,
              completedAt: true,
              currency: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        ...pageArgs(page, pageSize),
      }),
      prisma.driverEarning.count({ where }),
    ]);
    res.json(paginated(items, total, page, pageSize));
  },
);

driverRouter.get('/wallet', async (req, res) => {
  const wallet = await prisma.wallet.upsert({
    where: { userId: req.user!.id },
    create: { userId: req.user!.id },
    update: {},
  });
  const transactions = await prisma.walletTransaction.findMany({
    where: { walletId: wallet.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ balance: wallet.balance, currency: wallet.currency, transactions });
});

driverRouter.get('/payouts', async (req, res) => {
  res.json({
    items: await prisma.driverPayout.findMany({
      where: { driverId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  });
});

driverRouter.post('/payouts', validate(payoutRequestSchema), async (req, res) => {
  const me = req.user!.id;
  if (req.body.amount < 5000) throw badRequest('Minimum withdrawal is 50.00');
  const pending = await prisma.driverPayout.count({
    where: { driverId: me, status: { in: ['REQUESTED', 'APPROVED'] } },
  });
  if (pending) throw conflict('You already have a withdrawal in progress');
  const masked = req.body.destination.replace(/\s/g, '');
  const payout = await prisma.$transaction(async (tx) => {
    // Funds are reserved immediately (debited); a rejected payout is credited back.
    const p = await tx.driverPayout.create({
      data: {
        driverId: me,
        amount: req.body.amount,
        method: req.body.method,
        destination: `•••• ${masked.slice(-4)}`,
      },
    });
    await postWalletTx(tx, me, -req.body.amount, 'PAYOUT', {
      referenceType: 'payout',
      referenceId: p.id,
      description: 'Withdrawal request',
    });
    return p;
  });
  emitToAdmins('admin:ride_event', { rideId: '', status: 'PAYOUT_REQUESTED', code: payout.id });
  res.status(201).json(payout);
});

driverRouter.get('/reports/weekly', async (req, res) => {
  const me = req.user!.id;
  const weeks = 8;
  const from = startOfWeek(new Date(Date.now() - (weeks - 1) * 7 * 86_400_000));
  const rows = await prisma.driverEarning.findMany({ where: { driverId: me, createdAt: { gte: from } } });
  const out = Array.from({ length: weeks }, (_, i) => {
    const start = new Date(from.getTime() + i * 7 * 86_400_000);
    return {
      weekStart: start.toISOString().slice(0, 10),
      trips: 0,
      gross: 0,
      commission: 0,
      tips: 0,
      net: 0,
    };
  });
  for (const r of rows) {
    const idx = Math.floor((r.createdAt.getTime() - from.getTime()) / (7 * 86_400_000));
    const w = out[idx];
    if (!w) continue;
    w.trips++;
    w.gross += r.grossFare;
    w.commission += r.commission;
    w.tips += r.tip;
    w.net += r.netEarning + r.tip;
  }
  res.json({ weeks: out.reverse() });
});

driverRouter.get('/reviews', async (req, res) => {
  const items = await prisma.rating.findMany({
    where: { rateeId: req.user!.id },
    include: { review: true, ride: { select: { code: true, completedAt: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const dist = [1, 2, 3, 4, 5].map((s) => ({ score: s, count: items.filter((i) => i.score === s).length }));
  res.json({
    items: items.map((i) => ({
      id: i.id,
      score: i.score,
      comment: i.review?.isHidden ? null : i.review?.comment,
      tags: i.review?.tags ?? [],
      ride: i.ride,
      createdAt: i.createdAt,
    })),
    distribution: dist,
  });
});
