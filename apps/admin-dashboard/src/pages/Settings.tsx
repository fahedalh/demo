import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import type { UserDTO } from '@masar/shared';
import {
  api,
  ApiError,
  Avatar,
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  Field,
  Input,
  Select,
  Switch,
  toast,
  useAuth,
  useFormat,
} from '@masar/ui';
import { PageHeader } from '../components/DataTable';

interface Settings {
  dispatchRadiusKm: number;
  offerTimeoutSeconds: number;
  maxDispatchAttempts: number;
  freeCancellationSeconds: number;
  supportPhone: string;
  supportEmail: string;
  maintenanceMode: boolean;
}
const ROLES = ['SUPER_ADMIN', 'OPERATIONS', 'FINANCE', 'SUPPORT'] as const;

export function SettingsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get<Settings>('/admin/settings'),
  });
  const [v, setV] = useState<Settings | null>(null);
  useEffect(() => {
    if (q.data) setV(q.data);
  }, [q.data]);
  const save = useMutation({
    mutationFn: () =>
      api.put('/admin/settings', {
        ...v,
        dispatchRadiusKm: Number(v!.dispatchRadiusKm),
        offerTimeoutSeconds: Number(v!.offerTimeoutSeconds),
        maxDispatchAttempts: Number(v!.maxDispatchAttempts),
        freeCancellationSeconds: Number(v!.freeCancellationSeconds),
      }),
    onSuccess: () => {
      toast.success(t('settings.saved'));
      void qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });
  return (
    <div className="space-y-6">
      <PageHeader title={t('settings.title')} />
      <Card className="p-5">
        <h2 className="mb-4 font-semibold">{t('settings.platform')}</h2>
        {v && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label={t('settings.radius')}>
              <Input
                type="number"
                value={v.dispatchRadiusKm}
                onChange={(e) => setV({ ...v, dispatchRadiusKm: e.target.value as any })}
              />
            </Field>
            <Field label={t('settings.timeout')}>
              <Input
                type="number"
                value={v.offerTimeoutSeconds}
                onChange={(e) => setV({ ...v, offerTimeoutSeconds: e.target.value as any })}
              />
            </Field>
            <Field label={t('settings.attempts')}>
              <Input
                type="number"
                value={v.maxDispatchAttempts}
                onChange={(e) => setV({ ...v, maxDispatchAttempts: e.target.value as any })}
              />
            </Field>
            <Field label={t('settings.freeCancel')}>
              <Input
                type="number"
                value={v.freeCancellationSeconds}
                onChange={(e) => setV({ ...v, freeCancellationSeconds: e.target.value as any })}
              />
            </Field>
            <Field label={t('settings.phone')}>
              <Input
                dir="ltr"
                value={v.supportPhone}
                onChange={(e) => setV({ ...v, supportPhone: e.target.value })}
              />
            </Field>
            <Field label={t('settings.email')}>
              <Input
                type="email"
                value={v.supportEmail}
                onChange={(e) => setV({ ...v, supportEmail: e.target.value })}
              />
            </Field>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-line p-3 md:col-span-2">
              <span>
                <span className="block font-medium">{t('settings.maintenance')}</span>
                <span className="text-xs text-muted">{t('settings.maintenanceHelp')}</span>
              </span>
              <Switch
                checked={v.maintenanceMode}
                onCheckedChange={(c) => setV({ ...v, maintenanceMode: c })}
              />
            </label>
          </div>
        )}
        <Button className="mt-5" loading={save.isPending} onClick={() => save.mutate()}>
          {t('actions.save')}
        </Button>
      </Card>
      <Admins />
    </div>
  );
}

function Admins() {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const me = useAuth((s) => s.user)!;
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ firstName: '', lastName: '', email: '', password: '', adminRole: 'SUPPORT' });
  const q = useQuery({
    queryKey: ['admin', 'admins'],
    queryFn: () =>
      api.get<{ items: (UserDTO & { lastLoginAt: string | null })[] }>('/admin/admins').then((r) => r.items),
  });
  const create = useMutation({
    mutationFn: () => api.post('/admin/admins', v),
    onSuccess: () => {
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['admin', 'admins'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });
  const role = useMutation({
    mutationFn: ({ id, adminRole }: { id: string; adminRole: string }) =>
      api.patch(`/admin/users/${id}/admin-role`, { adminRole }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'admins'] }),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">{t('settings.admins')}</h2>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus /> {t('settings.addAdmin')}
        </Button>
      </div>
      <div className="divide-y divide-line">
        {q.data?.map((a) => (
          <div key={a.id} className="flex items-center gap-3 py-3">
            <Avatar name={`${a.firstName} ${a.lastName}`} size={36} />
            <div className="flex-1">
              <p className="font-medium">
                {a.firstName} {a.lastName} {a.id === me.id && <Badge>you</Badge>}
              </p>
              <p className="text-xs text-muted">
                {a.email} · {a.lastLoginAt ? f.relative(a.lastLoginAt) : '—'}
              </p>
            </div>
            <Select
              className="h-9 w-auto text-sm"
              value={a.adminRole ?? 'SUPPORT'}
              disabled={a.id === me.id}
              onChange={(e) => role.mutate({ id: a.id, adminRole: e.target.value })}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.replace('_', ' ')}
                </option>
              ))}
            </Select>
          </div>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t('settings.addAdmin')}>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('auth.firstName')}>
              <Input value={v.firstName} onChange={(e) => setV({ ...v, firstName: e.target.value })} />
            </Field>
            <Field label={t('auth.lastName')}>
              <Input value={v.lastName} onChange={(e) => setV({ ...v, lastName: e.target.value })} />
            </Field>
            <Field label={t('auth.email')} className="col-span-2">
              <Input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
            </Field>
            <Field label={t('auth.password')} hint={t('auth.passwordHint')}>
              <Input
                type="password"
                value={v.password}
                onChange={(e) => setV({ ...v, password: e.target.value })}
              />
            </Field>
            <Field label={t('settings.role')}>
              <Select value={v.adminRole} onChange={(e) => setV({ ...v, adminRole: e.target.value })}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r.replace('_', ' ')}
                  </option>
                ))}
              </Select>
            </Field>
            <Button className="col-span-2" loading={create.isPending} onClick={() => create.mutate()}>
              {t('actions.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
