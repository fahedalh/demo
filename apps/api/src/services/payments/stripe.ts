/** Stripe gateway (test or live mode depending on the key). */
import Stripe from 'stripe';
import { env } from '../../config/env';
import { badRequest } from '../../lib/errors';
import type { PaymentGateway, WebhookEvent } from './gateway';

let client: Stripe | null = null;
const stripe = () => (client ??= new Stripe(env.STRIPE_SECRET_KEY));

export const stripeGateway: PaymentGateway = {
  name: 'STRIPE',

  async createSetupSession(customerRef, email) {
    let customer = customerRef;
    if (!customer) customer = (await stripe().customers.create({ email: email ?? undefined })).id;
    const si = await stripe().setupIntents.create({ customer, usage: 'off_session', payment_method_types: ['card'] });
    return { clientSecret: si.client_secret!, customerRef: customer };
  },

  async tokenizeCard({ providerPaymentMethodId, customerRef }) {
    if (!providerPaymentMethodId) throw badRequest('providerPaymentMethodId is required with Stripe');
    const pm = await stripe().paymentMethods.retrieve(providerPaymentMethodId);
    if (customerRef && !pm.customer) await stripe().paymentMethods.attach(pm.id, { customer: customerRef });
    return {
      providerRef: pm.id,
      brand: pm.card?.brand ?? 'card',
      last4: pm.card?.last4 ?? '0000',
      expMonth: pm.card?.exp_month ?? 1,
      expYear: pm.card?.exp_year ?? 2099,
    };
  },

  async charge(req) {
    try {
      const pi = await stripe().paymentIntents.create(
        {
          amount: req.amount,
          currency: req.currency.toLowerCase(),
          payment_method: req.paymentMethodRef,
          customer: req.customerRef ?? undefined,
          confirm: true,
          off_session: true,
          description: req.description,
          metadata: req.metadata,
        },
        { idempotencyKey: req.idempotencyKey },
      );
      if (pi.status === 'succeeded') return { status: 'SUCCEEDED', providerRef: pi.id };
      if (pi.status === 'requires_action')
        return { status: 'REQUIRES_ACTION', providerRef: pi.id, clientSecret: pi.client_secret ?? undefined };
      return { status: 'FAILED', providerRef: pi.id, failureReason: pi.last_payment_error?.message ?? pi.status };
    } catch (err: any) {
      return { status: 'FAILED', providerRef: err?.raw?.payment_intent?.id ?? null, failureReason: err?.message ?? 'Payment failed' };
    }
  },

  async refund(providerRef, amount) {
    const r = await stripe().refunds.create({ payment_intent: providerRef, amount });
    return { status: r.status === 'succeeded' ? 'SUCCEEDED' : r.status === 'failed' ? 'FAILED' : 'PENDING', providerRef: r.id };
  },

  parseWebhook(rawBody, signature) {
    let evt: Stripe.Event;
    try {
      evt = stripe().webhooks.constructEvent(rawBody, signature ?? '', env.STRIPE_WEBHOOK_SECRET);
    } catch {
      throw badRequest('Invalid Stripe webhook signature');
    }
    const obj: any = evt.data.object;
    const map: Record<string, WebhookEvent['type']> = {
      'payment_intent.succeeded': 'payment.succeeded',
      'payment_intent.payment_failed': 'payment.failed',
      'charge.refunded': 'refund.succeeded',
    };
    const providerRef = evt.type === 'charge.refunded' ? obj.payment_intent : obj.id;
    return { id: evt.id, type: map[evt.type] ?? 'unknown', providerRef, raw: evt };
  },
};
