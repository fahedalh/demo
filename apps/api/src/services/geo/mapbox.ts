/** Mapbox Geocoding v6 + Directions v5. The token stays server-side; browsers only see results. */
import { env } from '../../config/env';
import type { GeoProvider, Route } from './index';

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`Mapbox HTTP ${res.status}`);
  return res.json();
}

const toSuggestion = (f: any) => ({
  id: f.id,
  name: f.properties?.name ?? f.properties?.full_address,
  address: f.properties?.full_address ?? f.properties?.place_formatted ?? '',
  lat: f.geometry.coordinates[1],
  lng: f.geometry.coordinates[0],
});

export const mapboxProvider: GeoProvider = {
  name: 'mapbox',
  async autocomplete(query, { near, locale }) {
    const prox = near ? `&proximity=${near.lng},${near.lat}` : '';
    const data = await getJson(
      `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(query)}&autocomplete=true&limit=8&language=${locale}${prox}&access_token=${env.MAPBOX_TOKEN}`,
    );
    return (data.features ?? []).map(toSuggestion);
  },
  async reverse(point, locale) {
    const data = await getJson(
      `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${point.lng}&latitude=${point.lat}&language=${locale}&access_token=${env.MAPBOX_TOKEN}`,
    );
    if (!data.features?.length) throw new Error('no reverse result');
    return toSuggestion(data.features[0]);
  },
  async route(from, to): Promise<Route> {
    const data = await getJson(
      `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${from.lng},${from.lat};${to.lng},${to.lat}?geometries=geojson&overview=full&access_token=${env.MAPBOX_TOKEN}`,
    );
    const r = data.routes?.[0];
    if (!r) throw new Error('no route');
    return {
      distanceMeters: Math.round(r.distance),
      durationSeconds: Math.round(r.duration),
      geometry: r.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]),
      provider: 'mapbox',
    };
  },
};
