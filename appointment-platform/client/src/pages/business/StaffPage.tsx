import { KeyRound, MoreHorizontal, Pencil, Plus, Trash2, UserSquare2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import type { WeeklySchedule } from '@bookly/shared';
import { ConfirmDialog, EmptyState, Field, PageHeader, QueryView, Stars } from '@/components/common';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown';
import { Input, Textarea } from '@/components/ui/input';
import { Avatar, Badge, Card, Checkbox, Switch } from '@/components/ui/misc';
import { ChipSelect, ColorInput, WeeklyScheduleEditor } from '@/features/business/editors';
import { EntityDialog } from '@/features/business/EntityForm';
import { useTenantList, useTenantMutation } from '@/features/business/hooks';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { api } from '@/services/api';
import type { Branch, Service, Staff } from '@/types';

const schema = z.object({
  name: z.string().trim().min(2, 'Required'),
  title: z.string().max(120).optional(),
  bio: z.string().max(1500).optional(),
  email: z.string().email().or(z.literal('')),
  phone: z.string().max(30).optional(),
  avatar: z.string().url().or(z.literal('')),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  branches: z.array(z.string()),
  services: z.array(z.string()),
  workingHours: z.array(z.any()),
  acceptsBookings: z.boolean(),
  isActive: z.boolean(),
  login: z.object({ enabled: z.boolean(), password: z.string().min(8, 'Min 8 characters').optional() }).optional(),
});
type Form = z.infer<typeof schema> & { customHours: boolean };
const empty: Form = { name: '', title: '', bio: '', email: '', phone: '', avatar: '', color: '#6366f1', branches: [], services: [], workingHours: [], acceptsBookings: true, isActive: true, customHours: false, login: { enabled: false } };

export function StaffPage() {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  useDocumentTitle(t('staff.title'));
  const list = useTenantList<Staff>('staff');
  const services = useTenantList<Service>('services', { active: 'true' });
  const branches = useTenantList<Branch>('branches', { active: 'true' });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [del, setDel] = useState<Staff | null>(null);
  const remove = useTenantMutation((base, sid: string) => api.delete(`${base}/staff/${sid}`), { invalidate: ['staff', 'services'], success: t('staff.deleted') });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const edit = (s?: Staff) => {
    setEditing(s ?? null);
    const svcIds = s ? (services.data?.items ?? []).filter((x) => x.staff.includes(s._id)).map((x) => x._id) : [];
    setForm(s ? { ...empty, ...s, title: s.title ?? '', bio: s.bio ?? '', email: s.email ?? '', phone: s.phone ?? '', avatar: s.avatar ?? '', services: svcIds, customHours: s.workingHours.some((d) => d.enabled), login: { enabled: false } } : empty);
    setOpen(true);
  };

  return (
    <>
      <PageHeader title={t('staff.title')} description={t('staff.subtitle')} actions={<Button onClick={() => edit()}><Plus />{t('staff.new')}</Button>} />
      <QueryView query={list}>
        {(d) => d.items.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {d.items.map((s) => {
              const svc = (services.data?.items ?? []).filter((x) => x.staff.includes(s._id));
              return (
                <Card key={s._id} className={`p-5 ${s.isActive ? '' : 'opacity-60'}`}>
                  <div className="flex items-start gap-3">
                    <Avatar name={s.name} src={s.avatar} color={s.color} className="h-12 w-12" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{s.name}</p>
                      <p className="truncate text-sm text-muted-foreground">{s.title}</p>
                      {s.rating?.count ? <p className="mt-0.5 flex items-center gap-1 text-xs"><Stars value={s.rating.average} /><span className="num">{s.rating.average}</span></p> : null}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={tc('common.actions')}><MoreHorizontal /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onSelect={() => edit(s)}><Pencil />{tc('actions.edit')}</DropdownMenuItem>
                        {s.isActive && <DropdownMenuItem danger onSelect={() => setDel(s)}><Trash2 />{tc('actions.delete')}</DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {svc.map((x) => <Badge key={x._id}>{x.name}</Badge>)}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {s.user && <Badge tone="info"><KeyRound className="h-3 w-3" />{t('staff.hasLogin')}</Badge>}
                    {!s.acceptsBookings && <Badge tone="warning">{t('staff.accepts')}: {tc('common.no')}</Badge>}
                    {!s.isActive && <Badge tone="muted">{tc('status.inactive')}</Badge>}
                  </div>
                </Card>
              );
            })}
          </div>
        ) : <EmptyState icon={<UserSquare2 />} title={t('staff.empty')} description={t('staff.emptyHint')} action={<Button onClick={() => edit()}><Plus />{t('staff.new')}</Button>} />}
      </QueryView>

      <EntityDialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? t('staff.edit') : t('staff.new')}
        resource="staff"
        editingId={editing?._id}
        value={form}
        schema={schema}
        successMessage={t('staff.saved')}
        size="xl"
        toPayload={({ customHours, ...v }) => ({ ...v, workingHours: customHours ? v.workingHours : [], login: v.login?.enabled ? v.login : undefined })}
      >
        {(err) => (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tc('common.name')} error={err.name} htmlFor="st-name" required><Input id="st-name" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
              <Field label={t('staff.jobTitle')} htmlFor="st-title"><Input id="st-title" value={form.title} onChange={(e) => set('title', e.target.value)} /></Field>
              <Field label={tc('common.email')} error={err.email} htmlFor="st-email"><Input id="st-email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
              <Field label={tc('common.phone')} htmlFor="st-phone"><Input id="st-phone" dir="ltr" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
              <Field label="Avatar URL" error={err.avatar} htmlFor="st-av"><Input id="st-av" dir="ltr" value={form.avatar} onChange={(e) => set('avatar', e.target.value)} /></Field>
              <Field label={tc('common.color')} htmlFor="st-color"><ColorInput id="st-color" value={form.color} onChange={(v) => set('color', v)} /></Field>
              <Field label={t('staff.bio')} htmlFor="st-bio" className="sm:col-span-2"><Textarea id="st-bio" value={form.bio} onChange={(e) => set('bio', e.target.value)} /></Field>
            </div>
            <Field label={t('staff.services')}><ChipSelect items={services.data?.items ?? []} value={form.services} onChange={(v) => set('services', v)} /></Field>
            <Field label={t('staff.branches')}><ChipSelect items={branches.data?.items ?? []} value={form.branches} onChange={(v) => set('branches', v)} /></Field>
            <div className="space-y-3">
              <label className="flex items-center gap-3 text-sm font-medium"><Switch checked={form.customHours} onCheckedChange={(c) => set('customHours', c)} />{form.customHours ? t('staff.customHours') : t('staff.useBranchHours')}</label>
              {form.customHours && <WeeklyScheduleEditor value={form.workingHours as WeeklySchedule} onChange={(v) => set('workingHours', v)} />}
            </div>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.acceptsBookings} onCheckedChange={(c) => set('acceptsBookings', c === true)} />{t('staff.accepts')}</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.isActive} onCheckedChange={(c) => set('isActive', c === true)} />{tc('common.active')}</label>
            {!editing?.user && (
              <div className="rounded-2xl border p-4">
                <label className="flex items-center gap-3 text-sm font-medium"><Switch checked={!!form.login?.enabled} onCheckedChange={(c) => set('login', { ...form.login, enabled: c })} />{t('staff.login')}</label>
                <p className="mt-1 text-xs text-muted-foreground">{t('staff.loginHint')}</p>
                {form.login?.enabled && (
                  <Field label={t('staff.loginPassword')} error={err['login.password'] ?? err.login} htmlFor="st-pw" className="mt-3 max-w-xs"><Input id="st-pw" type="password" autoComplete="new-password" value={form.login.password ?? ''} onChange={(e) => set('login', { enabled: true, password: e.target.value })} /></Field>
                )}
              </div>
            )}
          </>
        )}
      </EntityDialog>
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title={`${tc('actions.delete')}: ${del?.name ?? ''}`} destructive onConfirm={() => remove.mutateAsync(del!._id)} />
    </>
  );
}
