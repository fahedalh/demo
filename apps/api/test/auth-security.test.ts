import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { io as ioClient } from 'socket.io-client';
import { api, login, startServer, teardownAll, type TestServer } from './helpers';
import { lastOtpForTests } from '../src/services/otp';
import { signSandboxPayload } from '../src/services/payments/sandbox';
import { prisma } from '../src/lib/prisma';

let srv: TestServer;
beforeAll(async () => {
  srv = await startServer();
});
afterAll(async () => {
  await srv.close();
  await teardownAll();
});

const cookieOf = (res: request.Response) =>
  (res.headers['set-cookie'] as unknown as string[])
    .find((c) => c.startsWith('masar_rt_passenger'))!
    .split(';')[0];

describe('authentication', () => {
  const email = `new.rider.${Date.now()}@example.com`;

  it('registers a passenger and verifies the phone with an OTP', async () => {
    const phone = `+9715${String(Date.now()).slice(-8)}`;
    const res = await request(srv.url)
      .post('/api/auth/register')
      .set('X-Client-App', 'passenger')
      .send({ firstName: 'Nia', lastName: 'Test', email, phone, password: 'Secret123', role: 'PASSENGER' });
    expect(res.status).toBe(201);
    expect(res.body.user.phoneVerified).toBe(false);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeUndefined(); // browsers get an httpOnly cookie
    const code = lastOtpForTests.get(`VERIFY_PHONE:${phone}`)!;
    const v = await api(srv.url, res.body.accessToken).post('/api/auth/otp/verify', {
      target: phone,
      purpose: 'VERIFY_PHONE',
      code,
    });
    expect(v.status).toBe(200);
    expect(v.body.user.phoneVerified).toBe(true);
  });

  it('rejects weak passwords and duplicate accounts', async () => {
    const weak = await request(srv.url)
      .post('/api/auth/register')
      .set('X-Client-App', 'passenger')
      .send({ firstName: 'A', lastName: 'B', email: 'x@y.com', password: 'short', role: 'PASSENGER' });
    expect(weak.status).toBe(400);
    const dup = await request(srv.url)
      .post('/api/auth/register')
      .set('X-Client-App', 'passenger')
      .send({ firstName: 'A', lastName: 'B', email, password: 'Secret123', role: 'PASSENGER' });
    expect(dup.status).toBe(409);
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const res = await request(srv.url)
      .post('/api/auth/login')
      .set('X-Client-App', 'passenger')
      .send({ identifier: email, password: 'Secret123' });
    const c1 = cookieOf(res);
    const r1 = await request(srv.url)
      .post('/api/auth/refresh')
      .set('X-Client-App', 'passenger')
      .set('Cookie', c1);
    expect(r1.status).toBe(200);
    const c2 = cookieOf(r1);
    expect(c2).not.toBe(c1);
    // Re-using the old token = theft signal → whole family revoked.
    expect(
      (await request(srv.url).post('/api/auth/refresh').set('X-Client-App', 'passenger').set('Cookie', c1))
        .status,
    ).toBe(401);
    expect(
      (await request(srv.url).post('/api/auth/refresh').set('X-Client-App', 'passenger').set('Cookie', c2))
        .status,
    ).toBe(401);
  });

  it('keeps each app to its own role', async () => {
    const res = await request(srv.url)
      .post('/api/auth/login')
      .set('X-Client-App', 'driver')
      .send({ identifier: 'passenger@masar.demo', password: 'Passenger123!' });
    expect(res.status).toBe(403);
    const bad = await request(srv.url)
      .post('/api/auth/login')
      .set('X-Client-App', 'passenger')
      .send({ identifier: 'passenger@masar.demo', password: 'wrong' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.message).toMatch(/Incorrect/);
  });

  it('resets a forgotten password with a code and invalidates old sessions', async () => {
    const token = await login(srv.url, 'passenger', email, 'Secret123');
    await request(srv.url).post('/api/auth/password/forgot').send({ identifier: email });
    const code = lastOtpForTests.get(`RESET_PASSWORD:${email}`)!;
    const r = await request(srv.url)
      .post('/api/auth/password/reset')
      .send({ identifier: email, code, password: 'NewSecret123' });
    expect(r.status).toBe(200);
    expect((await api(srv.url, token).get('/api/auth/me')).status).toBe(401);
    expect(await login(srv.url, 'passenger', email, 'NewSecret123')).toBeTruthy();
  });
});

describe('authorization', () => {
  it('requires authentication', async () => {
    expect((await request(srv.url).get('/api/rides')).status).toBe(401);
    expect((await request(srv.url).get('/api/admin/stats/overview')).status).toBe(401);
  });

  it('blocks passengers from admin and driver APIs', async () => {
    const t = await login(srv.url, 'passenger', 'passenger@masar.demo', 'Passenger123!');
    expect((await api(srv.url, t).get('/api/admin/stats/overview')).status).toBe(403);
    expect((await api(srv.url, t).get('/api/driver/dashboard')).status).toBe(403);
  });

  it('applies admin RBAC (support admin cannot see finance)', async () => {
    const t = await login(srv.url, 'admin', 'support@masar.demo', 'Admin123!');
    expect((await api(srv.url, t).get('/api/admin/tickets')).status).toBe(200);
    expect((await api(srv.url, t).get('/api/admin/finance/summary')).status).toBe(403);
    expect((await api(srv.url, t).get('/api/admin/settings')).status).toBe(403);
  });

  it('suspending a user kills their sessions immediately', async () => {
    const admin = await login(srv.url, 'admin', 'admin@masar.demo', 'Admin123!');
    const pt = await login(srv.url, 'passenger', 'tom.b@masar.demo', 'Passenger123!');
    const tom = await prisma.user.findUniqueOrThrow({ where: { email: 'tom.b@masar.demo' } });
    expect(
      (
        await api(srv.url, admin).patch(`/api/admin/users/${tom.id}/status`, {
          status: 'SUSPENDED',
          reason: 'test',
        })
      ).status,
    ).toBe(200);
    expect((await api(srv.url, pt).get('/api/me')).status).toBe(401);
    const logs = await api(srv.url, admin).get('/api/admin/logs?q=user.suspended');
    expect(logs.body.items.length).toBeGreaterThan(0);
    await api(srv.url, admin).patch(`/api/admin/users/${tom.id}/status`, { status: 'ACTIVE' });
  });

  it('rejects unauthenticated socket connections', async () => {
    const err = await new Promise<Error>((resolve) => {
      const s = ioClient(srv.url, {
        auth: { token: 'nope' },
        transports: ['websocket'],
        reconnection: false,
      });
      s.on('connect_error', (e) => {
        s.close();
        resolve(e);
      });
    });
    expect(err.message).toBe('UNAUTHORIZED');
  });

  it('rejects uploads whose content does not match their type', async () => {
    const t = await login(srv.url, 'driver', 'newdriver@masar.demo', 'Driver123!');
    const res = await request(srv.url)
      .post('/api/driver/documents')
      .set('Authorization', `Bearer ${t}`)
      .field('type', 'INSURANCE')
      .attach('file', Buffer.from('MZ fake executable pretending to be a png'), {
        filename: 'x.png',
        contentType: 'image/png',
      });
    expect(res.status).toBe(400);
  });

  it('streams private documents only to their owner or admins', async () => {
    const doc = await prisma.driverDocument.findFirstOrThrow({
      where: { driver: { user: { email: 'driver@masar.demo' } }, type: 'DRIVING_LICENSE' },
    });
    const owner = await login(srv.url, 'driver', 'driver@masar.demo', 'Driver123!');
    const other = await login(srv.url, 'driver', 'ahmed.k@masar.demo', 'Driver123!');
    const admin = await login(srv.url, 'admin', 'admin@masar.demo', 'Admin123!');
    expect((await api(srv.url, owner).get(`/api/files/documents/${doc.id}`)).status).toBe(200);
    expect((await api(srv.url, admin).get(`/api/files/documents/${doc.id}`)).status).toBe(200);
    expect((await api(srv.url, other).get(`/api/files/documents/${doc.id}`)).status).toBe(403);
  });
});

describe('payments', () => {
  it('validates sandbox cards and tops up the wallet', async () => {
    const t = await login(srv.url, 'passenger', 'daniel.s@masar.demo', 'Passenger123!');
    expect(
      (
        await api(srv.url, t).post('/api/payments/methods', {
          cardNumber: '4242424242424241',
          expMonth: 1,
          expYear: new Date().getFullYear() + 1,
        })
      ).status,
    ).toBe(400);
    const card = await api(srv.url, t).post('/api/payments/methods', {
      cardNumber: '5555555555554444',
      expMonth: 1,
      expYear: new Date().getFullYear() + 1,
    });
    expect(card.body.brand).toBe('mastercard');
    expect(card.body.isDefault).toBe(true);
    const before = (await api(srv.url, t).get('/api/payments/wallet')).body.balance;
    const top = await api(srv.url, t).post('/api/payments/wallet/topup', {
      amount: 5000,
      paymentMethodId: card.body.id,
    });
    expect(top.status).toBe(200);
    expect(top.body.balance).toBe(before + 5000);
  });

  it('verifies webhook signatures and processes events once', async () => {
    const body = JSON.stringify({
      id: `evt_${Date.now()}`,
      type: 'payment.succeeded',
      providerRef: 'sbx_pi_unknown',
    });
    const bad = await request(srv.url)
      .post('/api/webhooks/payments')
      .set('Content-Type', 'application/json')
      .set('x-sandbox-signature', 't=1,v1=deadbeef')
      .send(body);
    expect(bad.status).toBe(400);
    const sig = signSandboxPayload(body);
    const ok = await request(srv.url)
      .post('/api/webhooks/payments')
      .set('Content-Type', 'application/json')
      .set('x-sandbox-signature', sig)
      .send(body);
    expect(ok.status).toBe(200);
    const dup = await request(srv.url)
      .post('/api/webhooks/payments')
      .set('Content-Type', 'application/json')
      .set('x-sandbox-signature', sig)
      .send(body);
    expect(dup.body.duplicate).toBe(true);
  });

  it('admin can refund a payment (wallet credit for cash/wallet)', async () => {
    const admin = await login(srv.url, 'admin', 'finance@masar.demo', 'Admin123!');
    const payment = await prisma.payment.findFirstOrThrow({
      where: { provider: 'CASH', status: 'SUCCEEDED' },
    });
    const wBefore = await prisma.wallet.findUniqueOrThrow({ where: { userId: payment.userId } });
    const res = await api(srv.url, admin).post(`/api/admin/payments/${payment.id}/refund`, {
      amount: 500,
      reason: 'Route issue',
    });
    expect(res.status).toBe(201);
    const wAfter = await prisma.wallet.findUniqueOrThrow({ where: { userId: payment.userId } });
    expect(wAfter.balance - wBefore.balance).toBe(500);
    const over = await api(srv.url, admin).post(`/api/admin/payments/${payment.id}/refund`, {
      amount: payment.amount,
      reason: 'Too much',
    });
    expect(over.status).toBe(422);
  });
});
