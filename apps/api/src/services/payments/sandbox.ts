/**
 * SANDBOX gateway — a simulated card processor for development and demos. No money moves.
 * Test cards (any future expiry):
 *   4242 4242 4242 4242  → succeeds
 *   4000 0000 0000 0002  → declined
 *   4000 0000 0000 9995  → insufficient funds
 *   5555 5555 5555 4444  → succeeds (Mastercard)
 * Webhooks are signed with HMAC-SHA256 (SANDBOX_WEBHOOK_SECRET) so the webhook handler and
 * its signature check are exercised exactly as with a real provider.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env';
import { badRequest } from '../../lib/errors';
import type { PaymentGateway, WebhookEvent } from './gateway';

function luhn(num: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = Number(num[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

function brandOf(num: string): string {
  if (/^4/.test(num)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(num)) return 'mastercard';
  if (/^3[47]/.test(num)) return 'amex';
  return 'card';
}

export function signSandboxPayload(body: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const sig = createHmac('sha256', env.SANDBOX_WEBHOOK_SECRET).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${sig}`;
}

export const sandboxGateway: PaymentGateway = {
  name: 'SANDBOX',

  async createSetupSession() {
    return null;
  },

  async tokenizeCard({ cardNumber, expMonth, expYear }) {
    if (!cardNumber || !expMonth || !expYear) throw badRequest('Card number and expiry are required');
    if (!luhn(cardNumber)) throw badRequest('Card number is invalid');
    const now = new Date();
    if (expYear < now.getFullYear() || (expYear === now.getFullYear() && expMonth < now.getMonth() + 1)) {
      throw badRequest('Card has expired');
    }
    // The PAN is discarded here; only an opaque reference + display data are kept.
    const last4 = cardNumber.slice(-4);
    return { providerRef: `sbx_pm_${last4}_${randomUUID().slice(0, 8)}`, brand: brandOf(cardNumber), last4, expMonth, expYear };
  },

  async charge(req) {
    const last4 = /^sbx_pm_(\d{4})_/.exec(req.paymentMethodRef)?.[1];
    const ref = `sbx_pi_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    if (last4 === '0002') return { status: 'FAILED', providerRef: ref, failureReason: 'Your card was declined' };
    if (last4 === '9995') return { status: 'FAILED', providerRef: ref, failureReason: 'Insufficient funds' };
    return { status: 'SUCCEEDED', providerRef: ref };
  },

  async refund(providerRef) {
    return { status: 'SUCCEEDED', providerRef: `sbx_re_${providerRef.slice(-10)}` };
  },

  parseWebhook(rawBody, signature) {
    const m = /t=(\d+),v1=([a-f0-9]+)/.exec(signature ?? '');
    if (!m) throw badRequest('Missing webhook signature');
    const expected = createHmac('sha256', env.SANDBOX_WEBHOOK_SECRET).update(`${m[1]}.${rawBody.toString('utf8')}`).digest();
    const given = Buffer.from(m[2], 'hex');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw badRequest('Invalid webhook signature');
    if (Math.abs(Date.now() / 1000 - Number(m[1])) > 300) throw badRequest('Webhook timestamp outside tolerance');
    const evt = JSON.parse(rawBody.toString('utf8'));
    return { id: evt.id, type: evt.type ?? 'unknown', providerRef: evt.providerRef ?? null, raw: evt } as WebhookEvent;
  },
};
