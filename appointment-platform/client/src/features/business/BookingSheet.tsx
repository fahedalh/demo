import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CalendarClock, Check, CheckCircle2, Mail, Phone, UserX, X, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BOOKING_TRANSITIONS, type BookingStatus } from '@bookly/shared';
import { ConfirmDialog, ErrorState, ListSkeleton, StatusBadge } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Avatar, Separator } from '@/components/ui/misc';
import { useTenant } from '@/contexts/TenantContext';
import { SlotPicker } from '@/features/booking/SlotPicker';
import { api, errorMessage } from '@/services/api';
import type { Booking, Slot } from '@/types';
import { fmtDate, fmtDateTime, fmtTime, money } from '@/utils/format';

const ACTIONS: Array<{ to: BookingStatus; key: string; icon: React.ReactNode; variant: 'default' | 'outline' | 'destructive'; reason?: boolean }> = [
  { to: 'confirmed', key: 'confirm', icon: <Check />, variant: 'default' },
  { to: 'completed', key: 'complete', icon: <CheckCircle2 />, variant: 'default' },
  { to: 'rejected', key: 'reject', icon: <X />, variant: 'destructive', reason: true },
  { to: 'no_show', key: 'noShow', icon: <UserX />, variant: 'outline' },
  { to: 'cancelled', key: 'cancel', icon: <XCircle />, variant: 'outline', reason: true },
];

export function BookingSheet({ bookingId, onOpenChange }: { bookingId: string | null; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  const { id, can, terms, business } = useTenant();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['bookings', id, 'detail', bookingId], queryFn: () => api.get<Booking>(`/businesses/${id}/bookings/${bookingId}`), enabled: !!bookingId });
  const [action, setAction] = useState<(typeof ACTIONS)[number] | null>(null);
  const [resOpen, setResOpen] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [notes, setNotes] = useState('');
  const [cashOpen, setCashOpen] = useState(false);
  const [cash, setCash] = useState('');
  const [busy, setBusy] = useState(false);
  const b = q.data;
  useEffect(() => setNotes(b?.internalNotes ?? ''), [b?.internalNotes]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['bookings', id] });
    void qc.invalidateQueries({ queryKey: ['analytics', id] });
  };
  const started = b ? new Date(b.start) <= new Date() : false;
  const allowed = b ? BOOKING_TRANSITIONS[b.status].filter((s) => (s === 'completed' || s === 'no_show' ? started : true)) : [];
  const outstanding = b ? Math.max(0, b.price.amount - b.price.paid) : 0;

  async function run<T>(fn: () => Promise<T>, success: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(success);
      refresh();
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!bookingId} onOpenChange={onOpenChange}>
      <DialogContent side="right" title={b ? `${b.snapshot.serviceName}` : tc('common.loading')} description={b ? <span className="num">{b.reference}</span> : undefined}>
        {q.isLoading ? <ListSkeleton rows={4} /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : b ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={b.status} />
              <StatusBadge status={b.price.status} />
              {b.recurrence?.groupId && <span className="text-xs text-muted-foreground">↻ {b.recurrence.rule}</span>}
            </div>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('bookings.whenSection')}</h3>
              <p className="font-semibold">{fmtDate(b.start, b.timezone)}</p>
              <p className="num text-sm">{fmtTime(b.start, b.timezone)} – {fmtTime(b.end, b.timezone)} · {b.mode === 'online' ? tc('common.online') : tc('common.inPerson')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{[b.staff ? `${terms.staff}: ${b.staff.name}` : null, b.resource ? `${terms.resource}: ${b.resource.name}` : null, b.branch?.name].filter(Boolean).join(' · ')}</p>
              {b.attendees > 1 && <p className="text-sm text-muted-foreground">{tc('booking.attendees')}: {b.attendees}</p>}
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('bookings.customerSection')}</h3>
              <div className="flex items-center gap-3">
                <Avatar name={b.snapshot.customerName} />
                <div className="min-w-0">
                  <p className="font-semibold">{b.snapshot.customerName}</p>
                  <div className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                    {b.snapshot.customerEmail && <a className="flex items-center gap-1 hover:text-primary" href={`mailto:${b.snapshot.customerEmail}`}><Mail className="h-3.5 w-3.5" />{b.snapshot.customerEmail}</a>}
                    {b.snapshot.customerPhone && <a className="flex items-center gap-1 hover:text-primary" href={`tel:${b.snapshot.customerPhone}`}><Phone className="h-3.5 w-3.5" /><span dir="ltr">{b.snapshot.customerPhone}</span></a>}
                  </div>
                  {b.customer?.stats && <p className="mt-1 text-xs text-muted-foreground">{t('customers.visits')}: {b.customer.stats.completed} · {t('customers.noShows')}: {b.customer.stats.noShows}</p>}
                </div>
              </div>
            </section>

            {(Object.keys(b.answers ?? {}).length > 0 || b.customerNote) && (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('bookings.answers')}</h3>
                <dl className="space-y-1 text-sm">
                  {Object.entries(b.answers ?? {}).map(([k, v]) => <div key={k} className="flex justify-between gap-4"><dt className="text-muted-foreground">{k}</dt><dd className="text-end font-medium">{String(v)}</dd></div>)}
                </dl>
                {b.customerNote && <p className="mt-2 rounded-xl bg-muted/60 p-3 text-sm"><span className="block text-xs font-semibold">{t('bookings.customerNote')}</span>{b.customerNote}</p>}
              </section>
            )}

            <section className="rounded-2xl border p-4">
              <div className="flex items-center justify-between">
                <p className="num font-semibold">{money(b.price.amount, b.price.currency)}</p>
                <p className="text-sm text-muted-foreground">{tc('manage.paid', { amount: money(b.price.paid, b.price.currency), total: money(b.price.amount, b.price.currency) })}</p>
              </div>
              {outstanding > 0 && can('payments:manage', 'bookings:manage') && !['cancelled', 'rejected'].includes(b.status) && (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => { setCash(String(outstanding)); setCashOpen(true); }}><Banknote />{t('bookings.recordPayment')}</Button>
              )}
            </section>

            {can('bookings:manage', 'bookings:own') && (
              <section className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {ACTIONS.filter((a) => allowed.includes(a.to)).map((a) => (
                    <Button key={a.to} size="sm" variant={a.variant} onClick={() => setAction(a)}>{a.icon}{t(`bookings.${a.key}`)}</Button>
                  ))}
                  {['pending', 'confirmed'].includes(b.status) && <Button size="sm" variant="outline" onClick={() => setResOpen(true)}><CalendarClock />{t('bookings.reschedule')}</Button>}
                </div>
              </section>
            )}

            <section>
              <label htmlFor="bk-notes" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('bookings.internalNotes')}</label>
              <Textarea id="bk-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} />
              <Button size="sm" variant="secondary" className="mt-2" disabled={notes === (b.internalNotes ?? '')} loading={busy} onClick={() => run(() => api.patch(`/businesses/${id}/bookings/${b._id}/notes`, { internalNotes: notes }), t('bookings.notesSaved'))}>{tc('actions.save')}</Button>
            </section>

            <Separator />
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tc('manage.history')}</h3>
              <ol className="space-y-2 text-sm">
                {b.history.map((h, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span>{h.action === 'status' ? `${tc(`status.${h.from}`)} → ${tc(`status.${h.to}`)}` : h.action}{h.byName ? ` · ${h.byName}` : ''}{h.note ? ` — ${h.note}` : ''}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{fmtDateTime(h.at, business.timezone)}</span>
                  </li>
                ))}
              </ol>
            </section>

            {action && (
              <ConfirmDialog
                open={!!action}
                onOpenChange={(o) => !o && setAction(null)}
                title={t(`bookings.${action.key}`)}
                destructive={action.variant === 'destructive'}
                withReason={action.reason}
                reasonLabel={t('bookings.reasonPrompt')}
                onConfirm={async (reason) => {
                  await api.patch(`/businesses/${id}/bookings/${b._id}/status`, { status: action.to, reason });
                  toast.success(t('bookings.statusChanged', { status: tc(`status.${action.to}`) }));
                  refresh();
                }}
              />
            )}

            <Dialog open={resOpen} onOpenChange={setResOpen}>
              <DialogContent title={t('bookings.reschedule')} size="lg">
                {b.service && <SlotPicker base={`/businesses/${id}/bookings`} service={b.service._id} staff={b.staff?._id} attendees={b.attendees} exclude={b._id} timezone={b.timezone} value={slot} onChange={setSlot} />}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setResOpen(false)}>{tc('actions.cancel')}</Button>
                  <Button disabled={!slot} loading={busy} onClick={async () => { if (await run(() => api.post(`/businesses/${id}/bookings/${b._id}/reschedule`, { start: slot!.start }), tc('manage.rescheduled'))) { setResOpen(false); setSlot(null); } }}>{tc('actions.confirm')}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={cashOpen} onOpenChange={setCashOpen}>
              <DialogContent title={t('payments.cash')} size="sm" description={t('payments.outstanding', { amount: money(outstanding, b.price.currency) })}>
                <Input type="number" min={0} step="0.01" max={outstanding} value={cash} onChange={(e) => setCash(e.target.value)} aria-label={tc('common.amount')} />
                <DialogFooter>
                  <Button loading={busy} onClick={async () => { if (await run(() => api.post(`/businesses/${id}/payments/cash`, { booking: b._id, amount: Number(cash) }), t('payments.cashRecorded'))) setCashOpen(false); }}>{tc('actions.confirm')}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
