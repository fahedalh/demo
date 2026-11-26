import { Types } from 'mongoose';
import { env } from '../../config/env';
import { onlineProvider, providerByKey } from '../../integrations/payments';
import { notifyBooking } from '../../services/notification.service';
import { AppError } from '../../utils/AppError';
import { Booking, type BookingDoc } from '../bookings/booking.model';
import { Business } from '../businesses/business.model';
import { Customer } from '../customers/customer.model';
import { Payment, type PaymentDoc } from './payment.model';
import { Subscription } from '../plans/plan.model';

const round = (n: number) => Math.round(n * 100) / 100;

export function amountDue(booking: BookingDoc) {
  const p = booking.price!;
  const deposit = p.deposit ?? 0;
  const paid = p.paid ?? 0;
  // Pay the deposit first when one is required, else the remaining balance.
  if (deposit > 0 && paid < deposit) return { amount: round(deposit - paid), kind: 'deposit' as const };
  const balance = round((p.amount ?? 0) - paid);
  return { amount: balance, kind: paid > 0 ? ('balance' as const) : ('full' as const) };
}

async function nextInvoiceNumber(businessId: unknown) {
  const b = await Business.findByIdAndUpdate(businessId, { $inc: { invoiceSeq: 1 } }, { new: true, projection: { invoiceSeq: 1, slug: 1 } });
  return `INV-${(b?.slug ?? 'biz').slice(0, 6).toUpperCase()}-${String(b?.invoiceSeq ?? 0).padStart(5, '0')}`;
}

async function applyToBooking(payment: PaymentDoc) {
  if (!payment.booking) return;
  const booking = await Booking.findById(payment.booking);
  if (!booking) return;
  const sign = payment.kind === 'refund' ? -1 : 1;
  booking.price!.paid = Math.max(0, round((booking.price!.paid ?? 0) + sign * payment.amount));
  const p = booking.price!;
  p.status = p.paid <= 0 ? (payment.kind === 'refund' ? 'refunded' : 'unpaid') : p.paid >= p.amount ? 'paid' : 'partially_paid';
  if (payment.method === 'online' && payment.kind !== 'refund') p.method = 'online';
  booking.history.push({ action: payment.kind === 'refund' ? 'refund' : 'payment', note: `${payment.currency} ${payment.amount} (${payment.provider})`, at: new Date() });
  await booking.save();
  if (payment.kind !== 'refund') {
    void notifyBooking('payment.received', booking, { amount: `${payment.currency} ${payment.amount}` });
  }
}

/** Marks a pending payment succeeded (idempotent) and updates the booking balance. */
export async function markSucceeded(payment: PaymentDoc) {
  const updated = await Payment.findOneAndUpdate(
    { _id: payment._id, status: 'pending' },
    { $set: { status: 'succeeded', paidAt: new Date(), invoiceNumber: await nextInvoiceNumber(payment.business) } },
    { new: true },
  );
  if (updated?.purpose === 'subscription') await activateSubscription(updated);
  else if (updated) await applyToBooking(updated);
  return updated ?? payment;
}

async function activateSubscription(payment: PaymentDoc) {
  const change = payment.subscriptionChange;
  if (!change?.plan) return;
  const now = new Date();
  const end = new Date(now);
  if (change.interval === 'annual') end.setFullYear(end.getFullYear() + 1);
  else end.setMonth(end.getMonth() + 1);
  await Subscription.findOneAndUpdate(
    { business: payment.business },
    { $set: { plan: change.plan, interval: change.interval ?? 'monthly', status: 'active', currentPeriodStart: now, currentPeriodEnd: end, cancelAtPeriodEnd: false, provider: payment.provider, providerRef: payment.providerRef } },
    { upsert: true },
  );
}

/** Checkout for a paid plan. The plan activates when the payment succeeds. */
export async function startSubscriptionCheckout(businessId: unknown, plan: { _id: unknown; name: string; price: { monthly: number; annual: number }; currency: string }, interval: 'monthly' | 'annual', userId: string, email?: string) {
  const provider = onlineProvider();
  if (!provider) throw new AppError(503, 'PAYMENTS_DISABLED', 'Online payments are not configured. Contact support to upgrade.');
  const amount = interval === 'annual' ? plan.price.annual : plan.price.monthly;
  await Payment.updateMany({ business: businessId, purpose: 'subscription', status: 'pending' }, { $set: { status: 'cancelled' } });
  const payment = await Payment.create({ business: businessId, purpose: 'subscription', subscriptionChange: { plan: plan._id, interval }, user: userId, amount, currency: plan.currency, kind: 'full', method: 'online', provider: provider.key });
  const back = `${env.APP_URL}/dashboard/${businessId}/billing`;
  const { providerRef, checkoutUrl } = await provider.createCheckout({ paymentId: String(payment._id), amount, currency: plan.currency, description: `${plan.name} plan (${interval})`, customerEmail: email, successUrl: `${back}?payment=success`, cancelUrl: `${back}?payment=cancelled` });
  payment.providerRef = providerRef;
  payment.checkoutUrl = checkoutUrl;
  await payment.save();
  return { checkoutUrl };
}

export async function startCheckout(booking: BookingDoc, opts: { userId?: string; returnPath: string }) {
  if (!['pending', 'confirmed'].includes(booking.status)) throw AppError.badRequest('This booking cannot be paid');
  const provider = onlineProvider();
  if (!provider) throw new AppError(503, 'PAYMENTS_DISABLED', 'Online payments are not available. You can pay at the location.');
  const due = amountDue(booking);
  if (due.amount <= 0) throw AppError.badRequest('Nothing to pay for this booking');
  await Payment.updateMany({ booking: booking._id, status: 'pending' }, { $set: { status: 'cancelled' } });
  const payment = await Payment.create({
    business: booking.business,
    booking: booking._id,
    customer: booking.customer,
    user: opts.userId,
    amount: due.amount,
    currency: booking.price!.currency,
    kind: due.kind,
    method: 'online',
    provider: provider.key,
  });
  const back = `${env.APP_URL}${opts.returnPath}`;
  const sep = back.includes('?') ? '&' : '?';
  const { providerRef, checkoutUrl } = await provider.createCheckout({
    paymentId: String(payment._id),
    amount: due.amount,
    currency: booking.price!.currency ?? 'USD',
    description: `${booking.snapshot?.serviceName ?? 'Booking'} · ${booking.reference}`,
    customerEmail: booking.snapshot?.customerEmail ?? undefined,
    successUrl: `${back}${sep}payment=success`,
    cancelUrl: `${back}${sep}payment=cancelled`,
  });
  payment.providerRef = providerRef;
  payment.checkoutUrl = checkoutUrl;
  await payment.save();
  return { paymentId: String(payment._id), checkoutUrl, provider: provider.key, amount: due.amount, kind: due.kind };
}

export async function recordCash(booking: BookingDoc, amount: number, note?: string) {
  const due = round((booking.price?.amount ?? 0) - (booking.price?.paid ?? 0));
  if (amount <= 0 || amount > due + 0.001) throw AppError.badRequest(`Amount must be between 0 and the outstanding ${due}`);
  const payment = await Payment.create({
    business: booking.business,
    booking: booking._id,
    customer: booking.customer,
    user: booking.user,
    amount,
    currency: booking.price!.currency,
    kind: (booking.price?.paid ?? 0) > 0 ? 'balance' : amount >= due ? 'full' : 'deposit',
    method: 'cash',
    provider: 'cash',
    note,
  });
  return markSucceeded(payment);
}

export async function refund(payment: PaymentDoc, amount?: number) {
  if (payment.status !== 'succeeded' || payment.kind === 'refund') throw AppError.badRequest('Only successful payments can be refunded');
  const already = await Payment.aggregate([{ $match: { refundOf: payment._id, status: 'succeeded' } }, { $group: { _id: null, sum: { $sum: '$amount' } } }]);
  const refundable = round(payment.amount - (already[0]?.sum ?? 0));
  const value = round(amount ?? refundable);
  if (value <= 0 || value > refundable) throw AppError.badRequest(`You can refund up to ${refundable}`);
  let providerRef: string | undefined;
  if (payment.method === 'online') {
    const provider = providerByKey(payment.provider);
    if (!provider?.isConfigured()) throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'The payment provider is not configured');
    providerRef = (await provider.refund(payment.providerRef!, value, payment.currency)).providerRef;
  }
  const r = await Payment.create({
    business: payment.business,
    booking: payment.booking,
    customer: payment.customer,
    user: payment.user,
    amount: value,
    currency: payment.currency,
    kind: 'refund',
    method: payment.method,
    provider: payment.provider,
    providerRef,
    status: 'succeeded',
    paidAt: new Date(),
    refundOf: payment._id,
  });
  if (value === refundable) await Payment.updateOne({ _id: payment._id }, { $set: { status: 'refunded' } });
  await applyToBooking(r);
  if (payment.customer) await Customer.updateOne({ _id: payment.customer }, { $inc: { 'stats.totalSpent': 0 } });
  return r;
}

export const isId = (s: string) => Types.ObjectId.isValid(s);
