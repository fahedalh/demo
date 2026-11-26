/**
 * DEMO TOOL — simulated driver fleet (not used in production).
 *
 * Signs in as the seeded drivers (except the main demo driver, whom you control in the
 * Driver app), puts them online and drives them around Dubai over Socket.IO, so the passenger
 * map shows live cars and the admin live map has traffic.
 *
 *   pnpm simulate:drivers                 # wander; decline any ride offers
 *   pnpm simulate:drivers -- --accept     # also accept offers and drive to the pickup
 *
 * Simulated drivers cannot start a trip on their own: starting requires the passenger's PIN,
 * which only a real driver receives from the passenger. With --accept they stop at ARRIVED.
 */
import { io, type Socket } from 'socket.io-client';
import { pointAlong, type LatLng } from '@masar/shared';

const API = process.env.SIM_API_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`;
const ACCEPT = process.argv.includes('--accept');
const DRIVERS = [
  'ahmed.k@masar.demo',
  'priya.n@masar.demo',
  'yousef.m@masar.demo',
  'carlos.m@masar.demo',
  'fatima.z@masar.demo',
  'li.w@masar.demo',
  'rashid.s@masar.demo',
  'grace.o@masar.demo',
];
const HOTSPOTS: LatLng[] = [
  { lat: 25.1985, lng: 55.2796 },
  { lat: 25.2131, lng: 55.2826 },
  { lat: 25.0763, lng: 55.1403 },
  { lat: 25.1181, lng: 55.2006 },
  { lat: 25.2486, lng: 55.3527 },
  { lat: 25.2066, lng: 55.2627 },
  { lat: 25.2252, lng: 55.2867 },
  { lat: 25.2354, lng: 55.3003 },
];

async function http<T>(path: string, token: string | null, body?: unknown): Promise<T> {
  const res = await fetch(`${API}/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Client-App': 'driver',
      'X-Client-Type': 'native',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${(data as any)?.error?.message ?? res.status}`);
  return data as T;
}

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const jitter = (p: LatLng): LatLng => ({
  lat: p.lat + (Math.random() - 0.5) * 0.02,
  lng: p.lng + (Math.random() - 0.5) * 0.02,
});

class SimDriver {
  token = '';
  socket!: Socket;
  pos: LatLng = jitter(pick(HOTSPOTS));
  path: LatLng[] = [];
  progress = 0;
  speed = 12 + Math.random() * 8; // m/s
  rideId: string | null = null;

  constructor(private email: string) {}

  async start() {
    const auth = await http<{ accessToken: string; user: { firstName: string } }>('/auth/login', null, {
      identifier: this.email,
      password: 'Driver123!',
    });
    this.token = auth.accessToken;
    await http('/driver/status', this.token, { online: true, lat: this.pos.lat, lng: this.pos.lng });
    this.socket = io(API, { auth: { token: this.token }, transports: ['websocket'] });
    this.socket.on('ride:offer', (offer: any) => void this.onOffer(offer));
    this.socket.on('ride:updated', (ride: any) => {
      if (['CANCELLED', 'COMPLETED', 'PAYMENT_COMPLETED'].includes(ride.status) && ride.id === this.rideId) {
        this.rideId = null;
        void this.wander();
      }
    });
    console.log(`🚗 ${auth.user.firstName} online at ${this.pos.lat.toFixed(4)},${this.pos.lng.toFixed(4)}`);
    await this.wander();
    setInterval(() => this.tick(), 1000);
  }

  async route(to: LatLng) {
    const r = await http<{ geometry: [number, number][] }>(
      `/geo/route?fromLat=${this.pos.lat}&fromLng=${this.pos.lng}&toLat=${to.lat}&toLng=${to.lng}`,
      this.token,
    );
    this.path = r.geometry.map(([lat, lng]) => ({ lat, lng }));
    this.progress = 0;
  }

  async wander() {
    await this.route(jitter(pick(HOTSPOTS))).catch(() => undefined);
  }

  async onOffer(offer: any) {
    if (!ACCEPT || this.rideId) {
      await http(`/driver/offers/${offer.offerId}/reject`, this.token, {}).catch(() => undefined);
      return;
    }
    try {
      const { ride } = await http<{ ride: any }>(`/driver/offers/${offer.offerId}/accept`, this.token, {});
      this.rideId = ride.id;
      console.log(`✅ ${this.email} accepted ${ride.code}, driving to pickup`);
      await this.route(ride.pickup);
    } catch (e) {
      console.warn((e as Error).message);
    }
  }

  tick() {
    if (!this.path.length) return;
    this.progress += this.speed;
    const { point, heading, done } = pointAlong(this.path, this.progress);
    this.pos = point;
    this.socket.emit('driver:location', {
      lat: point.lat,
      lng: point.lng,
      heading: Math.round(heading),
      speed: this.speed,
    });
    if (done) {
      this.path = [];
      if (this.rideId) {
        void http(`/driver/rides/${this.rideId}/arrived`, this.token, {})
          .then(() => console.log(`📍 ${this.email} arrived at pickup (start needs the passenger PIN)`))
          .catch(() => undefined);
      } else setTimeout(() => void this.wander(), 2000 + Math.random() * 4000);
    }
  }

  async stop() {
    await http('/driver/status', this.token, { online: false }).catch(() => undefined);
    this.socket?.close();
  }
}

const fleet = DRIVERS.map((e) => new SimDriver(e));
console.log(`Starting ${fleet.length} simulated drivers against ${API}${ACCEPT ? ' (auto-accept on)' : ''}…`);
await Promise.all(fleet.map((d) => d.start().catch((e) => console.error(`✗ ${(e as Error).message}`))));

async function shutdown() {
  console.log('\nTaking simulated drivers offline…');
  await Promise.all(fleet.map((d) => d.stop()));
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
