import fs from 'fs';
import path from 'path';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router } from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import { corsOrigins, isProd } from './config/env';
import { logger } from './config/logger';
import { redisReady } from './config/redis';
import { requireAuth } from './middleware/auth';
import { errorHandler, notFound } from './middleware/error';
import { apiLimiter } from './middleware/rateLimit';
import { sanitize } from './middleware/sanitize';
import { loadTenant } from './middleware/tenant';
import { adminRouter } from './modules/admin.routes';
import { aiRouter, aiTenantRouter } from './modules/ai/ai.routes';
import { adminAnalyticsRouter, businessAnalyticsRouter } from './modules/analytics/analytics.routes';
import { authRouter } from './modules/auth/auth.routes';
import { exceptionRouter } from './modules/availability/exception.routes';
import { customerRouter, tenantBookingRouter, waitlistRouter } from './modules/bookings/booking.routes';
import { branchRouter } from './modules/branches/branch.routes';
import { businessRouter, businessTenantRouter } from './modules/businesses/business.routes';
import { publicRouter } from './modules/businesses/public.routes';
import { adminCategoryRouter, categoryRouter } from './modules/categories/category.routes';
import { notificationRouter, templateRouter } from './modules/notifications/notification.routes';
import { publicPaymentRouter, tenantPaymentRouter } from './modules/payments/payment.routes';
import { adminPlanRouter, billingRouter, planRouter } from './modules/plans/plan.routes';
import { resourceRouter } from './modules/resources/resource.routes';
import { tenantReviewRouter } from './modules/reviews/review.routes';
import { searchRouter } from './modules/search/search.routes';
import { serviceRouter } from './modules/services/service.routes';
import { publicSettingsRouter } from './modules/settings/settings.routes';
import { staffRouter } from './modules/staff/staff.routes';
import { uploadRouter } from './modules/uploads/upload.routes';
import { meRouter } from './modules/users/me.routes';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({ contentSecurityPolicy: isProd ? undefined : false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(compression());
  // Stripe webhooks need the raw body: mounted before the JSON parser.
  app.use('/api/payments', publicPaymentRouter);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());
  app.use(sanitize);
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', db: mongoose.connection.readyState === 1 ? 'up' : 'down', redis: redisReady() ? 'up' : 'off', time: new Date().toISOString() });
  });

  const specPath = path.join(__dirname, 'docs', 'openapi.yaml');
  if (fs.existsSync(specPath)) {
    const spec = YAML.parse(fs.readFileSync(specPath, 'utf8'));
    app.get('/api/docs.json', (_req, res) => res.json(spec));
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'Bookly API' }));
  }

  const api = Router();
  api.use(apiLimiter);
  api.use('/auth', authRouter);
  api.use('/settings', publicSettingsRouter);
  api.use('/categories', categoryRouter);
  api.use('/plans', planRouter);
  api.use('/search', searchRouter);
  api.use('/public', publicRouter);
  api.use('/ai', aiRouter);
  api.use('/uploads', uploadRouter);
  api.use('/me', meRouter);
  api.use('/notifications', notificationRouter);

  // Tenant (business) scope
  api.use('/businesses', businessRouter);
  const tenant = Router({ mergeParams: true });
  tenant.use(requireAuth, loadTenant);
  tenant.use('/branches', branchRouter);
  tenant.use('/staff', staffRouter);
  tenant.use('/services', serviceRouter);
  tenant.use('/resources', resourceRouter);
  tenant.use('/exceptions', exceptionRouter);
  tenant.use('/bookings', tenantBookingRouter);
  tenant.use('/waitlist', waitlistRouter);
  tenant.use('/customers', customerRouter);
  tenant.use('/payments', tenantPaymentRouter);
  tenant.use('/reviews', tenantReviewRouter);
  tenant.use('/analytics', businessAnalyticsRouter);
  tenant.use('/templates', templateRouter);
  tenant.use('/billing', billingRouter);
  api.use('/businesses/:businessId/ai', aiTenantRouter);
  api.use('/businesses/:businessId', tenant);
  api.use('/businesses/:businessId', businessTenantRouter);

  // Platform administration
  api.use('/admin/analytics', adminAnalyticsRouter);
  api.use('/admin/categories', adminCategoryRouter);
  api.use('/admin/plans', adminPlanRouter);
  api.use('/admin', adminRouter);

  app.use('/api', api);

  // Production: serve the built SPA when present (docker image or single-process deploy).
  const clientDist = path.resolve(__dirname, '..', '..', 'client', 'dist');
  if (isProd && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { maxAge: '1h', index: false }));
    app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
