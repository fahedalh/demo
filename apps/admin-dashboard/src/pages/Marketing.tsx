import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Send, Trash2 } from 'lucide-react';
import {
  api,
  ApiError,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  DialogContent,
  Field,
  Input,
  Select,
  Switch,
  Textarea,
  toast,
  useFormat,
} from '@masar/ui';
import { DataTable, PageHeader, type Column } from '../components/DataTable';
import { toMajor, toMinor } from '../lib/hooks';

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  type: 'PERCENT' | 'FIXED';
  value: number;
  maxDiscount: number | null;
  minFare: number | null;
  usageLimit: number | null;
  perUserLimit: number;
  usedCount: number;
  startsAt: string;
  endsAt: string | null;
  isActive: boolean;
  _count: { redemptions: number };
}
interface Promo {
  id: string;
  title: string;
  titleAr: string;
  description: string | null;
  descriptionAr: string | null;
  isActive: boolean;
  endsAt: string | null;
  coupons: { code: string }[];
}

export function MarketingPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Partial<Coupon> | null>(null);
  const [del, setDel] = useState<Coupon | null>(null);
  const q = useQuery({
    queryKey: ['admin', 'coupons'],
    queryFn: () => api.get<{ items: Coupon[] }>('/admin/coupons').then((r) => r.items),
  });
  const toggle = useMutation({
    mutationFn: (c: Coupon) => api.put(`/admin/coupons/${c.id}`, { isActive: !c.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'coupons'] }),
  });
  const remove = useMutation({
    mutationFn: (c: Coupon) => api.del(`/admin/coupons/${c.id}`),
    onSuccess: () => {
      setDel(null);
      void qc.invalidateQueries({ queryKey: ['admin', 'coupons'] });
    },
  });
  const expired = (c: Coupon) => !!c.endsAt && new Date(c.endsAt) < new Date();
  const cols: Column<Coupon>[] = [
    {
      key: 'code',
      header: t('marketing.code'),
      cell: (c) => (
        <span>
          <span className="font-mono font-bold">{c.code}</span>
          <span className="block text-xs text-muted">{c.description}</span>
        </span>
      ),
    },
    {
      key: 'val',
      header: t('marketing.value'),
      cell: (c) =>
        c.type === 'PERCENT'
          ? `${c.value}%${c.maxDiscount ? ` (≤ ${f.money(c.maxDiscount)})` : ''}`
          : f.money(c.value),
    },
    { key: 'min', header: t('marketing.minFare'), cell: (c) => (c.minFare ? f.money(c.minFare) : '—') },
    {
      key: 'uses',
      header: t('marketing.uses'),
      cell: (c) => (
        <span className="tabular">
          {c.usedCount}
          {c.usageLimit ? ` / ${c.usageLimit}` : ''}
        </span>
      ),
    },
    {
      key: 'until',
      header: t('marketing.validUntil'),
      cell: (c) =>
        c.endsAt ? <span className={expired(c) ? 'text-danger' : ''}>{f.date(c.endsAt)}</span> : '∞',
    },
    {
      key: 'on',
      header: t('common.status'),
      cell: (c) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Switch checked={c.isActive} onCheckedChange={() => toggle.mutate(c)} />
        </span>
      ),
    },
    {
      key: 'x',
      header: '',
      cell: (c) => (
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t('actions.delete')}
          onClick={(e) => {
            e.stopPropagation();
            setDel(c);
          }}
        >
          <Trash2 />
        </Button>
      ),
    },
  ];
  return (
    <div className="space-y-8">
      <div>
        <PageHeader
          title={t('marketing.title')}
          actions={
            <Button onClick={() => setEdit({ type: 'PERCENT', value: 10, perUserLimit: 1, isActive: true })}>
              <Plus /> {t('marketing.addCoupon')}
            </Button>
          }
        />
        <DataTable columns={cols} rows={q.data} loading={q.isLoading} onRowClick={setEdit} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Campaigns />
        <Broadcast />
      </div>
      {edit && <CouponDialog coupon={edit} onClose={() => setEdit(null)} />}
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={`${t('actions.delete')} ${del?.code}?`}
        confirmLabel={t('actions.delete')}
        cancelLabel={t('actions.cancel')}
        danger
        loading={remove.isPending}
        onConfirm={() => del && remove.mutate(del)}
      />
    </div>
  );
}

function CouponDialog({ coupon, onClose }: { coupon: Partial<Coupon>; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [v, setV] = useState({
    code: coupon.code ?? '',
    description: coupon.description ?? '',
    type: coupon.type ?? 'PERCENT',
    value: coupon.type === 'FIXED' ? toMajor(coupon.value ?? 0) : String(coupon.value ?? 10),
    maxDiscount: coupon.maxDiscount ? toMajor(coupon.maxDiscount) : '',
    minFare: coupon.minFare ? toMajor(coupon.minFare) : '',
    usageLimit: coupon.usageLimit ? String(coupon.usageLimit) : '',
    perUserLimit: String(coupon.perUserLimit ?? 1),
    endsAt: coupon.endsAt ? coupon.endsAt.slice(0, 10) : '',
  });
  const save = useMutation({
    mutationFn: () => {
      const body = {
        code: v.code,
        description: v.description || undefined,
        type: v.type,
        value: v.type === 'FIXED' ? toMinor(v.value) : Number(v.value),
        maxDiscount: v.maxDiscount ? toMinor(v.maxDiscount) : null,
        minFare: v.minFare ? toMinor(v.minFare) : null,
        usageLimit: v.usageLimit ? Number(v.usageLimit) : null,
        perUserLimit: Number(v.perUserLimit || 1),
        endsAt: v.endsAt ? new Date(`${v.endsAt}T23:59:59`).toISOString() : null,
        isActive: coupon.isActive ?? true,
      };
      return coupon.id ? api.put(`/admin/coupons/${coupon.id}`, body) : api.post('/admin/coupons', body);
    },
    onSuccess: () => {
      toast.success(t('actions.save'));
      void qc.invalidateQueries({ queryKey: ['admin', 'coupons'] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setV({ ...v, [k]: e.target.value });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={coupon.id ? coupon.code : t('marketing.addCoupon')}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('marketing.code')}>
            <Input
              className="font-mono uppercase"
              value={v.code}
              onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })}
            />
          </Field>
          <Field label={t('marketing.type')}>
            <Select value={v.type} onChange={set('type')}>
              <option value="PERCENT">{t('marketing.percent')}</option>
              <option value="FIXED">{t('marketing.fixed')}</option>
            </Select>
          </Field>
          <Field label={`${t('marketing.value')} ${v.type === 'PERCENT' ? '%' : '(AED)'}`}>
            <Input type="number" value={v.value} onChange={set('value')} />
          </Field>
          <Field label={t('marketing.maxDiscount')}>
            <Input type="number" value={v.maxDiscount} onChange={set('maxDiscount')} />
          </Field>
          <Field label={t('marketing.minFare')}>
            <Input type="number" value={v.minFare} onChange={set('minFare')} />
          </Field>
          <Field label={t('marketing.validUntil')}>
            <Input type="date" value={v.endsAt} onChange={set('endsAt')} />
          </Field>
          <Field label={t('marketing.usageLimit')}>
            <Input type="number" value={v.usageLimit} onChange={set('usageLimit')} />
          </Field>
          <Field label={t('marketing.perUser')}>
            <Input type="number" value={v.perUserLimit} onChange={set('perUserLimit')} />
          </Field>
          <Field label="Description" className="col-span-2">
            <Input value={v.description} onChange={set('description')} />
          </Field>
          <Button className="col-span-2" loading={save.isPending} onClick={() => save.mutate()}>
            {t('actions.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Campaigns() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ title: '', titleAr: '', description: '', descriptionAr: '' });
  const q = useQuery({
    queryKey: ['admin', 'promotions'],
    queryFn: () => api.get<{ items: Promo[] }>('/admin/promotions').then((r) => r.items),
  });
  const create = useMutation({
    mutationFn: () => api.post('/admin/promotions', v),
    onSuccess: () => {
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['admin', 'promotions'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });
  const toggle = useMutation({
    mutationFn: (p: Promo) => api.put(`/admin/promotions/${p.id}`, { isActive: !p.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'promotions'] }),
  });
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">{t('marketing.promotions')}</h2>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus /> {t('marketing.addPromotion')}
        </Button>
      </div>
      <div className="space-y-2">
        {q.data?.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
            <div className="flex-1">
              <p className="font-semibold">
                {p.title} · <span dir="rtl">{p.titleAr}</span>
              </p>
              <p className="text-xs text-muted">
                {p.description}{' '}
                {p.coupons.map((c) => (
                  <Badge key={c.code} className="ms-1">
                    {c.code}
                  </Badge>
                ))}
              </p>
            </div>
            <Switch checked={p.isActive} onCheckedChange={() => toggle.mutate(p)} />
          </div>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t('marketing.addPromotion')}>
          <div className="space-y-3">
            <Field label={t('marketing.titleField')}>
              <Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
            </Field>
            <Field label={t('marketing.titleAr')}>
              <Input dir="rtl" value={v.titleAr} onChange={(e) => setV({ ...v, titleAr: e.target.value })} />
            </Field>
            <Field label={t('marketing.descriptionField')}>
              <Input value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
            </Field>
            <Field label={t('marketing.descriptionAr')}>
              <Input
                dir="rtl"
                value={v.descriptionAr}
                onChange={(e) => setV({ ...v, descriptionAr: e.target.value })}
              />
            </Field>
            <Button
              block
              disabled={!v.title || !v.titleAr}
              loading={create.isPending}
              onClick={() => create.mutate()}
            >
              {t('actions.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Broadcast() {
  const { t } = useTranslation();
  const [v, setV] = useState({ audience: 'ALL', title: '', body: '' });
  const send = useMutation({
    mutationFn: () => api.post<{ recipients: number }>('/admin/notifications/broadcast', v),
    onSuccess: (r) => {
      toast.success(t('marketing.sent', { count: r.recipients }));
      setV({ ...v, title: '', body: '' });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });
  return (
    <Card className="p-5">
      <h2 className="mb-3 font-semibold">{t('marketing.broadcast')}</h2>
      <div className="space-y-3">
        <Field label={t('marketing.audience')}>
          <Select value={v.audience} onChange={(e) => setV({ ...v, audience: e.target.value })}>
            <option value="ALL">{t('common.all')}</option>
            <option value="PASSENGERS">{t('users.passengers')}</option>
            <option value="DRIVERS">{t('users.drivers')}</option>
          </Select>
        </Field>
        <Field label={t('marketing.titleField')}>
          <Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
        </Field>
        <Field label={t('marketing.body')}>
          <Textarea value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} />
        </Field>
        <Button disabled={!v.title || !v.body} loading={send.isPending} onClick={() => send.mutate()}>
          <Send /> {t('actions.send')}
        </Button>
      </div>
    </Card>
  );
}
