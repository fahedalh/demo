import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Paginated } from '@bookly/shared';
import { EmptyState, ErrorState, Field, ListSkeleton, PageHeader, Pagination, QueryView, StatusBadge } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Avatar, Badge, Card } from '@/components/ui/misc';
import { useTenant } from '@/contexts/TenantContext';
import { useDebounce } from '@/hooks/useDebounce';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { api, errorMessage } from '@/services/api';
import type { Booking, Customer } from '@/types';
import { fmtDate, fmtTime, money } from '@/utils/format';

export function CustomersPage() {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  const { id, business } = useTenant();
  useDocumentTitle(t('customers.title'));
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => setPage(1), [dq, sort]);
  const list = useQuery({ queryKey: ['customers', id, dq, sort, page], queryFn: () => api.get<Paginated<Customer>>(`/businesses/${id}/customers`, { q: dq || undefined, sort, page }), placeholderData: keepPreviousData });

  return (
    <>
      <PageHeader title={t('customers.title')} description={t('customers.subtitle')} />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="ps-9" placeholder={t('customers.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('customers.search')} />
        </div>
        <NativeSelect className="sm:w-48" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          <option value="recent">{t('customers.sortRecent')}</option>
          <option value="name">{t('customers.sortName')}</option>
          <option value="value">{t('customers.sortValue')}</option>
        </NativeSelect>
      </div>
      <QueryView query={list}>
        {(d) => d.items.length ? (
          <>
            <Card className="divide-y">
              {d.items.map((c) => (
                <button key={c._id} onClick={() => setOpen(c._id)} className="flex w-full flex-wrap items-center gap-4 p-4 text-start hover:bg-muted/40">
                  <Avatar name={c.name} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{c.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{c.email}{c.phone ? ` · ${c.phone}` : ''}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">{c.tags?.map((tag) => <Badge key={tag} tone="primary">{tag}</Badge>)}</div>
                  <dl className="grid grid-cols-3 gap-4 text-center text-xs">
                    <div><dt className="text-muted-foreground">{t('customers.visits')}</dt><dd className="num font-semibold">{c.stats.completed}</dd></div>
                    <div><dt className="text-muted-foreground">{t('customers.noShows')}</dt><dd className="num font-semibold">{c.stats.noShows}</dd></div>
                    <div><dt className="text-muted-foreground">{t('customers.spent')}</dt><dd className="num font-semibold">{money(c.stats.totalSpent, business.currency)}</dd></div>
                  </dl>
                </button>
              ))}
            </Card>
            <Pagination page={d.page} pages={d.pages} onChange={setPage} />
          </>
        ) : <EmptyState icon={<Users />} title={t('customers.empty')} />}
      </QueryView>
      <CustomerDialog id={open} onClose={() => setOpen(null)} tz={business.timezone} currency={business.currency} />
      <span className="sr-only">{tc('common.customer')}</span>
    </>
  );
}

function CustomerDialog({ id: customerId, onClose, tz, currency }: { id: string | null; onClose: () => void; tz: string; currency: string }) {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  const { id, can } = useTenant();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['customers', id, 'detail', customerId], queryFn: () => api.get<{ customer: Customer; bookings: Booking[] }>(`/businesses/${id}/customers/${customerId}`), enabled: !!customerId });
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data) {
      setNotes(q.data.customer.notes ?? '');
      setTags((q.data.customer.tags ?? []).join(', '));
    }
  }, [q.data]);
  return (
    <Dialog open={!!customerId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent side="right" title={q.data?.customer.name ?? tc('common.loading')} description={q.data?.customer.email}>
        {q.isLoading ? <ListSkeleton rows={3} /> : q.error ? <ErrorState error={q.error} /> : q.data && (
          <div className="space-y-6">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([['visits', q.data.customer.stats.completed], ['noShows', q.data.customer.stats.noShows], ['spent', money(q.data.customer.stats.totalSpent, currency)], ['lastVisit', q.data.customer.stats.lastVisitAt ? fmtDate(q.data.customer.stats.lastVisitAt, tz) : '—']] as const).map(([k, v]) => (
                <div key={k} className="rounded-xl bg-muted/60 p-3"><dt className="text-xs text-muted-foreground">{t(`customers.${k}`)}</dt><dd className="num mt-1 text-sm font-semibold">{v}</dd></div>
              ))}
            </dl>
            {can('customers:manage') && (
              <form
                className="space-y-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  try {
                    await api.patch(`/businesses/${id}/customers/${customerId}`, { notes, tags: tags.split(',').map((x) => x.trim()).filter(Boolean) });
                    toast.success(t('customers.saved'));
                    void qc.invalidateQueries({ queryKey: ['customers', id] });
                  } catch (err) {
                    toast.error(errorMessage(err));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Field label={t('customers.tags')} hint={t('customers.tagsHint')} htmlFor="cu-tags"><Input id="cu-tags" value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
                <Field label={tc('common.notes')} htmlFor="cu-notes"><Textarea id="cu-notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
                <Button type="submit" size="sm" loading={busy}>{tc('actions.save')}</Button>
              </form>
            )}
            <div>
              <p className="mb-2 text-sm font-semibold">{t('customers.history')}</p>
              <ul className="divide-y rounded-2xl border">
                {q.data.bookings.map((b) => (
                  <li key={b._id} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <span className="min-w-0"><span className="block truncate font-medium">{b.snapshot.serviceName}</span><span className="num block text-xs text-muted-foreground">{fmtDate(b.start, tz)} {fmtTime(b.start, tz)}{b.snapshot.staffName ? ` · ${b.snapshot.staffName}` : ''}</span></span>
                    <StatusBadge status={b.status} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
