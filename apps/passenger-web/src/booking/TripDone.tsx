import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type { PaymentType, RideDTO } from '@masar/shared';
import {
  api,
  ApiError,
  Avatar,
  Button,
  cn,
  fileUrl,
  RatingStars,
  Textarea,
  toast,
  useFormat,
} from '@masar/ui';
import { PaymentPicker } from './PaymentPicker';

const TAGS = ['clean', 'driving', 'polite', 'route', 'music'] as const;
const TIPS = [0, 500, 1000, 2000];

export function TripDone({ ride, onClose }: { ride: RideDTO; onClose: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const [score, setScore] = useState(5);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [tip, setTip] = useState(0);
  const [pay, setPay] = useState<{ type: PaymentType; id: string | null }>({ type: 'WALLET', id: null });
  const driver = ride.driver;
  const pending = ride.status === 'PAYMENT_PENDING';

  const rate = useMutation({
    mutationFn: () =>
      api.post<{ ride: RideDTO }>(`/rides/${ride.id}/rate`, {
        score,
        comment: comment || undefined,
        tags: tags.map((k) => t(`done.tags.${k}`)),
        tip: tip || undefined,
      }),
    onSuccess: () => {
      toast.success(t('done.thanks'));
      void qc.invalidateQueries({ queryKey: ['rides'] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });

  const settle = useMutation({
    mutationFn: () =>
      api.post<{ status: string; ride: RideDTO }>(`/rides/${ride.id}/pay`, {
        paymentType: pay.type,
        paymentMethodId: pay.id ?? undefined,
      }),
    onSuccess: (r) => {
      qc.setQueryData(['ride', 'active'], r.ride);
      if (r.status === 'SUCCEEDED') toast.success(t('ride.status.PAYMENT_COMPLETED'));
      else toast.error(t('done.paymentFailed'));
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });

  const b = ride.fareBreakdown as Record<string, number> | null;

  return (
    <div className="p-5">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-accent/12"
      >
        <CheckCircle2 className="size-7 text-accent" />
      </motion.div>
      <h2 className="text-center text-2xl font-bold">{t('done.title')}</h2>
      <p className="mt-1 text-center text-sm text-muted">{ride.dropoff.address}</p>

      <div className="mt-5 rounded-2xl bg-surface-2 p-4">
        <div className="flex items-baseline justify-between">
          <span className="font-medium">{t('done.total')}</span>
          <span className="tabular text-2xl font-bold">
            {f.money(ride.finalFare ?? ride.estimatedFare, ride.currency)}
          </span>
        </div>
        {b && (
          <div className="mt-3 space-y-1 border-t border-line pt-3 text-sm text-muted">
            <Row label={t('rides.base')} value={f.money(b.baseFare, ride.currency)} />
            <Row label={t('rides.distance')} value={f.money(b.distanceFare, ride.currency)} />
            <Row label={t('rides.time')} value={f.money(b.timeFare, ride.currency)} />
            {b.surgeAmount > 0 && (
              <Row label={t('rides.surgeFee')} value={f.money(b.surgeAmount, ride.currency)} />
            )}
            {b.bookingFee > 0 && (
              <Row label={t('rides.booking')} value={f.money(b.bookingFee, ride.currency)} />
            )}
            {ride.discount > 0 && (
              <Row
                label={t('rides.discount')}
                value={`−${f.money(ride.discount, ride.currency)}`}
                className="text-accent-600"
              />
            )}
          </div>
        )}
        <p className="mt-3 text-xs text-muted">
          {ride.paymentType === 'CASH'
            ? t('done.cash')
            : pending
              ? ''
              : t('done.paid', { method: t(`ride.payment.${ride.paymentType}`) })}
        </p>
      </div>

      {pending && (
        <div className="mt-4 rounded-2xl border border-warning/40 bg-warning/8 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold">{t('done.paymentFailed')}</p>
              <p className="text-sm text-muted">{t('done.paymentFailedHelp')}</p>
            </div>
          </div>
          <div className="mt-3">
            <PaymentPicker value={pay} onChange={setPay} />
          </div>
          <Button block className="mt-3" loading={settle.isPending} onClick={() => settle.mutate()}>
            {t('done.payNow', { amount: f.money(ride.finalFare ?? 0, ride.currency) })}
          </Button>
        </div>
      )}

      {driver && !pending && (
        <div className="mt-6">
          <div className="flex flex-col items-center gap-2">
            <Avatar
              name={`${driver.firstName} ${driver.lastName}`}
              src={fileUrl(driver.avatarUrl)}
              size={56}
            />
            <p className="text-center font-semibold">{t('done.rate', { name: driver.firstName })}</p>
            <RatingStars value={score} onChange={setScore} size={34} />
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {TAGS.map((k) => (
              <button
                key={k}
                onClick={() => setTags((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]))}
                className={cn(
                  'rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition',
                  tags.includes(k) ? 'bg-primary text-primary-fg ring-primary' : 'ring-line hover:ring-fg',
                )}
              >
                {t(`done.tags.${k}`)}
              </button>
            ))}
          </div>
          <Textarea
            className="mt-4"
            value={comment}
            maxLength={500}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('done.comment')}
          />
          {ride.paymentType !== 'CASH' && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-semibold">{t('done.tip')}</p>
              <div className="grid grid-cols-4 gap-2">
                {TIPS.map((v) => (
                  <button
                    key={v}
                    onClick={() => setTip(v)}
                    className={cn(
                      'h-11 rounded-xl text-sm font-semibold ring-1 transition',
                      tip === v ? 'bg-primary text-primary-fg ring-primary' : 'ring-line hover:ring-fg',
                    )}
                  >
                    {v === 0 ? t('done.noTip') : f.money(v, ride.currency).replace(/\.00/, '')}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mt-5 grid grid-cols-[1fr_2fr] gap-2">
            <Button variant="secondary" size="lg" onClick={onClose}>
              {t('done.skip')}
            </Button>
            <Button size="lg" loading={rate.isPending} onClick={() => rate.mutate()}>
              {t('done.submit')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('flex justify-between', className)}>
      <span>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
