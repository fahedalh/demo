/** App-level providers and session bootstrap shared by every frontend. */
import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth-store';
import { ApiError, refreshSession } from '../lib/api';
import { useTheme } from '../lib/theme';
import { ConnectionBanner, ErrorBoundary } from './misc';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
    mutations: { retry: false },
  },
});

/** Restores the session from the refresh cookie on first load. */
export function useBootstrapSession() {
  const ready = useAuth((s) => s.ready);
  React.useEffect(() => {
    if (ready) return;
    void refreshSession().finally(() => useAuth.getState().setReady());
  }, [ready]);
  return ready;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();
  const theme = useTheme((s) => s.theme);
  const dark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ConnectionBanner />
        {children}
        <Toaster
          position={i18n.language === 'ar' ? 'top-left' : 'top-right'}
          dir={i18n.language === 'ar' ? 'rtl' : 'ltr'}
          theme={dark ? 'dark' : 'light'}
          richColors
          closeButton
          toastOptions={{ style: { borderRadius: 16, fontFamily: 'inherit' } }}
        />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export function FullScreenLoader() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative size-12">
          <span className="absolute inset-0 animate-ping rounded-full bg-accent/30" />
          <span className="absolute inset-2 rounded-full bg-accent" />
        </div>
      </div>
    </div>
  );
}

/** Registers the service worker in production builds (PWA). */
export function registerServiceWorker() {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    });
  }
}
