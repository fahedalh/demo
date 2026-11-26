import { z } from 'zod';

/** Validated runtime configuration. The process refuses to start with an invalid environment. */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:5174,http://localhost:5175'),
  PUBLIC_API_URL: z.string().default('http://localhost:4000'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  SOCKET_REDIS_ADAPTER: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  GEO_PROVIDER: z.enum(['local', 'osm', 'mapbox', 'google']).default('local'),
  MAPBOX_TOKEN: z.string().optional().default(''),
  GOOGLE_MAPS_API_KEY: z.string().optional().default(''),
  PAYMENT_PROVIDER: z.enum(['sandbox', 'stripe']).default('sandbox'),
  STRIPE_SECRET_KEY: z.string().optional().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(''),
  SANDBOX_WEBHOOK_SECRET: z.string().default('dev-sandbox-webhook-secret'),
  OTP_DELIVERY: z.enum(['console']).default('console'),
  STORAGE_DIR: z.string().default('./storage'),
  MAX_UPLOAD_MB: z.coerce.number().default(8),
  LOG_LEVEL: z.string().default('info'),
  /** Test/dev only: run dispatch timers faster. */
  DISPATCH_TIME_SCALE: z.coerce.number().default(1),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment configuration:', z.prettifyError(parsed.error));
  process.exit(1);
}

const e = parsed.data;
if (e.NODE_ENV === 'production' && /change-me/.test(e.JWT_ACCESS_SECRET + e.JWT_REFRESH_SECRET)) {
  console.error('❌ Refusing to start in production with placeholder JWT secrets');
  process.exit(1);
}
if (e.PAYMENT_PROVIDER === 'stripe' && (!e.STRIPE_SECRET_KEY || !e.STRIPE_WEBHOOK_SECRET)) {
  console.error('❌ PAYMENT_PROVIDER=stripe requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET');
  process.exit(1);
}

export const env = {
  ...e,
  isProd: e.NODE_ENV === 'production',
  isTest: e.NODE_ENV === 'test',
  corsOrigins: e.CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
