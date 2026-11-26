import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Lock } from 'lucide-react';
import {
  api,
  ApiError,
  Badge,
  Button,
  Card,
  cn,
  RatingStars,
  Select,
  Skeleton,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
  useFormat,
} from '@masar/ui';
import { DataTable, FilterBar, FilterSelect, PageHeader, type Column } from '../components/DataTable';
import { usePaged } from '../lib/hooks';

interface Ticket {
  id: string;
  number: number;
  subject: string;
  category: string;
  status: string;
  priority: string;
  updatedAt: string;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; role: string };
  assignedTo: { firstName: string } | null;
  ride: { code: string } | null;
}
const prioTone = (p: string) =>
  (p === 'URGENT' ? 'danger' : p === 'HIGH' ? 'warning' : 'neutral') as 'danger' | 'warning' | 'neutral';

export function SupportPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const [params, setParams] = useSearchParams();
  const selected = params.get('ticket');
  const list = usePaged<Ticket>('/admin/tickets', { status: '' });
  const cols: Column<Ticket>[] = [
    { key: 'n', header: '#', cell: (tk) => <span className="font-mono text-xs">{tk.number}</span> },
    {
      key: 's',
      header: t('support.subject'),
      cell: (tk) => <span className="block max-w-80 truncate font-medium">{tk.subject}</span>,
    },
    {
      key: 'u',
      header: t('support.user'),
      cell: (tk) => (
        <span className="text-sm">
          {tk.user.firstName} {tk.user.lastName}{' '}
          <span className="text-xs text-muted">· {tk.user.role.toLowerCase()}</span>
        </span>
      ),
    },
    {
      key: 'p',
      header: t('support.priority'),
      cell: (tk) => <Badge tone={prioTone(tk.priority)}>{tk.priority}</Badge>,
    },
    {
      key: 'st',
      header: t('common.status'),
      cell: (tk) => (
        <Badge tone={['RESOLVED', 'CLOSED'].includes(tk.status) ? 'success' : 'info'}>{tk.status}</Badge>
      ),
    },
    {
      key: 'up',
      header: t('support.updated'),
      cell: (tk) => <span className="text-xs text-muted">{f.relative(tk.updatedAt)}</span>,
    },
  ];
  return (
    <div>
      <PageHeader title={t('support.title')} />
      <Tabs defaultValue="tickets">
        <TabsList>
          <TabsTrigger value="tickets">{t('support.tickets')}</TabsTrigger>
          <TabsTrigger value="reviews">{t('support.reviews')}</TabsTrigger>
        </TabsList>
        <TabsContent value="tickets" className="mt-4">
          <div className={cn('grid gap-4', selected && 'xl:grid-cols-[1fr_480px]')}>
            <div>
              <FilterBar onSearch={(v) => list.setFilter('q', v)}>
                <FilterSelect
                  label={t('common.status')}
                  value={list.filters.status ?? ''}
                  onChange={(v) => list.setFilter('status', v)}
                  options={['OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED'].map((s) => ({
                    value: s,
                    label: s,
                  }))}
                />
              </FilterBar>
              <DataTable
                columns={cols}
                rows={list.data?.items}
                loading={list.isLoading}
                onRowClick={(tk) => setParams({ ticket: tk.id })}
                page={list.page}
                totalPages={list.data?.totalPages}
                total={list.data?.total}
                onPage={list.setPage}
              />
            </div>
            {selected && <TicketPanel id={selected} onClose={() => setParams({})} />}
          </div>
        </TabsContent>
        <TabsContent value="reviews" className="mt-4">
          <Reviews />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TicketPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const q = useQuery({
    queryKey: ['admin', 'ticket', id],
    queryFn: () => api.get<any>(`/admin/tickets/${id}`),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'ticket', id] });
    void qc.invalidateQueries({ queryKey: ['/admin/tickets'] });
  };
  const reply = useMutation({
    mutationFn: () => api.post(`/admin/tickets/${id}/messages`, { body, isInternal: internal }),
    onSuccess: () => {
      setBody('');
      refresh();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });
  const update = useMutation({
    mutationFn: (b: Record<string, unknown>) => api.patch(`/admin/tickets/${id}`, b),
    onSuccess: refresh,
  });
  if (!q.data) return <Skeleton className="h-96" />;
  const tk = q.data;
  return (
    <Card className="sticky top-20 max-h-[calc(100dvh-7rem)] overflow-y-auto p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted">
            #{tk.number} · {tk.category} · {f.dateTime(tk.createdAt)}
          </p>
          <h2 className="text-lg font-bold">{tk.subject}</h2>
          <p className="text-sm">
            <Link to={`/users/${tk.user.id}`} className="hover:underline">
              {tk.user.firstName} {tk.user.lastName}
            </Link>
            {tk.ride && (
              <>
                {' '}
                ·{' '}
                <Link className="font-mono text-xs hover:underline" to={`/rides/${tk.ride.id}`}>
                  {tk.ride.code}
                </Link>
              </>
            )}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t('actions.close')}
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Select
          className="h-9 w-auto text-sm"
          value={tk.status}
          onChange={(e) => update.mutate({ status: e.target.value })}
        >
          {['OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        <Select
          className="h-9 w-auto text-sm"
          value={tk.priority}
          onChange={(e) => update.mutate({ priority: e.target.value })}
        >
          {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        {!tk.assignedTo && (
          <Button size="sm" variant="outline" onClick={() => update.mutate({ assignToMe: true })}>
            {t('support.assign')}
          </Button>
        )}
      </div>
      <p className="mt-4 whitespace-pre-wrap rounded-2xl bg-surface-2 p-3 text-sm">{tk.description}</p>
      {tk.meta && (
        <pre className="mt-2 overflow-x-auto rounded-xl bg-surface-2 p-2 text-xs">
          {JSON.stringify(tk.meta, null, 1)}
        </pre>
      )}
      <div className="mt-4 space-y-2">
        {tk.messages.map((m: any) => (
          <div
            key={m.id}
            className={cn(
              'rounded-2xl p-3 text-sm',
              m.isInternal
                ? 'border border-dashed border-warning/60 bg-warning/5'
                : m.author.role === 'ADMIN'
                  ? 'bg-accent/8'
                  : 'bg-surface-2',
            )}
          >
            <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-muted">
              {m.isInternal && <Lock className="size-3" />}
              {m.author.firstName} · {f.relative(m.createdAt)}
            </p>
            <p className="whitespace-pre-wrap">{m.body}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={internal ? t('support.internal') : t('support.reply')}
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={internal} onCheckedChange={setInternal} />
            {t('support.internal')}
          </label>
          <Button disabled={!body.trim()} loading={reply.isPending} onClick={() => reply.mutate()}>
            {t('actions.send')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Reviews() {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin', 'reviews'],
    queryFn: () => api.get<{ items: any[] }>('/admin/reviews').then((r) => r.items),
  });
  const hide = useMutation({
    mutationFn: ({ id, isHidden }: { id: string; isHidden: boolean }) =>
      api.patch(`/admin/reviews/${id}`, { isHidden }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'reviews'] }),
  });
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {q.data
        ?.filter((r) => r.review?.comment)
        .map((r) => (
          <Card key={r.id} className={cn('p-4', r.review.isHidden && 'opacity-50')}>
            <div className="flex items-center justify-between">
              <RatingStars value={r.score} size={14} />
              <span className="text-xs text-muted">{f.relative(r.createdAt)}</span>
            </div>
            <p className="mt-2 text-sm">“{r.review.comment}”</p>
            <p className="mt-2 text-xs text-muted">
              {r.rater.firstName} → {r.ratee.firstName} · {r.ride.code}
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="mt-2"
              onClick={() => hide.mutate({ id: r.review.id, isHidden: !r.review.isHidden })}
            >
              {r.review.isHidden ? (
                <>
                  <Eye /> {t('support.show')}
                </>
              ) : (
                <>
                  <EyeOff /> {t('support.hide')}
                </>
              )}
            </Button>
          </Card>
        ))}
    </div>
  );
}
