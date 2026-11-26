import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Flag, Receipt, Star } from 'lucide-react';
import type { RideDTO } from '@masar/shared';
import { api, ApiError, Avatar, Button, Card, ConfirmDialog, ErrorState, fileUrl, MapView, RatingStars, RideStatusBadge, Skeleton, toast, useFormat } from '@masar/ui';
import { NewTicketDialog } from './Support';

interface ReceiptResp {
  ride: RideDTO;
  payments: { id: string; receiptNumber: string; purpose: string; type: string; amount: number; refundedAmount: number; currency: string; status: string; card: { brand: string; last4: string } | null; paidAt: string | null; createdAt: string }[];
}

export function RideDetailPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [report, setReport] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const ar = i18n.language === 'ar';
  const q = useQuery({ queryKey: ['receipt', id], queryFn: () => api.get<ReceiptResp>(`/rides/${id}/receipt`) });
  const hist = useQuery({ queryKey: ['history', id], queryFn: () => api.get<{ statuses: { id: string; toStatus: string; createdAt: string }[]; trail: { lat: number; lng: number }[] }>(`/rides/${id}/history`) });
  const cancel = useMutation({
    mutationFn: () => api.post(`/rides/${id}/cancel`, { reason: 'Scheduled ride cancelled by passenger' }),
    onSuccess: () => {
      toast.success(t('ride.status.CANCELLED'));
      void qc.invalidateQueries({ queryKey: ['rides'] });
      navigate('/rides');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });

  if (q.isLoading) return <div className="mx-auto max-w-3xl space-y-4 px-4 py-6"><Skeleton className="h-64" /><Skeleton className="h-40" /></div>;
  if (q.isError || !q.data) return <ErrorState onRetry={() => void q.refetch()} />;
  const { ride, payments } = q.data;
  const b = ride.fareBreakdown as Record<string, number> | null;
  const trail = hist.data?.trail.map((p) => [p.lat, p.lng] as [number, number]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Link to="/rides" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-fg">
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t('rides.title')}
      </Link>
      <Card className="overflow-hidden">
        <div className="h-56 sm:h-72">
          <MapView
            markers={[
              { id: 'p', kind: 'pickup', ...ride.pickup },
              { id: 'd', kind: 'dropoff', ...ride.dropoff },
            ]}
            route={trail && trail.length > 2 ? trail : ride.routeGeometry}
            fitTo={[[ride.pickup.lat, ride.pickup.lng], [ride.dropoff.lat, ride.dropoff.lng]]}
            fitPadding={[40, 40, 40, 40]}
          />
        </div>
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted">{f.dateTime(ride.scheduledAt ?? ride.requestedAt)} · <span className="font-mono">{ride.code}</span></p>
              <h1 className="mt-1 text-xl font-bold">{ar ? ride.category.nameAr : ride.category.name}</h1>
            </div>
            <RideStatusBadge status={ride.status} scheduled={!!ride.scheduledAt} />
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex gap-3"><span className="mt-1.5 size-2 shrink-0 rounded-full bg-fg" /><div><p className="font-medium">{ride.pickup.address}</p>{ride.startedAt && <p className="text-muted">{f.time(ride.startedAt)}</p>}</div></div>
            <div className="flex gap-3"><span className="mt-1.5 size-2 shrink-0 bg-fg" /><div><p className="font-medium">{ride.dropoff.address}</p>{ride.completedAt && <p className="text-muted">{f.time(ride.completedAt)}</p>}</div></div>
          </div>
          {ride.driver && (
            <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
              <Avatar name={`${ride.driver.firstName} ${ride.driver.lastName}`} src={fileUrl(ride.driver.avatarUrl)} size={44} />
              <div className="flex-1">
                <p className="font-semibold">{ride.driver.firstName} {ride.driver.lastName}</p>
                <p className="text-sm text-muted">{ride.driver.vehicle ? `${ride.driver.vehicle.make} ${ride.driver.vehicle.model} · ${ride.driver.vehicle.plateNumber}` : ''}</p>
              </div>
              <span className="inline-flex items-center gap-1 text-sm font-semibold"><Star className="size-4 fill-amber-400 text-amber-400" />{ride.driver.rating.toFixed(1)}</span>
            </div>
          )}
          {ride.myRating && <div className="flex items-center gap-2 text-sm text-muted"><RatingStars value={ride.myRating.score} />{ride.myRating.comment && <span>“{ride.myRating.comment}”</span>}</div>}
          {ride.cancellationReason && <p className="text-sm text-muted">{ride.cancellationReason}</p>}
        </div>
      </Card>

      <Card className="mt-4 p-5">
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><Receipt className="size-4" /> {t('rides.receipt')}</h2>
        <div className="space-y-1.5 text-sm">
          {b && (
            <>
              <Line label={t('rides.base')} value={f.money(b.baseFare, ride.currency)} />
              <Line label={`${t('rides.distance')} · ${f.distance(ride.estimatedDistanceMeters)}`} value={f.money(b.distanceFare, ride.currency)} />
              <Line label={`${t('rides.time')} · ${f.duration(ride.estimatedDurationSeconds)}`} value={f.money(b.timeFare, ride.currency)} />
              {b.surgeAmount > 0 && <Line label={t('rides.surgeFee')} value={f.money(b.surgeAmount, ride.currency)} />}
              {b.bookingFee > 0 && <Line label={t('rides.booking')} value={f.money(b.bookingFee, ride.currency)} />}
            </>
          )}
          {ride.discount > 0 && <Line label={t('rides.discount')} value={`−${f.money(ride.discount, ride.currency)}`} />}
          {ride.tip > 0 && <Line label={t('rides.tip')} value={f.money(ride.tip, ride.currency)} />}
          {ride.cancellationFee > 0 && <Line label={t('rides.cancellationFee')} value={f.money(ride.cancellationFee, ride.currency)} />}
          <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
            <span>{t('rides.total')}</span>
            <span className="tabular">{f.money((ride.finalFare ?? (ride.status === 'CANCELLED' ? 0 : ride.estimatedFare)) + ride.tip + ride.cancellationFee, ride.currency)}</span>
          </div>
        </div>
        {payments.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-line pt-4">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium">{p.card ? `${p.card.brand.toUpperCase()} •••• ${p.card.last4}` : t(`ride.payment.${p.type}`)} · {p.purpose === 'RIDE' ? t('rides.fare') : p.purpose === 'TIP' ? t('rides.tip') : t('rides.cancellationFee')}</p>
                  <p className="font-mono text-xs text-muted">{p.receiptNumber}</p>
                </div>
                <div className="text-end">
                  <p className="tabular font-semibold">{f.money(p.amount, p.currency)}</p>
                  <p className="text-xs text-muted">{p.status}{p.refundedAmount ? ` · −${f.money(p.refundedAmount, p.currency)}` : ''}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {hist.data && hist.data.statuses.length > 0 && (
        <Card className="mt-4 p-5">
          <h2 className="mb-3 font-semibold">{t('rides.timeline')}</h2>
          <ol className="relative space-y-3 border-s border-line ps-5">
            {hist.data.statuses.map((s) => (
              <li key={s.id} className="relative text-sm">
                <span className="absolute -start-[25px] top-1.5 size-2.5 rounded-full bg-fg ring-4 ring-surface" />
                <span className="font-medium">{t(`ride.status.${s.toStatus}`)}</span> <span className="text-muted">· {f.time(s.createdAt)}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {ride.status === 'REQUESTED' && ride.scheduledAt && (
          <Button variant="danger" onClick={() => setCancelOpen(true)}>{t('rides.cancelScheduled')}</Button>
        )}
        <Button variant="outline" onClick={() => setReport(true)}><Flag /> {t('rides.report')}</Button>
      </div>
      <NewTicketDialog open={report} onOpenChange={setReport} rideId={ride.id} />
      <ConfirmDialog open={cancelOpen} onOpenChange={setCancelOpen} title={t('rides.cancelScheduled')} confirmLabel={t('actions.confirm')} cancelLabel={t('actions.back')} danger loading={cancel.isPending} onConfirm={() => cancel.mutate()} />
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted">
      <span>{label}</span>
      <span className="tabular text-fg">{value}</span>
    </div>
  );
}
