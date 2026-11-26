import { Router } from 'express';
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
