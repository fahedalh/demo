import { useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Banknote, Check, CheckCircle2, Clock, CreditCard, Users, Video } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import type { CustomField } from '@bookly/shared';
import { Field } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Avatar, Badge, Card, Checkbox } from '@/components/ui/misc';
import { useAuth } from '@/contexts/AuthContext';
import { useLocalized } from '@/hooks/useLocalized';
import { cn } from '@/lib/utils';
import { api, ApiError, errorMessage } from '@/services/api';
import type { Booking, Branch, Business, Category, Service, Slot, Staff } from '@/types';
import { fmtDate, fmtDuration, fmtTime, money } from '@/utils/format';
import { SlotPicker } from './SlotPicker';

export interface PublicBusinessPayload {
  business: Business & { category: Category };
  services: Service[];
  staff: Staff[];
  branches: Branch[];
  payments: { online: boolean; provider: string | null };
}

type Step = 'service' | 'staff' | 'datetime' | 'details' | 'payment';

interface Details {
  name: string;
  email: string;
  phone: string;
  note: string;
  attendees: number;
  mode: 'in_person' | 'online';
  answers: Record<string, string | number | boolean>;
  repeat: 'none' | 'weekly' | 'biweekly' | 'monthly';
  count: number;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function BookingWizard({ data, initialService, initialStaff, onDone }: { data: PublicBusinessPayload; initialService?: string; initialStaff?: string; onDone?: () => void }) {
  const { t } = useTranslation();
  const loc = useLocalized();
  const { user } = useAuth();
  const { business, staff } = data;
  // Starting from a staff member (e.g. "Book" on a doctor card) limits services to what they offer.
  const services = useMemo(() => (initialStaff ? data.services.filter((s) => s.staff.includes(initialStaff)) : data.services), [data.services, initialStaff]);
  const category = business.category;
  const settings = business.settings;

  const [service, setService] = useState<Service | null>(() => services.find((s) => s._id === initialService) ?? null);
  const [staffId, setStaffId] = useState<string | undefined>(initialStaff);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [noSlotsDate, setNoSlotsDate] = useState<string | null>(null);
  const [details, setDetails] = useState<Details>({
    name: user?.name ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    note: '',
    attendees: 1,
    mode: service?.sessionModes?.[0] ?? 'in_person',
    answers: {},
    repeat: 'none',
    count: 4,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<'online' | 'cash'>('cash');
  const [result, setResult] = useState<{ bookings: Booking[]; skipped: string[] } | null>(null);

  const staffTerm = loc(category?.terminology?.staff) || t('common.staff');
  const serviceStaff = useMemo(() => (service ? staff.filter((s) => service.staff.includes(s._id)) : []), [service, staff]);
  const fields: CustomField[] = useMemo(() => [...(category?.bookingFlow?.customFields ?? []), ...(service?.customFields ?? [])], [category, service]);
  const amount = (service?.price ?? 0) * details.attendees;
  const depositPct = service?.depositPercent ?? settings.payment.depositPercent;
  const dueNow = settings.payment.mode === 'full' ? amount : settings.payment.mode === 'deposit' ? Math.round(amount * depositPct) / 100 : 0;
  const onlineRequired = (settings.payment.mode === 'deposit' || settings.payment.mode === 'full') && data.payments.online && amount > 0;
  const showPayment = amount > 0 && data.payments.online && settings.payment.mode !== 'none';

  const steps: Step[] = useMemo(() => {
    const configured = (category?.bookingFlow?.steps ?? ['service', 'staff', 'datetime', 'details', 'payment']) as string[];
    return (['service', 'staff', 'datetime', 'details', 'payment'] as Step[]).filter((s) => {
      if (s === 'service' || s === 'datetime' || s === 'details') return true;
      if (s === 'staff') return !initialStaff && configured.includes('staff') && settings.allowStaffSelection && serviceStaff.length > 1;
      if (s === 'payment') return showPayment;
      return false;
    });
  }, [category, settings.allowStaffSelection, serviceStaff.length, showPayment, initialStaff]);
  const [step, setStep] = useState<Step>(initialService && (initialStaff || !steps.includes('staff')) ? 'datetime' : initialService ? (steps[1] ?? 'datetime') : 'service');
  const idx = steps.indexOf(step);
  const go = (s: Step) => setStep(s);
  const next = () => go(steps[Math.min(idx + 1, steps.length - 1)]);
  const back = () => go(steps[Math.max(idx - 1, 0)]);

  const waitlist = useMutation({
    mutationFn: () => api.post(`/public/businesses/${business.slug}/waitlist`, { service: service!._id, staff: staffId, date: noSlotsDate, name: details.name || user?.name, email: details.email || user?.email }),
    onSuccess: () => toast.success(t('booking.waitlistJoined')),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const book = useMutation({
    mutationFn: () =>
      api.post<{ bookings: Booking[]; skipped: string[]; checkout: { checkoutUrl: string } | null }>(`/public/businesses/${business.slug}/bookings`, {
        service: service!._id,
        start: slot!.start,
        staff: staffId,
        attendees: service!.capacity > 1 ? details.attendees : undefined,
        mode: details.mode,
        customer: { name: details.name.trim(), email: details.email.trim(), phone: details.phone.trim() },
        answers: details.answers,
        note: details.note || undefined,
        paymentMethod: showPayment ? (onlineRequired ? 'online' : method) : 'cash',
        recurrence: details.repeat !== 'none' ? { frequency: details.repeat, count: details.count } : undefined,
      }),
    onSuccess: (r) => {
      if (r.checkout?.checkoutUrl) {
        toast.message(t('booking.redirecting'));
        window.location.assign(r.checkout.checkoutUrl);
        return;
      }
      setResult(r);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'SLOT_UNAVAILABLE') {
        toast.error(t('booking.slotTaken'));
        setSlot(null);
        go('datetime');
        return;
      }
      if (e instanceof ApiError && e.details?.fields) {
        setErrors(Object.fromEntries(Object.entries(e.details.fields).map(([k, v]) => [k.replace(/^customer\./, ''), v[0]])));
        go('details');
      }
      toast.error(errorMessage(e));
    },
  });

  function validateDetails() {
    const errs: Record<string, string> = {};
    if (details.name.trim().length < 2) errs.name = t('common.required');
    if (!EMAIL.test(details.email.trim())) errs.email = t('common.required');
    for (const f of fields) {
      const v = details.answers[f.key];
      if (f.required && (v === undefined || v === '' || (f.type === 'checkbox' && v !== true))) errs[`answers.${f.key}`] = t('common.required');
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  if (result) {
    const first = result.bookings[0];
    const pending = first.status === 'pending';
    return (
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="py-6 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
          <CheckCircle2 className="h-9 w-9" />
        </div>
        <h3 className="text-2xl font-bold">{pending ? t('booking.successPending') : t('booking.successTitle')}</h3>
        <p className="mt-2 text-muted-foreground">{pending ? t('booking.successPendingBody', { business: business.name, email: first.snapshot.customerEmail }) : t('booking.successBody', { email: first.snapshot.customerEmail })}</p>
        <Card className="mx-auto mt-6 max-w-sm p-5 text-start">
          <p className="text-xs text-muted-foreground">{t('booking.reference')}</p>
          <p className="num text-xl font-bold tracking-wider">{first.reference}</p>
          <div className="mt-3 space-y-1 text-sm">
            <p className="font-medium">{first.snapshot.serviceName}</p>
            <p className="text-muted-foreground">{fmtDate(first.start, first.timezone)} · {fmtTime(first.start, first.timezone)}</p>
            {first.snapshot.staffName && <p className="text-muted-foreground">{first.snapshot.staffName}</p>}
            {result.bookings.length > 1 && <p className="text-muted-foreground">+{result.bookings.length - 1} {t(`booking.${details.repeat}`)}</p>}
          </div>
        </Card>
        {result.skipped.length > 0 && <p className="mt-3 text-sm text-amber-600">{t('booking.skipped', { count: result.skipped.length })}</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button variant="brand" asChild>
            <Link to={user ? `/account/bookings/${first._id}` : `/track?ref=${first.reference}&email=${encodeURIComponent(first.snapshot.customerEmail ?? '')}`}>{t('booking.manage')}</Link>
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setResult(null);
              setSlot(null);
              setService(null);
              setStep('service');
              onDone?.();
            }}
          >
            {t('booking.addAnother')}
          </Button>
        </div>
        {!user && <p className="mt-4 text-xs text-muted-foreground"><Link to="/login" className="text-primary hover:underline">{t('booking.loginPrompt')}</Link></p>}
      </motion.div>
    );
  }

  return (
    <div>
      {/* Progress */}
      <ol className="mb-6 flex items-center gap-2" aria-label="Progress">
        {steps.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <button
              onClick={() => i < idx && go(s)}
              disabled={i > idx}
              aria-current={s === step ? 'step' : undefined}
              className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors', i < idx ? 'bg-brand text-white' : i === idx ? 'bg-brand/15 text-brand ring-2 ring-brand' : 'bg-muted text-muted-foreground')}
            >
              {i < idx ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </button>
            <span className={cn('hidden truncate text-xs font-medium sm:block', i === idx ? 'text-foreground' : 'text-muted-foreground')}>{t(`booking.steps.${s}`)}</span>
            {i < steps.length - 1 && <span className="h-px flex-1 bg-border" aria-hidden />}
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }}>
          {step === 'service' && (
            <div className="space-y-2">
              <h3 className="mb-3 font-semibold">{t('booking.chooseService')}</h3>
              {services.map((s) => (
                <button
                  key={s._id}
                  onClick={() => {
                    setService(s);
                    if (!initialStaff) setStaffId(undefined);
                    setSlot(null);
                    setDetails((d) => ({ ...d, mode: s.sessionModes[0] ?? 'in_person', attendees: 1 }));
                    // Decide from the chosen service, not from `steps` (computed before it was selected).
                    const flowHasStaff = (category?.bookingFlow?.steps ?? ['staff']).includes('staff');
                    const choosable = staff.filter((x) => s.staff.includes(x._id)).length > 1;
                    go(!initialStaff && flowHasStaff && settings.allowStaffSelection && choosable ? 'staff' : 'datetime');
                  }}
                  className={cn('flex w-full items-center gap-4 rounded-2xl border p-4 text-start transition-all hover:border-brand hover:shadow-soft', service?._id === s._id && 'border-brand bg-brand/5')}
                >
                  <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{s.name}</span>
                    {s.description && <span className="line-clamp-1 block text-sm text-muted-foreground">{s.description}</span>}
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{fmtDuration(s.duration)}</span>
                      {s.capacity > 1 && <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{s.capacity}</span>}
                      {s.sessionModes.includes('online') && <span className="flex items-center gap-1"><Video className="h-3.5 w-3.5" />{t('common.online')}</span>}
                    </span>
                  </span>
                  <span className="num shrink-0 font-bold">{s.price ? money(s.price, business.currency) : t('common.free')}</span>
                </button>
              ))}
            </div>
          )}

          {step === 'staff' && service && (
            <div>
              <h3 className="mb-3 font-semibold">{t('booking.chooseStaff', { staff: staffTerm.toLowerCase() })}</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                <button onClick={() => { setStaffId(undefined); setSlot(null); next(); }} className={cn('flex items-center gap-3 rounded-2xl border p-4 text-start transition-all hover:border-brand', !staffId && 'border-brand bg-brand/5')}>
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted"><Users className="h-5 w-5" /></span>
                  <span><span className="block font-semibold">{t('booking.anyStaff')}</span><span className="text-xs text-muted-foreground">{t('booking.anyStaffHint')}</span></span>
                </button>
                {serviceStaff.map((s) => (
                  <button key={s._id} onClick={() => { setStaffId(s._id); setSlot(null); next(); }} className={cn('flex items-center gap-3 rounded-2xl border p-4 text-start transition-all hover:border-brand', staffId === s._id && 'border-brand bg-brand/5')}>
                    <Avatar name={s.name} src={s.avatar} color={s.color} className="h-11 w-11" />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{s.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{s.title}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'datetime' && service && (
            <div>
              {service.capacity > 1 && (
                <Field label={t('booking.attendees')} className="mb-5 max-w-[10rem]">
                  <Input type="number" min={1} max={service.capacity} value={details.attendees} onChange={(e) => { setDetails({ ...details, attendees: Math.max(1, Math.min(service.capacity, Number(e.target.value) || 1)) }); setSlot(null); }} />
                </Field>
              )}
              <SlotPicker
                base={`/public/businesses/${business.slug}`}
                service={service._id}
                staff={staffId}
                attendees={details.attendees}
                timezone={data.branches[0]?.timezone || business.timezone}
                value={slot}
                onChange={(s) => { setSlot(s); setNoSlotsDate(null); }}
                onNoSlots={(d) => setNoSlotsDate(d)}
              />
              {noSlotsDate && settings.waitlistEnabled && (
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-muted/60 p-4">
                  <p className="flex-1 text-sm">{t('booking.noSlotsHint')}</p>
                  {user || (details.name && EMAIL.test(details.email)) ? (
                    <Button variant="outline" size="sm" loading={waitlist.isPending} onClick={() => waitlist.mutate()}>{t('booking.joinWaitlist')}</Button>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Input placeholder={t('common.name')} className="h-9 w-36" value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} />
                      <Input placeholder={t('common.email')} type="email" className="h-9 w-48" value={details.email} onChange={(e) => setDetails({ ...details, email: e.target.value })} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 'details' && service && (
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (!validateDetails()) return;
                if (showPayment) next();
                else book.mutate();
              }}
              noValidate
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('common.name')} error={errors.name} htmlFor="bk-name" required>
                  <Input id="bk-name" autoComplete="name" value={details.name} aria-invalid={!!errors.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} />
                </Field>
                <Field label={t('common.email')} error={errors.email} htmlFor="bk-email" required>
                  <Input id="bk-email" type="email" autoComplete="email" value={details.email} aria-invalid={!!errors.email} onChange={(e) => setDetails({ ...details, email: e.target.value })} />
                </Field>
                <Field label={t('common.phone')} htmlFor="bk-phone" error={errors.phone}>
                  <Input id="bk-phone" type="tel" autoComplete="tel" dir="ltr" value={details.phone} onChange={(e) => setDetails({ ...details, phone: e.target.value })} />
                </Field>
                {service.sessionModes.length > 1 && (
                  <Field label={t('booking.mode')} htmlFor="bk-mode">
                    <NativeSelect id="bk-mode" value={details.mode} onChange={(e) => setDetails({ ...details, mode: e.target.value as Details['mode'] })}>
                      {service.sessionModes.map((m) => <option key={m} value={m}>{m === 'online' ? t('common.online') : t('common.inPerson')}</option>)}
                    </NativeSelect>
                  </Field>
                )}
              </div>

              {fields.length > 0 && (
                <div className="space-y-4">
                  <p className="text-sm font-semibold">{t('booking.questions')}</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {fields.map((f) => (
                      <CustomFieldInput key={f.key} field={f} value={details.answers[f.key]} error={errors[`answers.${f.key}`]} onChange={(v) => setDetails({ ...details, answers: { ...details.answers, [f.key]: v } })} />
                    ))}
                  </div>
                </div>
              )}

              <Field label={t('booking.note')} htmlFor="bk-note">
                <Textarea id="bk-note" maxLength={1000} value={details.note} onChange={(e) => setDetails({ ...details, note: e.target.value })} />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('booking.repeat')} htmlFor="bk-repeat">
                  <NativeSelect id="bk-repeat" value={details.repeat} onChange={(e) => setDetails({ ...details, repeat: e.target.value as Details['repeat'] })}>
                    <option value="none">{t('booking.repeatNone')}</option>
                    <option value="weekly">{t('booking.weekly')}</option>
                    <option value="biweekly">{t('booking.biweekly')}</option>
                    <option value="monthly">{t('booking.monthly')}</option>
                  </NativeSelect>
                </Field>
                {details.repeat !== 'none' && (
                  <Field label={t('booking.occurrences')} htmlFor="bk-count">
                    <Input id="bk-count" type="number" min={2} max={12} value={details.count} onChange={(e) => setDetails({ ...details, count: Math.max(2, Math.min(12, Number(e.target.value) || 2)) })} />
                  </Field>
                )}
              </div>

              <Summary />
              <div className="flex justify-between gap-2">
                <Button type="button" variant="ghost" onClick={back}><ArrowLeft className="rtl:rotate-180" />{t('actions.back')}</Button>
                <Button type="submit" variant="brand" size="lg" loading={book.isPending}>{showPayment ? t('actions.next') : book.isPending ? t('booking.confirming') : t('booking.confirm')}</Button>
              </div>
            </form>
          )}

          {step === 'payment' && service && (
            <div className="space-y-4">
              <h3 className="font-semibold">{t('booking.payment')}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <PayOption active={onlineRequired || method === 'online'} onClick={() => setMethod('online')} icon={<CreditCard />} title={t('booking.payOnline')} hint={t('booking.payOnlineHint')} />
                {!onlineRequired && settings.payment.acceptCash && (
                  <PayOption active={method === 'cash'} onClick={() => setMethod('cash')} icon={<Banknote />} title={t('booking.payAtLocation')} hint={t('booking.payAtLocationHint')} />
                )}
              </div>
              {dueNow > 0 && <p className="text-sm font-medium">{settings.payment.mode === 'full' ? t('booking.fullDue', { amount: money(dueNow, business.currency) }) : t('booking.depositDue', { amount: money(dueNow, business.currency) })}</p>}
              {data.payments.provider === 'test' && <Badge tone="warning">Sandbox</Badge>}
              <Summary />
              <div className="flex justify-between gap-2">
                <Button variant="ghost" onClick={back}><ArrowLeft className="rtl:rotate-180" />{t('actions.back')}</Button>
                <Button variant="brand" size="lg" loading={book.isPending} onClick={() => book.mutate()}>{book.isPending ? t('booking.confirming') : t('booking.confirm')}</Button>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {step === 'datetime' && (
        <div className="sticky bottom-0 mt-6 flex items-center justify-between gap-3 border-t bg-card/95 py-4 backdrop-blur">
          <Button variant="ghost" onClick={back}><ArrowLeft className="rtl:rotate-180" />{t('actions.back')}</Button>
          <Button variant="brand" size="lg" disabled={!slot} onClick={next}>{t('actions.next')}</Button>
        </div>
      )}
    </div>
  );

  function Summary() {
    if (!service || !slot) return null;
    const tz = data.branches[0]?.timezone || business.timezone;
    const staffName = staffId ? serviceStaff.find((s) => s._id === staffId)?.name : slot.staff.length === 1 ? slot.staff[0].name : undefined;
    const c = settings.cancellation;
    return (
      <div className="rounded-2xl bg-muted/50 p-4 text-sm">
        <p className="mb-2 font-semibold">{t('booking.summary')}</p>
        <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">{t('common.service')}</dt><dd className="text-end font-medium">{service.name}</dd>
          <dt className="text-muted-foreground">{t('common.date')}</dt><dd className="text-end font-medium">{fmtDate(slot.start, tz)}</dd>
          <dt className="text-muted-foreground">{t('common.time')}</dt><dd className="num text-end font-medium">{fmtTime(slot.start, tz)} – {fmtTime(slot.end, tz)}</dd>
          {staffName && (<><dt className="text-muted-foreground">{staffTerm}</dt><dd className="text-end font-medium">{staffName}</dd></>)}
          <dt className="text-muted-foreground">{t('common.total')}</dt><dd className="num text-end font-bold">{amount ? money(amount, business.currency) : t('common.free')}</dd>
        </dl>
        {c.allowed && <p className="mt-3 text-xs text-muted-foreground">{c.feePercent ? t('booking.policyFee', { hours: c.cutoffHours, fee: c.feePercent }) : t('booking.policy', { hours: c.cutoffHours })}</p>}
      </div>
    );
  }
}

function PayOption({ active, onClick, icon, title, hint }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; hint: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn('flex items-center gap-3 rounded-2xl border p-4 text-start transition-all [&_svg]:size-5', active ? 'border-brand bg-brand/5 ring-1 ring-brand' : 'hover:border-brand/50')}>
      <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', active ? 'bg-brand text-white' : 'bg-muted')}>{icon}</span>
      <span><span className="block font-semibold">{title}</span><span className="text-xs text-muted-foreground">{hint}</span></span>
    </button>
  );
}

export function CustomFieldInput({ field, value, error, onChange }: { field: CustomField; value: unknown; error?: string; onChange: (v: string | number | boolean) => void }) {
  const loc = useLocalized();
  const { t } = useTranslation();
  const id = `cf-${field.key}`;
  const label = loc(field.label);
  if (field.type === 'checkbox') {
    return (
      <div className="flex items-start gap-3 sm:col-span-2">
        <Checkbox id={id} checked={value === true} onCheckedChange={(c) => onChange(c === true)} aria-invalid={!!error} />
        <label htmlFor={id} className="text-sm">{label}{field.required && <span className="text-destructive"> *</span>}{error && <span className="block text-xs text-destructive">{error}</span>}</label>
      </div>
    );
  }
  return (
    <Field label={label} htmlFor={id} error={error} required={field.required} className={field.type === 'textarea' ? 'sm:col-span-2' : undefined}>
      {field.type === 'textarea' ? (
        <Textarea id={id} value={String(value ?? '')} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} />
      ) : field.type === 'select' ? (
        <NativeSelect id={id} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error}>
          <option value="">—</option>
          {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
        </NativeSelect>
      ) : (
        <Input
          id={id}
          type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
          dir={field.type === 'phone' ? 'ltr' : undefined}
          placeholder={field.placeholder ?? (field.required ? '' : t('common.optional'))}
          value={String(value ?? '')}
          onChange={(e) => onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)}
          aria-invalid={!!error}
        />
      )}
    </Field>
  );
}
