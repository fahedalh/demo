import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Gauge, Power, Radio, Star, TrendingUp } from 'lucide-react';
import type { RideDTO, RideOfferDTO } from '@masar/shared';
import { api, ApiError, Button, cn, MapView, Switch, toast, useFormat, useMapCenter, useSocketEvent, type MapMarker } from '@masar/ui';
import { useLocation } from '../lib/location';
import type { DashboardResp } from '../lib/api-types';
import { useDriverProfile } from '../App';
import { OfferCard } from '../components/OfferCard';
import { ActiveTrip, TripSummary } from '../components/ActiveTrip';

const ENGAGED = ['ACCEPTED', 'DRIVER_ARRIVING', 'ARRIVED', 'IN_PROGRESS'];

export function DrivePage() {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const center = useMapCenter();
  const profile = useDriverProfile();
  const loc = useLocation();
  const [offer, setOffer] = useState<RideOfferDTO | null>(null);
  const [summary, setSummary] = useState<RideDTO | null>(null);

  const dash = useQuery({ queryKey: ['driver', 'dashboard'], queryFn: () => api.get<DashboardResp>('/driver/dashboard'), refetchInterval: 60_000 });
  const active = useQuery({ queryKey: ['ride', 'active'], queryFn: () => api.get<{ ride: RideDTO | null }>('/rides/active').then((r) => r.ride) });
  const ride = active.data && ENGAGED.includes(active.data.status) ? active.data : null;
  const online = dash.data?.isOnline ?? profile.data?.profile.isOnline ?? false;

  // Seed the simulated position from the last known location.
  useEffect(() => {
    if (!loc.pos && profile.data) {
      const last = profile.data.profile.lastLocation;
      useLocation.setState({ pos: { lat: last?.lat ?? center[0], lng: last?.lng ?? center[1], heading: 0 } });
    }
  }, [profile.data, loc.pos, center]);

  // Restore a pending offer after a reload.
  useEffect(() => {
    void api.get<{ offer: RideOfferDTO | null }>('/driver/offers/current').then((r) => r.offer && setOffer(r.offer)).catch(() => undefined);
  }, []);

  useSocketEvent('ride:offer', useCallback((o: RideOfferDTO) => {
    setOffer(o);
    try {
      navigator.vibrate?.([200, 100, 200]);
    } catch {
      /* not supported */
    }
  }, []));
  useSocketEvent('ride:offer:cancelled', useCallback((p: { offerId: string; reason: string }) => {
    setOffer((cur) => {
      if (cur?.offerId === p.offerId) toast.info(p.reason === 'timeout' ? t('offer.expired') : t('offer.taken'));
      return cur?.offerId === p.offerId ? null : cur;
    });
  }, [t]));
  useSocketEvent('ride:updated', useCallback((r: RideDTO) => {
    if (ENGAGED.includes(r.status)) qc.setQueryData(['ride', 'active'], r);
    else {
      qc.setQueryData(['ride', 'active'], null);
      if (['COMPLETED', 'PAYMENT_PENDING', 'PAYMENT_COMPLETED'].includes(r.status)) setSummary(r);
      if (r.status === 'CANCELLED') toast.warning(t('ride.status.CANCELLED'));
      void qc.invalidateQueries({ queryKey: ['driver'] });
    }
  }, [qc, t]));
  useSocketEvent('driver:status', useCallback(() => void qc.invalidateQueries({ queryKey: ['driver', 'dashboard'] }), [qc]));

  // Simulation: drive to pickup, then along the trip route.
  const phase = ride ? (ride.status === 'IN_PROGRESS' ? 'trip' : ride.status === 'ARRIVED' ? 'wait' : 'pickup') : 'idle';
  useEffect(() => {
    if (!ride || !loc.simEnabled) return;
    if (phase === 'pickup') void useLocation.getState().driveTo(ride.pickup);
    if (phase === 'trip') useLocation.getState().followRoute(ride.routeGeometry);
    if (phase === 'wait') useLocation.getState().followRoute(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride?.id, phase, loc.simEnabled]);

  const toggle = useMutation({
    mutationFn: (on: boolean) => api.post<{ isOnline: boolean }>('/driver/status', { online: on, lat: loc.pos?.lat, lng: loc.pos?.lng }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['driver', 'dashboard'] }),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });

  const markers = useMemo<MapMarker[]>(() => {
    const m: MapMarker[] = [];
    if (loc.pos) m.push({ id: 'me', kind: ride ? 'car-busy' : 'car', lat: loc.pos.lat, lng: loc.pos.lng, heading: loc.pos.heading });
    const target = offer?.ride ?? ride;
    if (target) {
      m.push({ id: 'pickup', kind: 'pickup', ...target.pickup });
      m.push({ id: 'dropoff', kind: 'dropoff', ...target.dropoff });
    }
    return m;
  }, [loc.pos, offer, ride]);

  const fitTo: [number, number][] | null = useMemo(() => {
    const target = offer?.ride ?? ride;
    if (target && loc.pos) {
      if (phase === 'trip') return [[loc.pos.lat, loc.pos.lng], [target.dropoff.lat, target.dropoff.lng]];
      return [[loc.pos.lat, loc.pos.lng], [target.pickup.lat, target.pickup.lng], ...(offer ? [[target.dropoff.lat, target.dropoff.lng] as [number, number]] : [])];
    }
    return loc.pos ? [[loc.pos.lat, loc.pos.lng]] : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer?.offerId, ride?.id, phase, !!loc.pos]);

  const isDesktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;
  const approach: [number, number][] | null = loc.path && phase === 'pickup' ? loc.path.map((p) => [p.lat, p.lng]) : null;

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <MapView
        center={center}
        zoom={14}
        markers={markers}
        route={phase === 'trip' || offer ? (offer?.ride.routeGeometry ?? ride?.routeGeometry ?? null) : null}
        approach={approach}
        fitTo={fitTo}
        fitPadding={isDesktop ? [140, 60, 60, 460] : [150, 30, 360, 30]}
        followId={ride && !isDesktop ? 'me' : null}
        zoomControl={isDesktop}
      />

      {/* Status bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] p-4 md:start-[460px]">
        <div className="pointer-events-auto mx-auto flex max-w-xl items-center gap-3 rounded-2xl bg-surface p-2 ps-4 shadow-float">
          <span className={cn('relative grid size-3 place-items-center')}>
            {online && <span className="absolute inset-0 animate-ping rounded-full bg-accent/60" />}
            <span className={cn('relative size-3 rounded-full', online ? 'bg-accent' : 'bg-muted')} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold leading-tight">{online ? t('status.online') : t('status.offline')}</p>
            <p className="truncate text-xs text-muted">{ride ? t(`ride.status.${ride.status}`) : online ? t('status.finding') : t('status.offlineHelp')}</p>
          </div>
          <Button
            variant={online ? 'secondary' : 'accent'}
            className="rounded-xl"
            loading={toggle.isPending}
            disabled={!!ride && online}
            onClick={() => toggle.mutate(!online)}
          >
            <Power /> {online ? t('status.goOffline') : t('status.goOnline')}
          </Button>
        </div>
      </div>

      {/* Side panel */}
      <section className="absolute inset-x-0 bottom-16 z-[600] max-h-[70dvh] overflow-y-auto rounded-t-3xl bg-surface shadow-float scrollbar-none md:inset-x-auto md:bottom-4 md:start-4 md:top-4 md:max-h-none md:w-[420px] md:rounded-3xl">
        <AnimatePresence mode="wait">
          {ride ? (
            <motion.div key={`ride-${ride.id}`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <ActiveTrip ride={ride} />
            </motion.div>
          ) : summary ? (
            <motion.div key="summary" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <TripSummary ride={summary} onClose={() => setSummary(null)} />
            </motion.div>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-3">
                <Stat icon={TrendingUp} label={t('stats.today')} value={f.money(dash.data?.today.earnings ?? 0)} sub={`${dash.data?.today.trips ?? 0} ${t('stats.trips')}`} big />
                <Stat icon={TrendingUp} label={t('stats.week')} value={f.money(dash.data?.week.earnings ?? 0)} sub={`${dash.data?.week.trips ?? 0} ${t('stats.trips')}`} big />
                <Stat icon={Star} label={t('stats.rating')} value={(dash.data?.rating ?? 5).toFixed(2)} sub={`${dash.data?.ratingCount ?? 0}`} />
                <Stat icon={Gauge} label={t('stats.acceptance')} value={`${dash.data?.acceptanceRate ?? 100}%`} sub={`${dash.data?.completedRides ?? 0} ${t('stats.trips')}`} />
              </div>
              {!online && (
                <Button size="lg" variant="accent" block loading={toggle.isPending} onClick={() => toggle.mutate(true)} className="h-16 text-lg">
                  <Power /> {t('status.goOnline')}
                </Button>
              )}
              <SimulationCard />
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <AnimatePresence>{offer && <OfferCard key={offer.offerId} offer={offer} onClose={() => setOffer(null)} />}</AnimatePresence>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub, big }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub?: string; big?: boolean }) {
  return (
    <div className={cn('rounded-2xl p-4', big ? 'bg-ink text-white' : 'bg-surface-2')}>
      <div className={cn('flex items-center gap-1.5 text-xs font-semibold', big ? 'text-white/70' : 'text-muted')}><Icon className="size-3.5" />{label}</div>
      <p className={cn('tabular mt-1 text-xl font-bold', big && 'text-white')}>{value}</p>
      {sub && <p className={cn('text-xs', big ? 'text-white/60' : 'text-muted')}>{sub}</p>}
    </div>
  );
}

function SimulationCard() {
  const { t } = useTranslation();
  const { simEnabled, setSim, simSpeed, setSpeed, gpsError, source } = useLocation();
  return (
    <div className="rounded-2xl border border-dashed border-line p-4">
      <div className="flex items-center gap-3">
        <Radio className="size-5 text-info" />
        <div className="flex-1">
          <p className="font-semibold">{t('sim.title')}</p>
          <p className="text-xs text-muted">{t('sim.help')}</p>
        </div>
        <Switch checked={simEnabled} onCheckedChange={setSim} aria-label={t('sim.title')} />
      </div>
      {simEnabled && (
        <label className="mt-3 flex items-center gap-3 text-sm">
          <span className="text-muted">{t('sim.speed')}</span>
          <input type="range" min={10} max={120} step={5} value={simSpeed} onChange={(e) => setSpeed(Number(e.target.value))} className="flex-1 accent-[#06C167]" />
          <span className="tabular w-16 text-end font-medium">{Math.round(simSpeed * 3.6)} km/h</span>
        </label>
      )}
      {!simEnabled && gpsError && <p className="mt-2 text-xs text-danger">{t('status.locationNeeded')} ({gpsError})</p>}
      {!simEnabled && source === 'gps' && <p className="mt-2 text-xs text-accent-600">GPS ✓</p>}
    </div>
  );
}
