import { Schema, model } from 'mongoose';

const reviewSchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    booking: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
    staff: { type: Schema.Types.ObjectId, ref: 'Staff' },
    service: { type: Schema.Types.ObjectId, ref: 'Service' },
    authorName: String,
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, maxlength: 2000 },
    reply: { text: String, at: Date },
    status: { type: String, enum: ['published', 'hidden'], default: 'published' },
  },
  { timestamps: true },
);
reviewSchema.index({ business: 1, status: 1, createdAt: -1 });

export const Review = model('Review', reviewSchema);
