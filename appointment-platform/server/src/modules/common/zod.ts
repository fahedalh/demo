import { z } from 'zod';
import { CUSTOM_FIELD_TYPES, SESSION_MODES } from '@bookly/shared';
import { objectId } from '../../utils/objectId';

const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, 'Use HH:mm');

export const weeklyScheduleZ = z
  .array(
    z.object({
      day: z.number().int().min(0).max(6),
      enabled: z.boolean(),
      intervals: z
        .array(z.object({ start: hm, end: hm }))
        .max(6)
        .refine((ivs) => ivs.every((iv) => iv.start < iv.end), 'Each interval must end after it starts')
        .refine((ivs) => {
          const s = [...ivs].sort((a, b) => a.start.localeCompare(b.start));
          return s.every((iv, i) => i === 0 || s[i - 1].end <= iv.start);
        }, 'Intervals must not overlap'),
    }),
  )
  .max(7);

export const localizedZ = z.object({ en: z.string().trim().min(1).max(200), ar: z.string().trim().max(200).optional() });

export const customFieldZ = z.object({
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/, 'Letters, digits and _ only'),
  label: localizedZ,
  type: z.enum(CUSTOM_FIELD_TYPES),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  placeholder: z.string().max(200).optional(),
});

export const addressZ = z.object({
  line1: z.string().trim().max(200).optional(),
  city: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

/** Converts the API address shape ({lat,lng}) into the stored GeoJSON shape. */
export function toAddress(a?: z.infer<typeof addressZ>) {
  if (!a) return undefined;
  const { lat, lng, ...rest } = a;
  return { ...rest, location: lat !== undefined && lng !== undefined ? { type: 'Point', coordinates: [lng, lat] } : undefined };
}

export const idList = z.array(objectId).max(200);
export const sessionModesZ = z.array(z.enum(SESSION_MODES)).min(1);
export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a #RRGGBB colour');
