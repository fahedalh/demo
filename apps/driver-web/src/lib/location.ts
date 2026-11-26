/**
 * Driver location engine. Real devices use the Geolocation API (watchPosition).
 * For demos and testing there is a clearly-labelled GPS *simulation* that drives the car
 * along the current route, so the full trip lifecycle can be exercised from a desk.
 * Every position is streamed to the server over Socket.IO (`driver:location`).
 */
import { create } from 'zustand';
import { bearing, haversine, pointAlong, type LatLng } from '@masar/shared';
import { api, getSocket } from '@masar/ui';

interface LocState {
  pos: (LatLng & { heading: number }) | null;
  source: 'gps' | 'sim' | 'none';
  simEnabled: boolean;
  simSpeed: number; // m/s
  path: LatLng[] | null;
  progress: number; // meters along path
  gpsError: string | null;
  setSim: (on: boolean) => void;
  setSpeed: (mps: number) => void;
  setPos: (p: LatLng & { heading?: number }) => void;
  driveTo: (target: LatLng | null) => Promise<void>;
  followRoute: (route: [number, number][] | null) => void;
}

const SIM_KEY = 'masar.driver.sim';
const simDefault = (() => {
  try {
    const v = localStorage.getItem(SIM_KEY);
    return v == null ? import.meta.env.DEV : v === '1';
  } catch {
    return true;
  }
})();

let watchId: number | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function emit(p: LatLng & { heading: number }, speed?: number) {
  getSocket()?.emit('driver:location', { lat: p.lat, lng: p.lng, heading: Math.round(p.heading), speed });
}

export const useLocation = create<LocState>((set, get) => ({
  pos: null,
  source: 'none',
  simEnabled: simDefault,
  simSpeed: 28,
  path: null,
  progress: 0,
  gpsError: null,
  setSim: (on) => {
    try {
      localStorage.setItem(SIM_KEY, on ? '1' : '0');
    } catch {
      /* ignore */
    }
    set({ simEnabled: on });
    startEngine();
  },
  setSpeed: (simSpeed) => set({ simSpeed }),
  setPos: (p) => {
    const prev = get().pos;
    const heading = p.heading ?? (prev ? bearing(prev, p) : 0);
    const pos = { lat: p.lat, lng: p.lng, heading };
    set({ pos });
    emit(pos);
  },
  /** Simulation: route from the current position to a target via the API's routing provider. */
  driveTo: async (target) => {
    const from = get().pos;
    if (!target || !from) return set({ path: null, progress: 0 });
    if (haversine(from, target) < 30) return set({ path: null, progress: 0 });
    try {
      const r = await api.get<{ geometry: [number, number][] }>(
        `/geo/route?fromLat=${from.lat}&fromLng=${from.lng}&toLat=${target.lat}&toLng=${target.lng}`,
      );
      set({ path: r.geometry.map(([lat, lng]) => ({ lat, lng })), progress: 0 });
    } catch {
      set({ path: [from, target], progress: 0 });
    }
  },
  followRoute: (route) =>
    set({ path: route ? route.map(([lat, lng]) => ({ lat, lng })) : null, progress: 0 }),
}));

function tick() {
  const s = useLocation.getState();
  if (!s.simEnabled) return;
  if (s.path && s.path.length > 1) {
    const progress = s.progress + s.simSpeed;
    const { point, heading, done } = pointAlong(s.path, progress);
    const pos = { ...point, heading };
    useLocation.setState({ pos, progress, path: done ? null : s.path, source: 'sim' });
    emit(pos, s.simSpeed);
  } else if (s.pos) {
    emit(s.pos, 0); // heartbeat keeps the driver "fresh" for matching
  }
}

export function startEngine() {
  const s = useLocation.getState();
  if (timer) clearInterval(timer);
  timer = null;
  if (watchId != null) navigator.geolocation?.clearWatch(watchId);
  watchId = null;
  if (s.simEnabled) {
    useLocation.setState({ source: 'sim', gpsError: null });
    timer = setInterval(tick, 1000);
  } else if ('geolocation' in navigator) {
    watchId = navigator.geolocation.watchPosition(
      (p) => {
        useLocation.setState({ source: 'gps', gpsError: null });
        useLocation.getState().setPos({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          heading: p.coords.heading ?? undefined,
        });
      },
      (err) => useLocation.setState({ gpsError: err.message, source: 'none' }),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
    // Heartbeat while stationary.
    timer = setInterval(() => {
      const p = useLocation.getState().pos;
      if (p) emit(p, 0);
    }, 10_000);
  } else {
    useLocation.setState({ gpsError: 'Geolocation is not supported on this device', source: 'none' });
  }
}

export function stopEngine() {
  if (timer) clearInterval(timer);
  if (watchId != null) navigator.geolocation?.clearWatch(watchId);
  timer = null;
  watchId = null;
}
