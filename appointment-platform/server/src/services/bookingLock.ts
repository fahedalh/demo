/**
 * Short-lived mutual-exclusion locks around booking writes.
 * Redis (SET NX PX + compare-and-delete) when available — safe across API instances;
 * an in-process async mutex otherwise (single-instance development).
 * The unique `slotKey` index on bookings is a second, DB-level line of defence.
 */
import { getRedis, redisReady } from '../config/redis';
import { randomToken } from '../utils/crypto';
import { AppError } from '../utils/AppError';

const RELEASE = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
const local = new Map<string, Promise<void>>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function acquireLocal(key: string): Promise<() => void> {
  while (local.has(key)) await local.get(key);
  let release!: () => void;
  local.set(key, new Promise<void>((r) => (release = r)));
  return () => {
    local.delete(key);
    release();
  };
}

async function acquireRedis(key: string, ttlMs: number, waitMs: number): Promise<() => Promise<void>> {
  const redis = getRedis()!;
  const token = randomToken(16);
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const ok = await redis.set(`lock:${key}`, token, 'PX', ttlMs, 'NX');
    if (ok) return async () => void (await redis.eval(RELEASE, 1, `lock:${key}`, token));
    await sleep(25 + Math.random() * 50);
  }
  throw new AppError(409, 'SLOT_BUSY', 'This time slot is being booked by someone else, please try again');
}

export async function withLocks<T>(keys: string[], fn: () => Promise<T>, ttlMs = 10_000, waitMs = 5_000): Promise<T> {
  const sorted = [...new Set(keys)].sort(); // fixed order prevents deadlocks
  const releases: Array<() => unknown> = [];
  try {
    for (const k of sorted) {
      releases.push(redisReady() ? await acquireRedis(k, ttlMs, waitMs) : await acquireLocal(k));
    }
    return await fn();
  } finally {
    for (const r of releases.reverse()) await r();
  }
}
