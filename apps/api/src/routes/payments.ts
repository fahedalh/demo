/** Saved payment methods, wallet, top-ups and payment history (passengers). */
import { Router } from 'express';
import { z } from 'zod';
import { addCardSchema, walletTopupSchema } from '@masar/shared';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { q, validate } from '../middleware/validate';
import { notFound, unprocessable } from '../lib/errors';
import { pageArgs, paginated } from '../lib/pagination';
import { receiptNumber } from '../lib/ids';
import { gateway } from '../services/payments';
import { postWalletTx } from '../services/wallet.service';

export const paymentsRouter = Router();
paymentsRouter.use(requireAuth);

const pmDTO = (p: any) => ({ id: p.id, type: p.type, provider: p.provider, brand: p.brand, last4: p.last4, expMonth: p.expMonth, expYear: p.expYear, isDefault: p.isDefault });

paymentsRouter.get('/methods', async (req, res) => {
  const items = await prisma.paymentMethod.findMany({ where: { userId: req.user!.id, deletedAt: null }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
  res.json({ items: items.map(pmDTO), provider: gateway.name });
});

/** Stripe: returns a SetupIntent client secret for Stripe.js. Sandbox: null (card form posts test numbers). */
paymentsRouter.post('/setup-session', async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  const session = await gateway.createSetupSession(user.paymentCustomerRef, user.email);
  if (session && session.customerRef !== user.paymentCustomerRef) {
    await prisma.user.update({ where: { id: user.id }, data: { paymentCustomerRef: session.customerRef } });
  }
  res.json({ provider: gateway.name, clientSecret: session?.clientSecret ?? null });
});

paymentsRouter.post('/methods', validate(addCardSchema), async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  const card = await gateway.tokenizeCard({ ...req.body, customerRef: user.paymentCustomerRef });
  const count = await prisma.paymentMethod.count({ where: { userId: user.id, deletedAt: null } });
  const makeDefault = req.body.makeDefault || count === 0;
  const pm = await prisma.$transaction(async (tx) => {
    if (makeDefault) await tx.paymentMethod.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
    return tx.paymentMethod.create({ data: { userId: user.id, type: 'CARD', provider: gateway.name, ...card, isDefault: makeDefault } });
  });
  res.status(201).json(pmDTO(pm));
});

paymentsRouter.post('/methods/:id/default', async (req, res) => {
  const pm = await prisma.paymentMethod.findFirst({ where: { id: String(req.params.id), userId: req.user!.id, deletedAt: null } });
  if (!pm) throw notFound('Payment method');
  await prisma.$transaction([
    prisma.paymentMethod.updateMany({ where: { userId: req.user!.id }, data: { isDefault: false } }),
    prisma.paymentMethod.update({ where: { id: pm.id }, data: { isDefault: true } }),
  ]);
  res.json({ ok: true });
});

paymentsRouter.delete('/methods/:id', async (req, res) => {
  const r = await prisma.paymentMethod.updateMany({ where: { id: String(req.params.id), userId: req.user!.id, deletedAt: null }, data: { deletedAt: new Date(), isDefault: false } });
  if (!r.count) throw notFound('Payment method');
  res.json({ ok: true });
});

paymentsRouter.get('/wallet', async (req, res) => {
  const wallet = await prisma.wallet.upsert({ where: { userId: req.user!.id }, create: { userId: req.user!.id }, update: {} });
  const transactions = await prisma.walletTransaction.findMany({ where: { walletId: wallet.id }, orderBy: { createdAt: 'desc' }, take: 30 });
  res.json({ balance: wallet.balance, currency: wallet.currency, transactions });
});

paymentsRouter.post('/wallet/topup', validate(walletTopupSchema), async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  const pm = await prisma.paymentMethod.findFirst({ where: { id: req.body.paymentMethodId, userId: user.id, deletedAt: null } });
  if (!pm?.providerRef) throw notFound('Payment method');
  const payment = await prisma.payment.create({
    data: { userId: user.id, amount: req.body.amount, currency: 'AED', purpose: 'WALLET_TOPUP', type: 'CARD', provider: gateway.name, paymentMethodId: pm.id, receiptNumber: receiptNumber() },
  });
  const result = await gateway.charge({
    amount: req.body.amount,
    currency: 'AED',
    paymentMethodRef: pm.providerRef,
    customerRef: user.paymentCustomerRef,
    description: 'Masar wallet top-up',
    idempotencyKey: `topup-${payment.id}`,
  });
  if (result.status !== 'SUCCEEDED') {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', providerRef: result.providerRef, failureReason: result.failureReason } });
    throw unprocessable(result.failureReason ?? 'Top-up failed', 'PAYMENT_FAILED');
  }
  const wallet = await prisma.$transaction(async (tx) => {
    await tx.payment.update({ where: { id: payment.id }, data: { status: 'SUCCEEDED', providerRef: result.providerRef, paidAt: new Date() } });
    return postWalletTx(tx, user.id, req.body.amount, 'TOPUP', { referenceType: 'payment', referenceId: payment.id, description: `Top-up •••• ${pm.last4}` });
  });
  res.json({ balance: wallet.balance, currency: wallet.currency });
});

paymentsRouter.get('/history', validate(z.object({ page: z.coerce.number().default(1), pageSize: z.coerce.number().max(50).default(20) }), 'query'), async (req, res) => {
  const { page, pageSize } = q<{ page: number; pageSize: number }>(req);
  const where = { userId: req.user!.id };
  const [items, total] = await Promise.all([
    prisma.payment.findMany({ where, include: { paymentMethod: true, ride: { select: { code: true, pickupAddress: true, dropoffAddress: true } } }, orderBy: { createdAt: 'desc' }, ...pageArgs(page, pageSize) }),
    prisma.payment.count({ where }),
  ]);
  res.json(
    paginated(
      items.map((p) => ({
        id: p.id, receiptNumber: p.receiptNumber, purpose: p.purpose, type: p.type, provider: p.provider, amount: p.amount,
        refundedAmount: p.refundedAmount, currency: p.currency, status: p.status, failureReason: p.failureReason,
        card: p.paymentMethod ? { brand: p.paymentMethod.brand, last4: p.paymentMethod.last4 } : null, ride: p.ride, rideId: p.rideId, createdAt: p.createdAt,
      })),
      total, page, pageSize,
    ),
  );
});
