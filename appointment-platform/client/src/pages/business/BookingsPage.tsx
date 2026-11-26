import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ClipboardList, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import type { Paginated } from '@bookly/shared';
import { EmptyState, PageHeader, Pagination, QueryView, StatusBadge } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Avatar, Card, Tabs, TabsList, TabsTrigger } from '@/components/ui/misc';
import { useTenant } from '@/contexts/TenantContext';
import { BookingSheet } from '@/features/business/BookingSheet';
import { useTenantList } from '@/features/business/hooks';
import { NewBookingDialog } from '@/features/business/NewBookingDialog';
import { useDebounce } from '@/hooks/useDebounce';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { api } from '@/services/api';
import type { Booking, Staff } from '@/types';
import { fmtDate, fmtTime, money } from '@/utils/format';

type Tab = 'upcoming' | 'pending' | 'past' | 'all';

export function BookingsPage() {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  const { id, business, can, terms } = useTenant();
  useDocumentTitle(t('bookings.title'));
  const [sp, setSp] = useSearchParams();
  const [tab, setTab] = useState<Tab>((sp.get('tab') as Tab) ?? 'upcoming');
  const [q, setQ] = useState(sp.get('ref') ?? '');
  const dq = useDebounce(q);
  const [staff, setStaff] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const staffList = useTenantList<Staff>('staff', {}, can('bookings:read'));
  useEffect(() => {
    setPage(1);
  }, [tab, dq, staff]);

  const now = new Date().toISOString();
  const params: Record<string, string | number | undefined> = { page, limit: 25, q: dq || undefined, staff: staff || undefined };
  if (tab === 'upcoming') Object.assign(params, { from: now, status: 'pending,confirmed', sort: 'start' });
  if (tab === 'pending') Object.assign(params, { status: 'pending', sort: 'start' });
  if (tab === 'past') Object.assign(params, { to: now, sort: '-start' });
  if (tab === 'all') Object.assign(params, { sort: '-createdAt' });
  const list = useQuery({ queryKey: ['bookings', id, 'list', params], queryFn: () => api.get<Paginated<Booking>>(`/businesses/${id}/bookings`, params), placeholderData: keepPreviousData });

  return (
    <>
      <PageHeader title={t('bookings.title')} actions={can('bookings:manage', 'bookings:own') && <Button onClick={() => setCreating(true)}><Plus />{t('bookings.new')}</Button>} />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={tab} onValueChange={(v) => { setTab(v as Tab); setSp({}, { replace: true }); }}>
          <TabsList>
            <TabsTrigger value="upcoming">{t('bookings.upcoming')}</TabsTrigger>
            <TabsTrigger value="pending">{t('bookings.pendingTab')}</TabsTrigger>
            <TabsTrigger value="past">{t('bookings.past')}</TabsTrigger>
            <TabsTrigger value="all">{t('bookings.all')}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('bookings.search')} className="ps-9 sm:w-72" aria-label={t('bookings.search')} />
          </div>
          {can('bookings:read') && (staffList.data?.items.length ?? 0) > 0 && (
            <NativeSelect value={staff} onChange={(e) => setStaff(e.target.value)} className="sm:w-48" aria-label={terms.staff}>
              <option value="">{t('calendar.allStaff')}</option>
              {staffList.data!.items.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </NativeSelect>
          )}
        </div>
      </div>
      <QueryView query={list}>
        {(d) => d.items.length ? (
          <>
            <Card className="overflow-hidden">
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-start text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-start font-semibold">{tc('common.date')}</th>
                      <th className="px-4 py-3 text-start font-semibold">{tc('common.customer')}</th>
                      <th className="px-4 py-3 text-start font-semibold">{tc('common.service')}</th>
                      <th className="px-4 py-3 text-start font-semibold">{terms.staff}</th>
                      <th className="px-4 py-3 text-start font-semibold">{tc('common.amount')}</th>
                      <th className="px-4 py-3 text-start font-semibold">{tc('common.status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {d.items.map((b) => (
                      <tr key={b._id} className="cursor-pointer hover:bg-muted/40" onClick={() => setOpen(b._id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(b._id)}>
                        <td className="px-4 py-3"><p className="font-medium">{fmtDate(b.start, business.timezone)}</p><p className="num text-xs text-muted-foreground">{fmtTime(b.start, business.timezone)} · {b.reference}</p></td>
                        <td className="px-4 py-3"><div className="flex items-center gap-2"><Avatar name={b.snapshot.customerName} className="h-8 w-8" /><div className="min-w-0"><p className="truncate font-medium">{b.snapshot.customerName}</p><p className="truncate text-xs text-muted-foreground">{b.snapshot.customerEmail}</p></div></div></td>
                        <td className="px-4 py-3">{b.snapshot.serviceName}</td>
                        <td className="px-4 py-3">{b.snapshot.staffName ?? b.resource?.name ?? '—'}</td>
                        <td className="num px-4 py-3">{money(b.price.amount, b.price.currency)}</td>
                        <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y md:hidden">
                {d.items.map((b) => (
                  <li key={b._id}>
                    <button className="flex w-full items-center gap-3 p-4 text-start" onClick={() => setOpen(b._id)}>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{b.snapshot.customerName}</p>
                        <p className="text-sm text-muted-foreground">{b.snapshot.serviceName}</p>
                        <p className="num text-xs text-muted-foreground">{fmtDate(b.start, business.timezone)} · {fmtTime(b.start, business.timezone)}</p>
                      </div>
                      <StatusBadge status={b.status} />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
            <Pagination page={d.page} pages={d.pages} onChange={setPage} />
          </>
        ) : <EmptyState icon={<ClipboardList />} title={t('bookings.empty')} />}
      </QueryView>
      <BookingSheet bookingId={open} onOpenChange={(o) => !o && setOpen(null)} />
      <NewBookingDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
