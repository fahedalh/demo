import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Banknote, CheckCircle2, Flag, MessageCircle, Navigation, Phone, Send, ShieldAlert, Star, XCircle } from 'lucide-react';
import { haversine, type MessageDTO, type RideDTO } from '@masar/shared';
import {
  api, ApiError, Avatar, Button, cn, ConfirmDialog, Dialog, DialogContent, Input, RatingStars, Select, Textarea, toast, useAuth, useFormat, useSocketEvent,
} from '@masar/ui';
import { useLocation } from '../lib/location';

export function ActiveTrip({ ride }: { ride: RideDTO }) {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const pos = useLocation((s) => s.pos);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [farOpen, setFarOpen] = useState(false);
  const p = ride.passenger!;
  const ar = i18n.language === 'ar';

  const onMsg = useCallback((m: MessageDTO) => {
    if (m.rideId === ride.id && m.senderId !== useAuth.getState().user?.id && !chatOpen) {
      setUnread((u) => u + 1);
      toast(`${p.firstName}: ${m.body}`);
    }
  }, [ride.id, chatOpen, p.firstName]);
  useSocketEvent('ride:message', onMsg);

  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: Record<string, unknown> }) => api.post<{ ride: RideDTO }>(`/driver/rides/${ride.id}/${path}`, body),
    onSuccess: ({ ride: r }) => {
      if (['ACCEPTED', 'DRIVER_ARRIVING', 'ARRIVED', 'IN_PROGRESS'].includes(r.status)) qc.setQueryData(['ride', 'active'], r);
      else qc.setQueryData(['ride', 'active'], null);
      setPinOpen(false);
      setPin('');
      setCancelOpen(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });

  const sos = useMutation({
    mutationFn: () => api.post(`/rides/${ride.id}/sos`, { lat: pos?.lat, lng: pos?.lng }),
    onSuccess: () => toast.success(t('trip.sosSent')),
  });

  const target = ride.status === 'IN_PROGRESS' ? ride.dropoff : ride.pickup;
  const dist = pos ? haversine(pos, target) : null;
  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}&travelmode=driving`;

  const title = ride.status === 'IN_PROGRESS' ? t('trip.onTrip', { name: p.firstName }) : ride.status === 'ARRIVED' ? t('trip.atPickup', { name: p.firstName }) : t('trip.toPickup', { name: p.firstName });

  return (
    <div>
      <div className="bg-ink p-5 text-white">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/60">{t(`ride.status.${ride.status}`)} · {ride.code}</p>
        <h2 className="mt-1 text-2xl font-bold text-white">{title}</h2>
        <p className="mt-1 truncate text-sm text-white/75">{target.address}</p>
        {dist != null && <p className="tabular mt-2 text-sm font-semibold text-accent">{f.distance(dist)}</p>}
      </div>
      <div className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          <Avatar name={`${p.firstName} ${p.lastName}`} src={p.avatarUrl} size={48} />
          <div className="flex-1">
            <p className="font-bold">{p.firstName} {p.lastName}</p>
            <p className="inline-flex items-center gap-1 text-sm text-muted"><Star className="size-3.5 fill-amber-400 text-amber-400" />{p.rating.toFixed(2)} · {ar ? ride.category.nameAr : ride.category.name}</p>
          </div>
          <Button variant="secondary" size="icon" className="relative" onClick={() => { setChatOpen(true); setUnread(0); }} aria-label={t('trip.message')}>
            <MessageCircle />
            {unread > 0 && <span className="absolute -end-0.5 -top-0.5 grid size-5 place-items-center rounded-full bg-accent text-[10px] text-white">{unread}</span>}
          </Button>
          <Button asChild variant="secondary" size="icon" aria-label={t('trip.call')}><a href={p.phone ? `tel:${p.phone}` : undefined}><Phone /></a></Button>
        </div>

        {ride.pickupNotes && ride.status !== 'IN_PROGRESS' && <p className="rounded-xl bg-warning/10 p-3 text-sm">“{ride.pickupNotes}”</p>}

        <div className="flex items-center justify-between rounded-2xl bg-surface-2 p-4">
          <span className="flex items-center gap-2 text-sm font-semibold">{ride.paymentType === 'CASH' ? <><Banknote className="size-4" />{t('trip.cash', { amount: f.money(ride.estimatedFare, ride.currency) })}</> : t('trip.paidInApp')}</span>
          <span className="tabular font-bold">{f.money(ride.estimatedFare, ride.currency)}</span>
        </div>

        <Button asChild variant="outline" size="lg" block><a href={navUrl} target="_blank" rel="noreferrer"><Navigation /> {t('trip.navigate')}</a></Button>

        {['ACCEPTED', 'DRIVER_ARRIVING'].includes(ride.status) && (
          <Button size="lg" block className="h-16 text-lg" loading={act.isPending} onClick={() => act.mutate({ path: 'arrived' })}>{t('trip.arrived')}</Button>
        )}
        {ride.status === 'ARRIVED' && (
          <Button size="lg" variant="accent" block className="h-16 text-lg" onClick={() => setPinOpen(true)}>{t('trip.start')}</Button>
        )}
        {ride.status === 'IN_PROGRESS' && (
          <Button size="lg" variant="accent" block className="h-16 text-lg" loading={act.isPending} onClick={() => (dist != null && dist > 500 ? setFarOpen(true) : act.mutate({ path: 'complete' }))}><CheckCircle2 /> {t('trip.complete')}</Button>
        )}

        <div className="grid grid-cols-3 gap-2 text-xs">
          <button onClick={() => setReportOpen(true)} className="flex flex-col items-center gap-1 rounded-xl py-2 text-muted hover:bg-surface-2 hover:text-fg"><Flag className="size-4" />{t('trip.report')}</button>
          <button onClick={() => sos.mutate()} className="flex flex-col items-center gap-1 rounded-xl py-2 text-danger hover:bg-danger/5"><ShieldAlert className="size-4" />{t('trip.sos')}</button>
          {ride.status !== 'IN_PROGRESS' ? (
            <button onClick={() => setCancelOpen(true)} className="flex flex-col items-center gap-1 rounded-xl py-2 text-muted hover:bg-surface-2 hover:text-fg"><XCircle className="size-4" />{ride.status === 'ARRIVED' ? t('trip.noShow') : t('trip.cancel')}</button>
          ) : <span />}
        </div>
      </div>

      <Dialog open={pinOpen} onOpenChange={setPinOpen}>
        <DialogContent title={t('trip.pinTitle')} description={t('trip.enterPin')}>
          <form onSubmit={(e) => { e.preventDefault(); act.mutate({ path: 'start', body: { pin } }); }} className="space-y-4">
            <Input autoFocus inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} dir="ltr" className="h-16 text-center text-3xl font-bold tracking-[0.6em]" placeholder="••••" />
            <Button type="submit" variant="accent" size="lg" block disabled={pin.length !== 4} loading={act.isPending}>{t('trip.start')}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={ride.status === 'ARRIVED' ? t('trip.noShow') : t('trip.cancelTitle')}
        description={ride.status === 'ARRIVED' ? t('trip.noShowHelp') : t('trip.cancelHelp')}
        confirmLabel={t('actions.confirm')}
        cancelLabel={t('actions.back')}
        danger
        loading={act.isPending}
        onConfirm={() => act.mutate({ path: 'cancel', body: { reason: ride.status === 'ARRIVED' ? 'Passenger no-show' : 'Driver cancelled' } })}
      />
      <ConfirmDialog
        open={farOpen}
        onOpenChange={setFarOpen}
        title={t('trip.farTitle')}
        description={t('trip.farHelp', { distance: dist != null ? f.distance(dist) : '' })}
        confirmLabel={t('trip.complete')}
        cancelLabel={t('actions.back')}
        loading={act.isPending}
        onConfirm={() => { setFarOpen(false); act.mutate({ path: 'complete' }); }}
      />
      <DriverChat open={chatOpen} onOpenChange={setChatOpen} ride={ride} />
      <ReportDialog open={reportOpen} onOpenChange={setReportOpen} rideId={ride.id} />
    </div>
  );
}

function DriverChat({ open, onOpenChange, ride }: { open: boolean; onOpenChange: (o: boolean) => void; ride: RideDTO }) {
  const { t } = useTranslation();
  const me = useAuth((s) => s.user)!;
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const key = ['messages', ride.id];
  const { data } = useQuery({ queryKey: key, queryFn: () => api.get<{ items: MessageDTO[] }>(`/rides/${ride.id}/messages`).then((r) => r.items), enabled: open });
  const add = useCallback((m: MessageDTO) => {
    if (m.rideId === ride.id) qc.setQueryData<MessageDTO[]>(key, (prev) => (prev?.some((x) => x.id === m.id) ? prev : [...(prev ?? []), m]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride.id, qc]);
  useSocketEvent('ride:message', add);
  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth' }), [data?.length]);
  const send = useMutation({ mutationFn: (body: string) => api.post<MessageDTO>(`/rides/${ride.id}/messages`, { body }), onSuccess: (m) => { setText(''); add(m); } });
  const quick = ["I'm here", 'Arriving in 2 minutes', 'Traffic is heavy', 'Please come to the main entrance'];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={ride.passenger?.firstName}>
        <div className="flex max-h-[45dvh] min-h-40 flex-col gap-2 overflow-y-auto py-2">
          {data?.map((m) => (
            <div key={m.id} className={cn('max-w-[80%] rounded-2xl px-3.5 py-2', m.senderId === me.id ? 'self-end bg-primary text-primary-fg' : 'self-start bg-surface-2')}>{m.body}</div>
          ))}
          <div ref={end} />
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto scrollbar-none">
          {quick.map((q) => <button key={q} onClick={() => send.mutate(q)} className="shrink-0 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium">{q}</button>)}
        </div>
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) send.mutate(text.trim()); }}>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="…" />
          <Button type="submit" size="icon" className="size-12 shrink-0 rounded-xl" disabled={!text.trim()} aria-label={t('actions.send')}><Send className="rtl:-scale-x-100" /></Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReportDialog({ open, onOpenChange, rideId }: { open: boolean; onOpenChange: (o: boolean) => void; rideId: string }) {
  const { t } = useTranslation();
  const [category, setCategory] = useState('RIDE_ISSUE');
  const [description, setDescription] = useState('');
  const report = useMutation({
    mutationFn: () => api.post(`/driver/rides/${rideId}/report`, { category, description }),
    onSuccess: () => { toast.success(t('trip.report')); setDescription(''); onOpenChange(false); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('trip.report')}>
        <div className="space-y-3">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="RIDE_ISSUE">Trip issue</option>
            <option value="SAFETY">Safety</option>
            <option value="LOST_ITEM">Lost item</option>
            <option value="PAYMENT">Payment</option>
            <option value="OTHER">Other</option>
          </Select>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
          <Button block disabled={description.trim().length < 5} loading={report.isPending} onClick={() => report.mutate()}>{t('actions.submit')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TripSummary({ ride, onClose }: { ride: RideDTO; onClose: () => void }) {
  const { t } = useTranslation();
  const f = useFormat();
  const [score, setScore] = useState(5);
  const qc = useQueryClient();
  const rate = useMutation({
    mutationFn: () => api.post(`/rides/${ride.id}/rate`, { score }),
    onSettled: () => { void qc.invalidateQueries({ queryKey: ['driver'] }); onClose(); },
  });
  const e = ride.driverEarning;
  return (
    <div className="p-5">
      <div className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-accent/12"><CheckCircle2 className="size-7 text-accent" /></div>
      <h2 className="text-center text-xl font-bold">{t('trip.completed')}</h2>
      <p className="mt-1 text-center text-sm text-muted">{t('trip.youEarned')}</p>
      <p className="tabular text-center text-4xl font-bold">{f.money((e?.net ?? 0) + ride.tip, ride.currency)}</p>
      {e && (
        <div className="mt-5 space-y-1.5 rounded-2xl bg-surface-2 p-4 text-sm">
          <div className="flex justify-between"><span className="text-muted">{t('trip.fare')}</span><span className="tabular">{f.money(e.gross, ride.currency)}</span></div>
          <div className="flex justify-between"><span className="text-muted">{t('trip.commission')}</span><span className="tabular">−{f.money(e.commission, ride.currency)}</span></div>
          <div className="flex justify-between border-t border-line pt-1.5 font-semibold"><span>{t('trip.net')}</span><span className="tabular">{f.money(e.net, ride.currency)}</span></div>
          {ride.paymentType === 'CASH' && <p className="pt-1 text-xs text-muted">{t('trip.cash', { amount: f.money(ride.finalFare ?? 0, ride.currency) })}</p>}
        </div>
      )}
      {ride.passenger && (
        <div className="mt-5 flex flex-col items-center gap-2">
          <p className="font-semibold">{t('trip.rate', { name: ride.passenger.firstName })}</p>
          <RatingStars value={score} onChange={setScore} size={30} />
        </div>
      )}
      <Button size="lg" block className="mt-5" loading={rate.isPending} onClick={() => (ride.passenger ? rate.mutate() : onClose())}>{t('trip.done')}</Button>
    </div>
  );
}
