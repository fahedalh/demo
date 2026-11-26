import { Schema, model } from 'mongoose';

const settingsSchema = new Schema(
  {
    key: { type: String, default: 'global', unique: true },
    platformName: { type: String, default: 'Bookly' },
    supportEmail: { type: String, default: 'support@bookly.local' },
    defaultCurrency: { type: String, default: 'USD' },
    defaultLocale: { type: String, enum: ['en', 'ar'], default: 'en' },
    defaultTimezone: { type: String, default: 'Asia/Riyadh' },
    allowBusinessSignup: { type: Boolean, default: true },
    requireBusinessApproval: { type: Boolean, default: false },
    maintenanceMode: { type: Boolean, default: false },
    commissionPercent: { type: Number, default: 0, min: 0, max: 50 },
  },
  { timestamps: true },
);

export const PlatformSettings = model('PlatformSettings', settingsSchema, 'platformsettings');

export async function getSettings() {
  return (await PlatformSettings.findOne({ key: 'global' })) ?? (await PlatformSettings.create({ key: 'global' }));
}
