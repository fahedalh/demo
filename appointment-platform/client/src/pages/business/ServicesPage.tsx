import { Clock, LayoutGrid, MoreHorizontal, Pencil, Plus, Trash2, Users, Video } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import type { CustomField } from '@bookly/shared';
import { ConfirmDialog, EmptyState, Field, PageHeader, QueryView } from '@/components/common';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Badge, Card, Checkbox } from '@/components/ui/misc';
import { useTenant } from '@/contexts/TenantContext';
import { ChipSelect, ColorInput, CustomFieldsEditor } from '@/features/business/editors';
import { EntityDialog } from '@/features/business/EntityForm';
import { useTenantList, useTenantMutation } from '@/features/business/hooks';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { api } from '@/services/api';
import type { Resource, Service, Staff } from '@/types';
import { fmtDuration, money } from '@/utils/format';

const schema = z.object({
  name: z.string().trim().min(2, 'Required'),
  description: z.string().max(2000).optional(),
  group: z.string().max(60).optional(),
  duration: z.number().int().min(5).max(1440),
  bufferBefore: z.number().int().min(0).max(240),
  bufferAfter: z.number().int().min(0).max(240),
  price: z.number().min(0),
  depositPercent: z.number().min(0).max(100).nullable(),
  capacity: z.number().int().min(1).max(1000),
  staff: z.array(z.string()),
  resources: z.array(z.string()),
  sessionModes: z.array(z.enum(['in_person', 'online'])).min(1, 'Select at least one'),
  requiresApproval: z.boolean().nullable(),
  customFields: z.array(z.object({ key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/, 'Invalid key'), label: z.object({ en: z.string().min(1, 'Label required'), ar: z.string().optional() }), type: z.string(), required: z.boolean(), options: z.array(z.string()).optional() })),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  isActive: z.boolean(),
});

type Form = z.infer<typeof schema>;
const empty: Form = { name: '', description: '', group: '', duration: 30, bufferBefore: 0, bufferAfter: 0, price: 0, depositPercent: null, capacity: 1, staff: [], resources: [], sessionModes: ['in_person'], requiresApproval: null, customFields: [], color: '#6366f1', isActive: true };

export function ServicesPage() {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  const { business, terms } = useTenant();
  useDocumentTitle(t('services.title'));
  const list = useTenantList<Service>('services');
  const staff = useTenantList<Staff>('staff', { active: 'true' });
  const resources = useTenantList<Resource>('resources', { active: 'true' });
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(empty);
  const [del, setDel] = useState<Service | null>(null);
  const archive = useTenantMutation((base, sid: string) => api.delete(`${base}/services/${sid}`), { invalidate: ['services'], success: t('services.deleted') });

  const edit = (s?: Service) => {
    setEditing(s?._id ?? null);
    setForm(s ? { ...empty, ...s, description: s.description ?? '', group: s.group ?? '', depositPercent: s.depositPercent ?? null, requiresApproval: s.requiresApproval ?? null, customFields: s.customFields as Form['customFields'] } : empty);
    setOpen(true);
  };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      <PageHeader title={t('services.title')} description={t('services.subtitle')} actions={<Button onClick={() => edit()}><Plus />{t('services.new')}</Button>} />
      <QueryView query={list}>
        {(d) => d.items.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {d.items.map((s) => (
              <Card key={s._id} className={`p-5 ${s.isActive ? '' : 'opacity-60'}`}>
                <div className="flex items-start gap-3">
                  <span className="mt-1 h-10 w-1.5 shrink-0 rounded-full" style={{ background: s.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{s.name}</p>
                    {s.group && <p className="text-xs text-muted-foreground">{s.group}</p>}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={tc('common.actions')}><MoreHorizontal /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onSelect={() => edit(s)}><Pencil />{tc('actions.edit')}</DropdownMenuItem>
                      {s.isActive && <DropdownMenuItem danger onSelect={() => setDel(s)}><Trash2 />{tc('actions.delete')}</DropdownMenuItem>}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {s.description && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{s.description}</p>}
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  <Badge><Clock className="h-3 w-3" />{fmtDuration(s.duration)}</Badge>
                  {s.capacity > 1 && <Badge tone="info"><Users className="h-3 w-3" />{s.capacity}</Badge>}
                  {s.sessionModes.includes('online') && <Badge tone="primary"><Video className="h-3 w-3" />{tc('common.online')}</Badge>}
                  {!s.isActive && <Badge tone="muted">{tc('status.inactive')}</Badge>}
                  <span className="num ms-auto text-base font-bold">{s.price ? money(s.price, business.currency) : tc('common.free')}</span>
                </div>
              </Card>
            ))}
          </div>
        ) : <EmptyState icon={<LayoutGrid />} title={t('services.empty')} description={t('services.emptyHint')} action={<Button onClick={() => edit()}><Plus />{t('services.new')}</Button>} />}
      </QueryView>

      <EntityDialog open={open} onOpenChange={setOpen} title={editing ? t('services.edit') : t('services.new')} resource="services" editingId={editing} value={form} schema={schema} successMessage={t('services.saved')} size="xl">
        {(err) => (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tc('common.name')} error={err.name} htmlFor="s-name" required><Input id="s-name" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
              <Field label={t('services.group')} htmlFor="s-group"><Input id="s-group" placeholder={t('services.groupPh')} value={form.group} onChange={(e) => set('group', e.target.value)} /></Field>
              <Field label={tc('common.description')} htmlFor="s-desc" className="sm:col-span-2"><Textarea id="s-desc" value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
              <Field label={`${tc('common.duration')} (${tc('common.minutes')})`} error={err.duration} htmlFor="s-dur" required><Input id="s-dur" type="number" min={5} step={5} value={form.duration} onChange={(e) => set('duration', Number(e.target.value))} /></Field>
              <Field label={`${tc('common.price')} (${business.currency})`} error={err.price} htmlFor="s-price"><Input id="s-price" type="number" min={0} step="0.01" value={form.price} onChange={(e) => set('price', Number(e.target.value))} /></Field>
              <Field label={t('services.bufferBefore')} hint={t('services.bufferHint')} htmlFor="s-bb"><Input id="s-bb" type="number" min={0} step={5} value={form.bufferBefore} onChange={(e) => set('bufferBefore', Number(e.target.value))} /></Field>
              <Field label={t('services.bufferAfter')} htmlFor="s-ba"><Input id="s-ba" type="number" min={0} step={5} value={form.bufferAfter} onChange={(e) => set('bufferAfter', Number(e.target.value))} /></Field>
              <Field label={t('services.capacity')} hint={t('services.capacityHint')} htmlFor="s-cap"><Input id="s-cap" type="number" min={1} value={form.capacity} onChange={(e) => set('capacity', Number(e.target.value))} /></Field>
              <Field label={t('services.deposit')} hint={t('services.depositHint')} htmlFor="s-dep"><Input id="s-dep" type="number" min={0} max={100} value={form.depositPercent ?? ''} onChange={(e) => set('depositPercent', e.target.value === '' ? null : Number(e.target.value))} /></Field>
              <Field label={t('services.approval')} htmlFor="s-appr">
                <NativeSelect id="s-appr" value={form.requiresApproval === null ? '' : String(form.requiresApproval)} onChange={(e) => set('requiresApproval', e.target.value === '' ? null : e.target.value === 'true')}>
                  <option value="">{t('services.approvalDefault')}</option>
                  <option value="true">{t('services.approvalRequired')}</option>
                  <option value="false">{t('services.approvalAuto')}</option>
                </NativeSelect>
              </Field>
              <Field label={tc('common.color')} htmlFor="s-color"><ColorInput id="s-color" value={form.color} onChange={(v) => set('color', v)} /></Field>
            </div>
            <Field label={t('services.modes')} error={err.sessionModes}>
              <div className="flex gap-4">
                {(['in_person', 'online'] as const).map((m) => (
                  <label key={m} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={form.sessionModes.includes(m)} onCheckedChange={(c) => set('sessionModes', c ? [...form.sessionModes, m] : form.sessionModes.filter((x) => x !== m))} />
                    {m === 'online' ? tc('common.online') : tc('common.inPerson')}
                  </label>
                ))}
              </div>
            </Field>
            <Field label={`${t('services.staff')} (${terms.staff})`} hint={t('services.staffHint')}>
              <ChipSelect items={staff.data?.items ?? []} value={form.staff} onChange={(v) => set('staff', v)} />
            </Field>
            {(resources.data?.items.length ?? 0) > 0 && (
              <Field label={`${t('services.resources')} (${terms.resource})`} hint={t('services.resourcesHint')}>
                <ChipSelect items={resources.data!.items} value={form.resources} onChange={(v) => set('resources', v)} />
              </Field>
            )}
            <Field label={t('services.customFields')} error={Object.entries(err).find(([k]) => k.startsWith('customFields'))?.[1]}>
              <CustomFieldsEditor value={form.customFields as CustomField[]} onChange={(v) => set('customFields', v as Form['customFields'])} />
            </Field>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.isActive} onCheckedChange={(c) => set('isActive', c === true)} />{tc('common.active')}</label>
          </>
        )}
      </EntityDialog>
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title={`${tc('actions.delete')}: ${del?.name ?? ''}`} destructive onConfirm={() => archive.mutateAsync(del!._id)} />
    </>
  );
}
