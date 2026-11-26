/** Google Places (New) autocomplete + Geocoding + Routes API. Key is server-side only. */
import { env } from '../../config/env';
import type { GeoProvider, Route } from './index';

const KEY = () => env.GOOGLE_MAPS_API_KEY;

/** Decodes Google's encoded polyline format into [lat, lng] pairs. */
function decodePolyline(str: string): [number, number][] {
  let index = 0, lat = 0, lng = 0;
  const out: [number, number][] = [];
  while (index < str.length) {
    for (const which of [0, 1]) {
      let result = 0, shift = 0, b: number;
      do {
        b = str.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta;
      else lng += delta;
    }
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}

export const googleProvider: GeoProvider = {
  name: 'google',
  async autocomplete(query, { near, locale }) {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      signal: AbortSignal.timeout(4000),
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY(),
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: locale,
        maxResultCount: 8,
        ...(near ? { locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 30000 } } } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Google HTTP ${res.status}`);
    const data: any = await res.json();
    return (data.places ?? []).map((p: any) => ({
      id: p.id,
      name: p.displayName?.text ?? p.formattedAddress,
      address: p.formattedAddress,
      lat: p.location.latitude,
      lng: p.location.longitude,
    }));
  },
  async reverse(point, locale) {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${point.lat},${point.lng}&language=${locale}&key=${KEY()}`,
      { signal: AbortSignal.timeout(4000) },
    );
    const data: any = await res.json();
    const r = data.results?.[0];
    if (!r) throw new Error('no reverse result');
    return { id: r.place_id, name: r.formatted_address.split(',')[0], address: r.formatted_address, lat: point.lat, lng: point.lng };
  },
  async route(from, to): Promise<Route> {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY(),
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
        destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
      }),
    });
    if (!res.ok) throw new Error(`Google HTTP ${res.status}`);
    const data: any = await res.json();
    const r = data.routes?.[0];
    if (!r) throw new Error('no route');
    return {
      distanceMeters: r.distanceMeters,
      durationSeconds: parseInt(String(r.duration).replace('s', ''), 10),
      geometry: decodePolyline(r.polyline.encodedPolyline),
      provider: 'google',
    };
  },
};
