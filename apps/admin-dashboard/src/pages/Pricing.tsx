import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Pencil, Plus, Zap } from 'lucide-react';
import type { VehicleCategoryDTO } from '@masar/shared';
import {
  api,
  ApiError,
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  Field,
  Input,
  Switch,
  toast,
  useFormat,
} from '@masar/ui';
import { DataTable, PageHeader, type Column } from '../components/DataTable';
import { toMajor, toMinor } from '../lib/hooks';

interface Pricing {
  id: string;
  baseFare: number;
  perKm: number;
  perMinute: number;
  minimumFare: number;
  bookingFee: number;
  cancellationFee: number;
  commissionRate: number;
  surgeMultiplier: number;
  surgeEnabled: boolean;
  currency: string;
  category: VehicleCategoryDTO;
  serviceArea: { id: string; name: string };
}
interface Area {
  id: string;
  name: string;
  nameAr: string;
  city: string;
  country: string;
  currency: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  isActive: boolean;
  timezone: string;
  _count: { rides: number };
}

export function PricingPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const [edit, setEdit] = useState<Pricing | null>(null);
  const q = useQuery({
    queryKey: ['admin', 'pricing'],
    queryFn: () => api.get<{ items: Pricing[] }>('/admin/pricing').then((r) => r.items),
  });
  const cols: Column<Pricing>[] = [
    { key: 'area', header: t('pricing.area'), cell: (p) => p.serviceArea.name },
    {
      key: 'cat',
      header: t('pricing.category'),
      cell: (p) => <span className="font-semibold">{p.category.name}</span>,
    },
    { key: 'base', header: t('pricing.base'), cell: (p) => f.money(p.baseFare, p.currency) },
    { key: 'km', header: t('pricing.perKm'), cell: (p) => f.money(p.perKm, p.currency) },
    { key: 'min', header: t('pricing.perMin'), cell: (p) => f.money(p.perMinute, p.currency) },
    { key: 'minf', header: t('pricing.min'), cell: (p) => f.money(p.minimumFare, p.currency) },
    { key: 'cancel', header: t('pricing.cancel'), cell: (p) => f.money(p.cancellationFee, p.currency) },
    { key: 'comm', header: t('pricing.commission'), cell: (p) => `${Math.round(p.commissionRate * 100)}%` },
    {
      key: 'surge',
      header: t('pricing.surge'),
      cell: (p) =>
        p.surgeEnabled ? (
          <Badge tone="warning">
            <Zap className="size-3" />≤ ×{p.surgeMultiplier}
          </Badge>
        ) : (
          <span className="text-muted">off</span>
        ),
    },
    {
      key: 'x',
      header: '',
      cell: (p) => (
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t('pricing.edit')}
          onClick={(e) => {
            e.stopPropagation();
            setEdit(p);
          }}
        >
          <Pencil />
        </Button>
      ),
    },
  ];
  return (
    <div className="space-y-8">
      <div>
        <PageHeader title={t('pricing.title')} subtitle={t('pricing.minorHint')} />
        <DataTable columns={cols} rows={q.data} loading={q.isLoading} onRowClick={setEdit} />
      </div>
      <Categories />
      <Areas />
      {edit && <EditPricing pricing={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function EditPricing({ pricing, onClose }: { pricing: Pricing; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [v, setV] = useState({
    baseFare: toMajor(pricing.baseFare),
    perKm: toMajor(pricing.perKm),
    perMinute: toMajor(pricing.perMinute),
    minimumFare: toMajor(pricing.minimumFare),
    bookingFee: toMajor(pricing.bookingFee),
    cancellationFee: toMajor(pricing.cancellationFee),
    commissionRate: String(Math.round(pricing.commissionRate * 100)),
    surgeMultiplier: String(pricing.surgeMultiplier),
    surgeEnabled: pricing.surgeEnabled,
  });
  const save = useMutation({
    mutationFn: () =>
      api.put(`/admin/pricing/${pricing.id}`, {
        baseFare: toMinor(v.baseFare),
        perKm: toMinor(v.perKm),
        perMinute: toMinor(v.perMinute),
        minimumFare: toMinor(v.minimumFare),
        bookingFee: toMinor(v.bookingFee),
        cancellationFee: toMinor(v.cancellationFee),
        commissionRate: Number(v.commissionRate) / 100,
        surgeMultiplier: Number(v.surgeMultiplier),
        surgeEnabled: v.surgeEnabled,
      }),
    onSuccess: () => {
      toast.success(t('actions.save'));
      void qc.invalidateQueries({ queryKey: ['admin', 'pricing'] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });
  const num = (k: keyof typeof v, label: string, step = '0.01') => (
    <Field label={label}>
      <Input
        type="number"
        step={step}
        min={0}
        value={v[k] as string}
        onChange={(e) => setV({ ...v, [k]: e.target.value })}
      />
    </Field>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`${pricing.category.name} · ${pricing.serviceArea.name}`}
        description={t('pricing.minorHint')}
      >
        <div className="grid grid-cols-2 gap-3">
          {num('baseFare', t('pricing.base'))}
          {num('perKm', t('pricing.perKm'))}
          {num('perMinute', t('pricing.perMin'))}
          {num('minimumFare', t('pricing.min'))}
          {num('bookingFee', t('pricing.booking'))}
          {num('cancellationFee', t('pricing.cancel'))}
          {num('commissionRate', `${t('pricing.commission')} %`, '1')}
          {num('surgeMultiplier', t('pricing.surge'), '0.1')}
        </div>
        <label className="mt-4 flex items-center justify-between rounded-xl bg-surface-2 p-3 text-sm font-medium">
          {t('pricing.surgeOn')}
          <Switch checked={v.surgeEnabled} onCheckedChange={(c) => setV({ ...v, surgeEnabled: c })} />
        </label>
        <Button block className="mt-4" loading={save.isPending} onClick={() => save.mutate()}>
          {t('actions.save')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

type Cat = VehicleCategoryDTO & { vehicles: number; rides: number };
function Categories() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Partial<Cat> | null>(null);
  const q = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: () => api.get<{ items: Cat[] }>('/admin/categories').then((r) => r.items),
  });
  const save = useMutation({
    mutationFn: (c: Partial<Cat>) => {
      const body = {
        code: c.code,
        name: c.name,
        nameAr: c.nameAr,
        description: c.description ?? undefined,
        descriptionAr: c.descriptionAr ?? undefined,
        capacity: Number(c.capacity),
        icon: c.icon ?? 'car',
        sortOrder: Number(c.sortOrder ?? 0),
        isActive: c.isActive ?? true,
      };
      return c.id ? api.put(`/admin/categories/${c.id}`, body) : api.post('/admin/categories', body);
    },
    onSuccess: () => {
      setEdit(null);
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });
  const toggle = useMutation({
    mutationFn: (c: Cat) => api.put(`/admin/categories/${c.id}`, { isActive: !c.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'categories'] }),
  });
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">{t('pricing.categories')}</h2>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setEdit({ capacity: 4, isActive: true, sortOrder: 10 })}
        >
          <Plus /> {t('pricing.addCategory')}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {q.data?.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-line p-4">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {c.name} <span className="font-normal text-muted">· {c.nameAr}</span>
              </p>
              <p className="text-xs text-muted">
                {c.code} · {c.capacity} {t('pricing.capacity')} · {c.vehicles} veh · {c.rides} rides
              </p>
            </div>
            <Button size="icon-sm" variant="ghost" onClick={() => setEdit(c)} aria-label={t('actions.edit')}>
              <Pencil />
            </Button>
            <Switch
              checked={c.isActive}
              onCheckedChange={() => toggle.mutate(c)}
              aria-label={t('pricing.active')}
            />
          </div>
        ))}
      </div>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent title={edit?.id ? edit.name : t('pricing.addCategory')}>
          {edit && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Code">
                <Input
                  value={edit.code ?? ''}
                  disabled={!!edit.id}
                  onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })}
                />
              </Field>
              <Field label={t('pricing.capacity')}>
                <Input
                  type="number"
                  value={edit.capacity ?? 4}
                  onChange={(e) => setEdit({ ...edit, capacity: Number(e.target.value) })}
                />
              </Field>
              <Field label="Name">
                <Input value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </Field>
              <Field label="الاسم">
                <Input
                  dir="rtl"
                  value={edit.nameAr ?? ''}
                  onChange={(e) => setEdit({ ...edit, nameAr: e.target.value })}
                />
              </Field>
              <Field label="Description" className="col-span-2">
                <Input
                  value={edit.description ?? ''}
                  onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                />
              </Field>
              <Field label="الوصف" className="col-span-2">
                <Input
                  dir="rtl"
                  value={edit.descriptionAr ?? ''}
                  onChange={(e) => setEdit({ ...edit, descriptionAr: e.target.value })}
                />
              </Field>
              <Button className="col-span-2" loading={save.isPending} onClick={() => save.mutate(edit)}>
                {t('actions.save')}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Areas() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Partial<Area> | null>(null);
  const q = useQuery({
    queryKey: ['admin', 'areas'],
    queryFn: () => api.get<{ items: Area[] }>('/admin/service-areas').then((r) => r.items),
  });
  const save = useMutation({
    mutationFn: (a: Partial<Area>) => {
      const body = {
        name: a.name,
        nameAr: a.nameAr,
        city: a.city,
        country: a.country,
        currency: a.currency,
        centerLat: Number(a.centerLat),
        centerLng: Number(a.centerLng),
        radiusKm: Number(a.radiusKm),
        timezone: a.timezone ?? 'Asia/Dubai',
        isActive: a.isActive ?? true,
      };
      return a.id ? api.put(`/admin/service-areas/${a.id}`, body) : api.post('/admin/service-areas', body);
    },
    onSuccess: () => {
      setEdit(null);
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });
  const set = (k: keyof Area) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setEdit({ ...edit!, [k]: e.target.value });
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">{t('pricing.areas')}</h2>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setEdit({ country: 'AE', currency: 'AED', radiusKm: 30, isActive: true })}
        >
          <Plus /> {t('pricing.addArea')}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {q.data?.map((a) => (
          <button
            key={a.id}
            onClick={() => setEdit(a)}
            className="rounded-2xl border border-line p-4 text-start hover:border-fg/30"
          >
            <div className="flex items-center justify-between">
              <p className="font-semibold">
                {a.name} · {a.nameAr}
              </p>
              <Badge tone={a.isActive ? 'success' : 'neutral'}>{a.isActive ? 'active' : 'off'}</Badge>
            </div>
            <p className="text-xs text-muted">
              {a.city}, {a.country} · {a.currency} · {a.radiusKm} km · {a._count.rides} rides
            </p>
          </button>
        ))}
      </div>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent title={edit?.id ? edit.name : t('pricing.addArea')}>
          {edit && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name">
                <Input value={edit.name ?? ''} onChange={set('name')} />
              </Field>
              <Field label="الاسم">
                <Input dir="rtl" value={edit.nameAr ?? ''} onChange={set('nameAr')} />
              </Field>
              <Field label="City">
                <Input value={edit.city ?? ''} onChange={set('city')} />
              </Field>
              <Field label="Country">
                <Input maxLength={2} value={edit.country ?? ''} onChange={set('country')} />
              </Field>
              <Field label="Center lat">
                <Input type="number" step="0.0001" value={edit.centerLat ?? ''} onChange={set('centerLat')} />
              </Field>
              <Field label="Center lng">
                <Input type="number" step="0.0001" value={edit.centerLng ?? ''} onChange={set('centerLng')} />
              </Field>
              <Field label={t('pricing.radius')}>
                <Input type="number" value={edit.radiusKm ?? ''} onChange={set('radiusKm')} />
              </Field>
              <Field label={t('pricing.currency')}>
                <Input maxLength={3} value={edit.currency ?? ''} onChange={set('currency')} />
              </Field>
              <label className="col-span-2 flex items-center justify-between rounded-xl bg-surface-2 p-3 text-sm">
                {t('pricing.active')}
                <Switch
                  checked={edit.isActive ?? true}
                  onCheckedChange={(c) => setEdit({ ...edit, isActive: c })}
                />
              </label>
              <Button className="col-span-2" loading={save.isPending} onClick={() => save.mutate(edit)}>
                {t('actions.save')}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
