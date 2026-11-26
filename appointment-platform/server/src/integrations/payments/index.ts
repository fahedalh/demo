import { stripeProvider } from './stripe.provider';
import { testProvider } from './test.provider';
import type { PaymentProvider } from './types';

const providers: PaymentProvider[] = [stripeProvider, testProvider];

/** The online provider used for new checkouts: Stripe when configured, else the sandbox provider. */
export function onlineProvider(): PaymentProvider | null {
  return providers.find((p) => p.isConfigured()) ?? null;
}

export function providerByKey(key: string): PaymentProvider | undefined {
  return providers.find((p) => p.key === key);
}

export type { PaymentProvider };
