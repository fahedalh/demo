/**
 * Payment gateway abstraction. Adding a regional provider (e.g. Checkout.com, Tap, PayTabs)
 * means implementing this interface and registering it in ./index.ts — ride/wallet logic
 * never talks to a provider SDK directly.
 */
export interface TokenizedCard {
  providerRef: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface ChargeRequest {
  amount: number; // minor units
  currency: string;
  paymentMethodRef: string;
  customerRef?: string | null;
  description: string;
  idempotencyKey: string;
  metadata?: Record<string, string>;
}

export interface ChargeResult {
  status: 'SUCCEEDED' | 'REQUIRES_ACTION' | 'FAILED';
  providerRef: string | null;
  failureReason?: string;
  clientSecret?: string; // for 3-D Secure / SCA flows completed on the client
}

export interface RefundResult {
  status: 'SUCCEEDED' | 'FAILED' | 'PENDING';
  providerRef: string | null;
  failureReason?: string;
}

export interface WebhookEvent {
  id: string;
  type: 'payment.succeeded' | 'payment.failed' | 'refund.succeeded' | 'unknown';
  providerRef: string | null;
  raw: unknown;
}

export interface PaymentGateway {
  readonly name: 'SANDBOX' | 'STRIPE';
  /** Prepares a card-collection session (Stripe SetupIntent); sandbox returns null. */
  createSetupSession(
    customerRef: string | null,
    email?: string | null,
  ): Promise<{ clientSecret: string; customerRef: string } | null>;
  /** Saves a card. Sandbox receives a test PAN (discarded after validation); Stripe receives a pm_ id. */
  tokenizeCard(input: {
    cardNumber?: string;
    expMonth?: number;
    expYear?: number;
    providerPaymentMethodId?: string;
    customerRef?: string | null;
  }): Promise<TokenizedCard>;
  charge(req: ChargeRequest): Promise<ChargeResult>;
  refund(providerRef: string, amount: number): Promise<RefundResult>;
  /** Verifies the signature and normalizes the event. Throws on an invalid signature. */
  parseWebhook(rawBody: Buffer, signature: string | undefined): WebhookEvent;
}
