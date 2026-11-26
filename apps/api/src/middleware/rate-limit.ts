import { rateLimit, type Options } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { redis, rk } from '../lib/redis';
import { env } from '../config/env';

function make(name: string, opts: Partial<Options>) {
  return rateLimit({
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => env.isTest,
    store: new RedisStore({
      prefix: rk(`rl:${name}:`),
      sendCommand: (command: string, ...args: string[]) => redis.call(command, ...args) as Promise<RedisReply>,
    }),
    handler: (_req, res) =>
      res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down' } }),
    ...opts,
  });
}

/** General API budget per IP. */
export const apiLimiter = make('api', { windowMs: 60_000, limit: 600 });
/** Brute-force protection for credentials / OTP endpoints. */
export const authLimiter = make('auth', { windowMs: 15 * 60_000, limit: 30 });
export const otpLimiter = make('otp', { windowMs: 15 * 60_000, limit: 8 });
