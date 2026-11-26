import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AuthScreen, i18n, FullScreenLoader, Providers, useAuth, useBootstrapSession } from '@masar/ui';
import { Layout } from './Layout';

const OverviewPage = lazy(() => import('./pages/Overview').then((m) => ({ default: m.OverviewPage })));
const LivePage = lazy(() => import('./pages/LiveMap').then((m) => ({ default: m.LiveMapPage })));
const RidesPage = lazy(() => import('./pages/Rides').then((m) => ({ default: m.RidesPage })));
const RideDetailPage = lazy(() => import('./pages/Rides').then((m) => ({ default: m.RideDetailPage })));
const UsersPage = lazy(() => import('./pages/Users').then((m) => ({ default: m.UsersPage })));
const UserDetailPage = lazy(() => import('./pages/Users').then((m) => ({ default: m.UserDetailPage })));
const DriversPage = lazy(() => import('./pages/Drivers').then((m) => ({ default: m.DriversPage })));
const DriverDetailPage = lazy(() => import('./pages/Drivers').then((m) => ({ default: m.DriverDetailPage })));
const FinancePage = lazy(() => import('./pages/Finance').then((m) => ({ default: m.FinancePage })));
const PricingPage = lazy(() => import('./pages/Pricing').then((m) => ({ default: m.PricingPage })));
const MarketingPage = lazy(() => import('./pages/Marketing').then((m) => ({ default: m.MarketingPage })));
const SupportPage = lazy(() => import('./pages/Support').then((m) => ({ default: m.SupportPage })));
const SettingsPage = lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })));
const LogsPage = lazy(() => import('./pages/Logs').then((m) => ({ default: m.LogsPage })));

function Aside() {
  const { t } = useTranslation();
  return (
    <div className="relative flex h-full flex-col justify-end p-14 text-white">
      <div className="absolute inset-10 grid grid-cols-6 gap-3 opacity-80" aria-hidden>
        {Array.from({ length: 36 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl bg-white/[.04] ring-1 ring-white/5"
            style={{ height: 40 + ((i * 37) % 60) }}
          >
            {i % 7 === 2 && <div className="m-2 h-1.5 w-2/3 rounded-full bg-accent/70" />}
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-ink via-ink/90 to-transparent" />
      <div className="relative max-w-md">
        <h2 className="text-5xl font-bold leading-[1.05] text-white">{t('hero.title')}</h2>
        <p className="mt-4 text-lg text-white/70">{t('hero.subtitle')}</p>
      </div>
    </div>
  );
}

function Gate() {
  useTranslation(); // re-render demo labels when the language changes
  const ready = useBootstrapSession();
  const user = useAuth((s) => s.user);
  if (!ready && !user) return <FullScreenLoader />;
  if (!user) {
    return (
      <AuthScreen
        role="ADMIN"
        suffix="Console"
        allowRegister={false}
        demo={[
          { identifier: 'admin@masar.demo', password: 'Admin123!', label: i18n.t('demo.superAdmin') },
          { identifier: 'finance@masar.demo', password: 'Admin123!', label: i18n.t('demo.finance') },
          { identifier: 'support@masar.demo', password: 'Admin123!', label: i18n.t('demo.support') },
        ]}
        aside={<Aside />}
      />
    );
  }
  const s = (el: React.ReactNode) => <Suspense fallback={<FullScreenLoader />}>{el}</Suspense>;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={s(<OverviewPage />)} />
        <Route path="live" element={s(<LivePage />)} />
        <Route path="rides" element={s(<RidesPage />)} />
        <Route path="rides/:id" element={s(<RideDetailPage />)} />
        <Route path="users" element={s(<UsersPage />)} />
        <Route path="users/:id" element={s(<UserDetailPage />)} />
        <Route path="drivers" element={s(<DriversPage />)} />
        <Route path="drivers/:id" element={s(<DriverDetailPage />)} />
        <Route path="finance" element={s(<FinancePage />)} />
        <Route path="pricing" element={s(<PricingPage />)} />
        <Route path="marketing" element={s(<MarketingPage />)} />
        <Route path="support" element={s(<SupportPage />)} />
        <Route path="settings" element={s(<SettingsPage />)} />
        <Route path="logs" element={s(<LogsPage />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <Providers>
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
    </Providers>
  );
}
