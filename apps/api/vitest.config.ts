import { defineConfig } from 'vitest/config';

const testDb = (process.env.TEST_DATABASE_URL ?? 'postgresql://masar:masar@localhost:5432/masar_test?schema=public');

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDb,
      REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'test-access-secret-0123456789-0123456789',
      JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789-0123456789',
      SANDBOX_WEBHOOK_SECRET: 'test-webhook-secret',
      STORAGE_DIR: './storage-test',
      DISPATCH_TIME_SCALE: '0.05',
      GEO_PROVIDER: 'local',
      PAYMENT_PROVIDER: 'sandbox',
    },
  },
});
