import { Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { ConfirmDialog, EmptyState, Field, PageHeader, QueryView } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Badge, Card, Checkbox } from '@/components/ui/misc';
import { EntityDialog } from '@/features/business/EntityForm';
import { useTenantList, useTenantMutation } from '@/features/business/hooks';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { api } from '@/services/api';
import type { Branch, Resource } from '@/types';

const schema = z.object({ name: z.string().trim().min(1, 'Required'), type: z.string().trim().min(1, 'Required'), branch: z.string().optional(), description: z.string().max(1000).optional(), capacity: z.number().int().min(1), isActive: z.boolean() });
type Form = z.infer<typeof schema>;
const empty: Form = { name: '', type: '', branch: '', description: '', capacity: 1, isActive: true };

export function ResourcesPage() {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  useDocumentTitle(t('resources.title'));
  const list = useTenantList<Resource>('resources');
  const branches = useTenantList<Branch>('branches', { active: 'true' });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [del, setDel] = useState<Resource | null>(null);
  const remove = useTenantMutation((base, id: string) => api.delete(`${base}/resources/${id}`), { invalidate: ['resources'], success: t('resources.deleted') });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const edit = (r?: Resource) => {
    setEditing(r?._id ?? null);
    setForm(r ? { name: r.name, type: r.type, branch: r.branch ?? '', description: r.description ?? '', capacity: r.capacity, isActive: r.isActive } : empty);
    setOpen(true);
  };
  return (
    <>
      <PageHeader title={t('resources.title')} description={t('resources.subtitle')} actions={<Button onClick={() => edit()}><Plus />{t('resources.new')}</Button>} />
      <QueryView query={list}>
        {(d) => d.items.length ? (
          <Card className="divide-y">
            {d.items.map((r) => (
              <div key={r._id} className={`flex items-center gap-4 p-4 ${r.isActive ? '' : 'opacity-60'}`}>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted"><Package className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-sm text-muted-foreground">{r.type} · {t('resources.capacity')}: <span className="num">{r.capacity}</span>{r.branch ? ` · ${branches.data?.items.find((b) => b._id === r.branch)?.name ?? ''}` : ''}</p>
                </div>
                {!r.isActive && <Badge tone="muted">{tc('status.inactive')}</Badge>}
                <Button variant="ghost" size="icon-sm" onClick={() => edit(r)} aria-label={tc('actions.edit')}><Pencil /></Button>
                {r.isActive && <Button variant="ghost" size="icon-sm" onClick={() => setDel(r)} aria-label={tc('actions.delete')}><Trash2 /></Button>}
              </div>
            ))}
          </Card>
        ) : <EmptyState icon={<Package />} title={t('resources.empty')} description={t('resources.emptyHint')} action={<Button onClick={() => edit()}><Plus />{t('resources.new')}</Button>} />}
      </QueryView>
      <EntityDialog open={open} onOpenChange={setOpen} title={editing ? t('resources.edit') : t('resources.new')} resource="resources" editingId={editing} value={form} schema={schema} successMessage={t('resources.saved')} size="md" toPayload={(f) => ({ ...f, branch: f.branch || undefined })}>
        {(err) => (
          <>
            <Field label={tc('common.name')} error={err.name} htmlFor="rs-name" required><Input id="rs-name" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label={t('resources.type')} error={err.type} htmlFor="rs-type" required><Input id="rs-type" placeholder={t('resources.typePh')} value={form.type} onChange={(e) => set('type', e.target.value)} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tc('common.branch')} htmlFor="rs-branch">
                <NativeSelect id="rs-branch" value={form.branch} onChange={(e) => set('branch', e.target.value)}>
                  <option value="">{tc('common.all')}</option>
                  {branches.data?.items.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
                </NativeSelect>
              </Field>
              <Field label={t('resources.capacity')} htmlFor="rs-cap"><Input id="rs-cap" type="number" min={1} value={form.capacity} onChange={(e) => set('capacity', Number(e.target.value))} /></Field>
            </div>
            <Field label={tc('common.description')} htmlFor="rs-desc"><Textarea id="rs-desc" value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.isActive} onCheckedChange={(c) => set('isActive', c === true)} />{tc('common.active')}</label>
          </>
        )}
      </EntityDialog>
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title={`${tc('actions.delete')}: ${del?.name ?? ''}`} destructive onConfirm={() => remove.mutateAsync(del!._id)} />
    </>
  );
}
