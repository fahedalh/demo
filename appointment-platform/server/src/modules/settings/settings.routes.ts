import { Router } from 'express';
import { z } from 'zod';
import { channels } from '../../integrations/messaging';
import { authLimiter } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import { ContactMessage } from './contact.model';
import { onlineProvider } from '../../integrations/payments';
import { getAI } from '../../integrations/ai';
import { storageConfigured } from '../../integrations/storage';
import { cached } from '../../services/cache';
import { ah } from '../../utils/asyncHandler';
import { getSettings } from './settings.model';

/** Public, non-sensitive platform configuration for the client. */
export const publicSettingsRouter = Router();
publicSettingsRouter.get(
  '/',
  ah(async (_req, res) => {
    const s = await cached('settings:public', 60, async () => {
      const x = await getSettings();
      return { platformName: x.platformName, supportEmail: x.supportEmail, defaultCurrency: x.defaultCurrency, defaultLocale: x.defaultLocale, allowBusinessSignup: x.allowBusinessSignup, maintenanceMode: x.maintenanceMode };
    });
    res.json({ ...s, features: { onlinePayments: onlineProvider()?.key ?? null, uploads: storageConfigured(), ai: getAI().key } });
  }),
);

publicSettingsRouter.post(
  '/contact',
  authLimiter,
  validate({ body: z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().toLowerCase().email(), subject: z.string().trim().max(200).optional(), message: z.string().trim().min(10).max(4000) }) }),
  ah(async (req, res) => {
    const msg = await ContactMessage.create({ ...req.body, ip: req.ip });
    const settings = await getSettings();
    void channels.email.send(settings.supportEmail, { subject: `[Contact] ${req.body.subject ?? 'New message'}`, text: `${req.body.name} <${req.body.email}>\n\n${req.body.message}` });
    res.status(201).json({ ok: true, id: msg._id });
  }),
);
