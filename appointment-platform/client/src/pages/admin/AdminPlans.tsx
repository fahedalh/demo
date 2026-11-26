import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Gem, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { EmptyState, Field, PageHeader, QueryView } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Badge, Card, Checkbox } from '@/components/ui/misc';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { ApiError, api, errorMessage } from '@/services/api';
import type { Plan } from '@/types';
import { money } from '@/utils/format';

type Form = Omit<Plan, '_id' | 'subscribers'>;
const empty: Form = { key: '', name: '', description: '', price: { monthly: 0, annual: 0 }, currency: 'USD', limits: { staff: 1, branches: 1, bookingsPerMonth: 50, customBranding: false, integrations: false, ai: false, advancedAnalytics: false, whatsapp: false }, features: [], highlighted: false, isActive: true, sortOrder: 0 };

export function AdminPlans() {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  useDocumentTitle(t('admin.nav.plans'));
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'plans'], queryFn: () => api.get<{ items: Plan[] }>('/admin/plans') });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [f, setF] = useState<Form>(empty);
  const [features, setFeatures] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const edit = (p?: Plan) => {
    setEditing(p?._id ?? null);
    setF(p ? { ...empty, ...p } : empty);
    setFeatures((p?.features ?? []).join('\n'));
    setErrors({});
    setOpen(true);
  };
  const lim = (k: keyof Form['limits'], v: number | boolean) => setF({ ...f, limits: { ...f.limits, [k]: v } });
  async function save() {
    setBusy(true);
    try {
      const body = { ...f, features: features.split('\n').map((x) => x.trim()).filter(Boolean) };
      if (editing) await api.patch(`/admin/plans/${editing}`, body);
      else await api.post('/admin/plans', body);
      toast.success(tc('actions.save'));
      void qc.invalidateQueries({ queryKey: ['admin', 'plans'] });
      void qc.invalidateQueries({ queryKey: ['plans'] });
      setOpen(false);
    } catch (e) {
      if (e instanceof ApiError && e.details?.fields) setErrors(Object.fromEntries(Object.entries(e.details.fields).map(([k, v]) => [k, v[0]])));
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader title={t('admin.nav.plans')} actions={<Button onClick={() => edit()}><Plus />{t('admin.planNew')}</Button>} />
      <QueryView query={q}>
        {(d) => d.items.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {d.items.map((p) => (
              <Card key={p._id} className={`flex flex-col p-5 ${p.highlighted ? 'ring-2 ring-primary' : ''} ${p.isActive ? '' : 'opacity-60'}`}>
                <div className="flex items-start justify-between"><div><p className="font-bold">{p.name}</p><p className="text-xs text-muted-foreground" dir="ltr">{p.key}</p></div><Button variant="ghost" size="icon-sm" onClick={() => edit(p)} aria-label={tc('actions.edit')}><Pencil /></Button></div>
                <p className="num mt-3 text-2xl font-bold">{money(p.price.monthly, p.currency)}<span className="text-xs font-normal text-muted-foreground">{tc('pricing.perMonth')}</span></p>
                <p className="num text-xs text-muted-foreground">{money(p.price.annual, p.currency)}{tc('pricing.perYear')}</p>
                <ul className="mt-3 flex-1 space-y-1 text-xs">{p.features.map((x) => <li key={x} className="flex gap-1.5"><Check className="h-3.5 w-3.5 text-accent" />{x}</li>)}</ul>
                <Badge className="mt-4 self-start">{t('admin.subscribers')}: <span className="num">{p.subscribers ?? 0}</span></Badge>
              </Card>
            ))}
          </div>
        ) : <EmptyState icon={<Gem />} title={tc('common.empty')} />}
      </QueryView>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={editing ? t('admin.planEdit') : t('admin.planNew')} size="lg">
          <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tc('common.key')} error={errors.key} htmlFor="pl-key" required><Input id="pl-key" dir="ltr" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value.toLowerCase() })} /></Field>
              <Field label={tc('common.name')} error={errors.name} htmlFor="pl-name" required><Input id="pl-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
              <Field label={tc('common.description')} htmlFor="pl-desc" className="sm:col-span-2"><Input id="pl-desc" value={f.description ?? ''} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
              <Field label={t('admin.monthly')} htmlFor="pl-m"><Input id="pl-m" type="number" min={0} value={f.price.monthly} onChange={(e) => setF({ ...f, price: { ...f.price, monthly: Number(e.target.value) } })} /></Field>
              <Field label={t('admin.annual')} htmlFor="pl-a"><Input id="pl-a" type="number" min={0} value={f.price.annual} onChange={(e) => setF({ ...f, price: { ...f.price, annual: Number(e.target.value) } })} /></Field>
            </div>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">{t('admin.limits')}</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                {(['staff', 'branches', 'bookingsPerMonth'] as const).map((k) => <Field key={k} label={k} htmlFor={`pl-${k}`}><Input id={`pl-${k}`} type="number" min={-1} value={f.limits[k]} onChange={(e) => lim(k, Number(e.target.value))} /></Field>)}
              </div>
              <div className="mt-3 flex flex-wrap gap-4">
                {(['customBranding', 'integrations', 'ai', 'advancedAnalytics', 'whatsapp'] as const).map((k) => <label key={k} className="flex items-center gap-2 text-sm"><Checkbox checked={f.limits[k]} onCheckedChange={(c) => lim(k, c === true)} />{k}</label>)}
              </div>
            </fieldset>
            <Field label={t('admin.features')} hint={t('admin.featuresHint')} htmlFor="pl-f"><Textarea id="pl-f" rows={5} value={features} onChange={(e) => setFeatures(e.target.value)} /></Field>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.highlighted} onCheckedChange={(c) => setF({ ...f, highlighted: c === true })} />{t('admin.highlighted')}</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.isActive} onCheckedChange={(c) => setF({ ...f, isActive: c === true })} />{tc('common.active')}</label>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>{tc('actions.cancel')}</Button><Button type="submit" loading={busy}>{tc('actions.save')}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
