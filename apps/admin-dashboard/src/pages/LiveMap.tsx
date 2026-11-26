import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { DriverLocationPayload, RideDTO } from '@masar/shared';
import {
  api,
  Badge,
  Card,
  MapView,
  RideStatusBadge,
  useFormat,
  useMapCenter,
  useSocketEvent,
  type MapMarker,
} from '@masar/ui';
import { PageHeader } from '../components/DataTable';

interface LiveDriver {
  driverId: string;
  lat: number;
  lng: number;
  busy: boolean;
  category: string;
  name: string;
  heading?: number | null;
}

export function LiveMapPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const navigate = useNavigate();
  const center = useMapCenter();
  const q = useQuery({
    queryKey: ['admin', 'live'],
    queryFn: () => api.get<{ drivers: LiveDriver[]; rides: RideDTO[] }>('/admin/live'),
    refetchInterval: 15_000,
  });
  const [drivers, setDrivers] = useState<Record<string, LiveDriver>>({});
  useEffect(() => {
    if (q.data) setDrivers(Object.fromEntries(q.data.drivers.map((d) => [d.driverId, d])));
  }, [q.data]);
  useSocketEvent(
    'admin:driver_location',
    useCallback((p: DriverLocationPayload & { busy: boolean }) => {
      setDrivers((prev) => ({
        ...prev,
        [p.driverId]: {
          ...(prev[p.driverId] ?? { name: 'Driver', category: '' }),
          driverId: p.driverId,
          lat: p.lat,
          lng: p.lng,
          heading: p.heading,
          busy: p.busy,
        },
      }));
    }, []),
  );
  useSocketEvent(
    'admin:driver_offline',
    useCallback((p: { driverId: string }) => {
      setDrivers((prev) => {
        const n = { ...prev };
        delete n[p.driverId];
        return n;
      });
    }, []),
  );
  useSocketEvent(
    'admin:ride_event',
    useCallback(() => void q.refetch(), [q]),
  );

  const list = Object.values(drivers);
  const markers = useMemo<MapMarker[]>(
    () => [
      ...list.map((d) => ({
        id: d.driverId,
        kind: d.busy ? ('car-busy' as const) : ('car' as const),
        lat: d.lat,
        lng: d.lng,
        heading: d.heading ?? 0,
        label: `${d.name} · ${d.category}`,
      })),
      ...(q.data?.rides ?? [])
        .filter((r) => r.status === 'SEARCHING')
        .map((r) => ({
          id: `req-${r.id}`,
          kind: 'pickup' as const,
          lat: r.pickup.lat,
          lng: r.pickup.lng,
          label: r.code,
          onClick: () => navigate(`/rides/${r.id}`),
        })),
    ],
    [list, q.data, navigate],
  );

  return (
    <div>
      <PageHeader
        title={t('live.title')}
        actions={
          <>
            <Badge tone="success">
              {t('live.idle')}: {list.filter((d) => !d.busy).length}
            </Badge>
            <Badge tone="dark">
              {t('live.busy')}: {list.filter((d) => d.busy).length}
            </Badge>
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card className="h-[70vh] overflow-hidden">
          <MapView center={center} zoom={11} markers={markers} zoomControl />
        </Card>
        <Card className="max-h-[70vh] overflow-y-auto p-4">
          <h2 className="mb-2 font-semibold">
            {t('live.rides')} · {q.data?.rides.length ?? 0}
          </h2>
          <div className="divide-y divide-line">
            {q.data?.rides.map((r) => (
              <button
                key={r.id}
                onClick={() => navigate(`/rides/${r.id}`)}
                className="w-full py-3 text-start text-sm hover:bg-surface-2/50"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs">{r.code}</span>
                  <RideStatusBadge status={r.status} />
                </div>
                <p className="mt-1 truncate">
                  {r.pickup.address.split(',')[0]} → {r.dropoff.address.split(',')[0]}
                </p>
                <p className="text-xs text-muted">
                  {r.passenger?.firstName}
                  {r.driver ? ` · ${r.driver.firstName}` : ''} · {f.relative(r.requestedAt)}
                </p>
              </button>
            ))}
          </div>
          <h2 className="mb-2 mt-5 font-semibold">
            {t('live.drivers')} · {list.length}
          </h2>
          <div className="divide-y divide-line text-sm">
            {list.map((d) => (
              <div key={d.driverId} className="flex items-center justify-between py-2">
                <span>{d.name}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted">{d.category}</span>
                  <span className={`size-2 rounded-full ${d.busy ? 'bg-fg' : 'bg-accent'}`} />
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
