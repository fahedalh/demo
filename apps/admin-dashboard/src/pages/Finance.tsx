import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Pie, PieChart, ResponsiveContainer, Cell, Tooltip } from 'recharts';
import { Download } from 'lucide-react';
import {
  api,
  ApiError,
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  Field,
  Input,
  Select,
  StatCard,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
  useFormat,
} from '@masar/ui';
import { DataTable, FilterBar, FilterSelect, PageHeader, type Column } from '../components/DataTable';
import { downloadCsv, toMinor, usePaged, useCan } from '../lib/hooks';

interface Summary {
  days: number;
  grossBookings: number;
  commission: number;
  driverEarnings: number;
  tips: number;
  trips: number;
  promoCost: number;
  refunds: { amount: number; count: number };
  failedPayments: number;
  byPaymentType: { type: string; amount: number; count: number }[];
  payouts: { pendingAmount: number; pendingCount: number; paidAmount: number; paidCount: number };
  topDrivers: { driverId: string; name: string; net: number; trips: number }[];
}
interface Payment {
  id: string;
  receiptNumber: string;
  purpose: string;
  type: string;
  provider: string;
  amount: number;
  refundedAmount: number;
  currency: string;
  status: string;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; email: string | null };
  ride: { code: string } | null;
  rideId: string | null;
}
interface Payout {
  id: string;
  amount: number;
  status: string;
  method: string;
  destination: string;
  createdAt: string;
  note: string | null;
  driver: { id: string; firstName: string; lastName: string; phone: string | null };
}

const COLORS = ['#111111', '#06C167', '#2563eb', '#f59e0b'];

export function FinancePage() {
  const { t } = useTranslation();
  const f = useFormat();
  const can = useCan();
  const [days, setDays] = useState('30');
  const s = useQuery({
    queryKey: ['admin', 'finance', days],
    queryFn: () => api.get<Summary>(`/admin/finance/summary?days=${days}`),
    enabled: can('finance'),
  });
  const d = s.data;
  return (
    <div>
      <PageHeader
        title={t('finance.title')}
        actions={
          <Select value={days} onChange={(e) => setDays(e.target.value)} className="h-10 w-auto">
            {['7', '30', '90', '365'].map((v) => (
              <option key={v} value={v}>
                {t('finance.period', { days: v })}
              </option>
            ))}
          </Select>
        }
      />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label={t('finance.gross')}
          value={f.money(d?.grossBookings ?? 0)}
          hint={`${d?.trips ?? 0} trips`}
        />
        <StatCard label={t('finance.commission')} value={f.money(d?.commission ?? 0)} />
        <StatCard
          label={t('finance.driverEarnings')}
          value={f.money(d?.driverEarnings ?? 0)}
          hint={`${t('finance.tips')}: ${f.money(d?.tips ?? 0)}`}
        />
        <StatCard
          label={t('finance.payoutsPending')}
          value={f.money(d?.payouts.pendingAmount ?? 0)}
          hint={`${d?.payouts.pendingCount ?? 0}`}
        />
        <StatCard label={t('finance.promo')} value={f.money(d?.promoCost ?? 0)} />
        <StatCard
          label={t('finance.refunds')}
          value={f.money(d?.refunds.amount ?? 0)}
          hint={`${d?.refunds.count ?? 0}`}
        />
        <StatCard label={t('finance.failed')} value={d?.failedPayments ?? 0} />
        <StatCard
          label="Paid out"
          value={f.money(d?.payouts.paidAmount ?? 0)}
          hint={`${d?.payouts.paidCount ?? 0}`}
        />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-2 font-semibold">{t('finance.byType')}</h2>
          <div className="flex items-center gap-6">
            <div className="h-48 w-48">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={d?.byPaymentType ?? []}
                    dataKey="amount"
                    nameKey="type"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {(d?.byPaymentType ?? []).map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => f.money(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 text-sm">
              {d?.byPaymentType.map((b, i) => (
                <div key={b.type} className="flex items-center gap-2">
                  <span className="size-3 rounded" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="w-16">{t(`ride.payment.${b.type}`)}</span>
                  <span className="tabular font-semibold">{f.money(b.amount)}</span>
                  <span className="text-muted">({b.count})</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="mb-2 font-semibold">{t('finance.topDrivers')}</h2>
          <div className="divide-y divide-line text-sm">
            {d?.topDrivers.map((x, i) => (
              <Link
                key={x.driverId}
                to={`/drivers/${x.driverId}`}
                className="flex items-center gap-3 py-2.5 hover:bg-surface-2/50"
              >
                <span className="w-5 text-muted">{i + 1}</span>
                <span className="flex-1">{x.name}</span>
                <span className="text-muted">{x.trips} trips</span>
                <span className="tabular w-28 text-end font-semibold">{f.money(x.net)}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>
      <Tabs defaultValue="payments" className="mt-6">
        <TabsList>
          <TabsTrigger value="payments">{t('finance.payments')}</TabsTrigger>
          <TabsTrigger value="payouts">{t('finance.payouts')}</TabsTrigger>
        </TabsList>
        <TabsContent value="payments" className="mt-4">
          <PaymentsTable />
        </TabsContent>
        <TabsContent value="payouts" className="mt-4">
          <PayoutsTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PaymentsTable() {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const list = usePaged<Payment>('/admin/payments');
  const [refundFor, setRefundFor] = useState<Payment | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const refund = useMutation({
    mutationFn: () =>
      api.post(`/admin/payments/${refundFor!.id}/refund`, { amount: toMinor(amount), reason }),
    onSuccess: () => {
      toast.success(t('finance.refund'));
      setRefundFor(null);
      void qc.invalidateQueries({ queryKey: ['/admin/payments'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });
  const cols: Column<Payment>[] = [
    {
      key: 'r',
      header: t('finance.receipt'),
      cell: (p) => <span className="font-mono text-xs">{p.receiptNumber}</span>,
    },
    {
      key: 'u',
      header: t('finance.user'),
      cell: (p) => (
        <Link className="hover:underline" to={`/users/${p.user.id}`}>
          {p.user.firstName} {p.user.lastName}
        </Link>
      ),
    },
    {
      key: 'ride',
      header: 'Ride',
      cell: (p) =>
        p.ride ? (
          <Link className="font-mono text-xs hover:underline" to={`/rides/${p.rideId}`}>
            {p.ride.code}
          </Link>
        ) : (
          '—'
        ),
    },
    { key: 'purpose', header: 'Purpose', cell: (p) => <span className="text-xs">{p.purpose}</span> },
    {
      key: 'm',
      header: t('finance.method'),
      cell: (p) => (
        <span className="text-xs">
          {p.type} · {p.provider}
        </span>
      ),
    },
    {
      key: 'a',
      header: t('finance.amount'),
      className: 'text-end',
      cell: (p) => (
        <span className="tabular font-semibold">
          {f.money(p.amount, p.currency)}
          {p.refundedAmount ? (
            <span className="block text-xs text-danger">−{f.money(p.refundedAmount, p.currency)}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: 's',
      header: t('common.status'),
      cell: (p) => (
        <Badge tone={p.status === 'SUCCEEDED' ? 'success' : p.status === 'FAILED' ? 'danger' : 'warning'}>
          {p.status}
        </Badge>
      ),
    },
    {
      key: 'd',
      header: '',
      cell: (p) => <span className="whitespace-nowrap text-xs text-muted">{f.dateTime(p.createdAt)}</span>,
    },
    {
      key: 'x',
      header: '',
      cell: (p) =>
        ['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(p.status) ? (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              setRefundFor(p);
              setAmount(((p.amount - p.refundedAmount) / 100).toFixed(2));
              setReason('');
            }}
          >
            {t('finance.refund')}
          </Button>
        ) : null,
    },
  ];
  return (
    <>
      <FilterBar onSearch={(v) => list.setFilter('q', v)}>
        <FilterSelect
          label={t('common.status')}
          value={list.filters.status ?? ''}
          onChange={(v) => list.setFilter('status', v)}
          options={['SUCCEEDED', 'FAILED', 'PENDING', 'REFUNDED', 'PARTIALLY_REFUNDED'].map((s) => ({
            value: s,
            label: s,
          }))}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadCsv(
              'payments',
              (list.data?.items ?? []).map((p) => ({
                receipt: p.receiptNumber,
                user: `${p.user.firstName} ${p.user.lastName}`,
                purpose: p.purpose,
                method: p.type,
                provider: p.provider,
                amount: p.amount / 100,
                refunded: p.refundedAmount / 100,
                status: p.status,
                date: p.createdAt,
              })),
            )
          }
        >
          <Download /> {t('common.export')}
        </Button>
      </FilterBar>
      <DataTable
        columns={cols}
        rows={list.data?.items}
        loading={list.isLoading}
        page={list.page}
        totalPages={list.data?.totalPages}
        total={list.data?.total}
        onPage={list.setPage}
      />
      <Dialog open={!!refundFor} onOpenChange={(o) => !o && setRefundFor(null)}>
        <DialogContent title={t('finance.refundTitle')} description={refundFor?.receiptNumber}>
          <div className="space-y-3">
            <Field label={`${t('finance.amount')} (AED)`}>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label={t('rides.reason')}>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <Button
              block
              variant="danger"
              disabled={reason.trim().length < 3 || !(Number(amount) > 0)}
              loading={refund.isPending}
              onClick={() => refund.mutate()}
            >
              {t('finance.refund')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PayoutsTable() {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const list = usePaged<Payout>('/admin/payouts');
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'pay' | 'reject' }) =>
      api.post(`/admin/payouts/${id}/${action}`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['/admin/payouts'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'finance'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });
  const cols: Column<Payout>[] = [
    {
      key: 'd',
      header: t('rides.driver'),
      cell: (p) => (
        <Link className="hover:underline" to={`/drivers/${p.driver.id}`}>
          {p.driver.firstName} {p.driver.lastName}
        </Link>
      ),
    },
    {
      key: 'a',
      header: t('finance.amount'),
      cell: (p) => <span className="tabular font-semibold">{f.money(p.amount)}</span>,
    },
    {
      key: 'dest',
      header: 'Destination',
      cell: (p) => (
        <span className="text-xs">
          {p.method} · {p.destination}
        </span>
      ),
    },
    {
      key: 's',
      header: t('common.status'),
      cell: (p) => (
        <Badge tone={p.status === 'PAID' ? 'success' : p.status === 'REJECTED' ? 'danger' : 'info'}>
          {p.status}
        </Badge>
      ),
    },
    {
      key: 'at',
      header: '',
      cell: (p) => <span className="text-xs text-muted">{f.dateTime(p.createdAt)}</span>,
    },
    {
      key: 'x',
      header: '',
      cell: (p) => (
        <span className="flex gap-1">
          {p.status === 'REQUESTED' && (
            <Button size="sm" variant="outline" onClick={() => act.mutate({ id: p.id, action: 'approve' })}>
              {t('finance.approve')}
            </Button>
          )}
          {['REQUESTED', 'APPROVED'].includes(p.status) && (
            <Button size="sm" variant="accent" onClick={() => act.mutate({ id: p.id, action: 'pay' })}>
              {t('finance.pay')}
            </Button>
          )}
          {['REQUESTED', 'APPROVED'].includes(p.status) && (
            <Button size="sm" variant="ghost" onClick={() => act.mutate({ id: p.id, action: 'reject' })}>
              {t('finance.reject')}
            </Button>
          )}
        </span>
      ),
    },
  ];
  return (
    <>
      <FilterBar>
        <FilterSelect
          label={t('common.status')}
          value={list.filters.status ?? ''}
          onChange={(v) => list.setFilter('status', v)}
          options={['REQUESTED', 'APPROVED', 'PAID', 'REJECTED'].map((s) => ({ value: s, label: s }))}
        />
      </FilterBar>
      <DataTable
        columns={cols}
        rows={list.data?.items}
        loading={list.isLoading}
        page={list.page}
        totalPages={list.data?.totalPages}
        total={list.data?.total}
        onPage={list.setPage}
      />
    </>
  );
}
