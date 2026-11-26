import { Schema, model, type InferSchemaType } from 'mongoose';

/** Holidays, closures, staff time off and one-off extra opening hours. */
const exceptionSchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    scope: { type: String, enum: ['business', 'branch', 'staff', 'resource'], required: true },
    ref: { type: Schema.Types.ObjectId }, // branch/staff/resource id; empty for business scope
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    kind: { type: String, enum: ['closed', 'open'], default: 'closed' },
    reason: { type: String, maxlength: 200 },
  },
  { timestamps: true },
);
exceptionSchema.index({ business: 1, scope: 1, ref: 1, start: 1 });
exceptionSchema.index({ business: 1, end: 1 });

export type ExceptionAttrs = InferSchemaType<typeof exceptionSchema>;
export const AvailabilityException = model('AvailabilityException', exceptionSchema);
