import express, { Router } from 'express';
import { z } from 'zod';
import { logger } from '../../config/logger';
import { providerByKey } from '../../integrations/payments';
import { optionalAuth } from '../../middleware/auth';
import { can, tenantId } from '../../middleware/tenant';
import { validate } from '../../middleware/validate';
import { audit } from '../../services/audit';
import { AppError } from '../../utils/AppError';
import { ah } from '../../utils/asyncHandler';
import { objectId } from '../../utils/objectId';
import { paginate } from '../../utils/pagination';
import { Booking } from '../bookings/booking.model';
import { Payment } from './payment.model';
import { markSucceeded, recordCash, refund } from './payment.service';

/** Public payment endpoints (webhooks + sandbox approval). */
export const publicPaymentRouter = Router();

publicPaymentRouter.post(
  '/webhooks/stripe',
  express.raw({ type: 'application/json', limit: '1mb' }),
  ah(async (req, res) => {
    const provider = providerByKey('stripe');
    let result;
    try {
      result = await provider?.parseWebhook?.(req.body as Buffer, req.headers['stripe-signature'] as string | undefined);
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'stripe webhook signature failed');
      throw AppError.badRequest('Invalid signature');
    }
    if (result?.paymentId) {
      const payment = await Payment.findById(result.paymentId);
      if (payment && result.status === 'succeeded') await markSucceeded(payment);
      if (payment && result.status === 'failed') await Payment.updateOne({ _id: payment._id, status: 'pending' }, { $set: { status: 'failed' } });
    }
    res.json({ received: true });
  }),
);

/** Sandbox checkout page data + approve/decline. Only for the `test` provider. */
publicPaymentRouter.get(
  '/test/:paymentId',
  validate({ params: z.object({ paymentId: objectId }) }),
  ah(async (req, res) => {
    const p = await Payment.findOne({ _id: req.params.paymentId, provider: 'test' }).populate('business', 'name logo branding').lean();
    if (!p) throw AppError.notFound('Payment');
    const booking = p.booking ? await Booking.findById(p.booking, { reference: 1, snapshot: 1, start: 1, timezone: 1, user: 1 }).lean() : null;
    res.json({ payment: { _id: p._id, amount: p.amount, currency: p.currency, status: p.status, kind: p.kind, purpose: p.purpose, business: p.business }, booking, testMode: true });
  }),
);

publicPaymentRouter.post(
  '/test/:paymentId/:action',
  optionalAuth,
  validate({ params: z.object({ paymentId: objectId, action: z.enum(['approve', 'decline']) }) }),
  ah(async (req, res) => {
    if (!providerByKey('test')?.isConfigured()) throw AppError.forbidden('Test payments are disabled');
    const p = await Payment.findOne({ _id: req.params.paymentId, provider: 'test' });
    if (!p) throw AppError.notFound('Payment');
    if (p.status !== 'pending') throw AppError.badRequest(`Payment already ${p.status}`);
    if (req.params.action === 'approve') await markSucceeded(p);
    else await Payment.updateOne({ _id: p._id }, { $set: { status: 'failed' } });
    const booking = p.booking ? await Booking.findById(p.booking, { reference: 1, user: 1 }).lean() : null;
    const returnTo = p.purpose === 'subscription' ? `/dashboard/${p.business}/billing` : booking?.user ? `/account/bookings/${p.booking}` : `/track?ref=${booking?.reference}`;
    res.json({ status: req.params.action === 'approve' ? 'succeeded' : 'failed', reference: booking?.reference, returnTo });
  }),
);

/** Tenant payments */
export const tenantPaymentRouter = Router({ mergeParams: true });

tenantPaymentRouter.get(
  '/',
  can('payments:read'),
  validate({ query: z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25), status: z.string().optional(), method: z.enum(['online', 'cash']).optional() }) }),
  ah(async (req, res) => {
    const { page, limit, status, method } = req.query as unknown as { page: number; limit: number; status?: string; method?: string };
    const filter: Record<string, unknown> = { business: tenantId(req), purpose: { $ne: 'subscription' }, status: { $ne: 'cancelled' } };
    if (status) filter.status = status;
    if (method) filter.method = method;
    const [items, total, totals] = await Promise.all([
      Payment.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('booking', 'reference snapshot start').populate('customer', 'name email').lean(),
      Payment.countDocuments(filter),
      Payment.aggregate([{ $match: { business: tenantId(req), purpose: { $ne: 'subscription' }, status: { $in: ['succeeded', 'refunded'] } } }, { $group: { _id: '$kind', sum: { $sum: '$amount' } } }]),
    ]);
    const refunds = totals.find((t) => t._id === 'refund')?.sum ?? 0;
    const gross = totals.filter((t) => t._id !== 'refund').reduce((a, t) => a + t.sum, 0);
    res.json({ ...paginate(items, total, page, limit), summary: { gross, refunds, net: gross - refunds } });
  }),
);

tenantPaymentRouter.get(
  '/:paymentId/invoice',
  can('payments:read'),
  validate({ params: z.object({ businessId: objectId, paymentId: objectId }) }),
  ah(async (req, res) => {
    const p = await Payment.findOne({ _id: req.params.paymentId, business: tenantId(req) }).populate('booking', 'reference snapshot start timezone price').populate('customer', 'name email phone').lean();
    if (!p) throw AppError.notFound('Payment');
    const b = req.tenant!.business;
    res.json({ payment: p, business: { name: b.name, address: b.address, contact: b.contact, logo: b.logo } });
  }),
);

tenantPaymentRouter.post(
  '/cash',
  can('payments:manage', 'bookings:manage'),
  validate({ body: z.object({ booking: objectId, amount: z.number().positive(), note: z.string().max(200).optional() }) }),
  ah(async (req, res) => {
    const booking = await Booking.findOne({ _id: req.body.booking, business: tenantId(req) });
    if (!booking) throw AppError.notFound('Booking');
    const p = await recordCash(booking, req.body.amount, req.body.note);
    await audit(req, 'payment.cash_recorded', { type: 'Payment', id: p._id }, { amount: req.body.amount });
    res.status(201).json(p);
  }),
);

tenantPaymentRouter.post(
  '/:paymentId/refund',
  can('payments:manage'),
  validate({ params: z.object({ businessId: objectId, paymentId: objectId }), body: z.object({ amount: z.number().positive().optional() }) }),
  ah(async (req, res) => {
    const p = await Payment.findOne({ _id: req.params.paymentId, business: tenantId(req) });
    if (!p) throw AppError.notFound('Payment');
    const r = await refund(p, req.body.amount);
    await audit(req, 'payment.refunded', { type: 'Payment', id: p._id }, { amount: r.amount });
    res.status(201).json(r);
  }),
);


