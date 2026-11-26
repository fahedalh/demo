import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { addressSchema, dayScheduleSchema } from '../common/schemas';

const branchSchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    name: { type: String, required: true, trim: true },
    address: addressSchema,
    phone: String,
    timezone: String, // falls back to business timezone
    workingHours: { type: [dayScheduleSchema], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
branchSchema.index({ business: 1, isActive: 1 });
branchSchema.index({ 'address.location': '2dsphere' });

export type BranchDoc = HydratedDocument<InferSchemaType<typeof branchSchema>>;
export const Branch = model('Branch', branchSchema);
