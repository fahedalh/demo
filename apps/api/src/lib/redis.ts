import { Redis } from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: false });
redis.on('error', (err) => logger.error({ err }, 'redis error'));

/** Prefix keys so test runs never collide with development data. */
export const rk = (key: string) => `${env.isTest ? 'test:' : ''}masar:${key}`;

/** Best-effort distributed lock (SET NX PX). Returns a release function or null. */
export async function acquireLock(key: string, ttlMs: number): Promise<(() => Promise<void>) | null> {
  const token = Math.random().toString(36).slice(2);
  const ok = await redis.set(rk(`lock:${key}`), token, 'PX', ttlMs, 'NX');
  if (!ok) return null;
  return async () => {
    // Only release a lock we still own.
    await redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      rk(`lock:${key}`),
      token,
    );
  };
}
