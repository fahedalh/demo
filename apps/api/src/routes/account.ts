/** Profile, saved places, emergency contacts and notifications — shared by passengers and drivers. */
import { Router } from 'express';
import {
  emergencyContactSchema,
  paginationSchema,
  savedPlaceSchema,
  updateProfileSchema,
} from '@masar/shared';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { q, validate } from '../middleware/validate';
import { notFound } from '../lib/errors';
import { toUserDTO } from '../services/serializers';
import { pageArgs, paginated } from '../lib/pagination';

export const accountRouter = Router();
accountRouter.use(requireAuth);

accountRouter.get('/', async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.user!.id },
    include: { passengerProfile: true, wallet: true },
  });
  res.json({
    user: toUserDTO(user),
    stats: user.passengerProfile
      ? {
          rating: user.passengerProfile.rating,
          ratingCount: user.passengerProfile.ratingCount,
          totalRides: user.passengerProfile.totalRides,
        }
      : null,
    wallet: user.wallet ? { balance: user.wallet.balance, currency: user.wallet.currency } : null,
  });
});

accountRouter.patch('/', validate(updateProfileSchema), async (req, res) => {
  const current = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  const data: any = { ...req.body };
  // Changing a contact detail resets its verification.
  if (data.email && data.email !== current.email) data.emailVerifiedAt = null;
  if (data.phone && data.phone !== current.phone) data.phoneVerifiedAt = null;
  const user = await prisma.user.update({ where: { id: req.user!.id }, data });
  res.json({ user: toUserDTO(user) });
});

/** Soft-deletes the account (GDPR-style erasure keeps ride/financial records intact). */
accountRouter.delete('/', async (req, res) => {
  const id = req.user!.id;
  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        email: null,
        phone: null,
        firstName: 'Deleted',
        lastName: 'User',
        avatarUrl: null,
        passwordHash: null,
        tokenVersion: { increment: 1 },
      },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  res.json({ ok: true });
});

// ─── Saved places ───
accountRouter.get('/places', async (req, res) => {
  res.json({
    items: await prisma.savedPlace.findMany({
      where: { userId: req.user!.id, deletedAt: null },
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
    }),
  });
});
accountRouter.post('/places', validate(savedPlaceSchema), async (req, res) => {
  // Only one HOME and one WORK: replace the previous one.
  if (req.body.type !== 'FAVORITE') {
    await prisma.savedPlace.updateMany({
      where: { userId: req.user!.id, type: req.body.type, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }
  res.status(201).json(await prisma.savedPlace.create({ data: { ...req.body, userId: req.user!.id } }));
});
accountRouter.patch('/places/:id', validate(savedPlaceSchema.partial()), async (req, res) => {
  const p = await prisma.savedPlace.findFirst({
    where: { id: String(req.params.id), userId: req.user!.id, deletedAt: null },
  });
  if (!p) throw notFound('Place');
  res.json(await prisma.savedPlace.update({ where: { id: p.id }, data: req.body }));
});
accountRouter.delete('/places/:id', async (req, res) => {
  const r = await prisma.savedPlace.updateMany({
    where: { id: String(req.params.id), userId: req.user!.id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (!r.count) throw notFound('Place');
  res.json({ ok: true });
});

// ─── Emergency contacts ───
accountRouter.get('/emergency-contacts', async (req, res) => {
  res.json({
    items: await prisma.emergencyContact.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'asc' },
    }),
  });
});
accountRouter.post('/emergency-contacts', validate(emergencyContactSchema), async (req, res) => {
  const count = await prisma.emergencyContact.count({ where: { userId: req.user!.id } });
  if (count >= 5)
    return res
      .status(400)
      .json({ error: { code: 'LIMIT', message: 'You can save up to 5 emergency contacts' } });
  res.status(201).json(await prisma.emergencyContact.create({ data: { ...req.body, userId: req.user!.id } }));
});
accountRouter.delete('/emergency-contacts/:id', async (req, res) => {
  const r = await prisma.emergencyContact.deleteMany({
    where: { id: String(req.params.id), userId: req.user!.id },
  });
  if (!r.count) throw notFound('Contact');
  res.json({ ok: true });
});

// ─── Notifications ───
accountRouter.get('/notifications', validate(paginationSchema, 'query'), async (req, res) => {
  const { page, pageSize } = q<{ page: number; pageSize: number }>(req);
  const where = { userId: req.user!.id };
  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(page, pageSize) }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { ...where, readAt: null } }),
  ]);
  res.json({ ...paginated(items, total, page, pageSize), unread });
});
accountRouter.post('/notifications/read-all', async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user!.id, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ ok: true });
});
accountRouter.post('/notifications/:id/read', async (req, res) => {
  await prisma.notification.updateMany({
    where: { id: String(req.params.id), userId: req.user!.id },
    data: { readAt: new Date() },
  });
  res.json({ ok: true });
});
