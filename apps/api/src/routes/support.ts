import { Router } from 'express';
import { supportTicketSchema, ticketReplySchema } from '@masar/shared';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { badRequest, notFound } from '../lib/errors';
import { emitToAdmins } from '../realtime/io';

export const supportRouter = Router();
supportRouter.use(requireAuth);

supportRouter.get('/tickets', async (req, res) => {
  const items = await prisma.supportTicket.findMany({ where: { userId: req.user!.id }, orderBy: { updatedAt: 'desc' }, include: { ride: { select: { code: true } } } });
  res.json({ items });
});

supportRouter.post('/tickets', validate(supportTicketSchema), async (req, res) => {
  if (req.body.rideId) {
    const ride = await prisma.ride.findFirst({ where: { id: req.body.rideId, OR: [{ passengerId: req.user!.id }, { driverId: req.user!.id }] } });
    if (!ride) throw badRequest('Unknown ride');
  }
  const ticket = await prisma.supportTicket.create({
    data: { ...req.body, userId: req.user!.id, priority: req.body.category === 'SAFETY' ? 'HIGH' : 'NORMAL' },
  });
  emitToAdmins('admin:ride_event', { rideId: req.body.rideId ?? '', status: 'TICKET_OPENED', code: String(ticket.number) });
  res.status(201).json(ticket);
});

supportRouter.get('/tickets/:id', async (req, res) => {
  const t = await prisma.supportTicket.findFirst({
    where: { id: String(req.params.id), userId: req.user!.id },
    include: { messages: { where: { isInternal: false }, orderBy: { createdAt: 'asc' }, include: { author: { select: { firstName: true, role: true } } } }, ride: { select: { code: true } } },
  });
  if (!t) throw notFound('Ticket');
  res.json(t);
});

supportRouter.post('/tickets/:id/messages', validate(ticketReplySchema), async (req, res) => {
  const t = await prisma.supportTicket.findFirst({ where: { id: String(req.params.id), userId: req.user!.id } });
  if (!t) throw notFound('Ticket');
  if (t.status === 'CLOSED') throw badRequest('This ticket is closed');
  const m = await prisma.$transaction(async (tx) => {
    const msg = await tx.ticketMessage.create({ data: { ticketId: t.id, authorId: req.user!.id, body: req.body.body } });
    await tx.supportTicket.update({ where: { id: t.id }, data: { status: t.status === 'WAITING_ON_USER' || t.status === 'RESOLVED' ? 'OPEN' : t.status } });
    return msg;
  });
  res.status(201).json(m);
});
