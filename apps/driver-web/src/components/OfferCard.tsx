import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { MessageSquareText, Star } from 'lucide-react';
import type { RideDTO, RideOfferDTO } from '@masar/shared';
import { api, ApiError, Badge, Button, toast, useFormat } from '@masar/ui';

/** Full-width incoming request with a countdown ring. Large touch targets for in-car use. */
export function OfferCard({ offer, onClose }: { offer: RideOfferDTO; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const ar = i18n.language === 'ar';
  const total = Math.max(1, (new Date(offer.expiresAt).getTime() - Date.now()) / 1000);
  const [left, setLeft] = useState(total);
  useEffect(() => {
    const iv = setInterval(() => {
      const l = (new Date(offer.expiresAt).getTime() - Date.now()) / 1000;
      setLeft(l);
      if (l <= 0) onClose();
    }, 200);
    return () => clearInterval(iv);
  }, [offer.expiresAt, onClose]);

  const accept = useMutation({
    mutationFn: () => api.post<{ ride: RideDTO }>(`/driver/offers/${offer.offerId}/accept`),
    onSuccess: ({ ride }) => {
      qc.setQueryData(['ride', 'active'], ride);
      onClose();
    },
    onError: (e) => {
      toast.error(e instanceof ApiError ? e.message : t('offer.taken'));
      onClose();
    },
  });
  const decline = useMutation({
    mutationFn: () => api.post(`/driver/offers/${offer.offerId}/reject`),
    onSettled: onClose,
  });

  const r = offer.ride;
  const pct = Math.max(0, Math.min(1, left / Math.min(total, 30)));
  const C = 2 * Math.PI * 26;
  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 28, stiffness: 280 }}
      className="fixed inset-x-0 bottom-0 z-[900] rounded-t-3xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0_-12px_60px_rgba(0,0,0,.25)] md:inset-x-auto md:start-1/2 md:bottom-6 md:w-[480px] md:rounded-3xl ltr:md:-translate-x-1/2 rtl:md:translate-x-1/2"
      role="alertdialog"
      aria-label={t('offer.title')}
    >
      <div className="flex items-start gap-4">
        <div className="relative size-16 shrink-0">
          <svg viewBox="0 0 60 60" className="size-16 -rotate-90">
            <circle cx="30" cy="30" r="26" fill="none" stroke="var(--line)" strokeWidth="5" />
            <circle
              cx="30"
              cy="30"
              r="26"
              fill="none"
              stroke="#06C167"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - pct)}
              style={{ transition: 'stroke-dashoffset .2s linear' }}
            />
          </svg>
          <span className="tabular absolute inset-0 grid place-items-center text-lg font-bold">
            {Math.max(0, Math.ceil(left))}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge tone="dark">{ar ? r.category.nameAr : r.category.name}</Badge>
            <Badge>{t(`ride.payment.${r.paymentType}`)}</Badge>
            {r.surgeMultiplier > 1 && <Badge tone="warning">×{r.surgeMultiplier}</Badge>}
          </div>
          <p className="tabular mt-2 text-3xl font-bold">{f.money(offer.estimatedEarning, r.currency)}</p>
          <p className="text-xs text-muted">{t('offer.earn')}</p>
        </div>
        {r.passenger && (
          <div className="text-end text-sm">
            <p className="font-semibold">{r.passenger.firstName}</p>
            <p className="inline-flex items-center gap-1 text-muted">
              <Star className="size-3.5 fill-amber-400 text-amber-400" />
              {r.passenger.rating.toFixed(1)}
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 space-y-3 rounded-2xl bg-surface-2 p-4">
        <div className="flex gap-3">
          <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-fg" />
          <div className="min-w-0">
            <p className="truncate font-semibold">{r.pickup.address}</p>
            <p className="text-xs text-muted">
              {t('offer.pickupIn', {
                min: Math.max(1, Math.round(offer.pickupEtaSeconds / 60)),
                distance: f.distance(offer.pickupDistanceMeters),
              })}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <span className="mt-1.5 size-2.5 shrink-0 bg-fg" />
          <div className="min-w-0">
            <p className="truncate font-semibold">{r.dropoff.address}</p>
            <p className="text-xs text-muted">
              {t('offer.trip', {
                distance: f.distance(r.estimatedDistanceMeters),
                duration: f.duration(r.estimatedDurationSeconds),
              })}
            </p>
          </div>
        </div>
        {r.pickupNotes && (
          <p className="flex gap-2 border-t border-line pt-3 text-sm">
            <MessageSquareText className="mt-0.5 size-4 shrink-0 text-muted" />
            {r.pickupNotes}
          </p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-[1fr_2fr] gap-3">
        <Button
          size="lg"
          variant="secondary"
          className="h-16"
          loading={decline.isPending}
          onClick={() => decline.mutate()}
        >
          {t('offer.decline')}
        </Button>
        <Button
          size="lg"
          variant="accent"
          className="h-16 text-lg"
          loading={accept.isPending}
          onClick={() => accept.mutate()}
        >
          {t('offer.accept')}
        </Button>
      </div>
    </motion.div>
  );
}
