import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api, refreshAccessToken, tokenStore, type SessionPayload } from '@/services/api';
import { connectSocket, disconnectSocket } from '@/services/socket';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: { name: string; email: string; password: string; phone?: string; accountType: 'customer' | 'business' }) => Promise<User>;
  logout: () => Promise<void>;
  setUser: (u: User) => void;
  refreshProfile: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();
  const { i18n, t } = useTranslation();

  const accept = useCallback(
    (s: SessionPayload) => {
      tokenStore.set(s.accessToken);
      setUser(s.user);
      connectSocket();
      if (s.user.locale && s.user.locale !== i18n.language) void i18n.changeLanguage(s.user.locale);
      return s.user;
    },
    [i18n],
  );

  useEffect(() => {
    // Restore session from the httpOnly refresh cookie.
    refreshAccessToken()
      .then((s) => s && accept(s))
      .finally(() => setReady(true));
    tokenStore.onExpired(() => {
      setUser(null);
      disconnectSocket();
      toast.message(t('auth.sessionExpired'));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      ready,
      login: async (email, password) => accept(await api.post<SessionPayload>('/auth/login', { email, password })),
      register: async (data) => accept(await api.post<SessionPayload>('/auth/register', { ...data, locale: i18n.language })),
      logout: async () => {
        await api.post('/auth/logout').catch(() => undefined);
        tokenStore.set(null);
        disconnectSocket();
        setUser(null);
        qc.clear();
      },
      setUser,
      refreshProfile: async () => {
        const r = await api.get<{ user: User }>('/auth/me');
        setUser(r.user);
      },
    }),
    [user, ready, accept, qc, i18n.language],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Where to send a user after login. */
export function homeFor(user: User) {
  if (user.role === 'super_admin') return '/admin';
  const m = user.memberships?.[0];
  if (m) return `/dashboard/${m.business}`;
  if (user.role === 'business_owner') return '/onboarding';
  return '/account';
}
