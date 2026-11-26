import { Schema, model } from 'mongoose';

const contactSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true },
    subject: { type: String, maxlength: 200 },
    message: { type: String, required: true, maxlength: 4000 },
    status: { type: String, enum: ['new', 'handled'], default: 'new' },
    ip: String,
  },
  { timestamps: true },
);
contactSchema.index({ status: 1, createdAt: -1 });

export const ContactMessage = model('ContactMessage', contactSchema);
