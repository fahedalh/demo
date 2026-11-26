/**
 * End-to-end ride workflow over real HTTP + Socket.IO against Postgres and Redis:
 * passenger books → nearest driver gets a live offer → accepts → live location → arrives →
 * PIN-verified start → complete → card charged → rating + tip → admin sees trip & finances.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Socket } from 'socket.io-client';
import { prisma } from '../src/lib/prisma';
import {
  allDriversOffline,
  api,
  connectSocket,
  DUBAI_MALL,
  login,
  MARINA,
  sleep,
  startServer,
  teardownAll,
  waitFor,
  type TestServer,
} from './helpers';

let srv: TestServer;
let pTok: string, dTok: string, aTok: string;
let pSock: Socket, dSock: Socket, aSock: Socket;

beforeAll(async () => {
  srv = await startServer();
  await allDriversOffline();
  pTok = await login(srv.url, 'passenger', 'passenger@masar.demo', 'Passenger123!');
  dTok = await login(srv.url, 'driver', 'driver@masar.demo', 'Driver123!');
  aTok = await login(srv.url, 'admin', 'admin@masar.demo', 'Admin123!');
  [pSock, dSock, aSock] = await Promise.all([
    connectSocket(srv.url, pTok),
    connectSocket(srv.url, dTok),
    connectSocket(srv.url, aTok),
  ]);
});

afterAll(async () => {
  pSock?.close();
  dSock?.close();
  aSock?.close();
  await api(srv.url, dTok).post('/api/driver/status', { online: false });
  await srv.close();
  await teardownAll();
});

describe('complete ride workflow', () => {
  let rideId = '';
  let offerId = '';
  let pin = '';

  it('driver goes online near the pickup', async () => {
    const res = await api(srv.url, dTok).post('/api/driver/status', {
      online: true,
      lat: 25.2003,
      lng: 55.2742,
    });
    expect(res.status).toBe(200);
    expect(res.body.isOnline).toBe(true);
  });

  it('passenger gets fare estimates for every category', async () => {
    const res = await api(srv.url, pTok).post('/api/rides/estimate', {
      pickup: DUBAI_MALL,
      dropoff: MARINA,
      couponCode: 'MASAR10',
    });
    expect(res.status).toBe(200);
    expect(res.body.route.distanceMeters).toBeGreaterThan(15_000);
    expect(res.body.options.length).toBe(6);
    const eco = res.body.options.find((o: any) => o.category.code === 'ECONOMY');
    expect(eco.nearbyDrivers).toBe(1);
    expect(eco.etaSeconds).toBeGreaterThan(0);
    expect(eco.discount).toBeGreaterThan(0);
    expect(res.body.coupon.valid).toBe(true);
  });

  it('passenger books; nearest driver receives a real-time offer', async () => {
    const offerP = waitFor<any>(dSock, 'ride:offer');
    const methods = await api(srv.url, pTok).get('/api/payments/methods');
    const card = methods.body.items.find((m: any) => m.last4 === '4242');
    const res = await api(srv.url, pTok)
      .post('/api/rides', {
        pickup: DUBAI_MALL,
        dropoff: MARINA,
        categoryCode: 'ECONOMY',
        paymentType: 'CARD',
        paymentMethodId: card.id,
        pickupNotes: 'Fountain side entrance',
      })
      .set('Idempotency-Key', 'flow-1');
    expect(res.status).toBe(201);
    expect(res.body.ride.status).toBe('SEARCHING');
    expect(res.body.ride.startPin).toMatch(/^\d{4}$/);
    rideId = res.body.ride.id;
    pin = res.body.ride.startPin;

    const offer = await offerP;
    expect(offer.ride.id).toBe(rideId);
    expect(offer.ride.startPin).toBeNull(); // the driver never sees the PIN
    expect(offer.estimatedEarning).toBeGreaterThan(0);
    offerId = offer.offerId;
  });

  it('rejects duplicate bookings (same idempotency key and second active ride)', async () => {
    const again = await api(srv.url, pTok)
      .post('/api/rides', {
        pickup: DUBAI_MALL,
        dropoff: MARINA,
        categoryCode: 'ECONOMY',
        paymentType: 'CASH',
      })
      .set('Idempotency-Key', 'flow-1');
    expect(again.status).toBe(200);
    expect(again.body.ride.id).toBe(rideId);
    const second = await api(srv.url, pTok).post('/api/rides', {
      pickup: DUBAI_MALL,
      dropoff: MARINA,
      categoryCode: 'ECONOMY',
      paymentType: 'CASH',
    });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ACTIVE_RIDE_EXISTS');
  });

  it('driver accepts; passenger is notified with driver details', async () => {
    const updateP = waitFor<any>(pSock, 'ride:updated', (r) => r.status === 'ACCEPTED');
    const res = await api(srv.url, dTok).post(`/api/driver/offers/${offerId}/accept`);
    expect(res.status).toBe(200);
    const ride = await updateP;
    expect(ride.driver.firstName).toBe('Omar');
    expect(ride.driver.vehicle.plateNumber).toBe('DXB A 41872');
    expect(ride.driver.phone).toBeTruthy();
    // Accepting twice is impossible.
    const twice = await api(srv.url, dTok).post(`/api/driver/offers/${offerId}/accept`);
    expect(twice.status).toBe(409);
  });

  it('driver location streams to the passenger and moves the ride to DRIVER_ARRIVING', async () => {
    const locP = waitFor<any>(pSock, 'ride:driver_location');
    const statusP = waitFor<any>(pSock, 'ride:updated', (r) => r.status === 'DRIVER_ARRIVING');
    const adminP = waitFor<any>(aSock, 'admin:driver_location');
    const ack = await dSock.emitWithAck('driver:location', {
      lat: 25.1995,
      lng: 55.277,
      heading: 120,
      speed: 8,
    });
    expect(ack.ok).toBe(true);
    const loc = await locP;
    expect(loc.lat).toBeCloseTo(25.1995);
    await statusP;
    await adminP;
  });

  it('in-app chat works both ways', async () => {
    const msgP = waitFor<any>(dSock, 'ride:message');
    const res = await api(srv.url, pTok).post(`/api/rides/${rideId}/messages`, {
      body: 'I am by the fountain',
    });
    expect(res.status).toBe(201);
    expect((await msgP).body).toBe('I am by the fountain');
    const list = await api(srv.url, dTok).get(`/api/rides/${rideId}/messages`);
    expect(list.body.items).toHaveLength(1);
  });

  it('enforces the state machine and the trip PIN', async () => {
    const early = await api(srv.url, dTok).post(`/api/driver/rides/${rideId}/complete`);
    expect(early.status).toBe(409);
    const arrivedP = waitFor<any>(pSock, 'ride:updated', (r) => r.status === 'ARRIVED');
    expect((await api(srv.url, dTok).post(`/api/driver/rides/${rideId}/arrived`)).status).toBe(200);
    await arrivedP;
    const wrongPin = pin === '0000' ? '1111' : '0000';
    const bad = await api(srv.url, dTok).post(`/api/driver/rides/${rideId}/start`, { pin: wrongPin });
    expect(bad.status).toBe(400);
    const started = await api(srv.url, dTok).post(`/api/driver/rides/${rideId}/start`, { pin });
    expect(started.status).toBe(200);
    expect(started.body.ride.status).toBe('IN_PROGRESS');
    // Passengers cannot cancel once the trip has started.
    expect((await api(srv.url, pTok).post(`/api/rides/${rideId}/cancel`, {})).status).toBe(409);
  });

  it('completes the trip and charges the card', async () => {
    await sleep(600); // stay clear of the 2-updates/second location throttle
    for (const [lat, lng] of [
      [25.1985, 55.2796],
      [25.17, 55.24],
      [25.13, 55.2],
      [25.09, 55.16],
      [25.0763, 55.1403],
    ]) {
      await dSock.emitWithAck('driver:location', { lat, lng });
      await sleep(550);
    }
    const doneP = waitFor<any>(pSock, 'ride:updated', (r) => r.status === 'PAYMENT_COMPLETED');
    const res = await api(srv.url, dTok).post(`/api/driver/rides/${rideId}/complete`);
    expect(res.status).toBe(200);
    const ride = await doneP;
    expect(ride.finalFare).toBeGreaterThan(0);
    // Following the quoted route keeps the upfront price.
    expect(ride.finalFare).toBe(ride.estimatedFare);
    expect(ride.paymentStatus).toBe('SUCCEEDED');
    expect(res.body.ride.driverEarning.net).toBeGreaterThan(0);
    expect(res.body.ride.driverEarning.commission).toBe(Math.round(res.body.ride.driverEarning.gross * 0.2));
  });

  it('passenger rates with a tip; driver rating and earnings update', async () => {
    const before = await api(srv.url, dTok).get('/api/driver/wallet');
    const res = await api(srv.url, pTok).post(`/api/rides/${rideId}/rate`, {
      score: 5,
      comment: 'Excellent',
      tags: ['Clean car'],
      tip: 1000,
    });
    expect(res.status).toBe(200);
    expect(res.body.ride.myRating.score).toBe(5);
    expect(res.body.ride.tip).toBe(1000);
    const after = await api(srv.url, dTok).get('/api/driver/wallet');
    expect(after.body.balance - before.body.balance).toBe(1000);
    expect((await api(srv.url, pTok).post(`/api/rides/${rideId}/rate`, { score: 4 })).status).toBe(409);
    const receipt = await api(srv.url, pTok).get(`/api/rides/${rideId}/receipt`);
    expect(receipt.body.payments.map((p: any) => p.purpose).sort()).toEqual(['RIDE', 'TIP']);
  });

  it('admin sees the trip, its timeline and the financial records', async () => {
    const detail = await api(srv.url, aTok).get(`/api/admin/rides/${rideId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.history.map((h: any) => h.toStatus)).toEqual([
      'REQUESTED',
      'SEARCHING',
      'ACCEPTED',
      'DRIVER_ARRIVING',
      'ARRIVED',
      'IN_PROGRESS',
      'COMPLETED',
      'PAYMENT_COMPLETED',
    ]);
    expect(detail.body.trail.length).toBeGreaterThan(3);
    expect(detail.body.payments.some((p: any) => p.status === 'SUCCEEDED' && p.purpose === 'RIDE')).toBe(
      true,
    );
    const fin = await api(srv.url, aTok).get('/api/admin/finance/summary?days=1');
    expect(fin.body.trips).toBeGreaterThanOrEqual(1);
    expect(fin.body.commission).toBeGreaterThan(0);
    const overview = await api(srv.url, aTok).get('/api/admin/stats/overview');
    expect(overview.body.completedRides).toBeGreaterThan(100);
  });
});

describe('dispatch edge cases', () => {
  it('a rejected offer moves to the next nearest driver', async () => {
    const t2 = await login(srv.url, 'driver', 'ahmed.k@masar.demo', 'Driver123!');
    const s2 = await connectSocket(srv.url, t2);
    // Omar is closer than Ahmed.
    await api(srv.url, dTok).post('/api/driver/status', { online: true, lat: 25.199, lng: 55.279 });
    await api(srv.url, t2).post('/api/driver/status', { online: true, lat: 25.2101, lng: 55.2817 });
    const p2 = await login(srv.url, 'passenger', 'james.c@masar.demo', 'Passenger123!');
    const first = waitFor<any>(dSock, 'ride:offer');
    const res = await api(srv.url, p2).post('/api/rides', {
      pickup: DUBAI_MALL,
      dropoff: MARINA,
      categoryCode: 'ECONOMY',
      paymentType: 'CASH',
    });
    expect(res.status).toBe(201);
    const o1 = await first;
    const second = waitFor<any>(s2, 'ride:offer');
    await api(srv.url, dTok).post(`/api/driver/offers/${o1.offerId}/reject`);
    const o2 = await second;
    expect(o2.ride.id).toBe(res.body.ride.id);

    // Let Ahmed's offer time out (offer timeout is scaled down in tests) → ride expires.
    const ended = await prisma.ride.findUniqueOrThrow({ where: { id: res.body.ride.id } });
    expect(['SEARCHING', 'EXPIRED']).toContain(ended.status);
    await sleep(5000);
    const final = await prisma.ride.findUniqueOrThrow({ where: { id: res.body.ride.id } });
    expect(final.status).toBe('EXPIRED');
    const offers = await prisma.rideOffer.findMany({
      where: { rideId: final.id },
      orderBy: { offeredAt: 'asc' },
    });
    expect(offers.map((o) => o.status)).toEqual(['REJECTED', 'EXPIRED']);
    s2.close();
    await api(srv.url, t2).post('/api/driver/status', { online: false });
  });

  it('reports NO_DRIVER_AVAILABLE when nobody is around', async () => {
    await api(srv.url, dTok).post('/api/driver/status', { online: false });
    const p3 = await login(srv.url, 'passenger', 'layla.n@masar.demo', 'Passenger123!');
    const res = await api(srv.url, p3).post('/api/rides', {
      pickup: DUBAI_MALL,
      dropoff: MARINA,
      categoryCode: 'PREMIUM',
      paymentType: 'CASH',
    });
    expect(res.status).toBe(201);
    await sleep(5500);
    const ride = await prisma.ride.findUniqueOrThrow({ where: { id: res.body.ride.id } });
    expect(ride.status).toBe('NO_DRIVER_AVAILABLE');
  });

  it('passenger can cancel while searching; cash trip records commission owed by driver', async () => {
    await api(srv.url, dTok).post('/api/driver/status', { online: true, lat: 25.2003, lng: 55.2742 });
    const p4 = await login(srv.url, 'passenger', 'mohammed.f@masar.demo', 'Passenger123!');
    const offerP = waitFor<any>(dSock, 'ride:offer');
    const r1 = await api(srv.url, p4).post('/api/rides', {
      pickup: DUBAI_MALL,
      dropoff: MARINA,
      categoryCode: 'ECONOMY',
      paymentType: 'CASH',
    });
    const offer = await offerP;
    const withdrawn = waitFor<any>(dSock, 'ride:offer:cancelled');
    const c = await api(srv.url, p4).post(`/api/rides/${r1.body.ride.id}/cancel`, {
      reason: 'Changed plans',
    });
    expect(c.body.ride.status).toBe('CANCELLED');
    expect(c.body.ride.cancellationFee).toBe(0);
    expect((await withdrawn).offerId).toBe(offer.offerId);

    // Cash trip end to end
    const offer2P = waitFor<any>(dSock, 'ride:offer');
    const r2 = await api(srv.url, p4).post('/api/rides', {
      pickup: DUBAI_MALL,
      dropoff: MARINA,
      categoryCode: 'ECONOMY',
      paymentType: 'CASH',
    });
    const o2 = await offer2P;
    await api(srv.url, dTok).post(`/api/driver/offers/${o2.offerId}/accept`);
    const pin = (await api(srv.url, p4).get(`/api/rides/${r2.body.ride.id}`)).body.ride.startPin;
    await api(srv.url, dTok).post(`/api/driver/rides/${r2.body.ride.id}/arrived`);
    await api(srv.url, dTok).post(`/api/driver/rides/${r2.body.ride.id}/start`, { pin });
    const before = (await api(srv.url, dTok).get('/api/driver/wallet')).body.balance;
    const done = await api(srv.url, dTok).post(`/api/driver/rides/${r2.body.ride.id}/complete`);
    expect(done.body.ride.status).toBe('PAYMENT_COMPLETED');
    const after = (await api(srv.url, dTok).get('/api/driver/wallet')).body.balance;
    expect(before - after).toBe(done.body.ride.driverEarning.commission);
  });

  it('a declined card leaves the ride in PAYMENT_PENDING until the passenger pays another way', async () => {
    const p5 = await login(srv.url, 'passenger', 'anna.k@masar.demo', 'Passenger123!');
    const card = await api(srv.url, p5).post('/api/payments/methods', {
      cardNumber: '4000000000000002',
      expMonth: 12,
      expYear: new Date().getFullYear() + 2,
    });
    expect(card.status).toBe(201);
    const offerP = waitFor<any>(dSock, 'ride:offer');
    const r = await api(srv.url, p5).post('/api/rides', {
      pickup: DUBAI_MALL,
      dropoff: MARINA,
      categoryCode: 'ECONOMY',
      paymentType: 'CARD',
      paymentMethodId: card.body.id,
    });
    const o = await offerP;
    await api(srv.url, dTok).post(`/api/driver/offers/${o.offerId}/accept`);
    const pin = (await api(srv.url, p5).get(`/api/rides/${r.body.ride.id}`)).body.ride.startPin;
    await api(srv.url, dTok).post(`/api/driver/rides/${r.body.ride.id}/arrived`);
    await api(srv.url, dTok).post(`/api/driver/rides/${r.body.ride.id}/start`, { pin });
    const done = await api(srv.url, dTok).post(`/api/driver/rides/${r.body.ride.id}/complete`);
    expect(done.body.ride.status).toBe('PAYMENT_PENDING');

    const good = await api(srv.url, p5).post('/api/payments/methods', {
      cardNumber: '4242424242424242',
      expMonth: 12,
      expYear: new Date().getFullYear() + 2,
    });
    const pay = await api(srv.url, p5).post(`/api/rides/${r.body.ride.id}/pay`, {
      paymentType: 'CARD',
      paymentMethodId: good.body.id,
    });
    expect(pay.body.status).toBe('SUCCEEDED');
    expect(pay.body.ride.status).toBe('PAYMENT_COMPLETED');
  });
});
