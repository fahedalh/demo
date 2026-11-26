import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, useSocketEvent, useMapCenter } from '@masar/ui';
import type { DriverLocationPayload, NotificationDTO, RideDTO, VehicleCategoryDTO } from '@masar/shared';
import { toast } from '@masar/ui';

export function useActiveRide() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['ride', 'active'],
    queryFn: () => api.get<{ ride: RideDTO | null }>('/rides/active').then((r) => r.ride),
    refetchInterval: (q) => (q.state.data && ['SEARCHING', 'ACCEPTED', 'DRIVER_ARRIVING', 'ARRIVED', 'IN_PROGRESS'].includes(q.state.data.status) ? 15_000 : false),
  });
  // Realtime: the server pushes every status change. REST polling above is only a safety net.
  const onUpdate = useCallback(
    (ride: RideDTO) => {
      qc.setQueryData(['ride', 'active'], (prev: RideDTO | null | undefined) => (!prev || prev.id === ride.id || ride.status === 'SEARCHING' ? ride : prev));
      qc.setQueryData(['ride', ride.id], ride);
      void qc.invalidateQueries({ queryKey: ['rides'] });
    },
    [qc],
  );
  useSocketEvent('ride:updated', onUpdate);
  return query;
}

export function useDriverLocation(rideId: string | undefined) {
  const [loc, setLoc] = useState<DriverLocationPayload | null>(null);
  useEffect(() => setLoc(null), [rideId]);
  const handler = useCallback((p: DriverLocationPayload) => {
    if (!rideId || p.rideId !== rideId) return;
    setLoc(p);
  }, [rideId]);
  useSocketEvent('ride:driver_location', handler);
  return loc;
}

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: () => api.get<{ items: VehicleCategoryDTO[] }>('/catalog/categories').then((r) => r.items), staleTime: 300_000 });
}

export function useGeolocation() {
  const fallback = useMapCenter();
  const [state, setState] = useState<{ lat: number; lng: number; status: 'locating' | 'ok' | 'denied' }>({ lat: fallback[0], lng: fallback[1], status: 'locating' });
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setState((s) => ({ ...s, status: 'denied' }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => setState({ lat: p.coords.latitude, lng: p.coords.longitude, status: 'ok' }),
      () => setState((s) => ({ ...s, status: 'denied' })),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  }, []);
  return state;
}

/** Shows realtime notifications as toasts and keeps the unread badge fresh. */
export function useLiveNotifications() {
  const qc = useQueryClient();
  const handler = useCallback(
    (n: NotificationDTO) => {
      if (n.type !== 'RIDE_MESSAGE') toast(n.title, { description: n.body || undefined });
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    },
    [qc],
  );
  useSocketEvent('notification', handler);
}
