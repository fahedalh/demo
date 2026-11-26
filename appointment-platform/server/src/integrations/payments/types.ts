export interface CheckoutInput {
  paymentId: string;
  amount: number; // major units
  currency: string;
  description: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
}

export interface WebhookResult {
  status: 'succeeded' | 'failed';
  paymentId?: string;
  providerRef?: string;
}

export interface PaymentProvider {
  key: string;
  label: string;
  isConfigured(): boolean;
  createCheckout(input: CheckoutInput): Promise<{ providerRef: string; checkoutUrl: string }>;
  refund(providerRef: string, amount: number, currency: string): Promise<{ providerRef: string }>;
  parseWebhook?(rawBody: Buffer, signature: string | undefined): Promise<WebhookResult | null>;
}
