/**
 * Payment provider webhooks. Mounted with a raw body parser (signatures are computed over the
 * exact bytes). Every event is verified, then applied idempotently to Payment / Refund records.
 */
import express, { Router } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { redis, rk } from '../lib/redis';
import { gateway } from '../services/payments';
import { broadcastRide, SYSTEM, transition } from '../services/ride.service';

export const webhooksRouter = Router();

webhooksRouter.post('/payments', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const signature = (req.headers['stripe-signature'] ?? req.headers['x-sandbox-signature']) as string | undefined;
  const event = gateway.parseWebhook(req.body as Buffer, signature);

  // Idempotency: providers retry deliveries; process each event id once.
  const first = await redis.set(rk(`webhook:${event.id}`), '1', 'EX', 7 * 86_400, 'NX');
  if (!first) return res.json({ received: true, duplicate: true });

  if (event.providerRef) {
    const payment = await prisma.payment.findFirst({ where: { providerRef: event.providerRef } });
    if (payment) {
      if (event.type === 'payment.succeeded' && payment.status !== 'SUCCEEDED') {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: 'SUCCEEDED', paidAt: new Date(), failureReason: null } });
        if (payment.rideId) {
          const ride = await prisma.ride.findUnique({ where: { id: payment.rideId } });
          if (ride?.status === 'PAYMENT_PENDING') {
            await transition(ride.id, 'PAYMENT_PENDING', 'PAYMENT_COMPLETED', SYSTEM, {}, `webhook ${event.id}`);
            await broadcastRide(ride.id);
          }
        }
      } else if (event.type === 'payment.failed' && payment.status === 'PENDING') {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', failureReason: 'Declined (webhook)' } });
      } else if (event.type === 'refund.succeeded') {
        await prisma.refund.updateMany({ where: { paymentId: payment.id, status: 'PENDING' }, data: { status: 'SUCCEEDED' } });
      }
    }
  }
  logger.info({ id: event.id, type: event.type }, 'payment webhook processed');
  res.json({ received: true });
});
