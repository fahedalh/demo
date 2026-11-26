import Redis from 'ioredis';
import { env } from './env';
import { logger } from './logger';

let client: Redis | null = null;

/** Returns a connected Redis client, or null when REDIS_URL is not configured. */
export function getRedis(): Redis | null {
  if (!env.REDIS_URL) return null;
  if (!client) {
    client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false });
    client.on('error', (err) => logger.warn({ err: err.message }, 'Redis error'));
    client.on('ready', () => logger.info('Redis connected'));
  }
  return client;
}

export function redisReady(): boolean {
  return !!client && client.status === 'ready';
}

export async function closeRedis() {
  if (client) await client.quit().catch(() => undefined);
  client = null;
}
