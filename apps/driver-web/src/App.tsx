import { useTranslation } from 'react-i18next';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api, i18n, AuthScreen, FullScreenLoader, Providers, useAuth, useBootstrapSession } from '@masar/ui';
import { Shell } from './Shell';
import { DriveAside } from './components/DriveAside';
import { DrivePage } from './pages/Drive';
import { OnboardingPage } from './pages/Onboarding';
import type { DriverProfileResp } from './lib/api-types';

const EarningsPage = lazy(() => import('./pages/Earnings').then((m) => ({ default: m.EarningsPage })));
const TripsPage = lazy(() => import('./pages/Trips').then((m) => ({ default: m.TripsPage })));
const AccountPage = lazy(() => import('./pages/Account').then((m) => ({ default: m.AccountPage })));

export function useDriverProfile() {
  return useQuery({
    queryKey: ['driver', 'profile'],
    queryFn: () => api.get<DriverProfileResp>('/driver/profile'),
  });
}

function Approved() {
  const s = (el: React.ReactNode) => <Suspense fallback={<FullScreenLoader />}>{el}</Suspense>;
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<DrivePage />} />
        <Route path="earnings" element={s(<EarningsPage />)} />
        <Route path="trips" element={s(<TripsPage />)} />
        <Route path="account" element={s(<AccountPage />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function Gate() {
  useTranslation(); // re-render demo labels when the language changes
  const ready = useBootstrapSession();
  const user = useAuth((s) => s.user);
  const profile = useDriverProfile();
  if (!ready && !user) return <FullScreenLoader />;
  if (!user) {
    return (
      <AuthScreen
        role="DRIVER"
        suffix="Driver"
        demo={[
          { identifier: 'driver@masar.demo', password: 'Driver123!', label: i18n.t('demo.driver') },
          { identifier: 'newdriver@masar.demo', password: 'Driver123!', label: i18n.t('demo.pending') },
        ]}
        aside={<DriveAside />}
      />
    );
  }
  if (profile.isLoading) return <FullScreenLoader />;
  if (profile.data?.profile.verificationStatus !== 'APPROVED') return <OnboardingPage />;
  return <Approved />;
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
