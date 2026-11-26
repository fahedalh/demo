import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { PAYMENT_MODES, SUPPORTED_LOCALES } from '@bookly/shared';
import { addressSchema } from '../common/schemas';

const businessSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    category: { type: Schema.Types.ObjectId, ref: 'BusinessCategory', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    tagline: { type: String, maxlength: 160 },
    description: { type: String, maxlength: 4000 },
    logo: String,
    cover: String,
    gallery: [String],
    branding: {
      primaryColor: { type: String, default: '#4f46e5', match: /^#[0-9a-fA-F]{6}$/ },
      accentColor: { type: String, default: '#14b8a6', match: /^#[0-9a-fA-F]{6}$/ },
      customDomain: String,
      hidePlatformBranding: { type: Boolean, default: false },
    },
    contact: { email: String, phone: String, website: String, whatsapp: String },
    address: addressSchema,
    timezone: { type: String, default: 'Asia/Riyadh' },
    currency: { type: String, default: 'USD', uppercase: true },
    locale: { type: String, enum: SUPPORTED_LOCALES, default: 'en' },
    settings: {
      slotInterval: { type: Number, default: 15, min: 5, max: 240 },
      minNoticeMinutes: { type: Number, default: 60, min: 0 },
      maxAdvanceDays: { type: Number, default: 60, min: 1, max: 730 },
      requireApproval: { type: Boolean, default: false },
      allowGuestBooking: { type: Boolean, default: true },
      allowStaffSelection: { type: Boolean, default: true },
      waitlistEnabled: { type: Boolean, default: true },
      payment: {
        mode: { type: String, enum: PAYMENT_MODES, default: 'optional' },
        depositPercent: { type: Number, default: 20, min: 0, max: 100 },
        acceptCash: { type: Boolean, default: true },
      },
      cancellation: {
        allowed: { type: Boolean, default: true },
        cutoffHours: { type: Number, default: 12, min: 0 },
        feePercent: { type: Number, default: 0, min: 0, max: 100 },
      },
      reschedule: {
        allowed: { type: Boolean, default: true },
        cutoffHours: { type: Number, default: 12, min: 0 },
        maxTimes: { type: Number, default: 2, min: 0 },
      },
      notifications: {
        email: { type: Boolean, default: true },
        whatsapp: { type: Boolean, default: false },
        sms: { type: Boolean, default: false },
        reminderHours: { type: [Number], default: [24] },
      },
    },
    status: { type: String, enum: ['pending', 'active', 'suspended'], default: 'active', index: true },
    featured: { type: Boolean, default: false },
    rating: { average: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
    priceRange: { min: { type: Number, default: 0 }, max: { type: Number, default: 0 } },
    invoiceSeq: { type: Number, default: 0 },
  },
  { timestamps: true },
);
businessSchema.index({ 'address.location': '2dsphere' });
businessSchema.index({ name: 'text', tagline: 'text', description: 'text' }, { weights: { name: 5, tagline: 2, description: 1 } });
businessSchema.index({ category: 1, status: 1 });
businessSchema.index({ status: 1, featured: -1, 'rating.average': -1 });
businessSchema.index({ 'address.city': 1 });

export type BusinessAttrs = InferSchemaType<typeof businessSchema>;
export type BusinessDoc = HydratedDocument<BusinessAttrs>;
export const Business = model('Business', businessSchema);
