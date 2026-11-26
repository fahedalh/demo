/**
 * Offline provider (development / tests / outage fallback).
 * Routing approximates a road path with a curved polyline and city driving speeds;
 * it is clearly labelled `local` in API responses so it is never mistaken for real routing.
 */
import { haversine, pathLength, type LatLng } from '@masar/shared';
import type { GeoProvider, PlaceSuggestion, Route } from './index';
import { DUBAI_PLACES } from './places-dubai';

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[ً-ٟ]/g, '');

function toSuggestion(p: (typeof DUBAI_PLACES)[number], locale: string): PlaceSuggestion {
  const ar = locale === 'ar';
  return { id: p.id, name: ar ? p.nameAr : p.name, address: ar ? p.addressAr : p.address, lat: p.lat, lng: p.lng };
}

function buildPath(from: LatLng, to: LatLng): [number, number][] {
  // A gently curved path (quadratic Bézier, bowed 7% of the trip length) sampled every ~120 m:
  // reads like a road on the map and lets live tracking animate smoothly. Straight lines and
  // L-shapes look wrong in coastal cities, where an L-shaped corner often lands in the sea.
  const dLat = to.lat - from.lat;
  const dLng = to.lng - from.lng;
  const ctrl = { lat: (from.lat + to.lat) / 2 - dLng * 0.07, lng: (from.lng + to.lng) / 2 + dLat * 0.07 };
  const steps = Math.max(2, Math.ceil(haversine(from, to) / 120));
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    out.push([+(a * from.lat + b * ctrl.lat + c * to.lat).toFixed(6), +(a * from.lng + b * ctrl.lng + c * to.lng).toFixed(6)]);
  }
  return out;
}

export const localProvider: GeoProvider = {
  name: 'local',

  async autocomplete(query, { near, locale }) {
    const q = norm(query.trim());
    if (!q) return [];
    const hits = DUBAI_PLACES.filter((p) =>
      [p.name, p.nameAr, p.address, p.addressAr, p.kind].some((f) => norm(f).includes(q)),
    );
    if (near) hits.sort((a, b) => haversine(near, a) - haversine(near, b));
    return hits.slice(0, 8).map((p) => toSuggestion(p, locale));
  },

  async reverse(point, locale) {
    let best = DUBAI_PLACES[0];
    let bestD = Infinity;
    for (const p of DUBAI_PLACES) {
      const d = haversine(point, p);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    const ar = locale === 'ar';
    if (bestD < 250) return toSuggestion(best, locale);
    return {
      id: `pt:${point.lat.toFixed(5)},${point.lng.toFixed(5)}`,
      name: ar ? `بالقرب من ${best.nameAr}` : `Near ${best.name}`,
      address: `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`,
      lat: point.lat,
      lng: point.lng,
    };
  },

  async route(from, to): Promise<Route> {
    const geometry = buildPath(from, to);
    // Real road distance is typically ~1.25× the geometric path in a city grid.
    const meters = pathLength(geometry.map(([lat, lng]) => ({ lat, lng }))) * 1.22;
    // Average speed grows with trip length (city streets → highways).
    const kmh = meters < 3000 ? 24 : meters < 10_000 ? 36 : 55;
    const seconds = Math.round((meters / 1000 / kmh) * 3600) + 60;
    return { distanceMeters: Math.round(meters), durationSeconds: seconds, geometry, provider: 'local' };
  },
};
