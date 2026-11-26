import rateLimit from 'express-rate-limit';
import { isTest } from '../config/env';

const common = { standardHeaders: 'draft-7' as const, legacyHeaders: false, skip: () => isTest };

export const apiLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 300 });

export const authLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60_000,
  limit: 30,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, please try again later' } },
});

export const bookingLimiter = rateLimit({
  ...common,
  windowMs: 60_000,
  limit: 20,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many booking attempts, slow down' } },
});
