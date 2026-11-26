import { Schema, model, type HydratedDocument, type InferSchemaType, Types } from 'mongoose';
import { MEMBER_ROLES, PLATFORM_ROLES, SUPPORTED_LOCALES } from '@bookly/shared';

const membershipSchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    role: { type: String, enum: MEMBER_ROLES, required: true },
    staff: { type: Schema.Types.ObjectId, ref: 'Staff' },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: PLATFORM_ROLES, default: 'customer', index: true },
    memberships: { type: [membershipSchema], default: [] },
    favorites: [{ type: Schema.Types.ObjectId, ref: 'Business' }],
    locale: { type: String, enum: SUPPORTED_LOCALES, default: 'en' },
    avatar: String,
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    notificationPrefs: {
      email: { type: Boolean, default: true },
      whatsapp: { type: Boolean, default: false },
      sms: { type: Boolean, default: false },
    },
    lastLoginAt: Date,
  },
  { timestamps: true },
);
userSchema.index({ 'memberships.business': 1 });
userSchema.index({ name: 'text', email: 'text' });

userSchema.set('toJSON', {
  transform: (_doc, ret: Record<string, unknown>) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

export type UserAttrs = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<UserAttrs>;
export const User = model('User', userSchema);
export type { Types };
