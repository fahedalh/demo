import { io, type Socket } from 'socket.io-client';
import { tokenStore } from './api';

let socket: Socket | null = null;

export function connectSocket() {
  const token = tokenStore.get();
  if (!token) return null;
  if (socket?.connected) return socket;
  socket?.disconnect();
  socket = io(import.meta.env.VITE_API_URL || '/', { path: '/socket.io', auth: { token }, transports: ['websocket', 'polling'], reconnectionAttempts: 10 });
  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
