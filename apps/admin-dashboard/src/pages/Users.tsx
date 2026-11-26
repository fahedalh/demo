import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Star } from 'lucide-react';
import type { RideDTO, UserDTO } from '@masar/shared';
import {
  api,
  ApiError,
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Input,
  RideStatusBadge,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  toast,
  useFormat,
} from '@masar/ui';
import { DataTable, FilterBar, FilterSelect, PageHeader, type Column } from '../components/DataTable';
import { usePaged } from '../lib/hooks';

type Row = UserDTO & {
  lastLoginAt: string | null;
  rating: number | null;
  rides: number;
  verificationStatus: string | null;
  isOnline: boolean;
  walletBalance: number;
};

export function UsersPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const navigate = useNavigate();
  const list = usePaged<Row>('/admin/users', { role: 'PASSENGER' });
  const cols: Column<Row>[] = [
    {
      key: 'name',
      header: t('users.name'),
      cell: (u) => (
        <span className="flex items-center gap-3">
          <Avatar name={`${u.firstName} ${u.lastName}`} size={32} />
          <span className="font-semibold">
            {u.firstName} {u.lastName}
          </span>
        </span>
      ),
    },
    {
      key: 'contact',
      header: t('users.contact'),
      cell: (u) => (
        <span className="text-xs">
          <span className="block">{u.email}</span>
          <span className="block text-muted" dir="ltr">
            {u.phone}
          </span>
        </span>
      ),
    },
    { key: 'rides', header: t('users.rides'), cell: (u) => <span className="tabular">{u.rides}</span> },
    {
      key: 'rating',
      header: t('users.rating'),
      cell: (u) =>
        u.rating != null ? (
          <span className="inline-flex items-center gap-1">
            <Star className="size-3.5 fill-amber-400 text-amber-400" />
            {u.rating.toFixed(2)}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'wallet',
      header: t('users.wallet'),
      cell: (u) => <span className="tabular">{f.money(u.walletBalance)}</span>,
    },
    {
      key: 'status',
      header: t('common.status'),
      cell: (u) => (
        <span className="flex gap-1">
          <Badge tone={u.status === 'ACTIVE' ? 'success' : 'danger'}>{u.status}</Badge>
          {u.verificationStatus && u.verificationStatus !== 'APPROVED' && (
            <Badge tone="info">{u.verificationStatus}</Badge>
          )}
          {u.isOnline && <Badge tone="success">online</Badge>}
        </span>
      ),
    },
    {
      key: 'joined',
      header: t('users.joined'),
      cell: (u) => <span className="text-muted">{f.date(u.createdAt)}</span>,
    },
  ];
  return (
    <div>
      <PageHeader title={t('users.title')} />
      <Tabs
        value={list.filters.role ?? 'PASSENGER'}
        onValueChange={(v) => list.setFilter('role', v)}
        className="mb-4"
      >
        <TabsList>
          <TabsTrigger value="PASSENGER">{t('users.passengers')}</TabsTrigger>
          <TabsTrigger value="DRIVER">{t('users.drivers')}</TabsTrigger>
          <TabsTrigger value="ADMIN">{t('users.admins')}</TabsTrigger>
        </TabsList>
      </Tabs>
      <FilterBar onSearch={(v) => list.setFilter('q', v)}>
        <FilterSelect
          label={t('common.status')}
          value={list.filters.status ?? ''}
          onChange={(v) => list.setFilter('status', v)}
          options={[
            { value: 'ACTIVE', label: 'Active' },
            { value: 'SUSPENDED', label: 'Suspended' },
          ]}
        />
      </FilterBar>
      <DataTable
        columns={cols}
        rows={list.data?.items}
        loading={list.isLoading}
        onRowClick={(u) => navigate(`/users/${u.id}`)}
        page={list.page}
        totalPages={list.data?.totalPages}
        total={list.data?.total}
        onPage={list.setPage}
      />
    </div>
  );
}

interface UserDetail {
  user: UserDTO;
  lastLoginAt: string | null;
  passengerProfile: { rating: number; totalRides: number } | null;
  driverProfile: {
    verificationStatus: string;
    rating: number;
    completedRides: number;
    isOnline: boolean;
  } | null;
  wallet: {
    balance: number;
    transactions: {
      id: string;
      type: string;
      amount: number;
      description: string | null;
      createdAt: string;
    }[];
  } | null;
  emergencyContacts: { id: string; name: string; phone: string }[];
  savedPlaces: { id: string; label: string; address: string }[];
  paymentMethods: { id: string; brand: string; last4: string; isDefault: boolean }[];
  rides: RideDTO[];
  tickets: { id: string; number: number; subject: string; status: string }[];
}

export function UserDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState('');
  const q = useQuery({
    queryKey: ['admin', 'user', id],
    queryFn: () => api.get<UserDetail>(`/admin/users/${id}`),
  });
  const setStatus = useMutation({
    mutationFn: (status: 'ACTIVE' | 'SUSPENDED') =>
      api.patch(`/admin/users/${id}/status`, { status, reason: reason || undefined }),
    onSuccess: () => {
      setConfirm(false);
      void qc.invalidateQueries({ queryKey: ['admin', 'user', id] });
      toast.success(t('actions.save'));
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });
  if (!q.data) return <Skeleton className="h-96" />;
  const d = q.data;
  const u = d.user;
  return (
    <div>
      <Link to="/users" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t('users.title')}
      </Link>
      <Card className="mb-4 flex flex-wrap items-center gap-5 p-6">
        <Avatar name={`${u.firstName} ${u.lastName}`} size={64} />
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            {u.firstName} {u.lastName}
          </h1>
          <p className="text-sm text-muted">
            {u.role}
            {u.adminRole ? ` · ${u.adminRole}` : ''} · {u.email} · <span dir="ltr">{u.phone}</span>
          </p>
          <p className="text-xs text-muted">
            {t('users.joined')} {f.date(u.createdAt)} · {t('users.lastLogin')}{' '}
            {d.lastLoginAt ? f.relative(d.lastLoginAt) : '—'}
          </p>
        </div>
        <Badge tone={u.status === 'ACTIVE' ? 'success' : 'danger'}>{u.status}</Badge>
        {u.role === 'DRIVER' && (
          <Button variant="outline" onClick={() => navigate(`/drivers/${u.id}`)}>
            {t('drivers.title')}
          </Button>
        )}
        {u.status === 'ACTIVE' ? (
          <Button variant="danger" onClick={() => setConfirm(true)}>
            {t('users.suspend')}
          </Button>
        ) : (
          <Button variant="accent" loading={setStatus.isPending} onClick={() => setStatus.mutate('ACTIVE')}>
            {t('users.activate')}
          </Button>
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-3 font-semibold">{t('rides.title')}</h2>
          <div className="divide-y divide-line text-sm">
            {d.rides.map((r) => (
              <Link
                key={r.id}
                to={`/rides/${r.id}`}
                className="flex items-center gap-3 py-2.5 hover:bg-surface-2/50"
              >
                <span className="w-24 font-mono text-xs">{r.code}</span>
                <span className="min-w-0 flex-1 truncate">{r.dropoff.address}</span>
                <RideStatusBadge status={r.status} />
                <span className="tabular w-24 text-end">
                  {f.money(r.finalFare ?? r.estimatedFare, r.currency)}
                </span>
              </Link>
            ))}
          </div>
        </Card>
        <div className="space-y-4">
          <Card className="p-5 text-sm">
            <h2 className="mb-2 font-semibold">
              {t('users.wallet')}: {f.money(d.wallet?.balance ?? 0)}
            </h2>
            {d.wallet?.transactions.slice(0, 6).map((tx) => (
              <div key={tx.id} className="flex justify-between py-1">
                <span className="truncate text-muted">{tx.description ?? tx.type}</span>
                <span className="tabular">{f.money(tx.amount)}</span>
              </div>
            ))}
          </Card>
          {d.paymentMethods.length > 0 && (
            <Card className="p-5 text-sm">
              <h2 className="mb-2 font-semibold">Cards</h2>
              {d.paymentMethods.map((p) => (
                <p key={p.id}>
                  {p.brand?.toUpperCase()} •••• {p.last4} {p.isDefault && <Badge>default</Badge>}
                </p>
              ))}
            </Card>
          )}
          {d.emergencyContacts.length > 0 && (
            <Card className="p-5 text-sm">
              <h2 className="mb-2 font-semibold">Emergency contacts</h2>
              {d.emergencyContacts.map((c) => (
                <p key={c.id}>
                  {c.name} · <span dir="ltr">{c.phone}</span>
                </p>
              ))}
            </Card>
          )}
          {d.tickets.length > 0 && (
            <Card className="p-5 text-sm">
              <h2 className="mb-2 font-semibold">{t('support.tickets')}</h2>
              {d.tickets.map((tk) => (
                <Link key={tk.id} to={`/support?ticket=${tk.id}`} className="block py-1 hover:underline">
                  #{tk.number} {tk.subject} · {tk.status}
                </Link>
              ))}
            </Card>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('users.suspendTitle')}
        description={t('users.suspendHelp')}
        confirmLabel={t('users.suspend')}
        cancelLabel={t('actions.cancel')}
        danger
        loading={setStatus.isPending}
        onConfirm={() => setStatus.mutate('SUSPENDED')}
      >
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('rides.reason')} />
      </ConfirmDialog>
    </div>
  );
}
