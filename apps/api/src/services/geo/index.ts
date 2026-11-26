/**
 * Map / location integration layer. Every provider implements the same interface;
 * the active one is chosen with GEO_PROVIDER. Network providers fall back to the offline
 * `local` provider when the remote service fails, so booking never hard-fails on a map outage.
 * Route results are cached in Redis for 10 minutes (keyed on rounded coordinates).
 */
import type { LatLng } from '@masar/shared';
import { env } from '../../config/env';
import { redis, rk } from '../../lib/redis';
import { logger } from '../../lib/logger';
import { localProvider } from './local';
import { osmProvider } from './osm';
import { mapboxProvider } from './mapbox';
import { googleProvider } from './google';

export interface PlaceSuggestion {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface Route {
  distanceMeters: number;
  durationSeconds: number;
  geometry: [number, number][]; // [lat, lng]
  provider: string;
}

export interface GeoProvider {
  name: string;
  autocomplete(query: string, opts: { near?: LatLng; locale: string }): Promise<PlaceSuggestion[]>;
  reverse(point: LatLng, locale: string): Promise<PlaceSuggestion>;
  route(from: LatLng, to: LatLng): Promise<Route>;
}

function pick(): GeoProvider {
  switch (env.GEO_PROVIDER) {
    case 'osm':
      return osmProvider;
    case 'mapbox':
      return env.MAPBOX_TOKEN ? mapboxProvider : localProvider;
    case 'google':
      return env.GOOGLE_MAPS_API_KEY ? googleProvider : localProvider;
    default:
      return localProvider;
  }
}

const provider = pick();

async function withFallback<T>(op: string, primary: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  if (provider === localProvider) return fallback();
  try {
    return await primary();
  } catch (err) {
    logger.warn({ err: (err as Error).message, provider: provider.name, op }, 'geo provider failed, using local fallback');
    return fallback();
  }
}

const r5 = (n: number) => n.toFixed(4);

export const geo = {
  providerName: provider.name,

  autocomplete(query: string, opts: { near?: LatLng; locale: string }) {
    return withFallback('autocomplete', () => provider.autocomplete(query, opts), () => localProvider.autocomplete(query, opts));
  },

  reverse(point: LatLng, locale: string) {
    return withFallback('reverse', () => provider.reverse(point, locale), () => localProvider.reverse(point, locale));
  },

  async route(from: LatLng, to: LatLng): Promise<Route> {
    const key = rk(`route:${provider.name}:${r5(from.lat)},${r5(from.lng)}:${r5(to.lat)},${r5(to.lng)}`);
    const cached = await redis.get(key).catch(() => null);
    if (cached) return JSON.parse(cached) as Route;
    const route = await withFallback('route', () => provider.route(from, to), () => localProvider.route(from, to));
    await redis.set(key, JSON.stringify(route), 'EX', 600).catch(() => undefined);
    return route;
  },
};
