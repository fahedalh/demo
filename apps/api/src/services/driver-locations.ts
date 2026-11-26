/**
 * Live driver positions live in Redis (GEO set + per-driver metadata hash), not Postgres:
 * they change every few seconds and only the latest value matters. Postgres receives a
 * throttled copy (DriverProfile.lastLat/lastLng) and the per-ride trail (RideLocation).
 *
 * Keys:
 *   masar:drivers:geo          GEO set of online drivers (member = driver user id)
 *   masar:driver:<id>          hash { category, busy, rideId, lastSeen, heading }
 *   masar:driver:<id>:offer    pending offer id (TTL = offer timeout) — one offer at a time
 */
import { redis, rk } from '../lib/redis';

const GEO = () => rk('drivers:geo');
const META = (id: string) => rk(`driver:${id}`);
const OFFER = (id: string) => rk(`driver:${id}:offer`);
const STALE_MS = 2 * 60_000;

export interface NearbyDriver {
  driverId: string;
  distanceM: number;
  lat: number;
  lng: number;
  category: string;
}

export const driverLocations = {
  async goOnline(driverId: string, category: string, lat?: number | null, lng?: number | null) {
    await redis.hset(META(driverId), { category, busy: '0', lastSeen: String(Date.now()) });
    if (lat != null && lng != null) await redis.geoadd(GEO(), lng, lat, driverId);
  },

  async goOffline(driverId: string) {
    await redis.zrem(GEO(), driverId);
    await redis.del(META(driverId), OFFER(driverId));
  },

  async update(driverId: string, lat: number, lng: number, heading?: number | null) {
    const pipe = redis.multi();
    pipe.geoadd(GEO(), lng, lat, driverId);
    pipe.hset(META(driverId), { lastSeen: String(Date.now()), heading: heading == null ? '' : String(heading) });
    await pipe.exec();
  },

  async setBusy(driverId: string, rideId: string | null) {
    if (!(await redis.exists(META(driverId)))) return;
    await redis.hset(META(driverId), { busy: rideId ? '1' : '0', rideId: rideId ?? '' });
  },

  async meta(driverId: string) {
    return redis.hgetall(META(driverId));
  },

  async isOnline(driverId: string) {
    return (await redis.exists(META(driverId))) === 1;
  },

  /** Online, idle, fresh drivers of a category near a point, nearest first. */
  async findNearby(lat: number, lng: number, radiusKm: number, category: string | null, limit = 20): Promise<NearbyDriver[]> {
    const raw = (await redis.geosearch(GEO(), 'FROMLONLAT', lng, lat, 'BYRADIUS', radiusKm, 'km', 'ASC', 'COUNT', limit * 2, 'WITHDIST', 'WITHCOORD')) as [
      string,
      string,
      [string, string],
    ][];
    if (!raw.length) return [];
    const pipe = redis.multi();
    raw.forEach(([id]) => {
      pipe.hgetall(META(id));
      pipe.exists(OFFER(id));
    });
    const res = (await pipe.exec()) ?? [];
    const out: NearbyDriver[] = [];
    raw.forEach(([id, dist, [lngS, latS]], i) => {
      const meta = res[i * 2]?.[1] as Record<string, string> | undefined;
      const hasOffer = (res[i * 2 + 1]?.[1] as number) === 1;
      if (!meta?.category) return;
      if (meta.busy === '1' || hasOffer) return;
      if (Date.now() - Number(meta.lastSeen ?? 0) > STALE_MS) return;
      if (category && meta.category !== category) return;
      out.push({ driverId: id, distanceM: Math.round(Number(dist) * 1000), lat: Number(latS), lng: Number(lngS), category: meta.category });
    });
    return out.slice(0, limit);
  },

  async reserveForOffer(driverId: string, offerId: string, ttlMs: number) {
    return (await redis.set(OFFER(driverId), offerId, 'PX', ttlMs, 'NX')) === 'OK';
  },

  async releaseOffer(driverId: string) {
    await redis.del(OFFER(driverId));
  },

  async allOnline(): Promise<{ driverId: string; lat: number; lng: number; busy: boolean; category: string }[]> {
    const members = await redis.zrange(GEO(), 0, -1);
    if (!members.length) return [];
    const pos = await redis.geopos(GEO(), ...members);
    const pipe = redis.multi();
    members.forEach((m) => pipe.hgetall(META(m)));
    const metas = (await pipe.exec()) ?? [];
    return members
      .map((id, i) => {
        const p = pos[i];
        const meta = (metas[i]?.[1] ?? {}) as Record<string, string>;
        if (!p || !meta.category) return null;
        return { driverId: id, lng: Number(p[0]), lat: Number(p[1]), busy: meta.busy === '1', category: meta.category };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  },
};
