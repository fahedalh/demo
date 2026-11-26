import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { dayScheduleSchema } from '../common/schemas';

const resourceSchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true }, // room, bay, equipment, vehicle, table …
    description: String,
    capacity: { type: Number, default: 1, min: 1 },
    workingHours: { type: [dayScheduleSchema], default: [] }, // empty = follow branch
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
resourceSchema.index({ business: 1, branch: 1, isActive: 1 });

export type ResourceDoc = HydratedDocument<InferSchemaType<typeof resourceSchema>>;
export const Resource = model('Resource', resourceSchema);
