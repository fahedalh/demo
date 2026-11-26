import { useMutation } from '@tanstack/react-query';
import { CalendarPlus, CreditCard, MapPin, Navigation, RefreshCw, Star, Video, XCircle } from 'lucide-react';
import { DateTime } from 'luxon';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ConfirmDialog, StarInput, Stars, StatusBadge } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';
import { Avatar, Card, Separator } from '@/components/ui/misc';
import { api, errorMessage } from '@/services/api';
import type { Booking, Slot } from '@/types';
import { fmtDate, fmtDateTime, fmtTime, money } from '@/utils/format';
import { SlotPicker } from './SlotPicker';

type Access = { kind: 'user' } | { kind: 'guest'; email: string };

function icsFor(b: Booking) {
  const f = (iso: string) => DateTime.fromISO(iso).toUTC().toFormat("yyyyLLdd'T'HHmmss'Z'");
  const body = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bookly//EN', 'BEGIN:VEVENT',
    `UID:${b.reference}@bookly`, `DTSTAMP:${f(new Date().toISOString())}`, `DTSTART:${f(b.start)}`, `DTEND:${f(b.end)}`,
    `SUMMARY:${b.snapshot.serviceName} — ${b.business.name}`,
    `DESCRIPTION:Reference ${b.reference}`,
    `LOCATION:${[b.branch?.name, b.business.address?.city].filter(Boolean).join(', ')}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([body], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${b.reference}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ManageBooking({ booking: b, access, onChanged }: { booking: Booking; access: Access; onChanged: () => void }) {
  const { t } = useTranslation();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [resOpen, setResOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  const upcoming = ['pending', 'confirmed'].includes(b.status) && new Date(b.end) > new Date();
  const outstanding = Math.max(0, (b.price?.amount ?? 0) - (b.price?.paid ?? 0));
  const loc = b.business.address?.location?.coordinates;
  const policy = b.business.settings?.cancellation;
  const hoursLeft = (new Date(b.start).getTime() - Date.now()) / 3_600_000;
  const lateFee = policy && hoursLeft < policy.cutoffHours && policy.feePercent ? Math.round((b.price.amount * policy.feePercent) / 100) : 0;
  const guestBody = access.kind === 'guest' ? { reference: b.reference, email: access.email } : {};

  const pay = useMutation({
    mutationFn: () => (access.kind === 'user' ? api.post<{ checkoutUrl: string }>(`/me/bookings/${b._id}/pay`) : api.post<{ checkoutUrl: string }>('/public/bookings/track/pay', guestBody)),
    onSuccess: (r) => window.location.assign(r.checkoutUrl),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const resched = useMutation({
    mutationFn: () => (access.kind === 'user' ? api.post(`/me/bookings/${b._id}/reschedule`, { start: slot!.start }) : api.post('/public/bookings/track/reschedule', { ...guestBody, start: slot!.start })),
    onSuccess: () => {
      toast.success(t('manage.rescheduled'));
      setResOpen(false);
      setSlot(null);
      onChanged();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const review = useMutation({
    mutationFn: () => api.post(`/me/bookings/${b._id}/review`, { rating, comment: comment || undefined }),
    onSuccess: () => {
      toast.success(t('manage.reviewThanks'));
      setReviewOpen(false);
      onChanged();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr,320px]">
      <Card className="overflow-hidden">
        <div className="h-2" style={{ background: b.business.branding?.primaryColor ?? 'hsl(var(--primary))' }} />
        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">{t('booking.reference')}</p>
              <p className="num text-lg font-bold tracking-wider">{b.reference}</p>
            </div>
            <StatusBadge status={b.status} />
          </div>
          <h2 className="mt-5 text-2xl font-bold">{b.snapshot.serviceName}</h2>
          <Link to={`/b/${b.business.slug}`} className="text-primary hover:underline">{b.business.name}</Link>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-muted/50 p-4">
              <p className="text-xs text-muted-foreground">{t('common.date')}</p>
              <p className="font-semibold">{fmtDate(b.start, b.timezone)}</p>
              <p className="num text-sm">{fmtTime(b.start, b.timezone)} – {fmtTime(b.end, b.timezone)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{t('common.timezoneNote', { tz: b.timezone })}</p>
            </div>
            <div className="rounded-2xl bg-muted/50 p-4">
              {b.staff ? (
                <div className="flex items-center gap-3"><Avatar name={b.staff.name} src={b.staff.avatar} color={b.staff.color} /><div><p className="font-semibold">{b.staff.name}</p><p className="text-xs text-muted-foreground">{b.staff.title}</p></div></div>
              ) : b.resource ? (
                <p className="font-semibold">{b.resource.name} <span className="block text-xs font-normal text-muted-foreground">{b.resource.type}</span></p>
              ) : null}
              {b.mode === 'online' ? (
                <p className="mt-2 flex items-start gap-1.5 text-sm"><Video className="mt-0.5 h-4 w-4 shrink-0" />{t('manage.joinOnline')}</p>
              ) : (
                b.branch && <p className="mt-2 flex items-start gap-1.5 text-sm"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{b.branch.name}</p>
              )}
            </div>
          </div>

          {b.price.amount > 0 && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
              <div>
                <p className="num font-semibold">{money(b.price.amount, b.price.currency)}</p>
                <p className="text-xs text-muted-foreground">{t('manage.paid', { amount: money(b.price.paid, b.price.currency), total: money(b.price.amount, b.price.currency) })}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={b.price.status} />
                {upcoming && outstanding > 0 && <Button size="sm" variant="brand" loading={pay.isPending} onClick={() => pay.mutate()}><CreditCard />{t('manage.pay', { amount: money(b.price.deposit > b.price.paid ? b.price.deposit - b.price.paid : outstanding, b.price.currency) })}</Button>}
              </div>
            </div>
          )}

          {b.cancellation?.at && (
            <p className="mt-4 rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">{t('status.cancelled')} · {fmtDateTime(b.cancellation.at)}{b.cancellation.reason ? ` — ${b.cancellation.reason}` : ''}{b.cancellation.fee ? ` · ${money(b.cancellation.fee, b.price.currency)}` : ''}</p>
          )}

          {b.review && (
            <div className="mt-5 rounded-2xl border p-4">
              <p className="mb-1 text-sm font-semibold">{t('manage.yourReview')}</p>
              <Stars value={b.review.rating} />
              {b.review.comment && <p className="mt-2 text-sm">{b.review.comment}</p>}
            </div>
          )}
        </div>
      </Card>

      <div className="space-y-3">
        <Card className="space-y-2 p-4">
          {upcoming && (
            <>
              <Button variant="outline" className="w-full justify-start" onClick={() => icsFor(b)}><CalendarPlus />{t('manage.addToCalendar')}</Button>
              {loc && b.mode !== 'online' && (
                <Button variant="outline" className="w-full justify-start" asChild>
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${loc[1]},${loc[0]}`} target="_blank" rel="noreferrer"><Navigation />{t('manage.directions')}</a>
                </Button>
              )}
              {b.business.settings?.reschedule?.allowed !== false && <Button variant="outline" className="w-full justify-start" onClick={() => setResOpen(true)}><RefreshCw />{t('manage.reschedule')}</Button>}
              {policy?.allowed !== false && <Button variant="outline" className="w-full justify-start text-destructive hover:text-destructive" onClick={() => setCancelOpen(true)}><XCircle />{t('manage.cancel')}</Button>}
            </>
          )}
          {access.kind === 'user' && b.status === 'completed' && !b.review && <Button variant="brand" className="w-full" onClick={() => setReviewOpen(true)}><Star />{t('manage.review')}</Button>}
          {!upcoming && !(b.status === 'completed' && !b.review) && <Button variant="outline" className="w-full" asChild><Link to={`/b/${b.business.slug}`}>{t('booking.addAnother')}</Link></Button>}
        </Card>
        <Card className="p-4">
          <p className="mb-3 text-sm font-semibold">{t('manage.history')}</p>
          <ol className="space-y-3 text-sm">
            {b.history.map((h, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
                <span>
                  <span className="font-medium capitalize">{h.to && h.action === 'status' ? t(`status.${h.to}`) : h.action === 'rescheduled' ? t('manage.rescheduled') : h.action === 'created' ? t('status.' + (h.to ?? 'pending')) : h.action}</span>
                  <span className="block text-xs text-muted-foreground">{fmtDateTime(h.at)}{h.note ? ` · ${h.note}` : ''}</span>
                </span>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={t('manage.cancelTitle')}
        description={lateFee ? t('manage.cancelFee', { amount: money(lateFee, b.price.currency) }) : t('manage.cancelBody')}
        destructive
        withReason
        reasonLabel={t('manage.reason')}
        confirmLabel={t('manage.cancel')}
        onConfirm={async (reason) => {
          if (access.kind === 'user') await api.post(`/me/bookings/${b._id}/cancel`, { reason });
          else await api.post('/public/bookings/track/cancel', { ...guestBody, reason });
          toast.success(t('manage.cancelled'));
          onChanged();
        }}
      />

      <Dialog open={resOpen} onOpenChange={setResOpen}>
        <DialogContent title={t('manage.rescheduleTitle')} size="lg">
          {b.service && <SlotPicker base={`/public/businesses/${b.business.slug}`} service={b.service._id} staff={b.staff?._id} attendees={b.attendees} timezone={b.timezone} value={slot} onChange={setSlot} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setResOpen(false)}>{t('actions.cancel')}</Button>
            <Button variant="brand" disabled={!slot} loading={resched.isPending} onClick={() => resched.mutate()}>{t('actions.confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent title={t('manage.reviewTitle')} size="sm">
          <div className="flex justify-center"><StarInput value={rating} onChange={setRating} /></div>
          <Separator className="my-4" />
          <Textarea placeholder={t('manage.reviewPlaceholder')} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} aria-label={t('manage.reviewPlaceholder')} />
          <DialogFooter>
            <Button variant="brand" loading={review.isPending} onClick={() => review.mutate()}>{t('actions.submit')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
