import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AuthScreen, FullScreenLoader, Providers, useAuth, useBootstrapSession } from '@masar/ui';
import { Shell } from './Shell';
import { AuthAside } from './pages/AuthAside';
import { HomePage } from './pages/Home';

// Secondary screens are code-split; the map-first home screen loads immediately.
const RidesPage = lazy(() => import('./pages/Rides').then((m) => ({ default: m.RidesPage })));
const RideDetailPage = lazy(() => import('./pages/RideDetail').then((m) => ({ default: m.RideDetailPage })));
const WalletPage = lazy(() => import('./pages/Wallet').then((m) => ({ default: m.WalletPage })));
const AccountPage = lazy(() => import('./pages/Account').then((m) => ({ default: m.AccountPage })));
const SupportPage = lazy(() => import('./pages/Support').then((m) => ({ default: m.SupportPage })));
const NotificationsPage = lazy(() =>
  import('./pages/Notifications').then((m) => ({ default: m.NotificationsPage })),
);

function Gate() {
  const ready = useBootstrapSession();
  const user = useAuth((s) => s.user);
  if (!ready && !user) return <FullScreenLoader />;
  if (!user) {
    return (
      <AuthScreen
        role="PASSENGER"
        demo={[
          {
            identifier: 'passenger@masar.demo',
            password: 'Passenger123!',
            label: 'Sara · passenger@masar.demo',
          },
        ]}
        aside={<AuthAside />}
      />
    );
  }
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<HomePage />} />
        <Route
          path="rides"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <RidesPage />
            </Suspense>
          }
        />
        <Route
          path="rides/:id"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <RideDetailPage />
            </Suspense>
          }
        />
        <Route
          path="wallet"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <WalletPage />
            </Suspense>
          }
        />
        <Route
          path="account"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <AccountPage />
            </Suspense>
          }
        />
        <Route
          path="support"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <SupportPage />
            </Suspense>
          }
        />
        <Route
          path="notifications"
          element={
            <Suspense fallback={<FullScreenLoader />}>
              <NotificationsPage />
            </Suspense>
          }
        />
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
