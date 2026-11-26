import { env } from '../../config/env';
import type { PaymentGateway } from './gateway';
import { sandboxGateway } from './sandbox';
import { stripeGateway } from './stripe';

export const gateway: PaymentGateway = env.PAYMENT_PROVIDER === 'stripe' ? stripeGateway : sandboxGateway;
export type { PaymentGateway } from './gateway';
