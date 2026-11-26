import { Schema, model } from 'mongoose';
import { PERMISSIONS } from '@bookly/shared';

const roleSchema = new Schema(
  {
    key: { type: String, required: true, unique: true }, // e.g. "business:manager"
    name: { type: String, required: true },
    description: String,
    permissions: [{ type: String, enum: PERMISSIONS }],
    system: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Role = model('Role', roleSchema);
