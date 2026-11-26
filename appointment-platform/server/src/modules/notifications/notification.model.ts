import { Schema, model } from 'mongoose';
import { NOTIFICATION_CHANNELS, NOTIFICATION_EVENTS, SUPPORTED_LOCALES } from '@bookly/shared';

const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    business: { type: Schema.Types.ObjectId, ref: 'Business' },
    event: { type: String, enum: NOTIFICATION_EVENTS, required: true },
    title: { type: String, required: true },
    body: String,
    link: String,
    readAt: Date,
  },
  { timestamps: true },
);
notificationSchema.index({ user: 1, readAt: 1, createdAt: -1 });

export const Notification = model('Notification', notificationSchema);

const templateSchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', default: null },
    event: { type: String, enum: NOTIFICATION_EVENTS, required: true },
    channel: { type: String, enum: NOTIFICATION_CHANNELS, required: true },
    locale: { type: String, enum: SUPPORTED_LOCALES, default: 'en' },
    subject: String,
    body: { type: String, required: true, maxlength: 5000 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
templateSchema.index({ business: 1, event: 1, channel: 1, locale: 1 }, { unique: true });

export const NotificationTemplate = model('NotificationTemplate', templateSchema);

/** Delivery log for external channels (email/WhatsApp/SMS). */
const deliverySchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business' },
    event: String,
    channel: String,
    to: String,
    status: { type: String, enum: ['sent', 'failed', 'skipped'] },
    error: String,
  },
  { timestamps: true },
);
deliverySchema.index({ business: 1, createdAt: -1 });
deliverySchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
export const NotificationDelivery = model('NotificationDelivery', deliverySchema);
