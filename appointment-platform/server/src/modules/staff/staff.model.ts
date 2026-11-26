import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { dayScheduleSchema } from '../common/schemas';

const staffSchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, required: true, trim: true },
    title: String,
    bio: { type: String, maxlength: 1500 },
    avatar: String,
    email: { type: String, lowercase: true, trim: true },
    phone: String,
    color: { type: String, default: '#6366f1' },
    branches: [{ type: Schema.Types.ObjectId, ref: 'Branch' }],
    services: [{ type: Schema.Types.ObjectId, ref: 'Service' }],
    workingHours: { type: [dayScheduleSchema], default: [] },
    acceptsBookings: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    rating: { average: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
  },
  { timestamps: true },
);
staffSchema.index({ business: 1, isActive: 1 });
staffSchema.index({ business: 1, user: 1 });

export type StaffDoc = HydratedDocument<InferSchemaType<typeof staffSchema>>;
export const Staff = model('Staff', staffSchema, 'staff');
