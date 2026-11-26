/** Authorised streaming of private driver documents (owner or admin with the `drivers` permission). */
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, adminCan, authenticate } from '../middleware/auth';
import { forbidden, notFound, unauthorized } from '../lib/errors';
import { readStoredFile } from '../services/storage';

export const filesRouter = Router();

filesRouter.get('/documents/:id', async (req, res, next) => {
  // <img> tags can't send headers, so a short-lived token may also come as ?token=
  if (!req.headers.authorization && typeof req.query.token === 'string') {
    try {
      req.user = await authenticate(req.query.token);
    } catch {
      return next(unauthorized());
    }
    return serve();
  }
  return requireAuth(req, res, (err?: unknown) => (err ? next(err) : serve()));

  async function serve() {
    try {
      const doc = await prisma.driverDocument.findUnique({ where: { id: String(req.params.id) }, include: { driver: true } });
      if (!doc || doc.deletedAt) throw notFound('Document');
      const u = req.user!;
      const isOwner = doc.driver.userId === u.id;
      const isAdmin = u.role === 'ADMIN' && adminCan(u.adminRole, 'drivers');
      // Profile photos are visible to passengers on a ride with that driver.
      const isRiderOfDriver =
        doc.type === 'PROFILE_PHOTO' &&
        !!(await prisma.ride.findFirst({ where: { passengerId: u.id, driverId: doc.driver.userId }, select: { id: true } }));
      if (!isOwner && !isAdmin && !isRiderOfDriver) throw forbidden();
      const buf = await readStoredFile(doc.storageKey);
      res.setHeader('Content-Type', doc.mimeType);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('Content-Disposition', `inline; filename="${doc.type.toLowerCase()}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(buf);
    } catch (e) {
      next(e);
    }
  }
});
