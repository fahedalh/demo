export interface LatLng {
  lat: number;
  lng: number;
}

const R = 6371000; // Earth radius (m)
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance in meters. */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b in degrees (0 = north). */
export function bearing(a: LatLng, b: LatLng): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function pathLength(points: LatLng[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += haversine(points[i - 1], points[i]);
  return d;
}

/** Point at `distance` meters along a polyline (clamped to the ends). */
export function pointAlong(points: LatLng[], distance: number): { point: LatLng; heading: number; done: boolean } {
  if (points.length === 0) throw new Error('empty path');
  if (points.length === 1) return { point: points[0], heading: 0, done: true };
  let remaining = Math.max(0, distance);
  for (let i = 1; i < points.length; i++) {
    const seg = haversine(points[i - 1], points[i]);
    if (remaining <= seg) {
      const t = seg === 0 ? 0 : remaining / seg;
      return {
        point: {
          lat: points[i - 1].lat + (points[i].lat - points[i - 1].lat) * t,
          lng: points[i - 1].lng + (points[i].lng - points[i - 1].lng) * t,
        },
        heading: bearing(points[i - 1], points[i]),
        done: false,
      };
    }
    remaining -= seg;
  }
  const last = points[points.length - 1];
  return { point: last, heading: bearing(points[points.length - 2], last), done: true };
}

/** Ray-casting point-in-polygon test for service-area geofences. */
export function pointInPolygon(p: LatLng, polygon: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat, xj = polygon[j].lng, yj = polygon[j].lat;
    const intersect = yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
