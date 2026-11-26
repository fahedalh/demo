/** Applies migrations to the dedicated test database and loads the demo seed once per run. */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { Redis } from 'ioredis';

export default async function setup() {
  const root = path.resolve(__dirname, '../../..');
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL:
      process.env.TEST_DATABASE_URL ?? 'postgresql://masar:masar@localhost:5432/masar_test?schema=public',
    STORAGE_DIR: './storage-test',
  };
  // Non-destructive: apply pending migrations; the seed itself truncates the dedicated test DB.
  execSync('npx prisma migrate deploy', { cwd: root, env, stdio: 'pipe' });
  execSync('npx tsx prisma/seed.ts', { cwd: root, env, stdio: 'pipe' });
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  const keys = await redis.keys('test:masar:*');
  if (keys.length) await redis.del(...keys);
  redis.disconnect();
}
