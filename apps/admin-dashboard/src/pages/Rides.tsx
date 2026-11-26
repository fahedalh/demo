import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Download } from 'lucide-react';
import { RIDE_STATUSES, type RideDTO } from '@masar/shared';
import {
  api,
  ApiError,
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Input,
  MapView,
  RideStatusBadge,
  Skeleton,
  toast,
  useFormat,
} from '@masar/ui';
import { DataTable, FilterBar, FilterSelect, PageHeader, type Column } from '../components/DataTable';
import { downloadCsv, usePaged } from '../lib/hooks';

export function RidesPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const navigate = useNavigate();
  const list = usePaged<RideDTO>('/admin/rides');
  const cols: Column<RideDTO>[] = [
    {
      key: 'code',
      header: t('rides.code'),
      cell: (r) => <span className="font-mono text-xs font-semibold">{r.code}</span>,
    },
    {
      key: 'pax',
      header: t('rides.passenger'),
      cell: (r) => (r.passenger ? `${r.passenger.firstName} ${r.passenger.lastName}` : '—'),
    },
    {
      key: 'drv',
      header: t('rides.driver'),
      cell: (r) =>
        r.driver ? `${r.driver.firstName} ${r.driver.lastName}` : <span className="text-muted">—</span>,
    },
    {
      key: 'route',
      header: t('rides.route'),
      cell: (r) => (
        <span className="block max-w-72 truncate">
          {r.pickup.address.split(',')[0]} → {r.dropoff.address.split(',')[0]}
        </span>
      ),
    },
    { key: 'cat', header: 'Cat.', cell: (r) => r.category.name },
    {
      key: 'status',
      header: t('common.status'),
      cell: (r) => <RideStatusBadge status={r.status} scheduled={!!r.scheduledAt} />,
    },
    {
      key: 'fare',
      header: t('rides.fare'),
      className: 'text-end',
      cell: (r) => (
        <span className="tabular font-semibold">{f.money(r.finalFare ?? r.estimatedFare, r.currency)}</span>
      ),
    },
    { key: 'pay', header: '', cell: (r) => <Badge>{t(`ride.payment.${r.paymentType}`)}</Badge> },
    {
      key: 'at',
      header: t('rides.created'),
      cell: (r) => <span className="whitespace-nowrap text-muted">{f.dateTime(r.requestedAt)}</span>,
    },
  ];
  return (
    <div>
      <PageHeader
        title={t('rides.title')}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv(
                'rides',
                (list.data?.items ?? []).map((r) => ({
                  code: r.code,
                  status: r.status,
                  passenger: r.passenger?.firstName,
                  driver: r.driver?.firstName,
                  pickup: r.pickup.address,
                  dropoff: r.dropoff.address,
                  fare: (r.finalFare ?? r.estimatedFare) / 100,
                  payment: r.paymentType,
                  requestedAt: r.requestedAt,
                })),
              )
            }
          >
            <Download /> {t('common.export')}
          </Button>
        }
      />
      <FilterBar onSearch={(v) => list.setFilter('q', v)}>
        <FilterSelect
          label={t('common.status')}
          value={list.filters.status ?? ''}
          onChange={(v) => list.setFilter('status', v)}
          options={[
            { value: 'ACTIVE', label: t('rides.active') },
            { value: 'FINISHED', label: t('rides.finished') },
            ...RIDE_STATUSES.map((s) => ({ value: s, label: t(`ride.status.${s}`) })),
          ]}
        />
        <Input
          type="date"
          className="h-10 w-auto"
          aria-label={t('common.from')}
          onChange={(e) => list.setFilter('from', e.target.value)}
        />
        <Input
          type="date"
          className="h-10 w-auto"
          aria-label={t('common.to')}
          onChange={(e) => list.setFilter('to', e.target.value ? `${e.target.value}T23:59:59` : '')}
        />
      </FilterBar>
      <DataTable
        columns={cols}
        rows={list.data?.items}
        loading={list.isLoading}
        onRowClick={(r) => navigate(`/rides/${r.id}`)}
        page={list.page}
        totalPages={list.data?.totalPages}
        total={list.data?.total}
        onPage={list.setPage}
      />
    </div>
  );
}

interface RideDetail {
  ride: RideDTO;
  history: {
    id: string;
    fromStatus: string | null;
    toStatus: string;
    actorRole: string;
    note: string | null;
    createdAt: string;
  }[];
  offers: {
    id: string;
    status: string;
    distanceM: number;
    offeredAt: string;
    driver: { firstName: string; lastName: string };
  }[];
  trail: { lat: number; lng: number }[];
  payments: {
    id: string;
    receiptNumber: string;
    purpose: string;
    type: string;
    provider: string;
    amount: number;
    refundedAmount: number;
    status: string;
    failureReason: string | null;
    createdAt: string;
  }[];
  messages: { id: string; senderId: string; body: string; createdAt: string }[];
  tickets: { id: string; number: number; subject: string; status: string }[];
}

export function RideDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const [cancel, setCancel] = useState(false);
  const [force, setForce] = useState(false);
  const [reason, setReason] = useState('');
  const q = useQuery({
    queryKey: ['admin', 'ride', id],
    queryFn: () => api.get<RideDetail>(`/admin/rides/${id}`),
    refetchInterval: 10_000,
  });
  const act = useMutation({
    mutationFn: (path: 'cancel' | 'complete') =>
      api.post(`/admin/rides/${id}/${path}`, path === 'cancel' ? { reason } : {}),
    onSuccess: () => {
      setCancel(false);
      setForce(false);
      void qc.invalidateQueries({ queryKey: ['admin', 'ride', id] });
      toast.success(t('actions.save'));
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });
  if (!q.data) return <Skeleton className="h-96" />;
  const { ride, history, offers, trail, payments, messages, tickets } = q.data;
  const cancellable = ['REQUESTED', 'SEARCHING', 'ACCEPTED', 'DRIVER_ARRIVING', 'ARRIVED'].includes(
    ride.status,
  );
  return (
    <div>
      <Link to="/rides" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t('rides.title')}
      </Link>
      <PageHeader
        title={`${t('rides.code')} ${ride.code}`}
        subtitle={
          <span className="inline-flex items-center gap-2">
            <RideStatusBadge status={ride.status} scheduled={!!ride.scheduledAt} /> {ride.category.name} ·{' '}
            {f.dateTime(ride.requestedAt)}
          </span>
        }
        actions={
          <>
            {cancellable && (
              <Button variant="danger" size="sm" onClick={() => setCancel(true)}>
                {t('rides.cancel')}
              </Button>
            )}
            {ride.status === 'IN_PROGRESS' && (
              <Button variant="outline" size="sm" onClick={() => setForce(true)}>
                {t('rides.forceComplete')}
              </Button>
            )}
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <Card className="h-96 overflow-hidden">
          <MapView
            markers={[
              { id: 'p', kind: 'pickup', ...ride.pickup },
              { id: 'd', kind: 'dropoff', ...ride.dropoff },
              ...(ride.driver?.location &&
              ['ACCEPTED', 'DRIVER_ARRIVING', 'ARRIVED', 'IN_PROGRESS'].includes(ride.status)
                ? [{ id: 'car', kind: 'car-busy' as const, ...ride.driver.location }]
                : []),
            ]}
            route={
              trail.length > 2 ? trail.map((p) => [p.lat, p.lng] as [number, number]) : ride.routeGeometry
            }
            fitTo={[
              [ride.pickup.lat, ride.pickup.lng],
              [ride.dropoff.lat, ride.dropoff.lng],
            ]}
            fitPadding={[40, 40, 40, 40]}
            zoomControl
          />
        </Card>
        <Card className="space-y-4 p-5 text-sm">
          <div className="space-y-2">
            <p>
              <span className="me-2 inline-block size-2 rounded-full bg-fg" />
              {ride.pickup.address}
            </p>
            <p>
              <span className="me-2 inline-block size-2 bg-fg" />
              {ride.dropoff.address}
            </p>
            {ride.pickupNotes && <p className="text-muted">“{ride.pickupNotes}”</p>}
          </div>
          {[
            ride.passenger && { label: t('rides.passenger'), p: ride.passenger },
            ride.driver && { label: t('rides.driver'), p: ride.driver },
          ]
            .filter(Boolean)
            .map((x: any) => (
              <Link
                key={x.label}
                to={`/users/${x.p.id}`}
                className="flex items-center gap-3 rounded-xl bg-surface-2 p-3 hover:bg-line"
              >
                <Avatar name={`${x.p.firstName} ${x.p.lastName}`} size={36} />
                <div className="flex-1">
                  <p className="text-xs text-muted">{x.label}</p>
                  <p className="font-semibold">
                    {x.p.firstName} {x.p.lastName}
                  </p>
                </div>
                <span className="text-xs" dir="ltr">
                  {x.p.phone}
                </span>
              </Link>
            ))}
          <div className="grid grid-cols-2 gap-2">
            <Kv k={t('rides.fare')} v={f.money(ride.finalFare ?? ride.estimatedFare, ride.currency)} />
            <Kv k="Payment" v={`${t(`ride.payment.${ride.paymentType}`)} · ${ride.paymentStatus ?? '—'}`} />
            <Kv k="Distance" v={f.distance(ride.estimatedDistanceMeters)} />
            <Kv k="Surge" v={`×${ride.surgeMultiplier}`} />
            {ride.discount > 0 && <Kv k="Discount" v={f.money(ride.discount, ride.currency)} />}
            {ride.tip > 0 && <Kv k="Tip" v={f.money(ride.tip, ride.currency)} />}
            {ride.driverEarning && (
              <Kv k="Commission" v={f.money(ride.driverEarning.commission, ride.currency)} />
            )}
            {ride.cancellationFee > 0 && (
              <Kv k="Cancel fee" v={f.money(ride.cancellationFee, ride.currency)} />
            )}
            <Kv k="PIN" v={ride.startPin ?? '—'} />
          </div>
          {ride.cancellationReason && (
            <p className="rounded-xl bg-danger/8 p-3 text-danger">
              {ride.cancelledByRole}: {ride.cancellationReason}
            </p>
          )}
          {tickets.map((tk) => (
            <Link key={tk.id} to={`/support?ticket=${tk.id}`} className="block rounded-xl bg-warning/10 p-3">
              #{tk.number} {tk.subject} · {tk.status}
            </Link>
          ))}
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">{t('rides.timeline')}</h2>
          <ol className="space-y-2.5 border-s border-line ps-4 text-sm">
            {history.map((h) => (
              <li key={h.id} className="relative">
                <span className="absolute -start-[21px] top-1.5 size-2.5 rounded-full bg-fg ring-4 ring-surface" />
                <p className="font-medium">
                  {t(`ride.status.${h.toStatus}`)}{' '}
                  <span className="text-xs font-normal text-muted">· {h.actorRole.toLowerCase()}</span>
                </p>
                <p className="text-xs text-muted">
                  {f.time(h.createdAt)}
                  {h.note ? ` · ${h.note}` : ''}
                </p>
              </li>
            ))}
          </ol>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">{t('rides.offers')}</h2>
          <div className="divide-y divide-line text-sm">
            {offers.map((o) => (
              <div key={o.id} className="flex justify-between py-2">
                <span>
                  {o.driver.firstName} {o.driver.lastName} · {f.distance(o.distanceM)}
                </span>
                <Badge
                  tone={o.status === 'ACCEPTED' ? 'success' : o.status === 'PENDING' ? 'info' : 'neutral'}
                >
                  {o.status}
                </Badge>
              </div>
            ))}
          </div>
          <h2 className="mb-3 mt-5 font-semibold">{t('rides.payments')}</h2>
          <div className="divide-y divide-line text-sm">
            {payments.map((p) => (
              <div key={p.id} className="py-2">
                <div className="flex justify-between">
                  <span>
                    {p.purpose} · {p.provider}
                  </span>
                  <span className="tabular font-semibold">{f.money(p.amount, ride.currency)}</span>
                </div>
                <p className="text-xs text-muted">
                  {p.receiptNumber} · {p.status}
                  {p.failureReason ? ` · ${p.failureReason}` : ''}
                </p>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">{t('rides.messages')}</h2>
          <div className="space-y-2 text-sm">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-xl px-3 py-2 ${m.senderId === ride.passenger?.id ? 'bg-surface-2' : 'bg-accent/10'}`}
              >
                <p className="text-xs text-muted">
                  {m.senderId === ride.passenger?.id ? t('rides.passenger') : t('rides.driver')} ·{' '}
                  {f.time(m.createdAt)}
                </p>
                {m.body}
              </div>
            ))}
            {!messages.length && <p className="text-muted">—</p>}
          </div>
        </Card>
      </div>
      <ConfirmDialog
        open={cancel}
        onOpenChange={setCancel}
        title={t('rides.cancel')}
        confirmLabel={t('rides.cancel')}
        cancelLabel={t('actions.back')}
        danger
        loading={act.isPending}
        onConfirm={() => (reason.trim().length >= 3 ? act.mutate('cancel') : toast.error(t('rides.reason')))}
      >
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('rides.reason')} />
      </ConfirmDialog>
      <ConfirmDialog
        open={force}
        onOpenChange={setForce}
        title={t('rides.forceComplete')}
        confirmLabel={t('actions.confirm')}
        cancelLabel={t('actions.back')}
        loading={act.isPending}
        onConfirm={() => act.mutate('complete')}
      />
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl bg-surface-2 p-2.5">
      <p className="text-[11px] text-muted">{k}</p>
      <p className="tabular font-semibold">{v}</p>
    </div>
  );
}
