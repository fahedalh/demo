import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts'], env: { NODE_ENV: 'test' }, hookTimeout: 180_000, testTimeout: 30_000 },
});
