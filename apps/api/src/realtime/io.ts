/**
 * Holder for the Socket.IO server plus typed emit helpers. Services import these helpers
 * instead of the server instance, which keeps business logic testable and transport-agnostic.
 */
import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@masar/shared';

export type IO = Server<ClientToServerEvents, ServerToClientEvents>;
let io: IO | null = null;

export const setIO = (server: IO) => {
  io = server;
};
export const getIO = () => io;

type Ev = keyof ServerToClientEvents;
type Args<E extends Ev> = Parameters<ServerToClientEvents[E]>;

export function emitToUser<E extends Ev>(userId: string, event: E, ...args: Args<E>) {
  (io?.to(`user:${userId}`).emit as any)?.(event, ...args);
}
export function emitToRide<E extends Ev>(rideId: string, event: E, ...args: Args<E>) {
  (io?.to(`ride:${rideId}`).emit as any)?.(event, ...args);
}
export function emitToAdmins<E extends Ev>(event: E, ...args: Args<E>) {
  (io?.to('admins').emit as any)?.(event, ...args);
}
/** Adds/removes every socket of a user to/from a ride room (server-side, so clients can't miss events). */
export function joinRideRoom(userId: string, rideId: string) {
  io?.in(`user:${userId}`).socketsJoin(`ride:${rideId}`);
}
export function leaveRideRoom(userId: string, rideId: string) {
  io?.in(`user:${userId}`).socketsLeave(`ride:${rideId}`);
}

export function disconnectUser(userId: string) {
  io?.to(`user:${userId}`).emit('session:revoked');
  io?.in(`user:${userId}`).disconnectSockets(true);
}
