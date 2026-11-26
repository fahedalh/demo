import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { BOOKING_FLOW_STEPS, SESSION_MODES, THEME_PRESETS } from '@bookly/shared';
import { customFieldSchema, localizedSchema } from '../common/schemas';

const categorySchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: localizedSchema, required: true },
    description: localizedSchema,
    icon: { type: String, default: 'Sparkles' },
    color: { type: String, default: '#6366f1' },
    image: String,
    terminology: {
      staff: { type: localizedSchema, default: () => ({ en: 'Staff', ar: 'الموظف' }) },
      service: { type: localizedSchema, default: () => ({ en: 'Service', ar: 'الخدمة' }) },
      resource: { type: localizedSchema, default: () => ({ en: 'Resource', ar: 'المورد' }) },
    },
    bookingFlow: {
      steps: { type: [{ type: String, enum: BOOKING_FLOW_STEPS }], default: ['service', 'staff', 'datetime', 'details', 'payment'] },
      requireStaff: { type: Boolean, default: false },
      resourceFirst: { type: Boolean, default: false },
      sessionModes: { type: [{ type: String, enum: SESSION_MODES }], default: ['in_person'] },
      customFields: { type: [customFieldSchema], default: [] },
    },
    subcategories: [localizedSchema],
    /** Default visual theme for businesses in this industry. */
    theme: { type: String, enum: THEME_PRESETS, default: 'default' },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export type CategoryAttrs = InferSchemaType<typeof categorySchema>;
export type CategoryDoc = HydratedDocument<CategoryAttrs>;
export const Category = model('BusinessCategory', categorySchema, 'businesscategories');
