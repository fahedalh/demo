import type { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { env, corsOrigins } from '../config/env';
import { User } from '../modules/users/user.model';
import { logger } from '../config/logger';

let io: Server | null = null;

export function initSocket(server: HttpServer) {
  io = new Server(server, { cors: { origin: corsOrigins, credentials: true }, path: '/socket.io' });
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error('unauthorized'));
      const p = jwt.verify(token, env.JWT_ACCESS_SECRET) as { sub: string };
      socket.data.userId = p.sub;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });
  io.on('connection', async (socket) => {
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`);
    const user = await User.findById(userId, { memberships: 1 }).lean();
    user?.memberships?.forEach((m) => socket.join(`business:${m.business}`));
    logger.debug({ userId }, 'socket connected');
  });
  return io;
}

export function emitToUser(userId: unknown, event: string, payload: unknown) {
  io?.to(`user:${String(userId)}`).emit(event, payload);
}

export function emitToBusiness(businessId: unknown, event: string, payload: unknown) {
  io?.to(`business:${String(businessId)}`).emit(event, payload);
}
