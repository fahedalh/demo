import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Check, ExternalLink, FileText, X } from 'lucide-react';
import type { UserDTO, VehicleDTO } from '@masar/shared';
import {
  api,
  ApiError,
  Avatar,
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  fileUrl,
  Skeleton,
  Textarea,
  toast,
  useFormat,
} from '@masar/ui';
import { DataTable, FilterBar, FilterSelect, PageHeader, type Column } from '../components/DataTable';
import { usePaged } from '../lib/hooks';

interface Row {
  id: string;
  user: UserDTO;
  verificationStatus: string;
  submittedAt: string | null;
  isOnline: boolean;
  rating: number;
  completedRides: number;
  acceptanceRate: number | null;
  vehicle: VehicleDTO | null;
  pendingDocuments: number;
}
const tone = (s: string) =>
  (s === 'APPROVED' ? 'success' : s === 'REJECTED' ? 'danger' : s === 'NEEDS_INFO' ? 'warning' : 'info') as
    'success' | 'danger' | 'warning' | 'info';

export function DriversPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const navigate = useNavigate();
  const list = usePaged<Row>('/admin/drivers', { status: 'UNDER_REVIEW' });
  const cols: Column<Row>[] = [
    {
      key: 'name',
      header: t('users.name'),
      cell: (d) => (
        <span className="flex items-center gap-3">
          <Avatar name={`${d.user.firstName} ${d.user.lastName}`} size={32} />
          <span>
            <span className="block font-semibold">
              {d.user.firstName} {d.user.lastName}
            </span>
            <span className="block text-xs text-muted" dir="ltr">
              {d.user.phone}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: 'vehicle',
      header: t('drivers.vehicle'),
      cell: (d) =>
        d.vehicle ? (
          <span>
            <span className="block">
              {d.vehicle.year} {d.vehicle.make} {d.vehicle.model}
            </span>
            <span className="text-xs text-muted">
              {d.vehicle.category.name} · <span dir="ltr">{d.vehicle.plateNumber}</span>
            </span>
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'status',
      header: t('common.status'),
      cell: (d) => (
        <span className="flex gap-1">
          <Badge tone={tone(d.verificationStatus)}>{d.verificationStatus}</Badge>
          {d.pendingDocuments > 0 && <Badge>{d.pendingDocuments} docs</Badge>}
        </span>
      ),
    },
    {
      key: 'perf',
      header: t('drivers.acceptance'),
      cell: (d) => (
        <span className="text-xs">
          {d.completedRides} trips · ★ {d.rating.toFixed(2)}
          {d.acceptanceRate != null ? ` · ${d.acceptanceRate}%` : ''}
        </span>
      ),
    },
    {
      key: 'sub',
      header: t('drivers.submitted'),
      cell: (d) => <span className="text-muted">{d.submittedAt ? f.relative(d.submittedAt) : '—'}</span>,
    },
  ];
  return (
    <div>
      <PageHeader title={t('drivers.title')} />
      <FilterBar onSearch={(v) => list.setFilter('q', v)}>
        <FilterSelect
          label={t('common.status')}
          value={list.filters.status ?? ''}
          onChange={(v) => list.setFilter('status', v)}
          options={['UNDER_REVIEW', 'NEEDS_INFO', 'PENDING', 'APPROVED', 'REJECTED'].map((s) => ({
            value: s,
            label: s.replace('_', ' '),
          }))}
        />
      </FilterBar>
      <DataTable
        columns={cols}
        rows={list.data?.items}
        loading={list.isLoading}
        onRowClick={(d) => navigate(`/drivers/${d.id}`)}
        page={list.page}
        totalPages={list.data?.totalPages}
        total={list.data?.total}
        onPage={list.setPage}
      />
    </div>
  );
}

interface Detail {
  user: UserDTO;
  profile: {
    verificationStatus: string;
    verificationNote: string | null;
    licenseNumber: string | null;
    licenseExpiry: string | null;
    dateOfBirth: string | null;
    nationalId: string | null;
    rating: number;
    completedRides: number;
    offersReceived: number;
    offersAccepted: number;
    isOnline: boolean;
    submittedAt: string | null;
  };
  vehicles: VehicleDTO[];
  documents: {
    id: string;
    type: string;
    vehicleId: string | null;
    status: string;
    reviewNote: string | null;
    mimeType: string;
    originalName: string;
    createdAt: string;
  }[];
  earnings: { grossFare: number | null; netEarning: number | null; commission: number | null };
  wallet: { balance: number } | null;
}

export function DriverDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const [decision, setDecision] = useState<null | 'REJECT' | 'REQUEST_INFO'>(null);
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<Detail['documents'][number] | null>(null);
  const q = useQuery({
    queryKey: ['admin', 'driver', id],
    queryFn: () => api.get<Detail>(`/admin/drivers/${id}`),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'driver', id] });
  const review = useMutation({
    mutationFn: (d: 'APPROVE' | 'REJECT' | 'REQUEST_INFO') =>
      api.post(`/admin/drivers/${id}/review`, { decision: d, note: note || undefined }),
    onSuccess: () => {
      setDecision(null);
      setNote('');
      void refresh();
      void qc.invalidateQueries({ queryKey: ['/admin/drivers'] });
      toast.success(t('actions.save'));
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });
  const docReview = useMutation({
    mutationFn: ({ docId, status }: { docId: string; status: 'APPROVED' | 'REJECTED' }) =>
      api.patch(`/admin/documents/${docId}`, { status }),
    onSuccess: () => void refresh(),
  });
  const vehicleReview = useMutation({
    mutationFn: ({ vid, status }: { vid: string; status: 'APPROVED' | 'REJECTED' }) =>
      api.patch(`/admin/vehicles/${vid}`, { status }),
    onSuccess: () => void refresh(),
  });
  if (!q.data) return <Skeleton className="h-96" />;
  const d = q.data;
  const p = d.profile;
  return (
    <div>
      <Link to="/drivers" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t('drivers.title')}
      </Link>
      <Card className="mb-4 flex flex-wrap items-center gap-5 p-6">
        <Avatar name={`${d.user.firstName} ${d.user.lastName}`} src={fileUrl(d.user.avatarUrl)} size={64} />
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            {d.user.firstName} {d.user.lastName}
          </h1>
          <p className="text-sm text-muted">
            {d.user.email} · <span dir="ltr">{d.user.phone}</span>
          </p>
          <div className="mt-1 flex gap-2">
            <Badge tone={tone(p.verificationStatus)}>{p.verificationStatus}</Badge>
            {p.isOnline && <Badge tone="success">online</Badge>}
          </div>
          {p.verificationNote && <p className="mt-2 text-sm text-muted">“{p.verificationNote}”</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setDecision('REQUEST_INFO')}>
            {t('drivers.requestInfo')}
          </Button>
          <Button variant="danger" onClick={() => setDecision('REJECT')}>
            {t('drivers.reject')}
          </Button>
          {p.verificationStatus !== 'APPROVED' && (
            <Button variant="accent" loading={review.isPending} onClick={() => review.mutate('APPROVE')}>
              <Check /> {t('drivers.approve')}
            </Button>
          )}
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 text-sm">
          <h2 className="mb-3 font-semibold">{t('drivers.personal')}</h2>
          <dl className="grid grid-cols-2 gap-y-2">
            <dt className="text-muted">{t('drivers.license')}</dt>
            <dd className="font-mono">{p.licenseNumber ?? '—'}</dd>
            <dt className="text-muted">{t('drivers.licenseExpiry')}</dt>
            <dd>{p.licenseExpiry ? f.date(p.licenseExpiry) : '—'}</dd>
            <dt className="text-muted">{t('drivers.dob')}</dt>
            <dd>{p.dateOfBirth ? f.date(p.dateOfBirth) : '—'}</dd>
            <dt className="text-muted">{t('drivers.nationalId')}</dt>
            <dd className="font-mono">{p.nationalId ?? '—'}</dd>
            <dt className="text-muted">{t('drivers.earnings')}</dt>
            <dd>{f.money(d.earnings.netEarning ?? 0)}</dd>
            <dt className="text-muted">{t('users.wallet')}</dt>
            <dd>{f.money(d.wallet?.balance ?? 0)}</dd>
            <dt className="text-muted">{t('drivers.acceptance')}</dt>
            <dd>{p.offersReceived ? Math.round((p.offersAccepted / p.offersReceived) * 100) : 100}%</dd>
          </dl>
          <h2 className="mb-3 mt-6 font-semibold">{t('drivers.vehicle')}</h2>
          {d.vehicles.map((v) => (
            <div key={v.id} className="mb-2 rounded-xl bg-surface-2 p-3">
              <p className="font-semibold">
                {v.year} {v.make} {v.model} · {v.color}
              </p>
              <p className="text-xs text-muted">
                {v.category.name} · {v.seats} seats · <span dir="ltr">{v.plateNumber}</span>
                {v.isElectric ? ' · EV' : ''}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Badge tone={tone(v.status)}>{v.status}</Badge>
                {v.status !== 'APPROVED' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => vehicleReview.mutate({ vid: v.id, status: 'APPROVED' })}
                  >
                    {t('drivers.approveVehicle')}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </Card>
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-3 font-semibold">{t('drivers.documents')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {d.documents.map((doc) => (
              <div key={doc.id} className="flex gap-3 rounded-2xl border border-line p-3">
                <button
                  onClick={() => setPreview(doc)}
                  className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface-2"
                >
                  {doc.mimeType.startsWith('image/') ? (
                    <img
                      src={fileUrl(`/api/files/documents/${doc.id}`)}
                      alt={doc.type}
                      className="size-full object-cover"
                    />
                  ) : (
                    <FileText className="size-6 text-muted" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{doc.type.replace(/_/g, ' ').toLowerCase()}</p>
                  <p className="truncate text-xs text-muted">
                    {doc.originalName} · {f.relative(doc.createdAt)}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <Badge tone={tone(doc.status)}>{doc.status}</Badge>
                    {doc.status !== 'APPROVED' && (
                      <Button
                        size="icon-sm"
                        variant="outline"
                        aria-label={t('drivers.approveDoc')}
                        onClick={() => docReview.mutate({ docId: doc.id, status: 'APPROVED' })}
                      >
                        <Check />
                      </Button>
                    )}
                    {doc.status !== 'REJECTED' && (
                      <Button
                        size="icon-sm"
                        variant="outline"
                        aria-label={t('drivers.rejectDoc')}
                        onClick={() => docReview.mutate({ docId: doc.id, status: 'REJECTED' })}
                      >
                        <X />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Dialog open={!!decision} onOpenChange={(o) => !o && setDecision(null)}>
        <DialogContent title={decision === 'REJECT' ? t('drivers.reject') : t('drivers.requestInfo')}>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('drivers.note')}
            rows={4}
          />
          <Button
            block
            className="mt-4"
            variant={decision === 'REJECT' ? 'danger' : 'primary'}
            disabled={decision === 'REQUEST_INFO' && !note.trim()}
            loading={review.isPending}
            onClick={() => decision && review.mutate(decision)}
          >
            {t('actions.confirm')}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent
          title={preview?.type.replace(/_/g, ' ').toLowerCase()}
          className="sm:w-[min(92vw,760px)]"
        >
          {preview &&
            (preview.mimeType.startsWith('image/') ? (
              <img
                src={fileUrl(`/api/files/documents/${preview.id}`)}
                alt=""
                className="max-h-[70vh] w-full rounded-xl object-contain [image-rendering:pixelated]"
              />
            ) : (
              <a
                className="inline-flex items-center gap-2 font-semibold underline"
                href={fileUrl(`/api/files/documents/${preview.id}`)}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="size-4" />
                {preview.originalName}
              </a>
            ))}
        </DialogContent>
      </Dialog>
    </div>
  );
}
