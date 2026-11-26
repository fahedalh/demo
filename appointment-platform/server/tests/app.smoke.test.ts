/** HTTP pipeline checks that need no database: routing, validation, auth guards, security headers. */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { createApp } from '../src/app';

mongoose.set('bufferCommands', false); // fail fast instead of hanging if a route touches the DB
const app = createApp();

describe('app smoke (no DB)', () => {
  it('serves health with security headers', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('serves the OpenAPI spec', async () => {
    const res = await request(app).get('/api/docs.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(Object.keys(res.body.paths).length).toBeGreaterThan(80);
  });

  it('returns structured 404s', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('validates input before touching the database', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'A', email: 'bad', password: 'short' });
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.error.details.fields)).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });

  it('rejects malformed JSON', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_JSON');
  });

  it('strips NoSQL operators from input', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: { $gt: '' }, password: 'x' });
    expect(res.status).toBe(422); // email object removed → validation error, never reaches Mongo
  });

  it('guards private and tenant routes', async () => {
    expect((await request(app).get('/api/me/bookings')).status).toBe(401);
    expect((await request(app).get('/api/businesses/507f1f77bcf86cd799439011/bookings')).status).toBe(401);
    expect((await request(app).get('/api/admin/users').set('Authorization', 'Bearer not-a-token')).status).toBe(401);
  });

  it('validates booking tracking references', async () => {
    const res = await request(app).get('/api/public/bookings/track').query({ reference: 'nope', email: 'a@b.co' });
    expect(res.status).toBe(422);
  });
});
