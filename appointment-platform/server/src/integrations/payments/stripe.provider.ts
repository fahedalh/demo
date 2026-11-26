import Stripe from 'stripe';
import { env } from '../../config/env';
import type { PaymentProvider } from './types';

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND']);
const THREE_DECIMAL = new Set(['KWD', 'BHD', 'JOD', 'OMR']);
export const toMinor = (amount: number, currency: string) =>
  Math.round(amount * (ZERO_DECIMAL.has(currency) ? 1 : THREE_DECIMAL.has(currency) ? 1000 : 100));

let client: Stripe | null = null;
const stripe = () => (client ??= new Stripe(env.STRIPE_SECRET_KEY!));

export const stripeProvider: PaymentProvider = {
  key: 'stripe',
  label: 'Card (Stripe)',
  isConfigured: () => !!env.STRIPE_SECRET_KEY,
  async createCheckout(i) {
    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      customer_email: i.customerEmail,
      line_items: [{ quantity: 1, price_data: { currency: i.currency.toLowerCase(), unit_amount: toMinor(i.amount, i.currency), product_data: { name: i.description } } }],
      metadata: { paymentId: i.paymentId },
      success_url: i.successUrl,
      cancel_url: i.cancelUrl,
    });
    return { providerRef: session.id, checkoutUrl: session.url! };
  },
  async refund(providerRef, amount, currency) {
    const session = await stripe().checkout.sessions.retrieve(providerRef);
    const refund = await stripe().refunds.create({ payment_intent: String(session.payment_intent), amount: toMinor(amount, currency) });
    return { providerRef: refund.id };
  },
  async parseWebhook(rawBody, signature) {
    if (!env.STRIPE_WEBHOOK_SECRET || !signature) return null;
    const event = stripe().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const s = event.data.object as Stripe.Checkout.Session;
      return { status: 'succeeded', paymentId: s.metadata?.paymentId, providerRef: s.id };
    }
    if (event.type === 'checkout.session.async_payment_failed' || event.type === 'checkout.session.expired') {
      const s = event.data.object as Stripe.Checkout.Session;
      return { status: 'failed', paymentId: s.metadata?.paymentId, providerRef: s.id };
    }
    return null;
  },
};
