import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const paymentSchema = new Schema(
  {
    business: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    purpose: { type: String, enum: ['booking', 'subscription'], default: 'booking' },
    booking: { type: Schema.Types.ObjectId, ref: 'Booking' },
    subscriptionChange: { plan: { type: Schema.Types.ObjectId, ref: 'Plan' }, interval: { type: String, enum: ['monthly', 'annual'] } },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    kind: { type: String, enum: ['deposit', 'full', 'balance', 'refund'], required: true },
    method: { type: String, enum: ['online', 'cash'], required: true },
    provider: { type: String, required: true }, // stripe | test | cash
    providerRef: String,
    checkoutUrl: String,
    status: { type: String, enum: ['pending', 'succeeded', 'failed', 'refunded', 'cancelled'], default: 'pending' },
    invoiceNumber: String,
    paidAt: Date,
    refundOf: { type: Schema.Types.ObjectId, ref: 'Payment' },
    note: String,
  },
  { timestamps: true },
);
paymentSchema.index({ business: 1, createdAt: -1 });
paymentSchema.index({ booking: 1 });
paymentSchema.index({ user: 1, createdAt: -1 });
paymentSchema.index({ providerRef: 1 }, { sparse: true });
paymentSchema.index({ status: 1, createdAt: -1 });

export type PaymentDoc = HydratedDocument<InferSchemaType<typeof paymentSchema>>;
export const Payment = model('Payment', paymentSchema);
