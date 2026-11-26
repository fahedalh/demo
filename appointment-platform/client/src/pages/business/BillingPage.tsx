import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader, QueryView, Section, StatusBadge } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/misc';
import { useTenant } from '@/contexts/TenantContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { cn } from '@/lib/utils';
import { api, errorMessage } from '@/services/api';
import type { Payment, Plan } from '@/types';
import { fmtDate, money } from '@/utils/format';

export function BillingPage() {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  const { id } = useTenant();
  useDocumentTitle(t('billing.title'));
  const qc = useQueryClient();
  const [sp] = useSearchParams();
  const [annual, setAnnual] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const billing = useQuery({ queryKey: ['billing', id], queryFn: () => api.get<{ plan: Plan; subscription: { interval: string; status: string; currentPeriodEnd?: string } | null; usage: { staff: number; branches: number; bookingsPerMonth: number }; invoices: Payment[] }>(`/businesses/${id}/billing`) });
  const plans = useQuery({ queryKey: ['plans'], queryFn: () => api.get<{ items: Plan[] }>('/plans') });
  useEffect(() => {
    if (sp.get('payment') === 'success') toast.success(t('billing.switched'));
  }, [sp, t]);

  const change = async (p: Plan) => {
    setBusy(p._id);
    try {
      const r = await api.post<{ activated?: boolean; checkoutUrl?: string }>(`/businesses/${id}/billing/change`, { plan: p._id, interval: annual ? 'annual' : 'monthly' });
      if (r.checkoutUrl) window.location.assign(r.checkoutUrl);
      else {
        toast.success(t('billing.switched'));
        void qc.invalidateQueries({ queryKey: ['billing', id] });
        void qc.invalidateQueries({ queryKey: ['usage', id] });
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const lim = (n: number) => (n < 0 ? '∞' : n);

  return (
    <>
      <PageHeader title={t('billing.title')} />
      <QueryView query={billing}>
        {(b) => (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-[1fr,2fr]">
              <Card className="p-5">
                <p className="text-sm text-muted-foreground">{t('billing.current')}</p>
                <p className="mt-1 text-2xl font-bold">{b.plan?.name}</p>
                {b.subscription && <div className="mt-2 flex items-center gap-2 text-sm"><StatusBadge status={b.subscription.status} />{b.subscription.currentPeriodEnd && <span className="text-muted-foreground">{t('billing.renews', { date: fmtDate(b.subscription.currentPeriodEnd) })}</span>}</div>}
              </Card>
              <Card className="p-5">
                <p className="mb-3 text-sm font-semibold">{t('billing.usage')}</p>
                <div className="grid gap-4 sm:grid-cols-3">
                  {([['staff', b.usage.staff, b.plan.limits.staff], ['branches', b.usage.branches, b.plan.limits.branches], ['bookings', b.usage.bookingsPerMonth, b.plan.limits.bookingsPerMonth]] as const).map(([k, used, max]) => (
                    <div key={k}>
                      <div className="mb-1 flex justify-between text-sm"><span>{t(`billing.${k}`)}</span><span className="num font-semibold">{used} / {lim(max)}</span></div>
                      <div className="h-2 rounded-full bg-muted"><div className={cn('h-2 rounded-full', max > 0 && used >= max ? 'bg-destructive' : 'bg-primary')} style={{ width: max < 0 ? '8%' : `${Math.min(100, (used / Math.max(1, max)) * 100)}%` }} /></div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <Section title={t('billing.change')} actions={
              <div className="inline-flex rounded-xl bg-muted p-1 text-sm" role="group">
                <button className={cn('rounded-lg px-3 py-1.5 font-medium', !annual && 'bg-background shadow-sm')} onClick={() => setAnnual(false)} aria-pressed={!annual}>{tc('pricing.monthly')}</button>
                <button className={cn('rounded-lg px-3 py-1.5 font-medium', annual && 'bg-background shadow-sm')} onClick={() => setAnnual(true)} aria-pressed={annual}>{tc('pricing.annual')}</button>
              </div>
            }>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {plans.data?.items.map((p) => {
                  const current = p._id === b.plan._id && (b.subscription?.interval ?? 'monthly') === (annual ? 'annual' : 'monthly');
                  return (
                    <div key={p._id} className={cn('flex flex-col rounded-2xl border p-5', current && 'ring-2 ring-primary')}>
                      <div className="flex items-center justify-between"><p className="font-semibold">{p.name}</p>{current && <Badge tone="primary">{t('billing.currentBadge')}</Badge>}</div>
                      <p className="num mt-2 text-2xl font-bold">{money(annual ? p.price.annual : p.price.monthly, p.currency)}<span className="text-xs font-normal text-muted-foreground">{annual ? tc('pricing.perYear') : tc('pricing.perMonth')}</span></p>
                      <ul className="mt-3 flex-1 space-y-1.5 text-xs">{p.features.map((f) => <li key={f} className="flex gap-1.5"><Check className="h-3.5 w-3.5 shrink-0 text-accent" />{f}</li>)}</ul>
                      <Button className="mt-4" variant={current ? 'secondary' : 'default'} disabled={current} loading={busy === p._id} onClick={() => change(p)}>{current ? t('billing.currentBadge') : t('billing.change')}</Button>
                    </div>
                  );
                })}
              </div>
            </Section>

            <Section title={t('billing.invoices')}>
              {b.invoices.length ? (
                <ul className="divide-y text-sm">
                  {b.invoices.map((i) => <li key={i._id} className="flex justify-between py-2.5"><span>{fmtDate(i.paidAt ?? i.createdAt)} · <span className="num">{i.invoiceNumber}</span></span><span className="num font-semibold">{money(i.amount, i.currency)}</span></li>)}
                </ul>
              ) : <p className="text-sm text-muted-foreground">{t('billing.noInvoices')}</p>}
            </Section>
          </div>
        )}
      </QueryView>
    </>
  );
}
