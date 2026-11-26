/** Tiny read-through cache: Redis when available, in-memory otherwise. */
import { getRedis, redisReady } from '../config/redis';

const mem = new Map<string, { v: string; exp: number }>();

export async function cached<T>(key: string, ttlSec: number, load: () => Promise<T>): Promise<T> {
  const k = `cache:${key}`;
  try {
    if (redisReady()) {
      const hit = await getRedis()!.get(k);
      if (hit) return JSON.parse(hit) as T;
    } else {
      const hit = mem.get(k);
      if (hit && hit.exp > Date.now()) return JSON.parse(hit.v) as T;
    }
  } catch {
    /* cache miss on error */
  }
  const value = await load();
  const s = JSON.stringify(value);
  if (redisReady()) await getRedis()!.set(k, s, 'EX', ttlSec).catch(() => undefined);
  else {
    if (mem.size > 500) mem.clear();
    mem.set(k, { v: s, exp: Date.now() + ttlSec * 1000 });
  }
  return value;
}

export async function invalidate(prefix: string) {
  const p = `cache:${prefix}`;
  for (const k of mem.keys()) if (k.startsWith(p)) mem.delete(k);
  if (redisReady()) {
    const redis = getRedis()!;
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `${p}*`, 'COUNT', 200);
      cursor = next;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== '0');
  }
}
