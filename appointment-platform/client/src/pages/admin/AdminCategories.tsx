import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BOOKING_FLOW_STEPS, THEME_PRESETS, type CustomField, type ThemePreset } from '@bookly/shared';
import { ConfirmDialog, EmptyState, Field, PageHeader, QueryView } from '@/components/common';
import { CategoryIcon, ICON_NAMES } from '@/components/common/CategoryIcon';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Badge, Card, Checkbox } from '@/components/ui/misc';
import { ColorInput, CustomFieldsEditor } from '@/features/business/editors';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useLocalized } from '@/hooks/useLocalized';
import { ApiError, api, errorMessage } from '@/services/api';
import type { Category } from '@/types';

type Form = Omit<Category, '_id' | 'businessCount'>;
const empty: Form = {
  slug: '', name: { en: '', ar: '' }, description: { en: '', ar: '' }, icon: 'Sparkles', color: '#6366f1',
  terminology: { staff: { en: 'Staff', ar: 'الموظف' }, service: { en: 'Service', ar: 'الخدمة' }, resource: { en: 'Resource', ar: 'المورد' } },
  bookingFlow: { steps: ['service', 'staff', 'datetime', 'details', 'payment'], requireStaff: false, resourceFirst: false, sessionModes: ['in_person'], customFields: [] },
  subcategories: [], theme: 'default', isActive: true, sortOrder: 0,
};

export function AdminCategories() {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  const loc = useLocalized();
  useDocumentTitle(t('admin.nav.categories'));
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'categories'], queryFn: () => api.get<{ items: Category[] }>('/admin/categories') });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [f, setF] = useState<Form>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<Category | null>(null);

  const edit = (c?: Category) => {
    setEditing(c?._id ?? null);
    setF(c ? { ...empty, ...c, description: c.description ?? { en: '', ar: '' } } : empty);
    setErrors({});
    setOpen(true);
  };
  const steps = f.bookingFlow.steps;
  const moveStep = (i: number, dir: -1 | 1) => {
    const next = [...steps];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    setF({ ...f, bookingFlow: { ...f.bookingFlow, steps: next } });
  };

  async function save() {
    const errs: Record<string, string> = {};
    if (!/^[a-z0-9-]{2,60}$/.test(f.slug)) errs.slug = 'a-z, 0-9, -';
    if (!f.name.en.trim()) errs.name = tc('common.required');
    if (!steps.includes('datetime')) errs.steps = 'datetime';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const { subcategories: _s, ...payload } = f;
      const body = { ...payload, description: f.description?.en ? f.description : undefined, bookingFlow: { ...f.bookingFlow, customFields: f.bookingFlow.customFields.filter((c) => c.key && c.label.en) } };
      if (editing) await api.patch(`/admin/categories/${editing}`, body);
      else await api.post('/admin/categories', body);
      toast.success(tc('actions.save'));
      void qc.invalidateQueries({ queryKey: ['admin', 'categories'] });
      void qc.invalidateQueries({ queryKey: ['categories'] });
      setOpen(false);
    } catch (e) {
      if (e instanceof ApiError && e.details?.fields) setErrors(Object.fromEntries(Object.entries(e.details.fields).map(([k, v]) => [k, v[0]])));
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const term = (k: 'staff' | 'service' | 'resource', lang: 'en' | 'ar', v: string) => setF({ ...f, terminology: { ...f.terminology, [k]: { ...f.terminology[k], [lang]: v } } });

  return (
    <>
      <PageHeader title={t('admin.nav.categories')} actions={<Button onClick={() => edit()}><Plus />{t('admin.categoryNew')}</Button>} />
      <QueryView query={q}>
        {(d) => d.items.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {d.items.map((c) => (
              <Card key={c._id} className={`p-5 ${c.isActive ? '' : 'opacity-60'}`}>
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: `${c.color}1f`, color: c.color }}><CategoryIcon name={c.icon} className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1"><p className="font-semibold">{loc(c.name)}</p><p className="text-xs text-muted-foreground" dir="ltr">/{c.slug}</p></div>
                  <Button variant="ghost" size="icon-sm" onClick={() => edit(c)} aria-label={tc('actions.edit')}><Pencil /></Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => setDel(c)} aria-label={tc('actions.delete')}><Trash2 /></Button>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">{c.bookingFlow.steps.map((s, i) => <Badge key={s} tone="primary">{i + 1}. {tc(`booking.steps.${s}`)}</Badge>)}</div>
                <p className="mt-3 text-xs text-muted-foreground">{t(`settings.themes.${c.theme ?? 'default'}`)} · {loc(c.terminology.staff)} · {loc(c.terminology.service)} · {c.bookingFlow.customFields.length} {t('services.customFields').toLowerCase()}</p>
              </Card>
            ))}
          </div>
        ) : <EmptyState icon={<Layers />} title={tc('common.empty')} />}
      </QueryView>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={editing ? t('admin.categoryEdit') : t('admin.categoryNew')} size="xl">
          <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="space-y-6" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('admin.slug')} error={errors.slug} htmlFor="c-slug" required><Input id="c-slug" dir="ltr" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} /></Field>
              <Field label={t('admin.icon')} htmlFor="c-icon">
                <div className="flex items-center gap-2"><CategoryIcon name={f.icon} className="h-5 w-5" /><NativeSelect id="c-icon" value={f.icon} onChange={(e) => setF({ ...f, icon: e.target.value })}>{ICON_NAMES.map((n) => <option key={n}>{n}</option>)}</NativeSelect></div>
              </Field>
              <Field label={t('admin.nameEn')} error={errors.name} htmlFor="c-en" required><Input id="c-en" value={f.name.en} onChange={(e) => setF({ ...f, name: { ...f.name, en: e.target.value } })} /></Field>
              <Field label={t('admin.nameAr')} htmlFor="c-ar"><Input id="c-ar" dir="rtl" value={f.name.ar ?? ''} onChange={(e) => setF({ ...f, name: { ...f.name, ar: e.target.value } })} /></Field>
              <Field label={t('admin.descEn')} htmlFor="c-den"><Input id="c-den" value={f.description?.en ?? ''} onChange={(e) => setF({ ...f, description: { ...f.description!, en: e.target.value } })} /></Field>
              <Field label={t('admin.descAr')} htmlFor="c-dar"><Input id="c-dar" dir="rtl" value={f.description?.ar ?? ''} onChange={(e) => setF({ ...f, description: { en: f.description?.en ?? '', ar: e.target.value } })} /></Field>
              <Field label={tc('common.color')}><ColorInput value={f.color} onChange={(v) => setF({ ...f, color: v })} /></Field>
              <Field label={t('admin.defaultTheme')} hint={t('settings.themeHint')} htmlFor="c-theme">
                <NativeSelect id="c-theme" value={f.theme ?? 'default'} onChange={(e) => setF({ ...f, theme: e.target.value as ThemePreset })}>
                  {THEME_PRESETS.map((p) => <option key={p} value={p}>{t(`settings.themes.${p}`)}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Sort" htmlFor="c-sort"><Input id="c-sort" type="number" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: Number(e.target.value) })} /></Field>
            </div>

            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-semibold">{t('admin.terminology')}</legend>
              {(['staff', 'service', 'resource'] as const).map((k) => (
                <div key={k} className="grid gap-2 sm:grid-cols-[160px,1fr,1fr] sm:items-center">
                  <span className="text-sm text-muted-foreground">{t(`admin.term${k[0].toUpperCase()}${k.slice(1)}` as 'admin.termStaff')}</span>
                  <Input value={f.terminology[k].en} onChange={(e) => term(k, 'en', e.target.value)} aria-label={`${k} EN`} />
                  <Input dir="rtl" value={f.terminology[k].ar ?? ''} onChange={(e) => term(k, 'ar', e.target.value)} aria-label={`${k} AR`} />
                </div>
              ))}
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-semibold">{t('admin.flow')}</legend>
              <p className="text-xs text-muted-foreground">{t('admin.flowSteps')}{errors.steps && <span className="text-destructive"> — {tc('booking.steps.datetime')} {tc('common.required')}</span>}</p>
              <ol className="space-y-1.5">
                {steps.map((s, i) => (
                  <li key={s} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
                    <span className="num w-5 text-muted-foreground">{i + 1}</span><span className="flex-1">{tc(`booking.steps.${s}`)}</span>
                    <Button type="button" variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => moveStep(i, -1)} aria-label="Up"><ArrowUp /></Button>
                    <Button type="button" variant="ghost" size="icon-sm" disabled={i === steps.length - 1} onClick={() => moveStep(i, 1)} aria-label="Down"><ArrowDown /></Button>
                    <Button type="button" variant="ghost" size="icon-sm" disabled={s === 'datetime'} onClick={() => setF({ ...f, bookingFlow: { ...f.bookingFlow, steps: steps.filter((x) => x !== s) } })} aria-label={tc('actions.remove')}><Trash2 /></Button>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap gap-2">
                {BOOKING_FLOW_STEPS.filter((s) => !steps.includes(s)).map((s) => <Button key={s} type="button" variant="outline" size="sm" onClick={() => setF({ ...f, bookingFlow: { ...f.bookingFlow, steps: [...steps, s] } })}><Plus />{tc(`booking.steps.${s}`)}</Button>)}
              </div>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.bookingFlow.requireStaff} onCheckedChange={(c) => setF({ ...f, bookingFlow: { ...f.bookingFlow, requireStaff: c === true } })} />{t('admin.requireStaff')}</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.bookingFlow.resourceFirst} onCheckedChange={(c) => setF({ ...f, bookingFlow: { ...f.bookingFlow, resourceFirst: c === true } })} />{t('admin.resourceFirst')}</label>
              <div className="flex gap-4 text-sm"><span className="text-muted-foreground">{t('admin.sessionModes')}:</span>
                {(['in_person', 'online'] as const).map((m) => <label key={m} className="flex items-center gap-2"><Checkbox checked={f.bookingFlow.sessionModes.includes(m)} onCheckedChange={(c) => setF({ ...f, bookingFlow: { ...f.bookingFlow, sessionModes: c ? [...f.bookingFlow.sessionModes, m] : f.bookingFlow.sessionModes.filter((x) => x !== m) } })} />{m === 'online' ? tc('common.online') : tc('common.inPerson')}</label>)}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-sm font-semibold">{t('services.customFields')}</legend>
              <CustomFieldsEditor value={f.bookingFlow.customFields as CustomField[]} onChange={(v) => setF({ ...f, bookingFlow: { ...f.bookingFlow, customFields: v } })} />
            </fieldset>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.isActive} onCheckedChange={(c) => setF({ ...f, isActive: c === true })} />{tc('common.active')}</label>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>{tc('actions.cancel')}</Button><Button type="submit" loading={busy}>{tc('actions.save')}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title={`${tc('actions.delete')}: ${del ? loc(del.name) : ''}`} destructive onConfirm={async () => { await api.delete(`/admin/categories/${del!._id}`); void qc.invalidateQueries({ queryKey: ['admin', 'categories'] }); }} />
    </>
  );
}
