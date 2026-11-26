import { Schema, model, type InferSchemaType } from 'mongoose';

const planSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, lowercase: true },
    name: { type: String, required: true },
    description: String,
    price: { monthly: { type: Number, default: 0 }, annual: { type: Number, default: 0 } },
    currency: { type: String, default: 'USD' },
    limits: {
      staff: { type: Number, default: 1 }, // -1 = unlimited
      branches: { type: Number, default: 1 },
      bookingsPerMonth: { type: Number, default: 50 },
      customBranding: { type: Boolean, default: false },
      integrations: { type: Boolean, default: false },
      ai: { type: Boolean, default: false },
      advancedAnalytics: { type: Boolean, default: false },
      whatsapp: { type: Boolean, default: false },
    },
    features: [String],
    highlighted: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export type PlanAttrs = InferSchemaType<typeof planSchema>;
export const Plan = model('Plan', planSchema);

const subscriptionSchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true, unique: true },
    plan: { type: Schema.Types.ObjectId, ref: 'Plan', required: true },
    interval: { type: String, enum: ['monthly', 'annual'], default: 'monthly' },
    status: { type: String, enum: ['trialing', 'active', 'past_due', 'cancelled'], default: 'active' },
    currentPeriodStart: { type: Date, default: Date.now },
    currentPeriodEnd: Date,
    cancelAtPeriodEnd: { type: Boolean, default: false },
    provider: { type: String, default: 'manual' },
    providerRef: String,
  },
  { timestamps: true },
);

export const Subscription = model('Subscription', subscriptionSchema);
