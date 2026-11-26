import { Schema, model } from 'mongoose';

const waitlistSchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    service: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    staff: { type: Schema.Types.ObjectId, ref: 'Staff' },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    phone: String,
    note: String,
    status: { type: String, enum: ['waiting', 'notified', 'booked', 'removed'], default: 'waiting' },
    notifiedAt: Date,
  },
  { timestamps: true },
);
waitlistSchema.index({ business: 1, date: 1, status: 1 });

export const WaitlistEntry = model('WaitlistEntry', waitlistSchema);
