import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MessageCircle, Phone, Share2, ShieldAlert, Star, Send } from 'lucide-react';
import { haversine, type DriverLocationPayload, type MessageDTO, type RideDTO } from '@masar/shared';
import {
  api,
  ApiError,
  Avatar,
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  fileUrl,
  Input,
  Textarea,
  toast,
  useAuth,
  useFormat,
  useSocketEvent,
  cn,
} from '@masar/ui';

const CONFIG_KEY = ['config'];

export function LiveTrip({ ride, driverLoc }: { ride: RideDTO; driverLoc: DriverLocationPayload | null }) {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const [chatOpen, setChatOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [sosOpen, setSosOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [unread, setUnread] = useState(0);
  const ar = i18n.language === 'ar';
  const d = ride.driver!;
  const v = d.vehicle;
  const { data: config } = useQuery({
    queryKey: CONFIG_KEY,
    queryFn: () => api.get<{ freeCancellationSeconds: number }>('/catalog/config'),
    staleTime: Infinity,
  });

  // ETA: remaining straight-line distance at city speed (refreshes with each location ping).
  const pos = driverLoc ?? d.location;
  const target = ride.status === 'IN_PROGRESS' ? ride.dropoff : ride.pickup;
  const etaMin = pos ? Math.max(1, Math.round(((haversine(pos, target) * 1.3) / 1000 / 30) * 60)) : null;

  const onMessage = useCallback(
    (m: MessageDTO) => {
      if (m.rideId === ride.id && m.senderId !== useAuth.getState().user?.id && !chatOpen)
        setUnread((u) => u + 1);
    },
    [ride.id, chatOpen],
  );
  useSocketEvent('ride:message', onMessage);

  const freeWindowOver =
    ride.acceptedAt && config
      ? Date.now() - new Date(ride.acceptedAt).getTime() > config.freeCancellationSeconds * 1000
      : false;
  const feeApplies = ride.status === 'ARRIVED' || freeWindowOver;

  const cancel = useMutation({
    mutationFn: () =>
      api.post<{ ride: RideDTO }>(`/rides/${ride.id}/cancel`, { reason: reason || undefined }),
    onSuccess: ({ ride: r }) => {
      setCancelOpen(false);
      qc.setQueryData(['ride', 'active'], null);
      toast.success(
        r.cancellationFee
          ? `${t('ride.status.CANCELLED')} · ${f.money(r.cancellationFee, r.currency)}`
          : t('ride.status.CANCELLED'),
      );
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });

  const sos = useMutation({
    mutationFn: () => api.post(`/rides/${ride.id}/sos`, { lat: pos?.lat, lng: pos?.lng }),
    onSuccess: () => {
      setSosOpen(false);
      toast.success(t('trip.sosSent'));
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });

  const share = async () => {
    const text = `${t('brand')} · ${ride.code}\n${v ? `${v.make} ${v.model} · ${v.plateNumber}` : ''}\n${ride.pickup.address} → ${ride.dropoff.address}`;
    try {
      if (navigator.share) await navigator.share({ title: `${t('brand')} ${ride.code}`, text });
      else {
        await navigator.clipboard.writeText(text);
        toast.success(t('trip.shared'));
      }
    } catch {
      /* user cancelled share */
    }
  };

  const headline =
    ride.status === 'ARRIVED'
      ? t('trip.arrived')
      : ride.status === 'IN_PROGRESS'
        ? t('trip.onTrip')
        : t('trip.arriving');
  const sub =
    ride.status === 'ARRIVED'
      ? t('trip.arrivedHelp')
      : ride.status === 'IN_PROGRESS'
        ? etaMin != null
          ? t('trip.eta', { time: f.time(new Date(Date.now() + etaMin * 60_000)) })
          : ''
        : etaMin != null
          ? t('trip.arrivingIn', { min: etaMin })
          : '';

  return (
    <div>
      <div className={cn('px-5 py-4', ride.status === 'ARRIVED' ? 'bg-accent text-white' : 'bg-surface')}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className={cn('text-xl font-bold', ride.status === 'ARRIVED' && 'text-white')}>{headline}</h2>
            <p className={cn('text-sm', ride.status === 'ARRIVED' ? 'text-white/85' : 'text-muted')}>{sub}</p>
          </div>
          {ride.status !== 'IN_PROGRESS' && ride.startPin && (
            <div
              className={cn(
                'rounded-2xl px-3 py-2 text-center',
                ride.status === 'ARRIVED' ? 'bg-white/15' : 'bg-surface-2',
              )}
              title={t('trip.pinHelp')}
            >
              <p
                className={cn(
                  'text-[10px] font-semibold uppercase tracking-wider',
                  ride.status === 'ARRIVED' ? 'text-white/80' : 'text-muted',
                )}
              >
                {t('trip.pin')}
              </p>
              <p className="tabular text-xl font-bold tracking-[0.2em]" dir="ltr">
                {ride.startPin}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar name={`${d.firstName} ${d.lastName}`} src={fileUrl(d.avatarUrl)} size={60} />
            <span className="absolute -bottom-1 start-1/2 inline-flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-surface px-1.5 py-0.5 text-xs font-bold shadow-soft ring-1 ring-line rtl:translate-x-1/2">
              <Star className="size-3 fill-amber-400 text-amber-400" />
              {d.rating.toFixed(1)}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold">
              {d.firstName} {d.lastName}
            </p>
            <p className="text-sm text-muted">{t('trip.trips', { count: d.completedRides })}</p>
          </div>
          {v && (
            <div className="text-end">
              <p
                className="rounded-lg bg-surface-2 px-2.5 py-1 font-mono text-sm font-bold tracking-wide"
                dir="ltr"
              >
                {v.plateNumber}
              </p>
              <p className="mt-1 text-xs text-muted">
                {t('trip.vehicle', { color: v.color, make: v.make, model: v.model })}
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => {
              setChatOpen(true);
              setUnread(0);
            }}
            className="relative flex flex-col items-center gap-1.5 rounded-2xl bg-surface-2 py-3 text-xs font-semibold transition hover:bg-line"
          >
            <MessageCircle className="size-5" />
            {t('actions.message')}
            {unread > 0 && (
              <span className="absolute end-3 top-2 grid size-5 place-items-center rounded-full bg-accent text-[10px] text-white">
                {unread}
              </span>
            )}
          </button>
          <a
            href={d.phone ? `tel:${d.phone}` : undefined}
            className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface-2 py-3 text-xs font-semibold transition hover:bg-line"
            aria-disabled={!d.phone}
          >
            <Phone className="size-5" />
            {t('actions.call')}
          </a>
          <button
            onClick={share}
            className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface-2 py-3 text-xs font-semibold transition hover:bg-line"
          >
            <Share2 className="size-5" />
            {t('trip.share')}
          </button>
        </div>

        <div className="space-y-2 rounded-2xl border border-line p-4 text-sm">
          <div className="flex items-center gap-3">
            <span className="size-2 rounded-full bg-fg" />
            <span className="truncate">{ride.pickup.address}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="size-2 bg-fg" />
            <span className="truncate">{ride.dropoff.address}</span>
          </div>
          <div className="flex items-center justify-between border-t border-line pt-2">
            <span className="text-muted">
              {ar ? ride.category.nameAr : ride.category.name} · {t(`ride.payment.${ride.paymentType}`)}
            </span>
            <span className="tabular font-bold">{f.money(ride.estimatedFare, ride.currency)}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 border-danger/30 text-danger hover:bg-danger/5"
            onClick={() => setSosOpen(true)}
          >
            <ShieldAlert /> {t('trip.sos')}
          </Button>
          {ride.status !== 'IN_PROGRESS' && (
            <Button variant="secondary" className="flex-1" onClick={() => setCancelOpen(true)}>
              {t('trip.cancelRide')}
            </Button>
          )}
        </div>
      </div>

      <ChatDialog open={chatOpen} onOpenChange={setChatOpen} ride={ride} />

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={t('trip.cancelTitle')}
        description={feeApplies ? t('trip.cancelFee') : t('trip.cancelFree')}
        confirmLabel={t('trip.cancelRide')}
        cancelLabel={t('trip.keep')}
        danger
        loading={cancel.isPending}
        onConfirm={() => cancel.mutate()}
      >
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('trip.reason')}
          maxLength={200}
        />
      </ConfirmDialog>

      <Dialog open={sosOpen} onOpenChange={setSosOpen}>
        <DialogContent title={t('trip.sosTitle')} description={t('trip.sosHelp')}>
          <div className="grid gap-2">
            <Button variant="danger" size="lg" loading={sos.isPending} onClick={() => sos.mutate()}>
              <ShieldAlert /> {t('trip.sosConfirm')}
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="tel:999">
                <Phone /> {t('trip.call999')}
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ChatDialog({
  open,
  onOpenChange,
  ride,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ride: RideDTO;
}) {
  const { t } = useTranslation();
  const f = useFormat();
  const me = useAuth((s) => s.user)!;
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const key = ['messages', ride.id];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => api.get<{ items: MessageDTO[] }>(`/rides/${ride.id}/messages`).then((r) => r.items),
    enabled: open,
  });
  const onMessage = useCallback(
    (m: MessageDTO) => {
      if (m.rideId !== ride.id) return;
      qc.setQueryData<MessageDTO[]>(key, (prev) =>
        prev?.some((x) => x.id === m.id) ? prev : [...(prev ?? []), m],
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ride.id, qc],
  );
  useSocketEvent('ride:message', onMessage);
  useEffect(() => bottom.current?.scrollIntoView({ behavior: 'smooth' }), [data?.length, open]);
  const send = useMutation({
    mutationFn: (body: string) => api.post<MessageDTO>(`/rides/${ride.id}/messages`, { body }),
    onSuccess: (m) => {
      setText('');
      onMessage(m);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });
  const quick = ['On my way', "I'm here", 'Running 2 min late', 'Please call me'];
  const other = me.id === ride.passenger?.id ? ride.driver : ride.passenger;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={other ? `${other.firstName}` : t('trip.chat')}
        className="flex flex-col sm:h-[560px]"
      >
        <div className="-mx-2 flex max-h-[50dvh] min-h-48 flex-1 flex-col gap-2 overflow-y-auto px-2 py-2">
          {data?.map((m) => {
            const mine = m.senderId === me.id;
            return (
              <div
                key={m.id}
                className={cn(
                  'max-w-[80%] rounded-2xl px-3.5 py-2 text-[15px]',
                  mine
                    ? 'self-end rounded-ee-md bg-primary text-primary-fg'
                    : 'self-start rounded-es-md bg-surface-2',
                )}
              >
                {m.body}
                <span className={cn('mt-0.5 block text-[10px]', mine ? 'text-primary-fg/60' : 'text-muted')}>
                  {f.time(m.createdAt)}
                </span>
              </div>
            );
          })}
          <div ref={bottom} />
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto scrollbar-none">
          {quick.map((q) => (
            <button
              key={q}
              onClick={() => send.mutate(q)}
              className="shrink-0 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium hover:bg-line"
            >
              {q}
            </button>
          ))}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) send.mutate(text.trim());
          }}
        >
          <Textarea
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('trip.typeMessage')}
            className="min-h-12 resize-none py-3"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (text.trim()) send.mutate(text.trim());
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            className="size-12 shrink-0 rounded-xl"
            disabled={!text.trim()}
            loading={send.isPending}
            aria-label={t('actions.send')}
          >
            {!send.isPending && <Send className="rtl:-scale-x-100" />}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
