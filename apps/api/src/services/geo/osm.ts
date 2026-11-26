/** OpenStreetMap stack: Photon (komoot) for search, OSRM for routing. Public servers are fair-use only. */
import type { GeoProvider, Route } from './index';

const UA = 'masar-ride-platform/1.0';

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.json();
}

function photonToSuggestion(f: any) {
  const p = f.properties ?? {};
  const [lng, lat] = f.geometry.coordinates;
  const address = [p.street && `${p.street} ${p.housenumber ?? ''}`.trim(), p.district, p.city, p.country]
    .filter(Boolean)
    .join(', ');
  return { id: `osm:${p.osm_type}${p.osm_id}`, name: p.name ?? p.street ?? address, address, lat, lng };
}

export const osmProvider: GeoProvider = {
  name: 'osm',
  async autocomplete(query, { near, locale }) {
    const bias = near ? `&lat=${near.lat}&lon=${near.lng}` : '';
    const lang = locale === 'ar' ? 'default' : 'en';
    const data = await getJson(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=8&lang=${lang}${bias}`);
    return (data.features ?? []).map(photonToSuggestion);
  },
  async reverse(point) {
    const data = await getJson(`https://photon.komoot.io/reverse?lat=${point.lat}&lon=${point.lng}`);
    if (!data.features?.length) throw new Error('no reverse result');
    return photonToSuggestion(data.features[0]);
  },
  async route(from, to): Promise<Route> {
    const data = await getJson(
      `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`,
    );
    const r = data.routes?.[0];
    if (!r) throw new Error('no route');
    return {
      distanceMeters: Math.round(r.distance),
      durationSeconds: Math.round(r.duration),
      geometry: r.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]),
      provider: 'osrm',
    };
  },
};
