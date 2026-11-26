import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Field, PageHeader, QueryView, Section } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Checkbox, Switch } from '@/components/ui/misc';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { api, errorMessage } from '@/services/api';

interface Settings { platformName: string; supportEmail: string; defaultCurrency: string; defaultLocale: 'en' | 'ar'; defaultTimezone: string; allowBusinessSignup: boolean; requireBusinessApproval: boolean; maintenanceMode: boolean; commissionPercent: number }

export function AdminSettings() {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  useDocumentTitle(t('admin.nav.settings'));
  const q = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => api.get<Settings>('/admin/settings') });
  const [f, setF] = useState<Settings | null>(null);
  useEffect(() => { if (q.data) setF(q.data); }, [q.data]);
  const m = useMutation({ mutationFn: (v: Settings) => api.patch('/admin/settings', { platformName: v.platformName, supportEmail: v.supportEmail, defaultCurrency: v.defaultCurrency, defaultLocale: v.defaultLocale, defaultTimezone: v.defaultTimezone, allowBusinessSignup: v.allowBusinessSignup, requireBusinessApproval: v.requireBusinessApproval, maintenanceMode: v.maintenanceMode, commissionPercent: v.commissionPercent }), onSuccess: () => toast.success(tc('actions.save')), onError: (e) => toast.error(errorMessage(e)) });
  return (
    <>
      <PageHeader title={t('admin.nav.settings')} />
      <QueryView query={q}>
        {() => f && (
          <form onSubmit={(e) => { e.preventDefault(); m.mutate(f); }}>
            <Section title={t('admin.nav.settings')}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('admin.platformName')} htmlFor="as-name"><Input id="as-name" value={f.platformName} onChange={(e) => setF({ ...f, platformName: e.target.value })} /></Field>
                <Field label={t('admin.supportEmail')} htmlFor="as-email"><Input id="as-email" type="email" value={f.supportEmail} onChange={(e) => setF({ ...f, supportEmail: e.target.value })} /></Field>
                <Field label={t('admin.defaultCurrency')} htmlFor="as-cur"><Input id="as-cur" maxLength={3} value={f.defaultCurrency} onChange={(e) => setF({ ...f, defaultCurrency: e.target.value.toUpperCase() })} /></Field>
                <Field label={t('admin.defaultLocale')} htmlFor="as-loc"><NativeSelect id="as-loc" value={f.defaultLocale} onChange={(e) => setF({ ...f, defaultLocale: e.target.value as 'en' | 'ar' })}><option value="en">English</option><option value="ar">العربية</option></NativeSelect></Field>
                <Field label={t('admin.defaultTimezone')} htmlFor="as-tz"><Input id="as-tz" dir="ltr" value={f.defaultTimezone} onChange={(e) => setF({ ...f, defaultTimezone: e.target.value })} /></Field>
                <Field label={t('admin.commission')} htmlFor="as-com"><Input id="as-com" type="number" min={0} max={50} value={f.commissionPercent} onChange={(e) => setF({ ...f, commissionPercent: Number(e.target.value) })} /></Field>
              </div>
              <div className="mt-5 max-w-md space-y-3">
                {([['allowBusinessSignup', t('admin.allowSignup')], ['requireBusinessApproval', t('admin.requireApproval')], ['maintenanceMode', t('admin.maintenance')]] as const).map(([k, label]) => (
                  <label key={k} className="flex items-center justify-between gap-4 text-sm font-medium">{label}<Switch checked={f[k]} onCheckedChange={(c) => setF({ ...f, [k]: c })} /></label>
                ))}
              </div>
              <Button type="submit" className="mt-6" loading={m.isPending}>{tc('actions.save')}</Button>
            </Section>
          </form>
        )}
      </QueryView>
    </>
  );
}

export function AdminRoles() {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  useDocumentTitle(t('admin.nav.roles'));
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'roles'], queryFn: () => api.get<{ items: Array<{ _id: string; key: string; name: string; description?: string; permissions: string[] }>; permissions: string[] }>('/admin/roles') });
  const toggle = async (roleId: string, perms: string[], p: string, on: boolean) => {
    try {
      await api.patch(`/admin/roles/${roleId}`, { permissions: on ? [...perms, p] : perms.filter((x) => x !== p) });
      void qc.invalidateQueries({ queryKey: ['admin', 'roles'] });
    } catch (e) { toast.error(errorMessage(e)); }
  };
  return (
    <>
      <PageHeader title={t('admin.nav.roles')} description={t('admin.ownerLocked')} />
      <QueryView query={q}>
        {(d) => (
          <div className="overflow-x-auto rounded-2xl border bg-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3 text-start">{t('admin.permissions')}</th>{d.items.map((r) => <th key={r._id} className="px-4 py-3 text-center">{r.name}</th>)}</tr></thead>
              <tbody className="divide-y">
                {d.permissions.map((p) => (
                  <tr key={p}>
                    <td className="px-4 py-2.5"><code className="text-xs" dir="ltr">{p}</code></td>
                    {d.items.map((r) => (
                      <td key={r._id} className="px-4 py-2.5 text-center">
                        <Checkbox checked={r.permissions.includes(p)} disabled={r.key === 'business:owner'} onCheckedChange={(c) => toggle(r._id, r.permissions, p, c === true)} aria-label={`${r.name} ${p}`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryView>
      <span className="sr-only">{tc('common.actions')}</span>
    </>
  );
}
