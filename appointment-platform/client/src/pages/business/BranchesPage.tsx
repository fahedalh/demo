import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { defaultWeeklySchedule, type WeeklySchedule } from '@bookly/shared';
import { ConfirmDialog, EmptyState, Field, PageHeader, QueryView } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, Card, Checkbox } from '@/components/ui/misc';
import { WeeklyScheduleEditor } from '@/features/business/editors';
import { EntityDialog } from '@/features/business/EntityForm';
import { useTenantList, useTenantMutation } from '@/features/business/hooks';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { api } from '@/services/api';
import type { Branch } from '@/types';

const schema = z.object({
  name: z.string().trim().min(2, 'Required'),
  phone: z.string().max(30).optional(),
  timezone: z.string().max(60).optional(),
  address: z.object({ line1: z.string().optional(), city: z.string().optional(), country: z.string().optional(), lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional() }),
  workingHours: z.array(z.any()),
  isActive: z.boolean(),
});
type Form = { name: string; phone: string; timezone: string; line1: string; city: string; country: string; lat: string; lng: string; workingHours: WeeklySchedule; isActive: boolean };
const empty: Form = { name: '', phone: '', timezone: '', line1: '', city: '', country: '', lat: '', lng: '', workingHours: defaultWeeklySchedule(), isActive: true };

export function BranchesPage() {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  useDocumentTitle(t('branches.title'));
  const list = useTenantList<Branch>('branches');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [del, setDel] = useState<Branch | null>(null);
  const remove = useTenantMutation((base, id: string) => api.delete(`${base}/branches/${id}`), { invalidate: ['branches'], success: t('branches.deleted') });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const edit = (b?: Branch) => {
    setEditing(b?._id ?? null);
    const c = b?.address?.location?.coordinates;
    setForm(b ? { name: b.name, phone: b.phone ?? '', timezone: b.timezone ?? '', line1: b.address?.line1 ?? '', city: b.address?.city ?? '', country: b.address?.country ?? '', lat: c ? String(c[1]) : '', lng: c ? String(c[0]) : '', workingHours: b.workingHours, isActive: b.isActive } : empty);
    setOpen(true);
  };
  return (
    <>
      <PageHeader title={t('branches.title')} description={t('branches.subtitle')} actions={<Button onClick={() => edit()}><Plus />{t('branches.new')}</Button>} />
      <QueryView query={list}>
        {(d) => d.items.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {d.items.map((b) => (
              <Card key={b._id} className={`p-5 ${b.isActive ? '' : 'opacity-60'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{b.name}</p>
                    <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-4 w-4" />{[b.address?.line1, b.address?.city, b.address?.country].filter(Boolean).join(', ') || '—'}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => edit(b)} aria-label={tc('actions.edit')}><Pencil /></Button>
                    {b.isActive && <Button variant="ghost" size="icon-sm" onClick={() => setDel(b)} aria-label={tc('actions.delete')}><Trash2 /></Button>}
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {b.workingHours.map((h) => (
                    <div key={h.day} className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">{tc(`days.${h.day}`)}</dt>
                      <dd className="num">{h.enabled ? h.intervals.map((i) => `${i.start}–${i.end}`).join(', ') : tc('business.closed')}</dd>
                    </div>
                  ))}
                </dl>
                {!b.isActive && <Badge tone="muted" className="mt-3">{tc('status.inactive')}</Badge>}
              </Card>
            ))}
          </div>
        ) : <EmptyState icon={<MapPin />} title={t('branches.empty')} action={<Button onClick={() => edit()}><Plus />{t('branches.new')}</Button>} />}
      </QueryView>
      <EntityDialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? t('branches.edit') : t('branches.new')}
        resource="branches"
        editingId={editing}
        value={form}
        schema={schema}
        successMessage={t('branches.saved')}
        size="xl"
        toPayload={(f) => ({ name: f.name, phone: f.phone || undefined, timezone: f.timezone || undefined, isActive: f.isActive, workingHours: f.workingHours, address: { line1: f.line1 || undefined, city: f.city || undefined, country: f.country || undefined, lat: f.lat ? Number(f.lat) : undefined, lng: f.lng ? Number(f.lng) : undefined } })}
      >
        {(err) => (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tc('common.name')} error={err.name} htmlFor="br-name" required><Input id="br-name" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
              <Field label={tc('common.phone')} htmlFor="br-phone"><Input id="br-phone" dir="ltr" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
              <Field label={tc('common.address')} htmlFor="br-l1" className="sm:col-span-2"><Input id="br-l1" value={form.line1} onChange={(e) => set('line1', e.target.value)} /></Field>
              <Field label={tc('common.city')} htmlFor="br-city"><Input id="br-city" value={form.city} onChange={(e) => set('city', e.target.value)} /></Field>
              <Field label={tc('common.country')} htmlFor="br-country"><Input id="br-country" value={form.country} onChange={(e) => set('country', e.target.value)} /></Field>
              <Field label={t('branches.lat')} error={err.address} htmlFor="br-lat"><Input id="br-lat" type="number" step="any" dir="ltr" value={form.lat} onChange={(e) => set('lat', e.target.value)} /></Field>
              <Field label={t('branches.lng')} htmlFor="br-lng"><Input id="br-lng" type="number" step="any" dir="ltr" value={form.lng} onChange={(e) => set('lng', e.target.value)} /></Field>
              <Field label={t('branches.timezone')} htmlFor="br-tz"><Input id="br-tz" dir="ltr" placeholder="Asia/Riyadh" value={form.timezone} onChange={(e) => set('timezone', e.target.value)} /></Field>
            </div>
            <Field label={t('branches.hours')}><WeeklyScheduleEditor value={form.workingHours} onChange={(v) => set('workingHours', v)} /></Field>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.isActive} onCheckedChange={(c) => set('isActive', c === true)} />{tc('common.active')}</label>
          </>
        )}
      </EntityDialog>
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title={`${tc('actions.delete')}: ${del?.name ?? ''}`} destructive onConfirm={() => remove.mutateAsync(del!._id)} />
    </>
  );
}
