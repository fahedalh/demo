import { Schema, model } from 'mongoose';

const auditSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User' },
    actorName: String,
    business: { type: Schema.Types.ObjectId, ref: 'Business' },
    action: { type: String, required: true },
    entity: String,
    entityId: String,
    meta: Schema.Types.Mixed,
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditSchema.index({ business: 1, createdAt: -1 });
auditSchema.index({ actor: 1, createdAt: -1 });
auditSchema.index({ action: 1, createdAt: -1 });
auditSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 400 });

export const AuditLog = model('AuditLog', auditSchema);
