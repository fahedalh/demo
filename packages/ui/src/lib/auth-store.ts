/**
 * Auth state per app. The access token is kept in memory (+ sessionStorage so a reload
 * doesn't flash the login screen); the refresh token lives in an httpOnly cookie the
 * browser never exposes to JavaScript.
 */
import { create } from 'zustand';
import type { UserDTO } from '@masar/shared';

export type ClientApp = 'passenger' | 'driver' | 'admin';

interface AuthState {
  user: UserDTO | null;
  accessToken: string | null;
  ready: boolean;
  setSession: (user: UserDTO, accessToken: string) => void;
  setUser: (user: UserDTO) => void;
  clear: () => void;
  setReady: () => void;
}

const KEY = 'masar.session';

function load(): { user: UserDTO | null; accessToken: string | null } {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* storage unavailable */
  }
  return { user: null, accessToken: null };
}

function save(v: { user: UserDTO | null; accessToken: string | null }) {
  try {
    if (v.user) sessionStorage.setItem(KEY, JSON.stringify(v));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}

export const useAuth = create<AuthState>((set, get) => ({
  ...load(),
  ready: false,
  setSession: (user, accessToken) => {
    save({ user, accessToken });
    set({ user, accessToken });
  },
  setUser: (user) => {
    save({ user, accessToken: get().accessToken });
    set({ user });
  },
  clear: () => {
    save({ user: null, accessToken: null });
    set({ user: null, accessToken: null });
  },
  setReady: () => set({ ready: true }),
}));
