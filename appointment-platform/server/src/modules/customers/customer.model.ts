import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const customerSchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: String,
    notes: { type: String, maxlength: 4000 },
    tags: [String],
    stats: {
      bookings: { type: Number, default: 0 },
      completed: { type: Number, default: 0 },
      cancelled: { type: Number, default: 0 },
      noShows: { type: Number, default: 0 },
      totalSpent: { type: Number, default: 0 },
      lastVisitAt: Date,
    },
  },
  { timestamps: true },
);
customerSchema.index({ business: 1, email: 1 }, { unique: true });
customerSchema.index({ business: 1, user: 1 });
customerSchema.index({ name: 'text', email: 'text', phone: 'text' });

export type CustomerDoc = HydratedDocument<InferSchemaType<typeof customerSchema>>;
export const Customer = model('Customer', customerSchema);
