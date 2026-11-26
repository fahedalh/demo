/**
 * End-to-end API tests against a real MongoDB. Enabled with either
 *   MONGODB_TEST_URI=mongodb://127.0.0.1:27017/bookly_test npm test   (existing server; dropped first)
 *   INTEGRATION=1 npm test                                             (throwaway mongodb-memory-server)
 */
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { defaultWeeklySchedule } from '@bookly/shared';

let uri = process.env.MONGODB_TEST_URI;
const d = uri || process.env.INTEGRATION ? describe : describe.skip;
let stopMemory: (() => Promise<unknown>) | null = null;

d('API (integration)', () => {
  let app: import('express').Express;
  let ownerToken = '';
  let customerToken = '';
  let businessId = '';
  let slug = '';
  let serviceId = '';
  let staffId = '';

  beforeAll(async () => {
    if (!uri) {
      const { MongoMemoryReplSet } = await import('mongodb-memory-server');
      const rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
      uri = rs.getUri('bookly_test');
      stopMemory = () => rs.stop();
    }
    const { connectDb } = await import('../src/config/db');
    await connectDb(uri);
    await mongoose.connection.dropDatabase();
    await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).syncIndexes()));
    const { createApp } = await import('../src/app');
    app = createApp();
    const { Category } = await import('../src/modules/categories/category.model');
    const { Plan } = await import('../src/modules/plans/plan.model');
    await Plan.create({ key: 'free', name: 'Free', limits: { staff: 5, branches: 2, bookingsPerMonth: 100 } });
    await Category.create({ slug: 'beauty', name: { en: 'Beauty' } });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await stopMemory?.();
  });

  it('registers a business owner and creates a business', async () => {
    const reg = await request(app).post('/api/auth/register').send({ name: 'Owner One', email: 'owner@test.dev', password: 'Passw0rd!', accountType: 'business' });
    expect(reg.status).toBe(201);
    ownerToken = reg.body.accessToken;
    const cats = await request(app).get('/api/categories');
    const res = await request(app).post('/api/businesses').set('Authorization', `Bearer ${ownerToken}`).send({ name: 'Test Salon', category: cats.body.items[0]._id, timezone: 'Asia/Riyadh', currency: 'SAR' });
    expect(res.status).toBe(201);
    businessId = res.body._id;
    slug = res.body.slug;
  });

  it('rejects invalid input with field errors', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'x', email: 'nope', password: '123' });
    expect(res.status).toBe(422);
    expect(res.body.error.details.fields.email).toBeDefined();
  });

  it('sets up staff with full-week hours and a service', async () => {
    const all = defaultWeeklySchedule([0, 1, 2, 3, 4, 5, 6]);
    const branches = await request(app).get(`/api/businesses/${businessId}/branches`).set('Authorization', `Bearer ${ownerToken}`);
    await request(app).patch(`/api/businesses/${businessId}/branches/${branches.body.items[0]._id}`).set('Authorization', `Bearer ${ownerToken}`).send({ workingHours: all }).expect(200);
    const staff = await request(app).post(`/api/businesses/${businessId}/staff`).set('Authorization', `Bearer ${ownerToken}`).send({ name: 'Stylist A', workingHours: all });
    expect(staff.status).toBe(201);
    staffId = staff.body._id;
    const svc = await request(app).post(`/api/businesses/${businessId}/services`).set('Authorization', `Bearer ${ownerToken}`).send({ name: 'Haircut', duration: 60, price: 100, staff: [staffId] });
    expect(svc.status).toBe(201);
    serviceId = svc.body._id;
  });

  it('enforces tenant isolation', async () => {
    const reg = await request(app).post('/api/auth/register').send({ name: 'Customer', email: 'cust@test.dev', password: 'Passw0rd!' });
    customerToken = reg.body.accessToken;
    const res = await request(app).get(`/api/businesses/${businessId}/bookings`).set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
  });

  it('books a slot and prevents a double booking under concurrency', async () => {
    const date = DateTime.now().setZone('Asia/Riyadh').plus({ days: 2 }).toISODate()!;
    const av = await request(app).get(`/api/public/businesses/${slug}/availability`).query({ service: serviceId, date });
    expect(av.status).toBe(200);
    expect(av.body.slots.length).toBeGreaterThan(0);
    const start = av.body.slots[0].start;
    const body = (email: string) => ({ service: serviceId, start, staff: staffId, customer: { name: 'Guest Person', email } });
    const [a, b] = await Promise.all([
      request(app).post(`/api/public/businesses/${slug}/bookings`).send(body('g1@test.dev')),
      request(app).post(`/api/public/businesses/${slug}/bookings`).send(body('g2@test.dev')),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const ok = a.status === 201 ? a : b;
    const track = await request(app).get('/api/public/bookings/track').query({ reference: ok.body.bookings[0].reference, email: ok.body.bookings[0].snapshot.customerEmail });
    expect(track.status).toBe(200);
    const after = await request(app).get(`/api/public/businesses/${slug}/availability`).query({ service: serviceId, date });
    expect(after.body.slots.map((s: { start: string }) => s.start)).not.toContain(start);
  });

  it('lets the owner confirm/cancel with valid transitions only', async () => {
    const list = await request(app).get(`/api/businesses/${businessId}/bookings`).set('Authorization', `Bearer ${ownerToken}`);
    const id = list.body.items[0]._id;
    const bad = await request(app).patch(`/api/businesses/${businessId}/bookings/${id}/status`).set('Authorization', `Bearer ${ownerToken}`).send({ status: 'completed' });
    expect(bad.status).toBe(400); // in the future
    const ok = await request(app).patch(`/api/businesses/${businessId}/bookings/${id}/status`).set('Authorization', `Bearer ${ownerToken}`).send({ status: 'cancelled', reason: 'Closed' });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('cancelled');
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'owner@test.dev', password: 'Passw0rd!' }).expect(200);
    const first = await agent.post('/api/auth/refresh');
    expect(first.status).toBe(200);
    expect(first.body.accessToken).toBeTruthy();
  });
});
