import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CheckCircle2, MoreHorizontal, Search, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PLATFORM_ROLES, type Paginated } from '@bookly/shared';
import { EmptyState, PageHeader, Pagination, QueryView, StatusBadge } from '@/components/common';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown';
import { Input, NativeSelect } from '@/components/ui/input';
import { Avatar, Badge, Card } from '@/components/ui/misc';
import { useAuth } from '@/contexts/AuthContext';
import { useDebounce } from '@/hooks/useDebounce';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useLocalized } from '@/hooks/useLocalized';
import { api, errorMessage } from '@/services/api';
import type { Business, Category, Payment, Plan, User } from '@/types';
import { fmtDate, fmtDateTime, money } from '@/utils/format';

function useList<T>(key: string, path: string, params: Record<string, string | number | undefined>) {
  return useQuery({ queryKey: ['admin', key, params], queryFn: () => api.get<Paginated<T>>(path, params), placeholderData: keepPreviousData });
}

function Toolbar({ q, setQ, children }: { q: string; setQ: (v: string) => void; children?: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="ps-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('common.search')} aria-label={t('actions.search')} /></div>
      {children}
    </div>
  );
}

function Table({ head, children }: { head: React.ReactNode[]; children: React.ReactNode }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><tr>{head.map((h, i) => <th key={i} className="px-4 py-3 text-start font-semibold">{h}</th>)}</tr></thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
    </Card>
  );
}

export function AdminBusinesses() {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  const loc = useLocalized();
  useDocumentTitle(t('admin.nav.businesses'));
  const qc = useQueryClient();
  const [sp] = useSearchParams();
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [status, setStatus] = useState(sp.get('status') ?? '');
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [dq, status]);
  const list = useList<Business & { owner: { name: string; email: string }; plan: string }>('businesses', '/admin/businesses', { q: dq || undefined, status: status || undefined, page });
  const patch = async (id: string, body: Record<string, unknown>) => {
    try {
      await api.patch(`/admin/businesses/${id}`, body);
      void qc.invalidateQueries({ queryKey: ['admin', 'businesses'] });
      toast.success(tc('actions.save'));
    } catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <>
      <PageHeader title={t('admin.nav.businesses')} />
      <Toolbar q={q} setQ={setQ}>
        <NativeSelect className="sm:w-44" value={status} onChange={(e) => setStatus(e.target.value)} aria-label={tc('common.status')}><option value="">{tc('common.all')}</option>{['pending', 'active', 'suspended'].map((s) => <option key={s} value={s}>{tc(`status.${s}`)}</option>)}</NativeSelect>
      </Toolbar>
      <QueryView query={list}>
        {(d) => d.items.length ? (
          <>
            <Table head={[tc('common.name'), t('admin.owner'), t('settings.category'), t('admin.plan'), tc('common.status'), '']}>
              {d.items.map((b) => (
                <tr key={b._id}>
                  <td className="px-4 py-3"><a href={`/b/${b.slug}`} target="_blank" rel="noreferrer" className="font-medium hover:underline">{b.name}</a>{b.featured && <Star className="ms-1 inline h-3.5 w-3.5 fill-amber-400 text-amber-400" />}<p className="text-xs text-muted-foreground">{b.address?.city} · {fmtDate(b.createdAt)}</p></td>
                  <td className="px-4 py-3">{b.owner?.name}<p className="text-xs text-muted-foreground">{b.owner?.email}</p></td>
                  <td className="px-4 py-3">{typeof b.category === 'object' ? loc((b.category as Category).name) : ''}</td>
                  <td className="px-4 py-3"><Badge>{b.plan}</Badge></td>
                  <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                  <td className="px-4 py-3 text-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={tc('common.actions')}><MoreHorizontal /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {b.status !== 'active' && <DropdownMenuItem onSelect={() => patch(b._id, { status: 'active' })}><CheckCircle2 />{b.status === 'pending' ? t('admin.approve') : t('admin.activate')}</DropdownMenuItem>}
                        {b.status !== 'suspended' && <DropdownMenuItem danger onSelect={() => patch(b._id, { status: 'suspended' })}><Ban />{t('admin.suspend')}</DropdownMenuItem>}
                        <DropdownMenuItem onSelect={() => patch(b._id, { featured: !b.featured })}><Star />{b.featured ? t('admin.unfeature') : t('admin.feature')}</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => window.open(`/dashboard/${b._id}`, '_self')}>{tc('nav.dashboard')}</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </Table>
            <Pagination page={d.page} pages={d.pages} onChange={setPage} />
          </>
        ) : <EmptyState title={tc('common.empty')} />}
      </QueryView>
    </>
  );
}

export function AdminUsers() {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  const { user: me } = useAuth();
  useDocumentTitle(t('admin.nav.users'));
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [dq, role]);
  const list = useList<User>('users', '/admin/users', { q: dq || undefined, role: role || undefined, page });
  const patch = async (id: string, body: Record<string, unknown>) => {
    try {
      await api.patch(`/admin/users/${id}`, body);
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success(tc('actions.save'));
    } catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <>
      <PageHeader title={t('admin.nav.users')} />
      <Toolbar q={q} setQ={setQ}>
        <NativeSelect className="sm:w-48" value={role} onChange={(e) => setRole(e.target.value)} aria-label={t('admin.role')}><option value="">{tc('common.all')}</option>{PLATFORM_ROLES.map((r) => <option key={r} value={r}>{t(`admin.roles.${r}`)}</option>)}</NativeSelect>
      </Toolbar>
      <QueryView query={list}>
        {(d) => (
          <>
            <Table head={[tc('common.name'), t('admin.role'), tc('common.status'), t('admin.when'), '']}>
              {d.items.map((u) => (
                <tr key={u._id}>
                  <td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar name={u.name} className="h-8 w-8" /><div><p className="font-medium">{u.name}</p><p className="text-xs text-muted-foreground">{u.email}</p></div></div></td>
                  <td className="px-4 py-3">
                    <NativeSelect className="h-9 w-44" value={u.role} disabled={u._id === me?._id} onChange={(e) => patch(u._id, { role: e.target.value })} aria-label={t('admin.role')}>{PLATFORM_ROLES.map((r) => <option key={r} value={r}>{t(`admin.roles.${r}`)}</option>)}</NativeSelect>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={u.status ?? 'active'} /></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{u.createdAt && fmtDate(u.createdAt)}{u.lastLoginAt ? ` · ${fmtDateTime(u.lastLoginAt)}` : ''}</td>
                  <td className="px-4 py-3 text-end">{u._id !== me?._id && <Button size="sm" variant={u.status === 'suspended' ? 'outline' : 'ghost'} onClick={() => patch(u._id, { status: u.status === 'suspended' ? 'active' : 'suspended' })}>{u.status === 'suspended' ? t('admin.activate') : t('admin.suspend')}</Button>}</td>
                </tr>
              ))}
            </Table>
            <Pagination page={d.page} pages={d.pages} onChange={setPage} />
          </>
        )}
      </QueryView>
    </>
  );
}

export function AdminPayments() {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  useDocumentTitle(t('admin.nav.payments'));
  const [purpose, setPurpose] = useState('');
  const [page, setPage] = useState(1);
  const list = useList<Payment>('payments', '/admin/payments', { purpose: purpose || undefined, page });
  return (
    <>
      <PageHeader title={t('admin.nav.payments')} actions={<NativeSelect className="w-48" value={purpose} onChange={(e) => { setPurpose(e.target.value); setPage(1); }} aria-label="Purpose"><option value="">{tc('common.all')}</option><option value="booking">Bookings</option><option value="subscription">Subscriptions</option></NativeSelect>} />
      <QueryView query={list}>
        {(d) => (
          <>
            <Table head={[tc('common.date'), 'Business', t('payments.kind'), t('payments.method'), tc('common.amount'), tc('common.status')]}>
              {d.items.map((p) => (
                <tr key={p._id}>
                  <td className="px-4 py-3">{fmtDateTime(p.paidAt ?? p.createdAt)}<p className="num text-xs text-muted-foreground">{p.invoiceNumber ?? p.booking?.reference}</p></td>
                  <td className="px-4 py-3">{p.business?.name}</td>
                  <td className="px-4 py-3">{t(`payments.kinds.${p.kind}`)}{p.purpose === 'subscription' && <Badge tone="info" className="ms-2">plan</Badge>}</td>
                  <td className="px-4 py-3">{t(`payments.methods.${p.method}`)} <span className="text-xs text-muted-foreground">({p.provider})</span></td>
                  <td className="num px-4 py-3 font-semibold">{money(p.amount, p.currency)}</td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                </tr>
              ))}
            </Table>
            <Pagination page={d.page} pages={d.pages} onChange={setPage} />
          </>
        )}
      </QueryView>
    </>
  );
}

export function AdminSubscriptions() {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  useDocumentTitle(t('admin.nav.subscriptions'));
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const list = useList<{ _id: string; business: { name: string; slug: string; status: string }; plan: Plan; interval: string; status: string; currentPeriodEnd?: string }>('subs', '/admin/plans/subscriptions', { page });
  const plans = useQuery({ queryKey: ['admin', 'plans'], queryFn: () => api.get<{ items: Plan[] }>('/admin/plans') });
  const patch = async (id: string, body: Record<string, unknown>) => {
    try {
      await api.patch(`/admin/plans/subscriptions/${id}`, body);
      void qc.invalidateQueries({ queryKey: ['admin', 'subs'] });
      toast.success(tc('actions.save'));
    } catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <>
      <PageHeader title={t('admin.nav.subscriptions')} />
      <QueryView query={list}>
        {(d) => (
          <>
            <Table head={['Business', t('admin.plan'), 'Interval', tc('common.status'), t('admin.periodEnd')]}>
              {d.items.map((s) => (
                <tr key={s._id}>
                  <td className="px-4 py-3 font-medium">{s.business?.name}</td>
                  <td className="px-4 py-3"><NativeSelect className="h-9 w-40" value={s.plan?._id} onChange={(e) => patch(s._id, { plan: e.target.value })} aria-label={t('admin.plan')}>{plans.data?.items.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}</NativeSelect></td>
                  <td className="px-4 py-3">{s.interval}</td>
                  <td className="px-4 py-3"><NativeSelect className="h-9 w-36" value={s.status} onChange={(e) => patch(s._id, { status: e.target.value })} aria-label={tc('common.status')}>{['trialing', 'active', 'past_due', 'cancelled'].map((x) => <option key={x} value={x}>{tc(`status.${x}`)}</option>)}</NativeSelect></td>
                  <td className="px-4 py-3">{s.currentPeriodEnd ? fmtDate(s.currentPeriodEnd) : '—'}</td>
                </tr>
              ))}
            </Table>
            <Pagination page={d.page} pages={d.pages} onChange={setPage} />
          </>
        )}
      </QueryView>
    </>
  );
}

export function AdminAudit() {
  const { t } = useTranslation('dashboard');
  useDocumentTitle(t('admin.nav.audit'));
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [dq]);
  const list = useList<{ _id: string; action: string; actorName?: string; entity?: string; entityId?: string; business?: { name: string }; ip?: string; createdAt: string; meta?: unknown }>('audit', '/admin/audit-logs', { q: dq || undefined, page });
  return (
    <>
      <PageHeader title={t('admin.nav.audit')} />
      <Toolbar q={q} setQ={setQ} />
      <QueryView query={list}>
        {(d) => (
          <>
            <Table head={[t('admin.when'), t('admin.actor'), t('admin.action'), t('admin.entity'), 'Business', 'IP']}>
              {d.items.map((l) => (
                <tr key={l._id}>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">{fmtDateTime(l.createdAt)}</td>
                  <td className="px-4 py-3">{l.actorName ?? '—'}</td>
                  <td className="px-4 py-3"><code className="rounded bg-muted px-1.5 py-0.5 text-xs" dir="ltr">{l.action}</code></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground" dir="ltr">{l.entity}{l.entityId ? ` · ${l.entityId.slice(-6)}` : ''}</td>
                  <td className="px-4 py-3">{l.business?.name ?? '—'}</td>
                  <td className="num px-4 py-3 text-xs text-muted-foreground">{l.ip}</td>
                </tr>
              ))}
            </Table>
            <Pagination page={d.page} pages={d.pages} onChange={setPage} />
          </>
        )}
      </QueryView>
    </>
  );
}

export function AdminMessages() {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  useDocumentTitle(t('admin.nav.messages'));
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const list = useList<{ _id: string; name: string; email: string; subject?: string; message: string; status: 'new' | 'handled'; createdAt: string }>('messages', '/admin/messages', { page });
  return (
    <>
      <PageHeader title={t('admin.nav.messages')} />
      <QueryView query={list}>
        {(d) => d.items.length ? (
          <>
            <div className="space-y-3">
              {d.items.map((m) => (
                <Card key={m._id} className={`p-5 ${m.status === 'handled' ? 'opacity-60' : ''}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{m.subject || '—'}</p>
                    <span className="text-xs text-muted-foreground">{fmtDateTime(m.createdAt)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{t('admin.from')}: {m.name} · <a className="hover:underline" href={`mailto:${m.email}`}>{m.email}</a></p>
                  <p className="mt-3 whitespace-pre-line text-sm">{m.message}</p>
                  <Button className="mt-3" size="sm" variant="outline" onClick={async () => { await api.patch(`/admin/messages/${m._id}`, { status: m.status === 'new' ? 'handled' : 'new' }); void qc.invalidateQueries({ queryKey: ['admin', 'messages'] }); }}>
                    {m.status === 'new' ? <><CheckCircle2 />{tc('status.completed')}</> : tc('status.pending')}
                  </Button>
                </Card>
              ))}
            </div>
            <Pagination page={d.page} pages={d.pages} onChange={setPage} />
          </>
        ) : <EmptyState title={tc('common.empty')} />}
      </QueryView>
    </>
  );
}
