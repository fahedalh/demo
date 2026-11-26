import { BarChart3, Building2, CreditCard, FileClock, Gem, KeyRound, Layers, Mail, Receipt, Settings, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DashboardLayout } from './DashboardLayout';

export function AdminLayout() {
  const { t } = useTranslation('dashboard');
  return (
    <DashboardLayout
      sections={[
        {
          title: t('nav.admin'),
          items: [
            { to: '/admin', label: t('admin.nav.overview'), icon: <BarChart3 />, end: true },
            { to: '/admin/businesses', label: t('admin.nav.businesses'), icon: <Building2 /> },
            { to: '/admin/users', label: t('admin.nav.users'), icon: <Users /> },
            { to: '/admin/categories', label: t('admin.nav.categories'), icon: <Layers /> },
          ],
        },
        {
          title: t('nav.money'),
          items: [
            { to: '/admin/plans', label: t('admin.nav.plans'), icon: <Gem /> },
            { to: '/admin/subscriptions', label: t('admin.nav.subscriptions'), icon: <Receipt /> },
            { to: '/admin/payments', label: t('admin.nav.payments'), icon: <CreditCard /> },
          ],
        },
        {
          items: [
            { to: '/admin/roles', label: t('admin.nav.roles'), icon: <KeyRound /> },
            { to: '/admin/messages', label: t('admin.nav.messages'), icon: <Mail /> },
            { to: '/admin/audit', label: t('admin.nav.audit'), icon: <FileClock /> },
            { to: '/admin/settings', label: t('admin.nav.settings'), icon: <Settings /> },
          ],
        },
      ]}
    />
  );
}
