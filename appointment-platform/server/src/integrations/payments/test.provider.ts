import { env, isProd } from '../../config/env';
import { randomToken } from '../../utils/crypto';
import type { PaymentProvider } from './types';

/**
 * Development/test provider. Redirects to the client's /pay/test/:paymentId page where the payer
 * explicitly approves or declines. Never enabled in production unless PAYMENTS_TEST_PROVIDER=true.
 */
export const testProvider: PaymentProvider = {
  key: 'test',
  label: 'Test card (sandbox)',
  isConfigured: () => env.PAYMENTS_TEST_PROVIDER && (!isProd || process.env.PAYMENTS_TEST_PROVIDER === 'true'),
  async createCheckout(i) {
    return { providerRef: `test_${randomToken(12)}`, checkoutUrl: `${env.APP_URL}/pay/test/${i.paymentId}` };
  },
  async refund() {
    return { providerRef: `test_refund_${randomToken(8)}` };
  },
};
