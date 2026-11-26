import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, FileText, Printer, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Paginated } from '@bookly/shared';
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Pagination, QueryView, StatCard, StatusBadge } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Card } from '@/components/ui/misc';
import { useTenant } from '@/contexts/TenantContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { cn } from '@/lib/utils';
import { api, errorMessage } from '@/services/api';
import type { Address, Payment } from '@/types';
import { fmtDate, fmtDateTime, money } from '@/utils/format';

export function PaymentsPage() {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  const { id, business, can } = useTenant();
  useDocumentTitle(t('payments.title'));
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [method, setMethod] = useState('');
  const [refund, setRefund] = useState<Payment | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [invoice, setInvoice] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['payments', id, page, method], queryFn: () => api.get<Paginated<Payment> & { summary: { gross: number; refunds: number; net: number } }>(`/businesses/${id}/payments`, { page, method: method || undefined }), placeholderData: keepPreviousData });

  return (
    <>
      <PageHeader title={t('payments.title')} description={t('payments.subtitle')} actions={
        <NativeSelect value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }} className="w-40" aria-label={t('payments.method')}>
          <option value="">{tc('common.all')}</option>
          <option value="online">{t('payments.methods.online')}</option>
          <option value="cash">{t('payments.methods.cash')}</option>
        </NativeSelect>
      } />
      <QueryView query={list}>
        {(d) => (
          <>
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
              <StatCard label={t('payments.gross')} value={money(d.summary.gross, business.currency)} />
              <StatCard label={t('payments.refunds')} value={money(d.summary.refunds, business.currency)} tone="rose" />
              <StatCard label={t('payments.net')} value={money(d.summary.net, business.currency)} tone="accent" />
            </div>
            {d.items.length ? (
              <Card className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-start">{tc('common.date')}</th>
                      <th className="px-4 py-3 text-start">{tc('common.customer')}</th>
                      <th className="px-4 py-3 text-start">{t('payments.kind')}</th>
                      <th className="px-4 py-3 text-start">{t('payments.method')}</th>
                      <th className="px-4 py-3 text-end">{tc('common.amount')}</th>
                      <th className="px-4 py-3 text-start">{tc('common.status')}</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {d.items.map((p) => (
                      <tr key={p._id}>
                        <td className="px-4 py-3"><p>{fmtDate(p.paidAt ?? p.createdAt, business.timezone)}</p><p className="num text-xs text-muted-foreground">{p.invoiceNumber ?? p.booking?.reference}</p></td>
                        <td className="px-4 py-3">{p.customer?.name ?? '—'}<p className="text-xs text-muted-foreground">{p.booking?.snapshot?.serviceName}</p></td>
                        <td className="px-4 py-3">{t(`payments.kinds.${p.kind}`)}</td>
                        <td className="px-4 py-3">{t(`payments.methods.${p.method}`)} <span className="text-xs text-muted-foreground">({p.provider})</span></td>
                        <td className={cn('num px-4 py-3 text-end font-semibold', p.kind === 'refund' && 'text-rose-600')}>{p.kind === 'refund' ? '−' : ''}{money(p.amount, p.currency)}</td>
                        <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            {p.invoiceNumber && <Button variant="ghost" size="icon-sm" onClick={() => setInvoice(p._id)} aria-label={t('payments.invoice')}><FileText /></Button>}
                            {can('payments:manage') && p.status === 'succeeded' && p.kind !== 'refund' && <Button variant="ghost" size="icon-sm" onClick={() => { setRefund(p); setAmount(String(p.amount)); }} aria-label={t('payments.refund')}><RotateCcw /></Button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            ) : <EmptyState icon={<CreditCard />} title={t('payments.empty')} />}
            <Pagination page={d.page} pages={d.pages} onChange={setPage} />
          </>
        )}
      </QueryView>

      <Dialog open={!!refund} onOpenChange={(o) => !o && setRefund(null)}>
        <DialogContent title={t('payments.refundTitle')} size="sm" description={refund ? `${refund.invoiceNumber ?? ''} · ${money(refund.amount, refund.currency)}` : undefined}>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="rf-amt">{t('payments.refundAmount')}</label>
          <Input id="rf-amt" type="number" min={0} step="0.01" max={refund?.amount} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefund(null)}>{tc('actions.cancel')}</Button>
            <Button
              variant="destructive"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.post(`/businesses/${id}/payments/${refund!._id}/refund`, { amount: Number(amount) });
                  toast.success(t('payments.refunded'));
                  void qc.invalidateQueries({ queryKey: ['payments', id] });
                  setRefund(null);
                } catch (e) {
                  toast.error(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t('payments.refund')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <InvoiceDialog paymentId={invoice} onClose={() => setInvoice(null)} />
    </>
  );
}

function InvoiceDialog({ paymentId, onClose }: { paymentId: string | null; onClose: () => void }) {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  const { id } = useTenant();
  const q = useQuery({
    queryKey: ['invoice', id, paymentId],
    queryFn: () => api.get<{ payment: Payment & { booking: { reference: string; snapshot: { serviceName: string; staffName?: string }; start: string; timezone: string; price: { amount: number } } }; business: { name: string; address?: Address; contact?: { email?: string; phone?: string }; logo?: string } }>(`/businesses/${id}/payments/${paymentId}/invoice`),
    enabled: !!paymentId,
  });
  return (
    <Dialog open={!!paymentId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t('payments.invoiceTitle', { number: q.data?.payment.invoiceNumber ?? '' })} size="lg">
        {q.isLoading ? <ListSkeleton rows={3} /> : q.error ? <ErrorState error={q.error} /> : q.data && (
          <div id="invoice-print" className="space-y-6 text-sm">
            <div className="flex justify-between gap-6">
              <div>
                <p className="text-lg font-bold">{q.data.business.name}</p>
                <p className="text-muted-foreground">{[q.data.business.address?.line1, q.data.business.address?.city, q.data.business.address?.country].filter(Boolean).join(', ')}</p>
                <p className="text-muted-foreground">{q.data.business.contact?.email}</p>
              </div>
              <div className="text-end">
                <p className="num font-semibold">{q.data.payment.invoiceNumber}</p>
                <p className="text-muted-foreground">{fmtDateTime(q.data.payment.paidAt ?? q.data.payment.createdAt)}</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">{t('payments.billTo')}</p>
              <p className="font-medium">{q.data.payment.customer?.name}</p>
              <p className="text-muted-foreground">{q.data.payment.customer?.email}</p>
            </div>
            <table className="w-full">
              <thead className="border-b text-xs uppercase text-muted-foreground"><tr><th className="py-2 text-start">{tc('common.description')}</th><th className="py-2 text-end">{tc('common.amount')}</th></tr></thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-3">{q.data.payment.booking?.snapshot.serviceName} — {fmtDate(q.data.payment.booking?.start, q.data.payment.booking?.timezone)} <span className="text-muted-foreground">({t(`payments.kinds.${q.data.payment.kind}`)}, {q.data.payment.booking?.reference})</span></td>
                  <td className="num py-3 text-end">{money(q.data.payment.amount, q.data.payment.currency)}</td>
                </tr>
              </tbody>
              <tfoot><tr><td className="py-3 text-end font-semibold">{tc('common.total')}</td><td className="num py-3 text-end text-base font-bold">{money(q.data.payment.amount, q.data.payment.currency)}</td></tr></tfoot>
            </table>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => {
            const html = document.getElementById('invoice-print')?.innerHTML ?? '';
            const w = window.open('', '_blank', 'width=800,height=900');
            if (!w) return;
            w.document.write(`<html dir="${document.dir}"><head><title>Invoice</title><style>body{font-family:system-ui,sans-serif;padding:40px;color:#0f172a}table{width:100%;border-collapse:collapse}td,th{padding:8px 0}.text-end{text-align:end}.text-muted-foreground{color:#64748b}.font-bold,.font-semibold{font-weight:700}.flex{display:flex;justify-content:space-between}</style></head><body>${html}</body></html>`);
            w.document.close();
            w.print();
          }}><Printer />{tc('actions.print')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
