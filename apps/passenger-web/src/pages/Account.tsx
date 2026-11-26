import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  BadgeCheck,
  Briefcase,
  ChevronRight,
  Home,
  LifeBuoy,
  LogOut,
  MapPin,
  Phone,
  Plus,
  ShieldCheck,
  Star,
  Trash2,
  UserRound,
} from 'lucide-react';
import { changePasswordSchema, emergencyContactSchema, type AuthResponse, type UserDTO } from '@masar/shared';
import {
  api,
  ApiError,
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  DialogContent,
  Field,
  FormError,
  Input,
  LanguageToggle,
  logout,
  PlaceResults,
  PlaceSearchInput,
  Select,
  Skeleton,
  ThemeToggle,
  toast,
  useAuth,
  useFormat,
} from '@masar/ui';

interface AccountResp {
  user: UserDTO;
  stats: { rating: number; ratingCount: number; totalRides: number } | null;
  wallet: { balance: number; currency: string } | null;
}

export function AccountPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const q = useQuery({ queryKey: ['me'], queryFn: () => api.get<AccountResp>('/me') });
  const [edit, setEdit] = useState(false);
  const [verify, setVerify] = useState(false);
  const [pwd, setPwd] = useState(false);
  const [del, setDel] = useState(false);
  const user = q.data?.user;

  const deleteAcc = useMutation({
    mutationFn: () => api.del('/me'),
    onSuccess: () => void logout(),
  });
  const logoutAll = useMutation({
    mutationFn: () => api.post('/auth/logout-all'),
    onSuccess: () => void logout(),
  });

  if (q.isLoading || !user)
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <Card className="flex flex-wrap items-center gap-5 p-6">
        <Avatar name={`${user.firstName} ${user.lastName}`} src={user.avatarUrl} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">
            {user.firstName} {user.lastName}
          </h1>
          <p className="text-sm text-muted">
            {t('account.memberSince', { date: f.date(user.createdAt, { month: 'long', year: 'numeric' }) })}
          </p>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            <span className="inline-flex items-center gap-1 font-semibold">
              <Star className="size-4 fill-amber-400 text-amber-400" />
              {q.data?.stats?.rating.toFixed(2) ?? '5.00'}
            </span>
            <span className="text-muted">
              {q.data?.stats?.totalRides ?? 0} {t('account.rides')}
            </span>
          </div>
        </div>
        <Button variant="outline" onClick={() => setEdit(true)}>
          {t('account.edit')}
        </Button>
      </Card>

      <Card className="divide-y divide-line">
        <InfoRow
          icon={UserRound}
          label={t('auth.email')}
          value={user.email ?? '—'}
          badge={
            user.email ? (
              user.emailVerified ? (
                <Badge tone="success">
                  <BadgeCheck className="size-3" />
                  {t('auth.verified')}
                </Badge>
              ) : (
                <Badge>{t('account.notVerified')}</Badge>
              )
            ) : null
          }
        />
        <InfoRow
          icon={Phone}
          label={t('auth.phone')}
          value={<span dir="ltr">{user.phone ?? '—'}</span>}
          badge={
            user.phone ? (
              user.phoneVerified ? (
                <Badge tone="success">
                  <BadgeCheck className="size-3" />
                  {t('auth.verified')}
                </Badge>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setVerify(true)}>
                  {t('account.verifyNow')}
                </Button>
              )
            ) : null
          }
        />
      </Card>

      <SavedPlaces />
      <EmergencyContacts />

      <Card className="p-5">
        <h2 className="mb-3 font-semibold">{t('account.preferences')}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </Card>

      <Card className="divide-y divide-line">
        <Link to="/support" className="flex items-center gap-3 p-4 hover:bg-surface-2">
          <LifeBuoy className="size-5" />
          <span className="flex-1 font-medium">{t('account.support')}</span>
          <ChevronRight className="size-4 text-muted rtl:rotate-180" />
        </Link>
        <button
          onClick={() => setPwd(true)}
          className="flex w-full items-center gap-3 p-4 text-start hover:bg-surface-2"
        >
          <ShieldCheck className="size-5" />
          <span className="flex-1 font-medium">{t('account.changePassword')}</span>
          <ChevronRight className="size-4 text-muted rtl:rotate-180" />
        </button>
        <button
          onClick={() => logoutAll.mutate()}
          className="flex w-full items-center gap-3 p-4 text-start hover:bg-surface-2"
        >
          <LogOut className="size-5" />
          <span className="flex-1 font-medium">{t('account.signOutAll')}</span>
        </button>
        <button
          onClick={() => void logout()}
          className="flex w-full items-center gap-3 p-4 text-start hover:bg-surface-2"
        >
          <LogOut className="size-5" />
          <span className="flex-1 font-medium">{t('actions.signOut')}</span>
        </button>
        <button
          onClick={() => setDel(true)}
          className="flex w-full items-center gap-3 p-4 text-start text-danger hover:bg-danger/5"
        >
          <Trash2 className="size-5" />
          <span className="flex-1 font-medium">{t('account.deleteAccount')}</span>
        </button>
      </Card>

      <EditProfileDialog open={edit} onOpenChange={setEdit} user={user} />
      {user.phone && <VerifyPhoneDialog open={verify} onOpenChange={setVerify} phone={user.phone} />}
      <ChangePasswordDialog open={pwd} onOpenChange={setPwd} />
      <ConfirmDialog
        open={del}
        onOpenChange={setDel}
        title={t('account.deleteAccount')}
        description={t('account.deleteHelp')}
        confirmLabel={t('actions.delete')}
        cancelLabel={t('actions.cancel')}
        danger
        loading={deleteAcc.isPending}
        onConfirm={() => deleteAcc.mutate()}
      />
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  badge,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 p-4">
      <Icon className="size-5 text-muted" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">{label}</p>
        <p className="truncate font-medium">{value}</p>
      </div>
      {badge}
    </div>
  );
}

const profileSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.string().trim().email(),
});

function EditProfileDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  user: UserDTO;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const setUser = useAuth((s) => s.setUser);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    values: { firstName: user.firstName, lastName: user.lastName, email: user.email ?? '' },
  });
  const submit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      const r = await api.patch<{ user: UserDTO }>('/me', v);
      setUser(r.user);
      toast.success(t('account.updated'));
      void qc.invalidateQueries({ queryKey: ['me'] });
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('errors.generic'));
    }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('account.edit')}>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormError message={error} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('auth.firstName')} error={form.formState.errors.firstName?.message}>
              <Input {...form.register('firstName')} />
            </Field>
            <Field label={t('auth.lastName')} error={form.formState.errors.lastName?.message}>
              <Input {...form.register('lastName')} />
            </Field>
          </div>
          <Field label={t('auth.email')} error={form.formState.errors.email?.message}>
            <Input type="email" {...form.register('email')} />
          </Field>
          <Button type="submit" block loading={form.formState.isSubmitting}>
            {t('actions.save')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VerifyPhoneDialog({
  open,
  onOpenChange,
  phone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  phone: string;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const setUser = useAuth((s) => s.setUser);
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const request = useMutation({
    mutationFn: () => api.post('/auth/otp/request', { target: phone, purpose: 'VERIFY_PHONE' }),
    onSuccess: () => {
      setSent(true);
      toast.success(t('auth.codeSent'));
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });
  const verify = useMutation({
    mutationFn: () =>
      api.post<{ user: UserDTO }>('/auth/otp/verify', { target: phone, purpose: 'VERIFY_PHONE', code }),
    onSuccess: (r) => {
      setUser(r.user);
      void qc.invalidateQueries({ queryKey: ['me'] });
      toast.success(t('auth.verified'));
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('auth.verifyPhone')} description={t('auth.verifyHelp', { target: phone })}>
        <div className="space-y-3">
          <Input
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="text-center text-lg font-semibold tracking-[0.5em]"
            dir="ltr"
            placeholder="••••••"
          />
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              loading={request.isPending}
              onClick={() => request.mutate()}
            >
              {sent ? t('actions.retry') : t('auth.sendCode')}
            </Button>
            <Button
              className="flex-1"
              disabled={code.length !== 6}
              loading={verify.isPending}
              onClick={() => verify.mutate()}
            >
              {t('auth.verify')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const setSession = useAuth((s) => s.setSession);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof changePasswordSchema>>({ resolver: zodResolver(changePasswordSchema) });
  const submit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      const r = await api.post<AuthResponse>('/auth/password/change', v);
      setSession(r.user, r.accessToken);
      toast.success(t('account.updated'));
      form.reset();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('errors.generic'));
    }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('account.changePassword')}>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormError message={error} />
          <Field label={t('account.currentPassword')} error={form.formState.errors.currentPassword?.message}>
            <Input type="password" autoComplete="current-password" {...form.register('currentPassword')} />
          </Field>
          <Field
            label={t('auth.newPassword')}
            error={form.formState.errors.newPassword?.message}
            hint={t('auth.passwordHint')}
          >
            <Input type="password" autoComplete="new-password" {...form.register('newPassword')} />
          </Field>
          <Button type="submit" block loading={form.formState.isSubmitting}>
            {t('actions.save')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface SavedPlace {
  id: string;
  label: string;
  type: 'HOME' | 'WORK' | 'FAVORITE';
  address: string;
  lat: number;
  lng: number;
}
const icons = { HOME: Home, WORK: Briefcase, FAVORITE: MapPin };

function SavedPlaces() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['places'],
    queryFn: () => api.get<{ items: SavedPlace[] }>('/me/places').then((r) => r.items),
  });
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<'HOME' | 'WORK' | 'FAVORITE'>('FAVORITE');
  const [label, setLabel] = useState('');
  const [query, setQuery] = useState('');
  const add = useMutation({
    mutationFn: (p: { name: string; address: string; lat: number; lng: number }) =>
      api.post('/me/places', {
        type,
        label: label.trim() || (type === 'FAVORITE' ? p.name : t(`account.${type.toLowerCase()}`)),
        address: `${p.name}, ${p.address}`,
        lat: p.lat,
        lng: p.lng,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['places'] });
      setOpen(false);
      setQuery('');
      setLabel('');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/me/places/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['places'] }),
  });
  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">{t('account.saved')}</h2>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus /> {t('account.addPlace')}
        </Button>
      </div>
      <div className="divide-y divide-line">
        {data?.map((p) => {
          const Icon = icons[p.type];
          return (
            <div key={p.id} className="flex items-center gap-3 py-3">
              <span className="grid size-9 place-items-center rounded-full bg-surface-2">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{p.label}</p>
                <p className="truncate text-sm text-muted">{p.address}</p>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t('actions.remove')}
                onClick={() => remove.mutate(p.id)}
              >
                <Trash2 />
              </Button>
            </div>
          );
        })}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t('account.addPlace')}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('account.label')}>
                <Select value={type} onChange={(e) => setType(e.target.value as any)}>
                  <option value="HOME">{t('account.home')}</option>
                  <option value="WORK">{t('account.work')}</option>
                  <option value="FAVORITE">{t('account.favorite')}</option>
                </Select>
              </Field>
              <Field label={t('account.name')}>
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={t(`account.${type.toLowerCase()}`)}
                />
              </Field>
            </div>
            <PlaceSearchInput
              value={query}
              onChange={setQuery}
              placeholder={t('account.searchAddress')}
              autoFocus
            />
            <PlaceResults query={query} onSelect={(p) => add.mutate(p)} />
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function EmergencyContacts() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['contacts'],
    queryFn: () =>
      api
        .get<{ items: { id: string; name: string; phone: string; relationship: string | null }[] }>(
          '/me/emergency-contacts',
        )
        .then((r) => r.items),
  });
  const [open, setOpen] = useState(false);
  const form = useForm<z.input<typeof emergencyContactSchema>>({
    resolver: zodResolver(emergencyContactSchema),
    defaultValues: { name: '', phone: '+971', relationship: '' },
  });
  const add = form.handleSubmit(async (v) => {
    try {
      await api.post('/me/emergency-contacts', v);
      void qc.invalidateQueries({ queryKey: ['contacts'] });
      form.reset();
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('errors.generic'));
    }
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/me/emergency-contacts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  });
  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-semibold">{t('account.emergency')}</h2>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus /> {t('account.addContact')}
        </Button>
      </div>
      <p className="mb-2 text-sm text-muted">{t('account.emergencyHelp')}</p>
      <div className="divide-y divide-line">
        {data?.map((c) => (
          <div key={c.id} className="flex items-center gap-3 py-3">
            <span className="grid size-9 place-items-center rounded-full bg-danger/10">
              <Phone className="size-4 text-danger" />
            </span>
            <div className="flex-1">
              <p className="font-medium">
                {c.name}
                {c.relationship ? ` · ${c.relationship}` : ''}
              </p>
              <p className="text-sm text-muted" dir="ltr">
                {c.phone}
              </p>
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t('actions.remove')}
              onClick={() => remove.mutate(c.id)}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t('account.addContact')}>
          <form onSubmit={add} className="space-y-3" noValidate>
            <Field label={t('account.name')} error={form.formState.errors.name?.message}>
              <Input {...form.register('name')} />
            </Field>
            <Field label={t('auth.phone')} error={form.formState.errors.phone?.message}>
              <Input dir="ltr" type="tel" {...form.register('phone')} />
            </Field>
            <Field label={t('account.relationship')}>
              <Input {...form.register('relationship')} />
            </Field>
            <Button type="submit" block loading={form.formState.isSubmitting}>
              {t('actions.save')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
