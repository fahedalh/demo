import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';
import { apiLimiter } from './middleware/rate-limit';
import { errorHandler, notFoundHandler } from './middleware/error';
import { authRouter } from './routes/auth';
import { accountRouter } from './routes/account';
import { catalogRouter } from './routes/catalog';
import { geoRouter } from './routes/geo';
import { ridesRouter } from './routes/rides';
import { driverRouter } from './routes/driver';
import { paymentsRouter } from './routes/payments';
import { supportRouter } from './routes/support';
import { filesRouter } from './routes/files';
import { webhooksRouter } from './routes/webhooks';
import { adminRouter } from './routes/admin';
import { getSettings } from './lib/settings';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  if (!env.isTest) app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));

  // Webhooks need the raw body for signature verification — mount before express.json().
  app.use('/api/webhooks', webhooksRouter);

  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());
  app.use('/api', apiLimiter);

  app.get('/api/health', async (_req, res) => {
    const [db, cache] = await Promise.allSettled([prisma.$queryRaw`SELECT 1`, redis.ping()]);
    const ok = db.status === 'fulfilled' && cache.status === 'fulfilled';
    res.status(ok ? 200 : 503).json({
      status: ok ? 'ok' : 'degraded',
      db: db.status === 'fulfilled',
      redis: cache.status === 'fulfilled',
      time: new Date().toISOString(),
    });
  });

  // Maintenance mode blocks new bookings but keeps in-flight trips and admin working.
  app.use('/api/rides', async (req, res, next) => {
    if (req.method === 'POST' && req.path === '/' && (await getSettings()).maintenanceMode) {
      return res.status(503).json({
        error: {
          code: 'MAINTENANCE',
          message: 'Bookings are paused for scheduled maintenance. Please try again soon.',
        },
      });
    }
    next();
  });

  app.use('/api/auth', authRouter);
  app.use('/api/me', accountRouter);
  app.use('/api/catalog', catalogRouter);
  app.use('/api/geo', geoRouter);
  app.use('/api/rides', ridesRouter);
  app.use('/api/driver', driverRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/support', supportRouter);
  app.use('/api/files', filesRouter);
  app.use('/api/admin', adminRouter);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}
