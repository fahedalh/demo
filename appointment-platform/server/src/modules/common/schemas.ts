import { Schema } from 'mongoose';
import { CUSTOM_FIELD_TYPES } from '@bookly/shared';

const HM = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;

export const localizedSchema = new Schema({ en: { type: String, required: true, trim: true }, ar: { type: String, trim: true } }, { _id: false });

const intervalSchema = new Schema(
  { start: { type: String, match: HM, required: true }, end: { type: String, match: HM, required: true } },
  { _id: false },
);

export const dayScheduleSchema = new Schema(
  { day: { type: Number, min: 0, max: 6, required: true }, enabled: { type: Boolean, default: true }, intervals: [intervalSchema] },
  { _id: false },
);

export const customFieldSchema = new Schema(
  {
    key: { type: String, required: true, match: /^[a-zA-Z][a-zA-Z0-9_]{0,40}$/ },
    label: { type: localizedSchema, required: true },
    type: { type: String, enum: CUSTOM_FIELD_TYPES, default: 'text' },
    required: { type: Boolean, default: false },
    options: [String],
    placeholder: String,
  },
  { _id: false },
);

export const pointSchema = new Schema(
  { type: { type: String, enum: ['Point'], default: 'Point' }, coordinates: { type: [Number], default: undefined } },
  { _id: false },
);

export const addressSchema = new Schema(
  { line1: String, city: { type: String, trim: true }, country: { type: String, trim: true }, postalCode: String, location: pointSchema },
  { _id: false },
);
