import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowLeft, CalendarClock, ChevronRight, MessageSquareText, Tag, Users, Zap } from 'lucide-react';
import type { EstimateResponse, FareEstimateDTO, RideDTO } from '@masar/shared';
import { api, ApiError, Button, cn, Dialog, DialogContent, ErrorState, Field, Input, Skeleton, Textarea, toast, useFormat } from '@masar/ui';
import { useBooking } from './store';
import { PaymentPicker, usePaymentLabel } from './PaymentPicker';
import { CarIllustration } from './CarIllustration';

export function RideOptions() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const b = useBooking();
  const qc = useQueryClient();
  const ar = i18n.language === 'ar';
  const [dialog, setDialog] = useState<null | 'payment' | 'promo' | 'schedule' | 'notes'>(null);

  const estimate = useQuery({
    queryKey: ['estimate', b.pickup?.lat, b.pickup?.lng, b.dropoff?.lat, b.dropoff?.lng, b.couponCode],
    enabled: !!b.pickup && !!b.dropoff,
    queryFn: () => api.post<EstimateResponse>('/rides/estimate', { pickup: b.pickup, dropoff: b.dropoff, couponCode: b.couponCode ?? undefined }),
    staleTime: 30_000,
  });
  useEffect(() => {
    useBooking.getState().set({ route: estimate.data?.route.geometry ?? null });
  }, [estimate.data]);
  useEffect(() => {
    if (estimate.data?.coupon && !estimate.data.coupon.valid) {
      toast.error(estimate.data.coupon.message ?? 'Invalid promo code');
      useBooking.getState().set({ couponCode: null });
    }
  }, [estimate.data?.coupon]);

  const options = estimate.data?.options ?? [];
  const selected = options.find((o) => o.category.code === b.categoryCode) ?? options[0];
  const paymentLabel = usePaymentLabel();

  const book = useMutation({
    mutationFn: () =>
      api.post<{ ride: RideDTO }>(
        '/rides',
        {
          pickup: b.pickup,
          dropoff: b.dropoff,
          categoryCode: selected!.category.code,
          paymentType: b.paymentType,
          paymentMethodId: b.paymentType === 'CARD' ? b.paymentMethodId ?? undefined : undefined,
          couponCode: b.couponCode ?? undefined,
          pickupNotes: b.notes || undefined,
          scheduledAt: b.scheduledAt?.toISOString(),
        },
        // Idempotency key: a retried/double-tapped request never creates two rides.
        { 'Idempotency-Key': `${b.pickup!.lat},${b.pickup!.lng}>${b.dropoff!.lat},${b.dropoff!.lng}@${Math.floor(Date.now() / 30_000)}` },
      ),
    onSuccess: ({ ride }) => {
      if (ride.scheduledAt) {
        toast.success(t('book.scheduledOk', { time: f.dateTime(ride.scheduledAt) }));
        void qc.invalidateQueries({ queryKey: ['rides'] });
        useBooking.getState().reset();
        return;
      }
      sessionStorage.removeItem('masar.dismissedRide');
      qc.setQueryData(['ride', 'active'], ride);
      useBooking.getState().set({ stage: 'home', dropoff: null, couponCode: null, notes: '', scheduledAt: null, route: null });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });

  if (estimate.isError) {
    return (
      <div className="p-5">
        <BackRow />
        <ErrorState message={(estimate.error as Error).message} onRetry={() => void estimate.refetch()} />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="p-5 pb-3">
        <BackRow />
        {estimate.data && (
          <p className="text-sm text-muted">
            {t('book.trip', { distance: f.distance(estimate.data.route.distanceMeters), duration: f.duration(estimate.data.route.durationSeconds) })}
          </p>
        )}
      </div>

      <div className="space-y-1.5 px-3" role="radiogroup" aria-label={t('book.chooseRide')}>
        {estimate.isLoading &&
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="mx-2 h-[76px]" />)}
        {options.map((o) => (
          <OptionRow key={o.category.id} option={o} active={selected?.category.code === o.category.code} ar={ar} onSelect={() => b.set({ categoryCode: o.category.code })} />
        ))}
      </div>

      <p className="px-5 pt-3 text-xs text-muted">{t('book.fareLocked')}</p>

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line px-5 pt-4">
        <Chip icon={<span className="text-base">💳</span>} label={paymentLabel} onClick={() => setDialog('payment')} />
        <Chip icon={<Tag className="size-4" />} label={b.couponCode ? t('book.promoApplied', { code: b.couponCode }) : t('book.addPromo')} active={!!b.couponCode} onClick={() => setDialog('promo')} />
        <Chip icon={<CalendarClock className="size-4" />} label={b.scheduledAt ? f.dateTime(b.scheduledAt) : t('book.now')} active={!!b.scheduledAt} onClick={() => setDialog('schedule')} />
        <Chip icon={<MessageSquareText className="size-4" />} label={b.notes || t('book.notes')} active={!!b.notes} onClick={() => setDialog('notes')} />
      </div>

      <div className="sticky bottom-0 bg-surface p-5 pt-4">
        <Button size="lg" block disabled={!selected || book.isPending} loading={book.isPending} onClick={() => book.mutate()}>
          {selected
            ? (b.scheduledAt ? t('book.confirmScheduled', { name: ar ? selected.category.nameAr : selected.category.name }) : t('book.confirm', { name: ar ? selected.category.nameAr : selected.category.name }))
            : t('state.loading')}
        </Button>
      </div>

      <Dialog open={dialog === 'payment'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title={t('book.payment')}>
          <PaymentPicker onDone={() => setDialog(null)} />
        </DialogContent>
      </Dialog>
      <PromoDialog open={dialog === 'promo'} onClose={() => setDialog(null)} />
      <ScheduleDialog open={dialog === 'schedule'} onClose={() => setDialog(null)} />
      <NotesDialog open={dialog === 'notes'} onClose={() => setDialog(null)} />
    </div>
  );
}

function BackRow() {
  const { t } = useTranslation();
  const b = useBooking();
  return (
    <div className="mb-2 flex items-center gap-2">
      <Button variant="ghost" size="icon-sm" onClick={() => b.set({ stage: 'search', route: null })} aria-label={t('actions.back')}>
        <ArrowLeft className="rtl:rotate-180" />
      </Button>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-bold">{t('book.chooseRide')}</h2>
        <p className="truncate text-xs text-muted">{b.pickup?.address} → {b.dropoff?.address}</p>
      </div>
    </div>
  );
}

function OptionRow({ option: o, active, ar, onSelect }: { option: FareEstimateDTO; active: boolean; ar: boolean; onSelect: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  return (
    <motion.button
      layout
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={cn('flex w-full items-center gap-3 rounded-2xl p-2.5 pe-4 text-start ring-2 transition', active ? 'bg-surface-2 ring-fg' : 'ring-transparent hover:bg-surface-2')}
    >
      <CarIllustration code={o.category.code} className="h-14 w-20 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-bold">{ar ? o.category.nameAr : o.category.name}</span>
          <span className="inline-flex items-center gap-0.5 text-xs text-muted"><Users className="size-3" />{o.category.capacity}</span>
          {o.surgeMultiplier > 1 && <span className="inline-flex items-center gap-0.5 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400"><Zap className="size-3" />×{o.surgeMultiplier}</span>}
        </div>
        <p className="truncate text-xs text-muted">
          {o.etaSeconds != null ? t('book.away', { min: Math.max(1, Math.round(o.etaSeconds / 60)) }) : t('book.noCars')} · {ar ? o.category.descriptionAr : o.category.description}
        </p>
      </div>
      <div className="text-end">
        <p className="tabular font-bold">{f.money(o.fare, o.currency)}</p>
        {o.discount > 0 && <p className="tabular text-xs text-muted line-through">{f.money(o.fareBeforeDiscount, o.currency)}</p>}
      </div>
    </motion.button>
  );
}

function Chip({ icon, label, onClick, active }: { icon: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} className={cn('flex h-11 min-w-0 items-center gap-2 rounded-xl px-3 text-sm font-medium transition', active ? 'bg-accent/12 text-accent-600 dark:text-accent' : 'bg-surface-2 hover:bg-line')}>
      {icon}
      <span className="min-w-0 flex-1 truncate text-start">{label}</span>
      <ChevronRight className="size-4 shrink-0 text-muted rtl:rotate-180" />
    </button>
  );
}

function PromoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const b = useBooking();
  const [code, setCode] = useState(b.couponCode ?? '');
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t('book.promo')}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            b.set({ couponCode: code.trim().toUpperCase() || null });
            onClose();
          }}
        >
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WELCOME20" className="font-mono uppercase" autoFocus />
          <div className="flex gap-2">
            {b.couponCode && (
              <Button type="button" variant="secondary" className="flex-1" onClick={() => { b.set({ couponCode: null }); setCode(''); onClose(); }}>
                {t('book.remove')}
              </Button>
            )}
            <Button type="submit" className="flex-1">{t('actions.apply')}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ScheduleDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const b = useBooking();
  const min = new Date(Date.now() + 15 * 60_000);
  const [value, setValue] = useState(toLocalInput(b.scheduledAt ?? new Date(Date.now() + 60 * 60_000)));
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t('book.scheduleTitle')} description={t('book.scheduleHelp')}>
        <div className="space-y-4">
          <Field error={error ?? undefined}>
            <Input type="datetime-local" value={value} min={toLocalInput(min)} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => { b.set({ scheduledAt: null }); onClose(); }}>{t('book.now')}</Button>
            <Button
              className="flex-1"
              onClick={() => {
                const d = new Date(value);
                if (isNaN(d.getTime()) || d.getTime() < Date.now() + 10 * 60_000) return setError('Schedule at least 15 minutes ahead');
                b.set({ scheduledAt: d });
                onClose();
              }}
            >
              {t('actions.confirm')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NotesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const b = useBooking();
  const [v, setV] = useState(b.notes);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t('book.notes')}>
        <Textarea value={v} maxLength={280} onChange={(e) => setV(e.target.value)} placeholder={t('book.notesPlaceholder')} autoFocus />
        <Button block className="mt-4" onClick={() => { b.set({ notes: v.trim() }); onClose(); }}>{t('actions.save')}</Button>
      </DialogContent>
    </Dialog>
  );
}
