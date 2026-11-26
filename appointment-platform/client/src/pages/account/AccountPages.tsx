import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CalendarCheck, CalendarClock, CreditCard, Heart, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { EmptyState, PageHeader, Pagination, QueryView, StatCard, StatusBadge } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, Tabs, TabsList, TabsTrigger } from '@/components/ui/misc';
import { useAuth } from '@/contexts/AuthContext';
import { BusinessCard } from '@/features/search/BusinessCard';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { cn } from '@/lib/utils';
import { api } from '@/services/api';
import type { Booking, Business, Notification, Payment } from '@/types';
import type { Paginated } from '@bookly/shared';
import { fmtDate, fmtDateTime, fmtTime, fromNow, money } from '@/utils/format';

export function BookingRow({ b }: { b: Booking }) {
  const d = new Date(b.start);
  return (
    <Link to={`/account/bookings/${b._id}`} className="flex items-center gap-4 rounded-2xl border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-soft">
      <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl text-white" style={{ background: b.business?.branding?.primaryColor ?? 'hsl(var(--primary))' }}>
        <span className="text-[10px] font-semibold uppercase">{d.toLocaleString(undefined, { month: 'short', timeZone: b.timezone })}</span>
        <span className="num text-xl font-bold leading-none">{d.toLocaleString('en', { day: 'numeric', timeZone: b.timezone })}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{b.snapshot.serviceName}</p>
        <p className="truncate text-sm text-muted-foreground">{b.business?.name}{b.snapshot.staffName ? ` · ${b.snapshot.staffName}` : ''}</p>
        <p className="num text-xs text-muted-foreground">{fmtTime(b.start, b.timezone)} · {b.reference}</p>
      </div>
      <StatusBadge status={b.status} />
    </Link>
  );
}

export function AccountOverview() {
  const { t } = useTranslation();
  const { user } = useAuth();
  useDocumentTitle(t('account.title'));
  const q = useQuery({ queryKey: ['me', 'overview'], queryFn: () => api.get<{ upcoming: Booking[]; stats: Record<string, number>; favoritesCount: number; spent: Array<{ _id: string; sum: number }> }>('/me/overview') });
  return (
    <>
      <PageHeader title={t('account.hello', { name: user?.name.split(' ')[0] })} actions={<Button asChild><Link to="/explore">{t('actions.bookNow')}</Link></Button>} />
      <QueryView query={q}>
        {(d) => (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label={t('account.statsUpcoming')} value={(d.stats.pending ?? 0) + (d.stats.confirmed ?? 0)} icon={<CalendarClock />} />
              <StatCard label={t('account.statsCompleted')} value={d.stats.completed ?? 0} icon={<CalendarCheck />} tone="accent" />
              <StatCard label={t('account.statsFavorites')} value={d.favoritesCount} icon={<Heart />} tone="rose" />
              <StatCard label={t('account.statsSpent')} value={d.spent.length ? d.spent.map((s) => money(s.sum, s._id)).join(' · ') : '—'} icon={<Wallet />} tone="amber" />
            </div>
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">{t('account.upcoming')}</h2><Button variant="ghost" size="sm" asChild><Link to="/account/bookings">{t('actions.viewAll')}</Link></Button></div>
              {d.upcoming.length ? <div className="space-y-3">{d.upcoming.map((b) => <BookingRow key={b._id} b={b} />)}</div> : <EmptyState icon={<CalendarCheck />} title={t('account.noUpcoming')} description={t('account.noUpcomingHint')} action={<Button asChild><Link to="/explore">{t('nav.explore')}</Link></Button>} />}
            </Card>
            {user && (user.memberships.length > 0 || user.role === 'business_owner') && (
              <Card className="p-5">
                <h2 className="mb-3 font-semibold">{t('account.myBusinesses')}</h2>
                <div className="flex flex-wrap gap-2">
                  {user.memberships.map((m) => <Button key={m.business} variant="outline" asChild><Link to={`/dashboard/${m.business}`}>{m.businessInfo?.name}</Link></Button>)}
                  {user.role !== 'staff' && <Button variant="secondary" asChild><Link to="/onboarding">{t('account.createBusiness')}</Link></Button>}
                </div>
              </Card>
            )}
          </div>
        )}
      </QueryView>
    </>
  );
}

export function MyBookingsPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('account.bookings'));
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['me', 'bookings', scope, page], queryFn: () => api.get<Paginated<Booking>>('/me/bookings', { scope, page }), placeholderData: keepPreviousData });
  return (
    <>
      <PageHeader title={t('account.bookings')} />
      <Tabs value={scope} onValueChange={(v) => { setScope(v as typeof scope); setPage(1); }}>
        <TabsList><TabsTrigger value="upcoming">{t('account.upcoming')}</TabsTrigger><TabsTrigger value="past">{t('account.past')}</TabsTrigger></TabsList>
      </Tabs>
      <div className="mt-4">
        <QueryView query={q}>
          {(d) => d.items.length ? (
            <>
              <div className="space-y-3">{d.items.map((b) => <BookingRow key={b._id} b={b} />)}</div>
              <Pagination page={d.page} pages={d.pages} onChange={setPage} />
            </>
          ) : <EmptyState icon={<CalendarCheck />} title={scope === 'upcoming' ? t('account.noUpcoming') : t('account.noPast')} description={t('account.noUpcomingHint')} action={<Button asChild><Link to="/explore">{t('nav.explore')}</Link></Button>} />}
        </QueryView>
      </div>
    </>
  );
}

export function FavoritesPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('account.favorites'));
  const q = useQuery({ queryKey: ['favorites'], queryFn: () => api.get<{ items: Business[] }>('/me/favorites') });
  return (
    <>
      <PageHeader title={t('account.favorites')} />
      <QueryView query={q}>
        {(d) => d.items.length ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{d.items.map((b) => <BusinessCard key={b._id} b={b} />)}</div> : <EmptyState icon={<Heart />} title={t('account.noFavorites')} description={t('account.noFavoritesHint')} />}
      </QueryView>
    </>
  );
}

export function MyPaymentsPage() {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  useDocumentTitle(tc('account.payments'));
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['me', 'payments', page], queryFn: () => api.get<Paginated<Payment>>('/me/payments', { page }), placeholderData: keepPreviousData });
  return (
    <>
      <PageHeader title={tc('account.payments')} />
      <QueryView query={q}>
        {(d) => d.items.length ? (
          <Card className="divide-y">
            {d.items.map((p) => (
              <div key={p._id} className="flex flex-wrap items-center gap-3 p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted"><CreditCard className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{p.business?.name} · {p.booking?.snapshot?.serviceName}</p>
                  <p className="text-xs text-muted-foreground">{fmtDateTime(p.paidAt ?? p.createdAt)} · {t(`payments.kinds.${p.kind}`)} · {t(`payments.methods.${p.method}`)}{p.invoiceNumber ? ` · ${p.invoiceNumber}` : ''}</p>
                </div>
                <p className={cn('num font-semibold', p.kind === 'refund' && 'text-emerald-600')}>{p.kind === 'refund' ? '−' : ''}{money(p.amount, p.currency)}</p>
                <StatusBadge status={p.status} />
              </div>
            ))}
          </Card>
        ) : <EmptyState icon={<CreditCard />} title={tc('account.noPayments')} />}
      </QueryView>
      {q.data && <Pagination page={q.data.page} pages={q.data.pages} onChange={setPage} />}
    </>
  );
}

export function NotificationsPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('account.notifications'));
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['notifications', 'page', page], queryFn: () => api.get<Paginated<Notification> & { unread: number }>('/notifications', { page }) });
  return (
    <>
      <PageHeader
        title={t('account.notifications')}
        actions={q.data?.unread ? <Button variant="outline" onClick={async () => { await api.post('/notifications/read-all'); void qc.invalidateQueries({ queryKey: ['notifications'] }); }}>{t('actions.markAllRead')}</Button> : null}
      />
      <QueryView query={q}>
        {(d) => d.items.length ? (
          <Card className="divide-y">
            {d.items.map((n) => (
              <button
                key={n._id}
                className="flex w-full items-start gap-3 p-4 text-start hover:bg-muted/50"
                onClick={async () => {
                  if (!n.readAt) await api.post(`/notifications/${n._id}/read`);
                  void qc.invalidateQueries({ queryKey: ['notifications'] });
                  if (n.link) navigate(n.link);
                }}
              >
                <span className={cn('mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', n.readAt ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary')}><Bell className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block', !n.readAt && 'font-semibold')}>{n.title}</span>
                  {n.body && <span className="block text-sm text-muted-foreground">{n.body}</span>}
                  <span className="block text-xs text-muted-foreground">{fromNow(n.createdAt)} · {fmtDate(n.createdAt)}</span>
                </span>
              </button>
            ))}
          </Card>
        ) : <EmptyState icon={<Bell />} title={t('account.noNotifications')} />}
      </QueryView>
      {q.data && <Pagination page={q.data.page} pages={q.data.pages} onChange={setPage} />}
    </>
  );
}
