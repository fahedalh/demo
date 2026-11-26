import { prisma } from './prisma';

/** Platform-wide operational settings, editable from the admin dashboard. */
export interface PlatformSettings {
  dispatchRadiusKm: number;
  offerTimeoutSeconds: number;
  maxDispatchAttempts: number;
  freeCancellationSeconds: number;
  supportPhone: string;
  supportEmail: string;
  maintenanceMode: boolean;
}

export const DEFAULT_SETTINGS: PlatformSettings = {
  dispatchRadiusKm: 8,
  offerTimeoutSeconds: 20,
  maxDispatchAttempts: 5,
  freeCancellationSeconds: 120,
  supportPhone: '+971800627271',
  supportEmail: 'support@masar.example',
  maintenanceMode: false,
};

let cache: { value: PlatformSettings; at: number } | null = null;

export async function getSettings(): Promise<PlatformSettings> {
  if (cache && Date.now() - cache.at < 10_000) return cache.value;
  const row = await prisma.systemSetting.findUnique({ where: { key: 'platform' } });
  const value = { ...DEFAULT_SETTINGS, ...((row?.value as Partial<PlatformSettings>) ?? {}) };
  cache = { value, at: Date.now() };
  return value;
}

export async function saveSettings(value: PlatformSettings): Promise<PlatformSettings> {
  await prisma.systemSetting.upsert({
    where: { key: 'platform' },
    create: { key: 'platform', value: value as any },
    update: { value: value as any },
  });
  cache = null;
  return getSettings();
}

export function invalidateSettingsCache() {
  cache = null;
}
