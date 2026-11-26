import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { q, validate } from '../middleware/validate';
import { geo } from '../services/geo';

export const geoRouter = Router();
geoRouter.use(requireAuth);

const autoSchema = z.object({
  q: z.string().trim().min(1).max(120),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  locale: z.enum(['en', 'ar']).default('en'),
});

geoRouter.get('/autocomplete', validate(autoSchema, 'query'), async (req, res) => {
  const { q: query, lat, lng, locale } = q<z.infer<typeof autoSchema>>(req);
  res.json({
    items: await geo.autocomplete(query, {
      near: lat != null && lng != null ? { lat, lng } : undefined,
      locale,
    }),
    provider: geo.providerName,
  });
});

const revSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  locale: z.enum(['en', 'ar']).default('en'),
});
geoRouter.get('/reverse', validate(revSchema, 'query'), async (req, res) => {
  const { lat, lng, locale } = q<z.infer<typeof revSchema>>(req);
  res.json(await geo.reverse({ lat, lng }, locale));
});

const routeSchema = z.object({
  fromLat: z.coerce.number(),
  fromLng: z.coerce.number(),
  toLat: z.coerce.number(),
  toLng: z.coerce.number(),
});
geoRouter.get('/route', validate(routeSchema, 'query'), async (req, res) => {
  const p = q<z.infer<typeof routeSchema>>(req);
  res.json(await geo.route({ lat: p.fromLat, lng: p.fromLng }, { lat: p.toLat, lng: p.toLng }));
});
