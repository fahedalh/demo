import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { SearchX } from 'lucide-react';
import type { RideDTO } from '@masar/shared';
import { api, ApiError, Button, toast, useFormat } from '@masar/ui';
import { useBooking } from './store';

export function Searching({ ride, failed, onDismiss }: { ride: RideDTO; failed?: boolean; onDismiss?: () => void }) {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const [retrying, setRetrying] = useState(false);
  const ar = i18n.language === 'ar';
  const cancel = useMutation({
    mutationFn: () => api.post<{ ride: RideDTO }>(`/rides/${ride.id}/cancel`, { reason: 'Cancelled while searching' }),
    onSuccess: () => {
      qc.setQueryData(['ride', 'active'], null);
      void qc.invalidateQueries({ queryKey: ['ride', 'active'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });

  const retry = async () => {
    setRetrying(true);
    try {
      const res = await api.post<{ ride: RideDTO }>('/rides', {
        pickup: ride.pickup,
        dropoff: ride.dropoff,
        categoryCode: ride.category.code,
        paymentType: ride.paymentType,
        pickupNotes: ride.pickupNotes ?? undefined,
      });
      sessionStorage.removeItem('masar.dismissedRide');
      qc.setQueryData(['ride', 'active'], res.ride);
      onDismiss?.();
      qc.setQueryData(['ride', 'active'], res.ride);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('errors.generic'));
    } finally {
      setRetrying(false);
    }
  };

  if (failed) {
    return (
      <div className="p-6 text-center">
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-surface-2"><SearchX className="size-7 text-muted" /></div>
        <h2 className="text-xl font-bold">{t(`failed.${ride.status === 'EXPIRED' ? 'EXPIRED' : 'NO_DRIVER_AVAILABLE'}`)}</h2>
        <p className="mt-2 text-sm text-muted">{ride.pickup.address} → {ride.dropoff.address}</p>
        <div className="mt-6 grid gap-2">
          <Button size="lg" loading={retrying} onClick={retry}>{t('failed.tryAgain')}</Button>
          <Button size="lg" variant="secondary" onClick={() => { onDismiss?.(); useBooking.getState().reset(); }}>{t('failed.newRide')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="relative mx-auto my-4 grid size-32 place-items-center" aria-hidden>
        {[0, 0.6, 1.2].map((d) => (
          <motion.span key={d} className="absolute inset-0 rounded-full bg-accent/25" initial={{ scale: 0.3, opacity: 0.8 }} animate={{ scale: 1.2, opacity: 0 }} transition={{ duration: 1.8, delay: d, repeat: Infinity, ease: 'easeOut' }} />
        ))}
        <span className="relative grid size-14 place-items-center rounded-full bg-primary shadow-float">
          <span className="size-3 rounded-full bg-accent" />
        </span>
      </div>
      <h2 className="text-center text-xl font-bold">{t('searching.title')}</h2>
      <p className="mt-1 text-center text-sm text-muted">{t('searching.subtitle', { category: ar ? ride.category.nameAr : ride.category.name })}</p>
      <div className="mt-5 overflow-hidden rounded-full bg-surface-2">
        <motion.div className="h-1 bg-accent" initial={{ x: '-100%' }} animate={{ x: '100%' }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }} style={{ width: '40%' }} />
      </div>
      <div className="mt-5 space-y-2 rounded-2xl bg-surface-2 p-4 text-sm">
        <div className="flex items-center gap-3"><span className="size-2 rounded-full bg-fg" /><span className="truncate">{ride.pickup.address}</span></div>
        <div className="flex items-center gap-3"><span className="size-2 bg-fg" /><span className="truncate">{ride.dropoff.address}</span></div>
        <div className="flex items-center justify-between border-t border-line pt-2 font-semibold">
          <span>{t(`ride.payment.${ride.paymentType}`)}</span>
          <span className="tabular">{f.money(ride.estimatedFare, ride.currency)}</span>
        </div>
      </div>
      {ride.pickupNotes && <p className="mt-3 text-center text-xs text-muted">“{ride.pickupNotes}”</p>}
      <Button variant="secondary" size="lg" block className="mt-5" loading={cancel.isPending} onClick={() => cancel.mutate()}>
        {t('searching.cancel')}
      </Button>
    </div>
  );
}
