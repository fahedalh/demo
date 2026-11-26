/**
 * Single Socket.IO connection per tab, authenticated with the current access token.
 * Reconnects automatically; on an auth error it refreshes the token and retries.
 */
import { io, type Socket } from 'socket.io-client';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import type { ClientToServerEvents, ServerToClientEvents } from '@masar/shared';
import { useAuth } from './auth-store';
import { apiBase, refreshSession } from './api';

export type MasarSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: MasarSocket | null = null;
let currentToken: string | null = null;

export const useSocketStatus = create<{
  connected: boolean;
  everConnected: boolean;
  set: (c: boolean) => void;
}>((set) => ({
  connected: false,
  everConnected: false,
  set: (connected) => set((s) => ({ connected, everConnected: s.everConnected || connected })),
}));

export function getSocket(): MasarSocket | null {
  return socket;
}

function connect(token: string) {
  if (socket && currentToken === token) return socket;
  socket?.disconnect();
  currentToken = token;
  socket = io(apiBase() || undefined, {
    auth: (cb) => cb({ token: useAuth.getState().accessToken ?? token }),
    transports: ['websocket', 'polling'],
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
  });
  socket.on('connect', () => useSocketStatus.getState().set(true));
  socket.on('disconnect', () => useSocketStatus.getState().set(false));
  socket.on('connect_error', async (err) => {
    useSocketStatus.getState().set(false);
    if (err.message === 'UNAUTHORIZED') {
      const fresh = await refreshSession();
      if (fresh) socket?.connect();
    }
  });
  socket.on('session:revoked', () => {
    useAuth.getState().clear();
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  currentToken = null;
  useSocketStatus.getState().set(false);
}

/** Connects while signed in; returns the socket (or null). */
export function useSocket(): MasarSocket | null {
  const token = useAuth((s) => s.accessToken);
  const [s, setS] = useState<MasarSocket | null>(socket);
  useEffect(() => {
    if (!token) {
      disconnectSocket();
      setS(null);
      return;
    }
    // Token refreshes don't need a reconnect: the auth callback reads the latest token.
    setS(socket && socket.connected ? socket : connect(token));
  }, [token]);
  return s;
}

/** Subscribes to a server event for the component's lifetime. */
export function useSocketEvent<E extends keyof ServerToClientEvents>(
  event: E,
  handler: ServerToClientEvents[E],
) {
  const s = useSocket();
  useEffect(() => {
    if (!s) return;
    s.on(event, handler as any);
    return () => {
      s.off(event, handler as any);
    };
  }, [s, event, handler]);
}
