/**
 * Socket.IO server: JWT-authenticated connections, room membership and inbound events.
 * Clients reconnect automatically (socket.io-client) and re-send the access token on each
 * handshake; on reconnect they re-subscribe to their ride room and refetch state over REST,
 * so nothing is lost while offline.
 */
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { locationUpdateSchema, DRIVER_ENGAGED_STATUSES } from '@masar/shared';
import type { ClientToServerEvents, ServerToClientEvents } from '@masar/shared';
import { env } from '../config/env';
import { authenticate, type AuthUser } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { logger } from '../lib/logger';
import { driverLocations } from '../services/driver-locations';
import { markDriverArriving } from '../services/ride.service';
import { setIO, type IO } from './io';

interface SocketData {
  user: AuthUser;
  lastLocAt?: number;
  lastDbWriteAt?: number;
}

export function createSocketServer(http: HttpServer): IO {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(http, {
    cors: { origin: env.corsOrigins, credentials: true },
    pingInterval: 20_000,
    pingTimeout: 20_000,
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60_000 },
  });

  if (env.SOCKET_REDIS_ADAPTER) {
    io.adapter(createAdapter(redis.duplicate(), redis.duplicate()));
    logger.info('socket.io redis adapter enabled');
  }

  io.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth?.token as string | undefined) ?? '';
      if (!token) return next(new Error('UNAUTHORIZED'));
      socket.data.user = await authenticate(token);
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', async (socket) => {
    const user = socket.data.user;
    socket.join(`user:${user.id}`);
    if (user.role === 'ADMIN') socket.join('admins');

    // Rejoin the room of any live ride so tracking resumes immediately after a reconnect.
    const live = await prisma.ride.findFirst({
      where: { OR: [{ passengerId: user.id }, { driverId: user.id }], status: { in: [...DRIVER_ENGAGED_STATUSES, 'SEARCHING'] } },
      select: { id: true },
    });
    if (live) socket.join(`ride:${live.id}`);
    if (user.role === 'DRIVER') {
      const dp = await prisma.driverProfile.findUnique({ where: { userId: user.id }, select: { isOnline: true } });
      if (dp?.isOnline) socket.join('drivers:online');
      socket.emit('driver:status', { isOnline: !!dp?.isOnline });
    }

    socket.on('ride:subscribe', async ({ rideId }, ack) => {
      const ride = await prisma.ride.findUnique({ where: { id: String(rideId) }, select: { passengerId: true, driverId: true } });
      const allowed = ride && (ride.passengerId === user.id || ride.driverId === user.id || user.role === 'ADMIN');
      if (!allowed) return ack?.({ ok: false, error: 'FORBIDDEN' });
      socket.join(`ride:${rideId}`);
      ack?.({ ok: true });
    });

    socket.on('ride:unsubscribe', ({ rideId }) => {
      socket.leave(`ride:${rideId}`);
    });

    socket.on('ride:typing', ({ rideId }) => {
      if (socket.rooms.has(`ride:${rideId}`)) socket.to(`ride:${rideId}`).emit('ride:typing', { rideId, userId: user.id });
    });

    socket.on('driver:location', async (payload, ack) => {
      if (user.role !== 'DRIVER') return ack?.({ ok: false, error: 'FORBIDDEN' });
      const parsed = locationUpdateSchema.safeParse(payload);
      if (!parsed.success) return ack?.({ ok: false, error: 'INVALID_LOCATION' });
      // Throttle to 2 updates/second per socket to protect Redis/DB from misbehaving clients.
      const now = Date.now();
      if (socket.data.lastLocAt && now - socket.data.lastLocAt < 500) return ack?.({ ok: true });
      socket.data.lastLocAt = now;
      try {
        await handleDriverLocation(io, socket.data, user.id, parsed.data);
        ack?.({ ok: true });
      } catch (err) {
        logger.error({ err }, 'driver location failed');
        ack?.({ ok: false, error: 'FAILED' });
      }
    });

    socket.on('passenger:location', async ({ rideId, lat, lng }) => {
      if (!socket.rooms.has(`ride:${rideId}`) || typeof lat !== 'number' || typeof lng !== 'number') return;
      socket.to(`ride:${rideId}`).emit('ride:driver_location', { driverId: user.id, rideId, lat, lng, at: new Date().toISOString() });
    });
  });

  setIO(io as unknown as IO);
  return io as unknown as IO;
}

async function handleDriverLocation(
  io: Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>,
  data: SocketData,
  driverId: string,
  loc: { lat: number; lng: number; heading?: number; speed?: number },
) {
  const online = await driverLocations.isOnline(driverId);
  if (online) await driverLocations.update(driverId, loc.lat, loc.lng, loc.heading);

  // Persist a throttled copy for the admin map / matching fallback.
  const now = Date.now();
  if (!data.lastDbWriteAt || now - data.lastDbWriteAt > 5_000) {
    data.lastDbWriteAt = now;
    await prisma.driverProfile.update({
      where: { userId: driverId },
      data: { lastLat: loc.lat, lastLng: loc.lng, lastHeading: loc.heading ?? null, lastLocationAt: new Date() },
    });
  }

  const ride = await prisma.ride.findFirst({
    where: { driverId, status: { in: DRIVER_ENGAGED_STATUSES } },
    select: { id: true, status: true },
  });
  const at = new Date().toISOString();
  if (ride) {
    await prisma.rideLocation.create({ data: { rideId: ride.id, lat: loc.lat, lng: loc.lng, heading: loc.heading, speed: loc.speed } });
    io.to(`ride:${ride.id}`).emit('ride:driver_location', { driverId, rideId: ride.id, ...loc, at });
    if (ride.status === 'ACCEPTED') await markDriverArriving(ride.id, driverId).catch(() => undefined);
  }
  if (online) io.to('admins').emit('admin:driver_location', { driverId, ...loc, at, isOnline: true, busy: !!ride });
}
