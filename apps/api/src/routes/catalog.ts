/** Public reference data used by all apps. */
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { toCategoryDTO } from '../services/serializers';
import { geo } from '../services/geo';
import { gateway } from '../services/payments';
import { getSettings } from '../lib/settings';
import { env } from '../config/env';

export const catalogRouter = Router();

catalogRouter.get('/categories', async (_req, res) => {
  const cats = await prisma.vehicleCategory.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
  res.json({ items: cats.map(toCategoryDTO) });
});

catalogRouter.get('/promotions', async (_req, res) => {
  const now = new Date();
  const items = await prisma.promotion.findMany({
    where: { isActive: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    include: {
      coupons: {
        where: { isActive: true, deletedAt: null },
        select: { code: true, type: true, value: true, maxDiscount: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ items });
});

catalogRouter.get('/service-areas', async (_req, res) => {
  const items = await prisma.serviceArea.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      nameAr: true,
      city: true,
      centerLat: true,
      centerLng: true,
      radiusKm: true,
      currency: true,
    },
  });
  res.json({ items });
});

/** Non-secret runtime configuration for clients. */
catalogRouter.get('/config', async (_req, res) => {
  const s = await getSettings();
  res.json({
    geoProvider: geo.providerName,
    paymentProvider: gateway.name,
    stripePublishableKey:
      env.PAYMENT_PROVIDER === 'stripe' ? (process.env.STRIPE_PUBLISHABLE_KEY ?? null) : null,
    supportPhone: s.supportPhone,
    supportEmail: s.supportEmail,
    maintenanceMode: s.maintenanceMode,
    freeCancellationSeconds: s.freeCancellationSeconds,
  });
});
