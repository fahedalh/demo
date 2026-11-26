import { Bell, CalendarCheck, CreditCard, Heart, Home, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DashboardLayout } from './DashboardLayout';

export function AccountLayout() {
  const { t } = useTranslation();
  return (
    <DashboardLayout
      sections={[
        {
          items: [
            { to: '/account', label: t('account.overview'), icon: <Home />, end: true },
            { to: '/account/bookings', label: t('account.bookings'), icon: <CalendarCheck /> },
            { to: '/account/favorites', label: t('account.favorites'), icon: <Heart /> },
            { to: '/account/payments', label: t('account.payments'), icon: <CreditCard /> },
            { to: '/account/notifications', label: t('account.notifications'), icon: <Bell /> },
            { to: '/account/profile', label: t('account.profile'), icon: <Settings /> },
          ],
        },
      ]}
    />
  );
}
