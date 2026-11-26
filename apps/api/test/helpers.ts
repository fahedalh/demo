import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as ioClient, type Socket } from 'socket.io-client';
import request from 'supertest';
import { createApp } from '../src/app';
import { createSocketServer } from '../src/realtime/socket';
import { prisma } from '../src/lib/prisma';
import { redis } from '../src/lib/redis';
import { dispatch } from '../src/services/dispatch.service';

export interface TestServer {
  url: string;
  http: Server;
  close: () => Promise<void>;
}

export async function startServer(): Promise<TestServer> {
  const app = createApp();
  const http = createServer(app);
  const io = createSocketServer(http);
  await new Promise<void>((r) => http.listen(0, r));
  const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  return {
    url,
    http,
    close: async () => {
      dispatch.clearAllTimers();
      io.close();
      await new Promise((r) => http.close(() => r(null)));
    },
  };
}

export async function teardownAll() {
  await prisma.$disconnect();
  redis.disconnect();
}

export const APP = { passenger: 'passenger', driver: 'driver', admin: 'admin' } as const;

export async function login(url: string, app: keyof typeof APP, identifier: string, password: string) {
  const res = await request(url)
    .post('/api/auth/login')
    .set('X-Client-App', app)
    .send({ identifier, password });
  if (res.status !== 200) throw new Error(`login failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.accessToken as string;
}

export function api(url: string, token?: string) {
  const agent = request(url);
  const wrap = (r: request.Test) => (token ? r.set('Authorization', `Bearer ${token}`) : r);
  return {
    get: (p: string) => wrap(agent.get(p)),
    post: (p: string, body?: object) => wrap(agent.post(p)).send(body ?? {}),
    put: (p: string, body?: object) => wrap(agent.put(p)).send(body ?? {}),
    patch: (p: string, body?: object) => wrap(agent.patch(p)).send(body ?? {}),
    del: (p: string) => wrap(agent.delete(p)),
  };
}

export function connectSocket(url: string, token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = ioClient(url, { auth: { token }, transports: ['websocket'], reconnection: false });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

/** Resolves with the first event payload that matches `pred`. */
export function waitFor<T = any>(
  socket: Socket,
  event: string,
  pred: (p: T) => boolean = () => true,
  timeoutMs = 8000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timeout waiting for ${event}`));
    }, timeoutMs);
    const handler = (p: T) => {
      if (pred(p)) {
        clearTimeout(t);
        socket.off(event, handler);
        resolve(p);
      }
    };
    socket.on(event, handler);
  });
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Puts every seeded driver offline (DB + Redis) so each test controls who is available. */
export async function allDriversOffline() {
  await prisma.driverProfile.updateMany({ data: { isOnline: false } });
  const keys = await redis.keys('test:masar:driver*');
  if (keys.length) await redis.del(...keys);
}

export const DUBAI_MALL = { address: 'Dubai Mall', lat: 25.1985, lng: 55.2796 };
export const MARINA = { address: 'Dubai Marina Mall', lat: 25.0763, lng: 55.1403 };
export const CITY_WALK = { address: 'City Walk', lat: 25.2066, lng: 55.2627 };
