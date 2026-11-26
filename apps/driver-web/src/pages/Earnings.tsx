import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ArrowDownToLine, Banknote, CreditCard } from 'lucide-react';
import { payoutRequestSchema } from '@masar/shared';
import { api, ApiError, Badge, Button, Card, Dialog, DialogContent, EmptyState, Field, Input, Skeleton, StatCard, Tabs, TabsList, TabsTrigger, toast, useFormat } from '@masar/ui';

interface EarningsResp { days: number; series: { date: string; net: number; gross: number; commission: number; tips: number; trips: number; cash: number; online: number }[]; totals: { net: number; gross: number; commission: number; tips: number; trips: number; cash: number; online: number } }
interface WalletResp { balance: number; currency: string; transactions: { id: string; type: string; amount: number; description: string | null; createdAt: string }[] }
interface Payout { id: string; amount: number; status: 'REQUESTED' | 'APPROVED' | 'PAID' | 'REJECTED'; destination: string; createdAt: string; note: string | null }

export function EarningsPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const [days, setDays] = useState(7);
  const [withdraw, setWithdraw] = useState(false);
  const earnings = useQuery({ queryKey: ['driver', 'earnings', days], queryFn: () => api.get<EarningsResp>(`/driver/earnings?days=${days}`) });
  const wallet = useQuery({ queryKey: ['driver', 'wallet'], queryFn: () => api.get<WalletResp>('/driver/wallet') });
  const payouts = useQuery({ queryKey: ['driver', 'payouts'], queryFn: () => api.get<{ items: Payout[] }>('/driver/payouts').then((r) => r.items) });
  const weekly = useQuery({ queryKey: ['driver', 'weekly'], queryFn: () => api.get<{ weeks: { weekStart: string; trips: number; gross: number; commission: number; tips: number; net: number }[] }>('/driver/reports/weekly').then((r) => r.weeks) });
  const tt = earnings.data?.totals;
  const chart = earnings.data?.series.map((s) => ({ ...s, label: f.date(s.date, { weekday: days <= 7 ? 'short' : undefined, day: 'numeric', month: days <= 7 ? undefined : 'short' }), netMajor: s.net / 100 }));

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('earnings.title')}</h1>
        <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <TabsList><TabsTrigger value="7">{t('earnings.period7')}</TabsTrigger><TabsTrigger value="30">{t('earnings.period30')}</TabsTrigger></TabsList>
        </Tabs>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="p-5">
          <p className="text-sm text-muted">{t('earnings.net')}</p>
          {earnings.isLoading ? <Skeleton className="mt-2 h-9 w-40" /> : <p className="tabular text-3xl font-bold">{f.money(tt?.net ?? 0)}</p>}
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ left: -18, right: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted)" interval="preserveStartEnd" reversed={document.documentElement.dir === 'rtl'} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted)" orientation={document.documentElement.dir === 'rtl' ? 'right' : 'left'} />
                <Tooltip cursor={{ fill: 'var(--surface-2)' }} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12 }} formatter={(v: number) => [f.money(Math.round(v * 100)), t('earnings.net')]} />
                <Bar dataKey="netMajor" fill="#06C167" radius={[6, 6, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <div className="space-y-4">
          <Card className="bg-ink p-5 text-white">
            <p className="text-sm text-white/70">{t('earnings.wallet')}</p>
            <p className="tabular text-3xl font-bold text-white">{f.money(wallet.data?.balance ?? 0, wallet.data?.currency)}</p>
            <Button variant="accent" className="mt-4" disabled={(wallet.data?.balance ?? 0) < 5000} onClick={() => setWithdraw(true)}><ArrowDownToLine /> {t('earnings.withdraw')}</Button>
            <p className="mt-2 text-xs text-white/50">{t('earnings.min')}</p>
          </Card>
          {(wallet.data?.balance ?? 0) < 0 && (
            <Card className="flex gap-3 border-warning/40 bg-warning/8 p-4 text-sm"><AlertTriangle className="size-5 shrink-0 text-amber-600" />{t('earnings.owe', { amount: f.money(-(wallet.data?.balance ?? 0)) })}</Card>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('earnings.gross')} value={f.money(tt?.gross ?? 0)} />
        <StatCard label={t('earnings.commission')} value={`−${f.money(tt?.commission ?? 0)}`} />
        <StatCard label={t('earnings.tips')} value={f.money(tt?.tips ?? 0)} />
        <StatCard label={t('earnings.trips')} value={tt?.trips ?? 0} />
        <StatCard label={t('earnings.cash')} value={f.money(tt?.cash ?? 0)} icon={Banknote} />
        <StatCard label={t('earnings.online')} value={f.money(tt?.online ?? 0)} icon={CreditCard} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">{t('earnings.weekly')}</h2>
          <div className="divide-y divide-line text-sm">
            {weekly.data?.map((w) => (
              <div key={w.weekStart} className="flex items-center justify-between py-2.5">
                <div><p className="font-medium">{t('earnings.week', { date: f.date(w.weekStart, { day: 'numeric', month: 'short' }) })}</p><p className="text-xs text-muted">{w.trips} {t('earnings.trips')} · −{f.money(w.commission)}</p></div>
                <p className="tabular font-semibold">{f.money(w.net)}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">{t('earnings.payouts')}</h2>
          {payouts.data?.length === 0 && <EmptyState title={t('earnings.noPayouts')} />}
          <div className="divide-y divide-line text-sm">
            {payouts.data?.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2.5">
                <div><p className="font-medium">{p.destination}</p><p className="text-xs text-muted">{f.dateTime(p.createdAt)}</p></div>
                <div className="text-end"><p className="tabular font-semibold">{f.money(p.amount)}</p><Badge tone={p.status === 'PAID' ? 'success' : p.status === 'REJECTED' ? 'danger' : 'info'}>{t(`earnings.statuses.${p.status}`)}</Badge></div>
              </div>
            ))}
          </div>
          <h3 className="mb-2 mt-5 text-sm font-semibold text-muted">{t('earnings.history')}</h3>
          <div className="divide-y divide-line text-sm">
            {wallet.data?.transactions.slice(0, 8).map((tx) => (
              <div key={tx.id} className="flex items-center justify-between py-2">
                <div className="min-w-0"><p className="truncate">{tx.description ?? tx.type}</p><p className="text-xs text-muted">{f.relative(tx.createdAt)}</p></div>
                <p className={`tabular font-semibold ${tx.amount < 0 ? 'text-danger' : 'text-accent-600'}`}>{tx.amount > 0 ? '+' : ''}{f.money(tx.amount)}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <WithdrawDialog open={withdraw} onOpenChange={setWithdraw} max={wallet.data?.balance ?? 0} />
    </div>
  );
}

function WithdrawDialog({ open, onOpenChange, max }: { open: boolean; onOpenChange: (o: boolean) => void; max: number }) {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [iban, setIban] = useState('');
  const [error, setError] = useState<string | null>(null);
  const req = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/driver/payouts', body),
    onSuccess: () => { toast.success(t('earnings.requested')); void qc.invalidateQueries({ queryKey: ['driver'] }); onOpenChange(false); setAmount(''); },
    onError: (e) => setError(e instanceof ApiError ? e.message : t('errors.generic')),
  });
  const submit = () => {
    setError(null);
    const minor = Math.round(Number(amount) * 100);
    const parsed = payoutRequestSchema.safeParse({ amount: minor, method: 'BANK_TRANSFER', destination: iban });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Invalid');
    if (minor < 5000) return setError(t('earnings.min'));
    if (minor > max) return setError(`Max ${f.money(max)}`);
    req.mutate(parsed.data);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('earnings.withdrawTitle')}>
        <div className="space-y-4">
          {error && <p className="text-sm text-danger">{error}</p>}
          <Field label={`${t('earnings.amount')} (AED)`} hint={`≤ ${f.money(max)}`}><Input type="number" min={50} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label={t('earnings.iban')}><Input dir="ltr" value={iban} onChange={(e) => setIban(e.target.value)} placeholder="AE07 0331 2345 6789 0123 456" /></Field>
          <Button block size="lg" loading={req.isPending} onClick={submit}>{t('earnings.withdraw')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
