import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, Clock, FileUp, Loader2, LogOut } from 'lucide-react';
import { driverOnboardingSchema, vehicleSchema, type VehicleCategoryDTO } from '@masar/shared';
import {
  api,
  ApiError,
  Badge,
  Button,
  Card,
  cn,
  Field,
  FormError,
  Input,
  LanguageToggle,
  Logo,
  logout,
  Select,
  ThemeToggle,
  toast,
} from '@masar/ui';
import { useDriverProfile } from '../App';

const DOCS = [
  'PROFILE_PHOTO',
  'DRIVING_LICENSE',
  'NATIONAL_ID',
  'VEHICLE_REGISTRATION',
  'INSURANCE',
  'VEHICLE_PHOTO',
] as const;

export function OnboardingPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useDriverProfile();
  const status = data?.profile.verificationStatus ?? 'PENDING';
  const submit = useMutation({
    mutationFn: () => api.post('/driver/submit'),
    onSuccess: () => {
      toast.success(t('onboarding.submitted'));
      void qc.invalidateQueries({ queryKey: ['driver', 'profile'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });
  if (!data) return null;
  const docsDone = data.checklist.documents.every((d) => d.uploaded);
  const canSubmit =
    data.checklist.personalInfo &&
    data.checklist.vehicle &&
    docsDone &&
    ['PENDING', 'NEEDS_INFO', 'REJECTED'].includes(status);
  const locked = status === 'UNDER_REVIEW';

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <Logo suffix="Driver" />
          <div className="flex items-center gap-1">
            <LanguageToggle />
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void logout()}
              aria-label={t('actions.signOut')}
            >
              <LogOut />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-8">
        <div>
          <h1 className="text-3xl font-bold">{t('onboarding.title')}</h1>
          <p className="mt-2 text-muted">{t('onboarding.subtitle')}</p>
        </div>
        {status !== 'PENDING' && (
          <Card
            className={cn(
              'flex items-start gap-3 p-5',
              status === 'UNDER_REVIEW' && 'border-info/30 bg-info/5',
              status === 'NEEDS_INFO' && 'border-warning/40 bg-warning/8',
              status === 'REJECTED' && 'border-danger/30 bg-danger/5',
            )}
          >
            {status === 'UNDER_REVIEW' ? (
              <Clock className="size-5 text-info" />
            ) : (
              <AlertTriangle className="size-5 text-amber-600" />
            )}
            <div>
              <p className="font-semibold">{t(`onboarding.review.${status}`)}</p>
              <p className="text-sm text-muted">
                {status === 'UNDER_REVIEW'
                  ? t('onboarding.review.UNDER_REVIEW_HELP')
                  : data.profile.verificationNote}
              </p>
            </div>
          </Card>
        )}
        <PersonalStep done={data.checklist.personalInfo} locked={locked} initial={data.profile} />
        <VehicleStep done={data.checklist.vehicle} locked={locked} vehicles={data.vehicles} />
        <DocumentsStep locked={locked} documents={data.documents} />
        {!locked && (
          <Button
            size="lg"
            block
            disabled={!canSubmit}
            loading={submit.isPending}
            onClick={() => submit.mutate()}
          >
            {t('onboarding.submit')}
          </Button>
        )}
      </main>
    </div>
  );
}

function StepHeader({ n, title, done }: { n: number; title: string; done: boolean }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span
        className={cn(
          'grid size-8 place-items-center rounded-full text-sm font-bold',
          done ? 'bg-accent text-white' : 'bg-surface-2',
        )}
      >
        {done ? <CheckCircle2 className="size-4" /> : n}
      </span>
      <h2 className="text-lg font-bold">{title}</h2>
    </div>
  );
}

const dateStr = (d: string | null) => (d ? d.slice(0, 10) : '');

function PersonalStep({
  done,
  locked,
  initial,
}: {
  done: boolean;
  locked: boolean;
  initial: {
    licenseNumber: string | null;
    licenseExpiry: string | null;
    dateOfBirth: string | null;
    nationalId: string | null;
  };
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof driverOnboardingSchema>>({
    resolver: zodResolver(driverOnboardingSchema),
    defaultValues: {
      licenseNumber: initial.licenseNumber ?? '',
      licenseExpiry: dateStr(initial.licenseExpiry),
      dateOfBirth: dateStr(initial.dateOfBirth),
      nationalId: initial.nationalId ?? '',
    },
  });
  const e = form.formState.errors;
  const save = form.handleSubmit(async (v) => {
    setError(null);
    try {
      await api.put('/driver/onboarding', v);
      toast.success(t('actions.save'));
      void qc.invalidateQueries({ queryKey: ['driver', 'profile'] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('errors.generic'));
    }
  });
  return (
    <Card className="p-5">
      <StepHeader n={1} title={t('onboarding.step1')} done={done} />
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2">
          <FormError message={error} />
        </div>
        <Field label={t('onboarding.license')} error={e.licenseNumber?.message}>
          <Input disabled={locked} {...form.register('licenseNumber')} />
        </Field>
        <Field label={t('onboarding.licenseExpiry')} error={e.licenseExpiry?.message as string}>
          <Input disabled={locked} type="date" {...form.register('licenseExpiry')} />
        </Field>
        <Field label={t('onboarding.dob')} error={e.dateOfBirth?.message as string}>
          <Input disabled={locked} type="date" {...form.register('dateOfBirth')} />
        </Field>
        <Field label={t('onboarding.nationalId')} error={e.nationalId?.message}>
          <Input disabled={locked} dir="ltr" {...form.register('nationalId')} />
        </Field>
        {!locked && (
          <div className="sm:col-span-2">
            <Button type="submit" loading={form.formState.isSubmitting}>
              {t('actions.save')}
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<{ items: VehicleCategoryDTO[] }>('/catalog/categories').then((r) => r.items),
    staleTime: Infinity,
  });
}

export function VehicleForm({ onSaved }: { onSaved?: () => void }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const cats = useCategories();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof vehicleSchema>>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      categoryCode: 'ECONOMY',
      make: '',
      model: '',
      year: new Date().getFullYear(),
      color: '',
      plateNumber: '',
      seats: 4,
      isElectric: false,
    },
  });
  const e = form.formState.errors;
  const save = form.handleSubmit(async (v) => {
    setError(null);
    try {
      await api.post('/driver/vehicles', v);
      form.reset();
      void qc.invalidateQueries({ queryKey: ['driver', 'profile'] });
      onSaved?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('errors.generic'));
    }
  });
  return (
    <form onSubmit={save} className="grid gap-4 sm:grid-cols-2" noValidate>
      <div className="sm:col-span-2">
        <FormError message={error} />
      </div>
      <Field label={t('onboarding.category')}>
        <Select {...form.register('categoryCode')}>
          {cats.data?.map((c) => (
            <option key={c.code} value={c.code}>
              {i18n.language === 'ar' ? c.nameAr : c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t('onboarding.plate')} error={e.plateNumber?.message}>
        <Input dir="ltr" placeholder="DXB A 12345" {...form.register('plateNumber')} />
      </Field>
      <Field label={t('onboarding.make')} error={e.make?.message}>
        <Input placeholder="Toyota" {...form.register('make')} />
      </Field>
      <Field label={t('onboarding.model')} error={e.model?.message}>
        <Input placeholder="Camry" {...form.register('model')} />
      </Field>
      <Field label={t('onboarding.year')} error={e.year?.message}>
        <Input type="number" {...form.register('year')} />
      </Field>
      <Field label={t('onboarding.color')} error={e.color?.message}>
        <Input {...form.register('color')} />
      </Field>
      <Field label={t('onboarding.seats')} error={e.seats?.message}>
        <Input type="number" min={2} max={8} {...form.register('seats')} />
      </Field>
      <label className="flex items-center gap-3 self-end pb-3 text-sm font-medium">
        <input type="checkbox" className="size-5 accent-[#06C167]" {...form.register('isElectric')} />
        {t('onboarding.electric')}
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" loading={form.formState.isSubmitting}>
          {t('actions.save')}
        </Button>
      </div>
    </form>
  );
}

function VehicleStep({
  done,
  locked,
  vehicles,
}: {
  done: boolean;
  locked: boolean;
  vehicles: {
    id: string;
    make: string;
    model: string;
    year: number;
    plateNumber: string;
    color: string;
    status: string;
  }[];
}) {
  const { t } = useTranslation();
  return (
    <Card className="p-5">
      <StepHeader n={2} title={t('onboarding.step2')} done={done} />
      {vehicles.map((v) => (
        <div key={v.id} className="mb-3 flex items-center justify-between rounded-2xl bg-surface-2 p-4">
          <div>
            <p className="font-semibold">
              {v.year} {v.make} {v.model} · {v.color}
            </p>
            <p className="font-mono text-sm text-muted" dir="ltr">
              {v.plateNumber}
            </p>
          </div>
          <Badge tone={v.status === 'APPROVED' ? 'success' : v.status === 'REJECTED' ? 'danger' : 'info'}>
            {t(`onboarding.docStatus.${v.status}`)}
          </Badge>
        </div>
      ))}
      {!done && !locked && <VehicleForm />}
    </Card>
  );
}

export function DocumentsStep({
  locked,
  documents,
  showTitle = true,
}: {
  locked: boolean;
  documents: { id: string; type: string; status: string; reviewNote: string | null; originalName: string }[];
  showTitle?: boolean;
}) {
  const { t } = useTranslation();
  const latest = (type: string) =>
    documents.find((d) => d.type === type && d.status !== 'REJECTED') ??
    documents.find((d) => d.type === type);
  const done = DOCS.every((d) => latest(d) && latest(d)!.status !== 'REJECTED');
  return (
    <Card className="p-5">
      {showTitle && <StepHeader n={3} title={t('onboarding.step3')} done={done} />}
      <p className="mb-3 text-xs text-muted">{t('onboarding.fileHelp')}</p>
      <div className="divide-y divide-line">
        {DOCS.map((type) => (
          <DocRow key={type} type={type} doc={latest(type)} locked={locked} />
        ))}
      </div>
    </Card>
  );
}

function DocRow({
  type,
  doc,
  locked,
}: {
  type: string;
  doc?: { id: string; status: string; reviewNote: string | null; originalName: string };
  locked: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('type', type);
      fd.append('file', file);
      return api.post('/driver/documents', fd);
    },
    onSuccess: () => {
      toast.success(t('onboarding.uploaded'));
      void qc.invalidateQueries({ queryKey: ['driver', 'profile'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });
  return (
    <div className="flex items-center gap-3 py-3">
      <span
        className={cn('grid size-10 place-items-center rounded-xl', doc ? 'bg-accent/10' : 'bg-surface-2')}
      >
        {upload.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : doc ? (
          <CheckCircle2 className="size-4 text-accent" />
        ) : (
          <FileUp className="size-4" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{t(`onboarding.docs.${type}`)}</p>
        {doc && (
          <p className="truncate text-xs text-muted">
            {doc.originalName}
            {doc.reviewNote ? ` · ${doc.reviewNote}` : ''}
          </p>
        )}
      </div>
      {doc && (
        <Badge tone={doc.status === 'APPROVED' ? 'success' : doc.status === 'REJECTED' ? 'danger' : 'info'}>
          {t(`onboarding.docStatus.${doc.status}`)}
        </Badge>
      )}
      {!locked && doc?.status !== 'APPROVED' && (
        <>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload.mutate(f);
              e.target.value = '';
            }}
          />
          <Button size="sm" variant="outline" onClick={() => input.current?.click()}>
            {doc ? t('onboarding.replace') : t('onboarding.upload')}
          </Button>
        </>
      )}
    </div>
  );
}
