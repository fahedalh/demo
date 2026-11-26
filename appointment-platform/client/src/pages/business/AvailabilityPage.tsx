import { CalendarOff, Plus, Trash2 } from 'lucide-react';
import { DateTime } from 'luxon';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { ConfirmDialog, EmptyState, Field, PageHeader, QueryView } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Badge, Card } from '@/components/ui/misc';
import { useTenant } from '@/contexts/TenantContext';
import { EntityDialog } from '@/features/business/EntityForm';
import { useTenantList, useTenantMutation } from '@/features/business/hooks';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { api } from '@/services/api';
import type { Branch, Resource, Staff } from '@/types';
import { fmtDateTime } from '@/utils/format';

interface Exception { _id: string; scope: 'business' | 'branch' | 'staff' | 'resource'; ref?: string; start: string; end: string; kind: 'closed' | 'open'; reason?: string }
const schema = z.object({ scope: z.enum(['business', 'branch', 'staff', 'resource']), ref: z.string().optional(), start: z.string().min(1, 'Required'), end: z.string().min(1, 'Required'), kind: z.enum(['closed', 'open']), reason: z.string().max(200).optional() }).refine((v) => v.scope === 'business' || !!v.ref, { path: ['ref'], message: 'Required' }).refine((v) => v.end > v.start, { path: ['end'], message: 'End must be after start' });
type Form = { scope: Exception['scope']; ref: string; start: string; end: string; kind: 'closed' | 'open'; reason: string };

export function AvailabilityPage() {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  const { business, can, staffId } = useTenant();
  useDocumentTitle(t('availability.title'));
  const tz = business.timezone;
  const list = useTenantList<Exception>('exceptions');
  const staff = useTenantList<Staff>('staff', {}, can('staff:manage'));
  const branches = useTenantList<Branch>('branches', {}, can('staff:manage'));
  const resources = useTenantList<Resource>('resources', {}, can('staff:manage'));
  const manager = can('staff:manage');
  const today = DateTime.now().setZone(tz).startOf('day');
  const empty: Form = { scope: manager ? 'business' : 'staff', ref: manager ? '' : (staffId ?? ''), start: today.plus({ days: 1 }).toFormat("yyyy-LL-dd'T'HH:mm"), end: today.plus({ days: 2 }).toFormat("yyyy-LL-dd'T'HH:mm"), kind: 'closed', reason: '' };
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(empty);
  const [del, setDel] = useState<Exception | null>(null);
  const remove = useTenantMutation((base, id: string) => api.delete(`${base}/exceptions/${id}`), { invalidate: ['exceptions'], success: t('availability.deleted') });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const refOptions = form.scope === 'staff' ? staff.data?.items : form.scope === 'branch' ? branches.data?.items : form.scope === 'resource' ? resources.data?.items : [];
  const refName = (e: Exception) => (e.scope === 'staff' ? staff.data?.items : e.scope === 'branch' ? branches.data?.items : e.scope === 'resource' ? resources.data?.items : [])?.find((x) => x._id === e.ref)?.name;
  // datetime-local values are interpreted in the business timezone.
  const toIso = (local: string) => DateTime.fromISO(local, { zone: tz }).toUTC().toISO();

  return (
    <>
      <PageHeader title={t('availability.title')} description={t('availability.subtitle')} actions={<Button onClick={() => { setForm(empty); setOpen(true); }}><Plus />{t('availability.new')}</Button>} />
      <QueryView query={list}>
        {(d) => d.items.length ? (
          <Card className="divide-y">
            {d.items.map((e) => (
              <div key={e._id} className="flex flex-wrap items-center gap-3 p-4">
                <Badge tone={e.kind === 'closed' ? 'danger' : 'success'}>{e.kind === 'closed' ? t('availability.closed') : t('availability.open')}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t(`availability.scopes.${e.scope}`)}{refName(e) ? `: ${refName(e)}` : ''}{e.reason ? ` — ${e.reason}` : ''}</p>
                  <p className="num text-sm text-muted-foreground">{fmtDateTime(e.start, tz)} → {fmtDateTime(e.end, tz)}</p>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => setDel(e)} aria-label={tc('actions.delete')}><Trash2 /></Button>
              </div>
            ))}
          </Card>
        ) : <EmptyState icon={<CalendarOff />} title={t('availability.empty')} />}
      </QueryView>
      <EntityDialog open={open} onOpenChange={setOpen} title={t('availability.new')} resource="exceptions" value={form} schema={schema} successMessage={t('availability.saved')} size="md" toPayload={(f) => ({ ...f, ref: f.scope === 'business' ? undefined : f.ref || undefined, start: toIso(f.start), end: toIso(f.end), reason: f.reason || undefined })}>
        {(err) => (
          <>
            {manager && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('availability.scope')} htmlFor="ex-scope">
                  <NativeSelect id="ex-scope" value={form.scope} onChange={(e) => { set('scope', e.target.value as Form['scope']); set('ref', ''); }}>
                    {(['business', 'branch', 'staff', 'resource'] as const).map((s) => <option key={s} value={s}>{t(`availability.scopes.${s}`)}</option>)}
                  </NativeSelect>
                </Field>
                {form.scope !== 'business' && (
                  <Field label={t(`availability.scopes.${form.scope}`)} error={err.ref} htmlFor="ex-ref" required>
                    <NativeSelect id="ex-ref" value={form.ref} onChange={(e) => set('ref', e.target.value)}>
                      <option value="">—</option>
                      {refOptions?.map((o) => <option key={o._id} value={o._id}>{o.name}</option>)}
                    </NativeSelect>
                  </Field>
                )}
              </div>
            )}
            <Field label={t('availability.kind')} htmlFor="ex-kind">
              <NativeSelect id="ex-kind" value={form.kind} onChange={(e) => set('kind', e.target.value as Form['kind'])}>
                <option value="closed">{t('availability.closed')}</option>
                <option value="open">{t('availability.open')}</option>
              </NativeSelect>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('availability.start')} error={err.start} htmlFor="ex-start"><Input id="ex-start" type="datetime-local" value={form.start} onChange={(e) => set('start', e.target.value)} /></Field>
              <Field label={t('availability.end')} error={err.end} htmlFor="ex-end"><Input id="ex-end" type="datetime-local" value={form.end} onChange={(e) => set('end', e.target.value)} /></Field>
            </div>
            <p className="text-xs text-muted-foreground">{tc('common.timezoneNote', { tz })}</p>
            <Field label={t('availability.reason')} htmlFor="ex-reason"><Input id="ex-reason" value={form.reason} onChange={(e) => set('reason', e.target.value)} /></Field>
          </>
        )}
      </EntityDialog>
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title={tc('actions.delete')} destructive onConfirm={() => remove.mutateAsync(del!._id)} />
    </>
  );
}
