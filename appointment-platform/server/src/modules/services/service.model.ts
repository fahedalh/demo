import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { SESSION_MODES } from '@bookly/shared';
import { customFieldSchema } from '../common/schemas';

const serviceSchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, maxlength: 2000 },
    group: { type: String, trim: true },
    image: String,
    duration: { type: Number, required: true, min: 5, max: 24 * 60 },
    bufferBefore: { type: Number, default: 0, min: 0, max: 240 },
    bufferAfter: { type: Number, default: 0, min: 0, max: 240 },
    price: { type: Number, default: 0, min: 0 },
    depositPercent: { type: Number, min: 0, max: 100 }, // overrides business default when set
    capacity: { type: Number, default: 1, min: 1, max: 1000 },
    staff: [{ type: Schema.Types.ObjectId, ref: 'Staff' }],
    branches: [{ type: Schema.Types.ObjectId, ref: 'Branch' }],
    resources: [{ type: Schema.Types.ObjectId, ref: 'Resource' }],
    sessionModes: { type: [{ type: String, enum: SESSION_MODES }], default: ['in_person'] },
    requiresApproval: { type: Boolean }, // overrides business default when set
    customFields: { type: [customFieldSchema], default: [] },
    color: { type: String, default: '#6366f1' },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);
serviceSchema.index({ business: 1, isActive: 1, sortOrder: 1 });
serviceSchema.index({ name: 'text', description: 'text', group: 'text' });
serviceSchema.index({ price: 1 });

export type ServiceDoc = HydratedDocument<InferSchemaType<typeof serviceSchema>>;
export const Service = model('Service', serviceSchema);
