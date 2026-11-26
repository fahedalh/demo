/**
 * Map-first home screen. The floating panel shows either the booking flow (no active ride)
 * or the live state of the current ride, driven by realtime socket updates.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { LocateFixed } from 'lucide-react';
import { haversine, type RideDTO } from '@masar/shared';
import { api, Button, cn, MapView, toast, useMapCenter, type MapMarker } from '@masar/ui';
import { useActiveRide, useDriverLocation, useGeolocation } from '../lib/hooks';
import { useBooking } from '../booking/store';
import { BookingPanel } from '../booking/BookingPanel';
import { Searching } from '../booking/Searching';
import { LiveTrip } from '../booking/LiveTrip';
import { TripDone } from '../booking/TripDone';
import { NotificationBell, UserMenu } from '../Shell';

const LIVE = ['ACCEPTED', 'DRIVER_ARRIVING', 'ARRIVED', 'IN_PROGRESS'];
const DISMISS_KEY = 'masar.dismissedRide';

export function HomePage() {
  const { t } = useTranslation();
  const geo = useGeolocation();
  const defaultCenter = useMapCenter();
  const booking = useBooking();
  const { data: active } = useActiveRide();
  const [failed, setFailed] = useState<RideDTO | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(() => sessionStorage.getItem(DISMISS_KEY));
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const driverLoc = useDriverLocation(active?.id);

  // Resolve the starting position: the device location when we serve it, otherwise the demo city.
  const { data: areas } = useQuery({
    queryKey: ['service-areas'],
    queryFn: () =>
      api
        .get<{ items: { centerLat: number; centerLng: number; radiusKm: number }[] }>(
          '/catalog/service-areas',
        )
        .then((r) => r.items),
    staleTime: Infinity,
  });
  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => api.get<{ serviceAnywhere?: boolean; freeCancellationSeconds: number }>('/catalog/config'),
    staleTime: Infinity,
  });
  const located = useRef(false);
  useEffect(() => {
    if (geo.status === 'locating' || !areas || !config || located.current) return;
    located.current = true;
    // Use the device location when we serve it (or everywhere in demo "service anywhere" mode).
    const usable =
      geo.status === 'ok' &&
      (config.serviceAnywhere ||
        areas.some((a) => haversine(geo, { lat: a.centerLat, lng: a.centerLng }) <= a.radiusKm * 1000));
    const pos = usable ? { lat: geo.lat, lng: geo.lng } : { lat: defaultCenter[0], lng: defaultCenter[1] };
    setUserPos(pos);
    if (!usable) toast.info(geo.status === 'ok' ? t('book.outsideArea') : t('book.locationDenied'));
    if (!useBooking.getState().pickup) {
      void api
        .get<{ name: string; address: string }>(
          `/geo/reverse?lat=${pos.lat}&lng=${pos.lng}&locale=${document.documentElement.lang === 'ar' ? 'ar' : 'en'}`,
        )
        .then((r) => useBooking.getState().set({ pickup: { address: r.name, lat: pos.lat, lng: pos.lng } }))
        .catch(() =>
          useBooking
            .getState()
            .set({ pickup: { address: t('book.currentLocation'), lat: pos.lat, lng: pos.lng } }),
        );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.status, areas, config]);

  // Keep the failure card visible after the search ends without a driver.
  useEffect(() => {
    if (active && ['NO_DRIVER_AVAILABLE', 'EXPIRED'].includes(active.status)) setFailed(active);
  }, [active]);

  const rideView: RideDTO | null = active && active.id !== dismissed ? active : null;
  const isLive = !!rideView && LIVE.includes(rideView.status);
  const isSearching = rideView?.status === 'SEARCHING';
  const isDone =
    !!rideView && ['COMPLETED', 'PAYMENT_PENDING', 'PAYMENT_COMPLETED'].includes(rideView.status);

  // Nearby cars (anonymous) while composing a booking.
  const near = booking.pickup ?? userPos;
  const { data: cars } = useQuery({
    queryKey: ['nearby-cars', near?.lat.toFixed(3), near?.lng.toFixed(3)],
    queryFn: () =>
      api
        .get<{ items: { id: string; lat: number; lng: number; heading: number }[] }>(
          `/rides/nearby-cars?lat=${near!.lat}&lng=${near!.lng}`,
        )
        .then((r) => r.items),
    enabled: !!near && !rideView,
    refetchInterval: 20_000,
  });

  const markers = useMemo<MapMarker[]>(() => {
    const m: MapMarker[] = [];
    if (rideView) {
      m.push({ id: 'pickup', kind: 'pickup', lat: rideView.pickup.lat, lng: rideView.pickup.lng });
      m.push({ id: 'dropoff', kind: 'dropoff', lat: rideView.dropoff.lat, lng: rideView.dropoff.lng });
      const d = driverLoc ?? rideView.driver?.location;
      if (isLive && d) m.push({ id: 'driver', kind: 'car', lat: d.lat, lng: d.lng, heading: d.heading ?? 0 });
      return m;
    }
    if (userPos && booking.stage !== 'pin')
      m.push({ id: 'me', kind: 'user', lat: userPos.lat, lng: userPos.lng });
    cars?.forEach((c) => m.push({ id: c.id, kind: 'car', lat: c.lat, lng: c.lng, heading: c.heading }));
    if (booking.stage === 'options') {
      if (booking.pickup) m.push({ id: 'pickup', kind: 'pickup', ...booking.pickup });
      if (booking.dropoff) m.push({ id: 'dropoff', kind: 'dropoff', ...booking.dropoff });
    }
    return m;
  }, [rideView, driverLoc, isLive, userPos, cars, booking.stage, booking.pickup, booking.dropoff]);

  const route = rideView ? rideView.routeGeometry : booking.stage === 'options' ? booking.route : null;
  const driverPoint = driverLoc ?? rideView?.driver?.location;
  const approach: [number, number][] | null =
    rideView && driverPoint && ['ACCEPTED', 'DRIVER_ARRIVING'].includes(rideView.status)
      ? [
          [driverPoint.lat, driverPoint.lng],
          [rideView.pickup.lat, rideView.pickup.lng],
        ]
      : null;

  const hasDriverPoint = !!driverPoint;
  const fitTo: [number, number][] | null = useMemo(() => {
    if (rideView) {
      if (rideView.status === 'IN_PROGRESS' && driverPoint)
        return [
          [driverPoint.lat, driverPoint.lng],
          [rideView.dropoff.lat, rideView.dropoff.lng],
        ];
      if (driverPoint && ['ACCEPTED', 'DRIVER_ARRIVING', 'ARRIVED'].includes(rideView.status))
        return [
          [driverPoint.lat, driverPoint.lng],
          [rideView.pickup.lat, rideView.pickup.lng],
        ];
      if (rideView.status === 'SEARCHING') return [[rideView.pickup.lat, rideView.pickup.lng]];
      return [
        [rideView.pickup.lat, rideView.pickup.lng],
        [rideView.dropoff.lat, rideView.dropoff.lng],
      ];
    }
    if (booking.stage === 'options' && booking.pickup && booking.dropoff)
      return [
        [booking.pickup.lat, booking.pickup.lng],
        [booking.dropoff.lat, booking.dropoff.lng],
      ];
    if (booking.stage === 'pin') return null;
    if (userPos) return [[userPos.lat, userPos.lng]];
    return null;
    // Refit only when the phase changes, not on every driver movement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    rideView?.id,
    rideView?.status,
    booking.stage,
    booking.pickup?.lat,
    booking.dropoff?.lat,
    userPos?.lat,
    hasDriverPoint,
  ]);

  const isDesktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;
  const padding: [number, number, number, number] = isDesktop ? [90, 60, 60, 500] : [90, 40, 380, 40];
  const rtlPadding: [number, number, number, number] =
    isDesktop && document.documentElement.dir === 'rtl' ? [90, 500, 60, 60] : padding;

  const dismissRide = (id: string) => {
    sessionStorage.setItem(DISMISS_KEY, id);
    setDismissed(id);
    setFailed(null);
    useBooking.getState().reset();
  };

  let panel: React.ReactNode;
  if (
    failed &&
    (!rideView || rideView.id === failed.id) &&
    ['NO_DRIVER_AVAILABLE', 'EXPIRED'].includes(failed.status)
  ) {
    panel = <Searching ride={failed} failed onDismiss={() => dismissRide(failed.id)} />;
  } else if (isSearching) panel = <Searching ride={rideView!} />;
  else if (isLive) panel = <LiveTrip ride={rideView!} driverLoc={driverLoc} />;
  else if (isDone) panel = <TripDone ride={rideView!} onClose={() => dismissRide(rideView!.id)} />;
  else panel = <BookingPanel userPos={userPos} geoDenied={geo.status === 'denied'} mapCenter={mapCenter} />;

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <MapView
        markers={markers}
        route={route}
        approach={approach}
        fitTo={fitTo}
        fitPadding={rtlPadding}
        onMoveEnd={setMapCenter}
        center={defaultCenter}
        zoom={14}
        zoomControl={isDesktop}
      />

      {booking.stage === 'pin' && !rideView && (
        <div className="pointer-events-none absolute inset-0 z-[400] grid place-items-center">
          <div className="-translate-y-5">
            <svg width="36" height="50" viewBox="0 0 30 42" className="drop-shadow-lg">
              <path
                d="M15 0C6.7 0 0 6.6 0 14.8 0 26 15 42 15 42s15-16 15-27.2C30 6.6 23.3 0 15 0z"
                fill="#111"
              />
              <circle cx="15" cy="15" r="5.5" fill="#fff" />
            </svg>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] flex items-center justify-between p-4">
        <div className="pointer-events-auto rounded-full bg-surface p-1 shadow-float">
          <UserMenu />
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          {userPos && !rideView && (
            <Button
              variant="outline"
              size="icon"
              className="bg-surface shadow-float"
              aria-label={t('book.currentLocation')}
              onClick={() => setUserPos({ ...userPos })}
            >
              <LocateFixed />
            </Button>
          )}
          <div className="rounded-full bg-surface shadow-float">
            <NotificationBell />
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.section
          key={
            rideView ? `${rideView.id}-${isLive ? 'live' : rideView.status}` : failed ? 'failed' : 'booking'
          }
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ type: 'spring', damping: 26, stiffness: 260 }}
          className={cn(
            'absolute z-[600] flex flex-col overflow-hidden bg-surface shadow-float',
            'inset-x-0 bottom-0 max-h-[72dvh] rounded-t-3xl pb-[env(safe-area-inset-bottom)]',
            'md:inset-x-auto md:bottom-auto md:start-4 md:top-20 md:max-h-[calc(100dvh-6rem)] md:w-[420px] md:rounded-3xl',
          )}
        >
          <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line md:hidden" />
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-none">{panel}</div>
        </motion.section>
      </AnimatePresence>
    </div>
  );
}
