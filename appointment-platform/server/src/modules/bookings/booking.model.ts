import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { BOOKING_STATUSES, PAYMENT_STATUSES, SESSION_MODES } from '@bookly/shared';

const historySchema = new Schema(
  {
    action: { type: String, required: true },
    at: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    byName: String,
    from: String,
    to: String,
    note: String,
  },
  { _id: false },
);

const bookingSchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
    service: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    staff: { type: Schema.Types.ObjectId, ref: 'Staff' },
    resource: { type: Schema.Types.ObjectId, ref: 'Resource' },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    reference: { type: String, required: true, unique: true },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    timezone: { type: String, required: true },
    attendees: { type: Number, default: 1, min: 1 },
    status: { type: String, enum: BOOKING_STATUSES, default: 'pending' },
    mode: { type: String, enum: SESSION_MODES, default: 'in_person' },
    meetingUrl: String,
    source: { type: String, enum: ['web', 'dashboard', 'staff', 'api', 'ai'], default: 'web' },
    answers: { type: Map, of: Schema.Types.Mixed, default: {} },
    customerNote: { type: String, maxlength: 1000 },
    internalNotes: { type: String, maxlength: 4000 },
    snapshot: { serviceName: String, staffName: String, customerName: String, customerEmail: String, customerPhone: String, duration: Number },
    price: {
      amount: { type: Number, default: 0 },
      currency: { type: String, default: 'USD' },
      deposit: { type: Number, default: 0 },
      paid: { type: Number, default: 0 },
      status: { type: String, enum: PAYMENT_STATUSES, default: 'unpaid' },
      method: { type: String, enum: ['online', 'cash', 'none'], default: 'none' },
    },
    recurrence: { groupId: String, index: Number, rule: String },
    rescheduleCount: { type: Number, default: 0 },
    cancellation: { by: { type: String, enum: ['customer', 'business', 'system'] }, reason: String, at: Date, fee: Number },
    history: { type: [historySchema], default: [] },
    reminderSentAt: Date,
    reviewRequestedAt: Date,
    /** `${staff|resource}|${startISO}` for 1:1 services while active; unique sparse index = DB-level double-booking guard. */
    slotKey: { type: String },
  },
  { timestamps: true },
);
bookingSchema.index({ slotKey: 1 }, { unique: true, sparse: true });
bookingSchema.index({ business: 1, start: 1 });
bookingSchema.index({ business: 1, staff: 1, start: 1 });
bookingSchema.index({ business: 1, resource: 1, start: 1 });
bookingSchema.index({ business: 1, customer: 1, start: -1 });
bookingSchema.index({ business: 1, status: 1, start: 1 });
bookingSchema.index({ user: 1, start: -1 });
bookingSchema.index({ status: 1, start: 1 });

export type BookingAttrs = InferSchemaType<typeof bookingSchema>;
export type BookingDoc = HydratedDocument<BookingAttrs>;
export const Booking = model('Booking', bookingSchema);
