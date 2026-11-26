import { useQuery } from '@tanstack/react-query';
import { BarChart3, CalendarDays, CalendarOff, ClipboardList, CreditCard, ExternalLink, Gem, Hourglass, LayoutGrid, MapPin, Package, Settings, Star, Users, UserSquare2 } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useParams } from 'react-router-dom';
import { ErrorState } from '@/components/common';
import { Badge, Skeleton } from '@/components/ui/misc';
import { TenantProvider, useTenantQuery } from '@/contexts/TenantContext';
import { hexToRgbTriplet } from '@/lib/utils';
import { api } from '@/services/api';
import { DashboardLayout, type NavSection } from './DashboardLayout';
import type { TenantInfo } from '@/types';

export function BusinessLayout() {
  const { businessId = '' } = useParams();
  const q = useTenantQuery(businessId);
  if (q.isLoading) {
    return (
      <div className="flex min-h-screen">
        <div className="hidden w-64 border-e p-4 lg:block"><Skeleton className="h-full" /></div>
        <div className="flex-1 space-y-4 p-8"><Skeleton className="h-10 w-64" /><Skeleton className="h-40" /><Skeleton className="h-80" /></div>
      </div>
    );
  }
  if (q.error) {
    const status = (q.error as { status?: number }).status;
    if (status === 403 || status === 404) return <Navigate to="/account" replace />;
    return <div className="p-8"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>;
  }
  return (
    <TenantProvider id={businessId} info={q.data!}>
      <BusinessShell info={q.data!} />
    </TenantProvider>
  );
}

function BusinessShell({ info }: { info: TenantInfo }) {
  const { t } = useTranslation('dashboard');
  const b = info.business;
  const base = `/dashboard/${b._id}`;
  const perms = new Set(info.permissions);
  const can = (...p: string[]) => p.some((x) => perms.has(x as never));
  const pending = useQuery({
    queryKey: ['bookings', b._id, 'pending-count'],
    queryFn: () => api.get<{ total: number }>(`/businesses/${b._id}/bookings`, { status: 'pending', from: new Date().toISOString(), limit: 1 }),
    enabled: can('bookings:read', 'bookings:own'),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const rgb = hexToRgbTriplet(b.branding?.primaryColor);
    if (rgb) document.documentElement.style.setProperty('--brand', rgb);
    return () => void document.documentElement.style.removeProperty('--brand');
  }, [b.branding?.primaryColor]);

  const sections: NavSection[] = [
    {
      title: t('nav.operations'),
      items: [
        { to: base, label: t('nav.overview'), icon: <BarChart3 />, end: true },
        { to: `${base}/calendar`, label: t('nav.calendar'), icon: <CalendarDays /> },
        { to: `${base}/bookings`, label: t('nav.bookings'), icon: <ClipboardList />, badge: pending.data?.total ? <Badge tone="warning" className="num">{pending.data.total}</Badge> : undefined },
        ...(can('bookings:read') ? [{ to: `${base}/waitlist`, label: t('nav.waitlist'), icon: <Hourglass /> }] : []),
      ],
    },
    ...(can('services:manage', 'staff:manage', 'branches:manage')
      ? [
          {
            title: t('nav.catalog'),
            items: [
              ...(can('services:manage') ? [{ to: `${base}/services`, label: t('nav.services'), icon: <LayoutGrid /> }] : []),
              ...(can('staff:manage') ? [{ to: `${base}/staff`, label: t('nav.staff'), icon: <UserSquare2 /> }] : []),
              ...(can('branches:manage') ? [{ to: `${base}/branches`, label: t('nav.branches'), icon: <MapPin /> }] : []),
              ...(can('resources:manage') ? [{ to: `${base}/resources`, label: t('nav.resources'), icon: <Package /> }] : []),
              ...(can('staff:manage') ? [{ to: `${base}/availability`, label: t('nav.availability'), icon: <CalendarOff /> }] : []),
            ],
          },
        ]
      : []),
    ...(can('customers:read', 'payments:read', 'reviews:manage')
      ? [
          {
            title: t('nav.people'),
            items: [
              ...(can('customers:read') ? [{ to: `${base}/customers`, label: t('nav.customers'), icon: <Users /> }] : []),
              ...(can('payments:read') ? [{ to: `${base}/payments`, label: t('nav.payments'), icon: <CreditCard /> }] : []),
              ...(can('reviews:manage') ? [{ to: `${base}/reviews`, label: t('nav.reviews'), icon: <Star /> }] : []),
            ],
          },
        ]
      : []),
    ...(can('settings:manage', 'business:update')
      ? [
          {
            title: t('nav.admin'),
            items: [
              { to: `${base}/settings`, label: t('nav.settings'), icon: <Settings /> },
              ...(can('subscription:manage') ? [{ to: `${base}/billing`, label: t('nav.billing'), icon: <Gem /> }] : []),
            ],
          },
        ]
      : []),
  ];

  return (
    <DashboardLayout
      sections={sections}
      header={
        <div className="rounded-2xl border bg-muted/40 p-3">
          <div className="flex items-center gap-3">
            {b.logo ? <img src={b.logo} alt="" className="h-9 w-9 rounded-lg object-cover" /> : <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand font-bold text-white">{b.name[0]}</div>}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{b.name}</p>
              <p className="truncate text-xs capitalize text-muted-foreground">{t(`settings.teamRoles.${info.memberRole}`, { defaultValue: info.memberRole.replace('_', ' ') })}</p>
            </div>
          </div>
          {b.status === 'active' ? (
            <a href={`/b/${b.slug}`} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
              <ExternalLink className="h-3.5 w-3.5" /> {t('nav.viewPage')}
            </a>
          ) : (
            <Badge tone={b.status === 'pending' ? 'warning' : 'danger'} className="mt-3">{t(`common:status.${b.status}`)}</Badge>
          )}
        </div>
      }
    />
  );
}
