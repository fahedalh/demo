import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Trash2, Upload, UserPlus, Wand2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { NOTIFICATION_EVENTS, SUPPORTED_CURRENCIES, TEMPLATE_PLACEHOLDERS, THEME_PRESETS, type NotificationEvent, type ThemePreset } from '@bookly/shared';
import { ConfirmDialog, Field, PageHeader, QueryView, Section } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Badge, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import { useTenant } from '@/contexts/TenantContext';
import { ColorInput } from '@/features/business/editors';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useLocalized } from '@/hooks/useLocalized';
import { ApiError, api, errorMessage } from '@/services/api';
import type { Business, BusinessSettings, Category } from '@/types';

type Errors = Record<string, string>;

function useSave() {
  const { t } = useTranslation('dashboard');
  const { id } = useTenant();
  const qc = useQueryClient();
  const [errors, setErrors] = useState<Errors>({});
  const m = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch<{ business: Business }>(`/businesses/${id}`, body),
    onSuccess: () => {
      setErrors({});
      toast.success(t('settings.saved'));
      void qc.invalidateQueries({ queryKey: ['tenant', id] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.details?.fields) setErrors(Object.fromEntries(Object.entries(e.details.fields).map(([k, v]) => [k.split('.').pop()!, v[0]])));
      toast.error(errorMessage(e));
    },
  });
  return { save: m.mutate, saving: m.isPending, errors };
}

export function SettingsPage() {
  const { t } = useTranslation('dashboard');
  const { can } = useTenant();
  useDocumentTitle(t('settings.title'));
  return (
    <>
      <PageHeader title={t('settings.title')} />
      <Tabs defaultValue="profile">
        <TabsList className="max-w-full">
          <TabsTrigger value="profile">{t('settings.profile')}</TabsTrigger>
          <TabsTrigger value="branding">{t('settings.branding')}</TabsTrigger>
          <TabsTrigger value="booking">{t('settings.booking')}</TabsTrigger>
          <TabsTrigger value="policies">{t('settings.policies')}</TabsTrigger>
          <TabsTrigger value="notifications">{t('settings.notifications')}</TabsTrigger>
          {can('settings:manage') && <TabsTrigger value="templates">{t('settings.templates')}</TabsTrigger>}
          {can('settings:manage') && <TabsTrigger value="team">{t('settings.team')}</TabsTrigger>}
        </TabsList>
        <TabsContent value="profile"><ProfileTab /></TabsContent>
        <TabsContent value="branding"><BrandingTab /></TabsContent>
        <TabsContent value="booking"><BookingRulesTab /></TabsContent>
        <TabsContent value="policies"><PoliciesTab /></TabsContent>
        <TabsContent value="notifications"><NotificationsTab /></TabsContent>
        {can('settings:manage') && <TabsContent value="templates"><TemplatesTab /></TabsContent>}
        {can('settings:manage') && <TabsContent value="team"><TeamTab /></TabsContent>}
      </Tabs>
    </>
  );
}

function ImageField({ label, value, onChange, folder }: { label: string; value: string; onChange: (v: string) => void; folder: string }) {
  const { t } = useTranslation('dashboard');
  const status = useQuery({ queryKey: ['uploads-status'], queryFn: () => api.get<{ enabled: boolean }>('/uploads/status'), staleTime: Infinity });
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Field label={label} hint={status.data && !status.data.enabled ? t('settings.uploadDisabled') : undefined}>
      <div className="flex items-center gap-3">
        {value && <img src={value} alt="" className="h-10 w-10 rounded-lg border object-cover" />}
        <Input value={value} onChange={(e) => onChange(e.target.value)} dir="ltr" placeholder="https://" />
        {status.data?.enabled && (
          <>
            <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBusy(true);
              try {
                const fd = new FormData();
                fd.append('file', file);
                const r = await api.upload<{ url: string }>(`/uploads/image?folder=${folder}`, fd);
                onChange(r.url);
              } catch (err) {
                toast.error(errorMessage(err));
              } finally {
                setBusy(false);
                e.target.value = '';
              }
            }} />
            <Button type="button" variant="outline" loading={busy} onClick={() => ref.current?.click()}><Upload />{t('settings.upload')}</Button>
          </>
        )}
      </div>
    </Field>
  );
}

function ProfileTab() {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  const loc = useLocalized();
  const { business: b, id, can } = useTenant();
  const { save, saving, errors } = useSave();
  const cats = useQuery({ queryKey: ['categories'], queryFn: () => api.get<{ items: Category[] }>('/categories') });
  const [f, setF] = useState({ name: b.name, slug: b.slug, category: (b.category as Category)._id, tagline: b.tagline ?? '', description: b.description ?? '', logo: b.logo ?? '', cover: b.cover ?? '', email: b.contact?.email ?? '', phone: b.contact?.phone ?? '', website: b.contact?.website ?? '', whatsapp: b.contact?.whatsapp ?? '', line1: b.address?.line1 ?? '', city: b.address?.city ?? '', country: b.address?.country ?? '', lat: b.address?.location?.coordinates?.[1]?.toString() ?? '', lng: b.address?.location?.coordinates?.[0]?.toString() ?? '', timezone: b.timezone, currency: b.currency, locale: b.locale });
  const [tone, setTone] = useState<'professional' | 'friendly' | 'luxury'>('professional');
  const gen = useMutation({
    mutationFn: () => api.post<{ description: string }>(`/businesses/${id}/ai/description`, { tone, locale: f.locale }),
    onSuccess: (r) => { setF((x) => ({ ...x, description: r.description })); toast.success(t('settings.generated')); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        save({
          name: f.name, slug: f.slug, category: f.category, tagline: f.tagline, description: f.description, logo: f.logo, cover: f.cover,
          contact: { email: f.email, phone: f.phone, website: f.website, whatsapp: f.whatsapp },
          address: { line1: f.line1 || undefined, city: f.city || undefined, country: f.country || undefined, lat: f.lat ? Number(f.lat) : undefined, lng: f.lng ? Number(f.lng) : undefined },
          timezone: f.timezone, currency: f.currency, locale: f.locale,
        });
      }}
    >
      <Section title={t('settings.profile')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('settings.name')} error={errors.name} htmlFor="sp-name" required><Input id="sp-name" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label={t('settings.slug')} error={errors.slug} htmlFor="sp-slug" hint={`${window.location.origin}/b/${f.slug}`}><Input id="sp-slug" dir="ltr" value={f.slug} onChange={(e) => set('slug', e.target.value.toLowerCase())} /></Field>
          <Field label={t('settings.category')} htmlFor="sp-cat"><NativeSelect id="sp-cat" value={f.category} onChange={(e) => set('category', e.target.value)}>{cats.data?.items.map((c) => <option key={c._id} value={c._id}>{loc(c.name)}</option>)}</NativeSelect></Field>
          <Field label={t('settings.tagline')} htmlFor="sp-tag"><Input id="sp-tag" value={f.tagline} maxLength={160} onChange={(e) => set('tagline', e.target.value)} /></Field>
          <div className="sm:col-span-2">
            <Field label={t('settings.description')} htmlFor="sp-desc"><Textarea id="sp-desc" rows={5} value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
            {can('business:update') && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <NativeSelect value={tone} onChange={(e) => setTone(e.target.value as typeof tone)} className="h-9 w-40" aria-label={t('settings.tone')}>{(['professional', 'friendly', 'luxury'] as const).map((x) => <option key={x} value={x}>{t(`settings.tones.${x}`)}</option>)}</NativeSelect>
                <Button type="button" size="sm" variant="secondary" loading={gen.isPending} onClick={() => gen.mutate()}><Wand2 />{t('settings.generate')}</Button>
              </div>
            )}
          </div>
          <ImageField label={t('settings.logo')} value={f.logo} onChange={(v) => set('logo', v)} folder="logos" />
          <ImageField label={t('settings.cover')} value={f.cover} onChange={(v) => set('cover', v)} folder="covers" />
        </div>
      </Section>
      <Section title={tc('nav.contact')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('settings.contactEmail')} error={errors.email} htmlFor="sp-email"><Input id="sp-email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label={t('settings.contactPhone')} htmlFor="sp-phone"><Input id="sp-phone" dir="ltr" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label={t('settings.website')} error={errors.website} htmlFor="sp-web"><Input id="sp-web" dir="ltr" value={f.website} onChange={(e) => set('website', e.target.value)} /></Field>
          <Field label={t('settings.whatsapp')} htmlFor="sp-wa"><Input id="sp-wa" dir="ltr" value={f.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} /></Field>
          <Field label={tc('common.address')} htmlFor="sp-l1" className="sm:col-span-2"><Input id="sp-l1" value={f.line1} onChange={(e) => set('line1', e.target.value)} /></Field>
          <Field label={tc('common.city')} htmlFor="sp-city"><Input id="sp-city" value={f.city} onChange={(e) => set('city', e.target.value)} /></Field>
          <Field label={tc('common.country')} htmlFor="sp-country"><Input id="sp-country" value={f.country} onChange={(e) => set('country', e.target.value)} /></Field>
          <Field label={tc('common.latitude')} htmlFor="sp-lat"><Input id="sp-lat" type="number" step="any" dir="ltr" value={f.lat} onChange={(e) => set('lat', e.target.value)} /></Field>
          <Field label={tc('common.longitude')} htmlFor="sp-lng"><Input id="sp-lng" type="number" step="any" dir="ltr" value={f.lng} onChange={(e) => set('lng', e.target.value)} /></Field>
        </div>
      </Section>
      <Section title={tc('common.time')}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('settings.timezone')} error={errors.timezone} htmlFor="sp-tz"><Input id="sp-tz" dir="ltr" value={f.timezone} onChange={(e) => set('timezone', e.target.value)} list="tz-list" /></Field>
          <Field label={t('settings.currency')} htmlFor="sp-cur"><NativeSelect id="sp-cur" value={f.currency} onChange={(e) => set('currency', e.target.value)}>{SUPPORTED_CURRENCIES.map((c) => <option key={c}>{c}</option>)}</NativeSelect></Field>
          <Field label={t('settings.locale')} htmlFor="sp-loc"><NativeSelect id="sp-loc" value={f.locale} onChange={(e) => set('locale', e.target.value as 'en' | 'ar')}><option value="en">English</option><option value="ar">العربية</option></NativeSelect></Field>
        </div>
        <datalist id="tz-list">{(Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone').map((z) => <option key={z} value={z} />)}</datalist>
      </Section>
      <Button type="submit" loading={saving}>{tc('actions.save')}</Button>
    </form>
  );
}

function BrandingTab() {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  const { business: b, id, base, can } = useTenant();
  const { save, saving } = useSave();
  const usage = useQuery({ queryKey: ['usage', id], queryFn: () => api.get<{ plan: { limits: { customBranding: boolean } } }>(`/businesses/${id}/usage`) });
  const locked = usage.data ? !usage.data.plan?.limits?.customBranding : false;
  const category = b.category as Category;
  const [theme, setTheme] = useState<ThemePreset | ''>(b.branding.theme ?? '');
  const [f, setF] = useState({ primaryColor: b.branding.primaryColor, accentColor: b.branding.accentColor, hidePlatformBranding: !!b.branding.hidePlatformBranding, customDomain: b.branding.customDomain ?? '' });
  return (
    <form className="grid gap-6 lg:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save({ branding: locked ? { theme: theme || null } : { ...f, customDomain: f.customDomain || undefined, theme: theme || null } }); }}>
      <Section title={t('settings.branding')}>
        <Field label={t('settings.theme')} hint={t('settings.themeHint')} htmlFor="br-theme" className="mb-5">
          <NativeSelect id="br-theme" value={theme} onChange={(e) => setTheme(e.target.value as ThemePreset | '')}>
            <option value="">{t('settings.themeInherit', { name: t(`settings.themes.${category?.theme ?? 'default'}`) })}</option>
            {THEME_PRESETS.map((p) => <option key={p} value={p}>{t(`settings.themes.${p}`)}</option>)}
          </NativeSelect>
        </Field>
        {locked && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
            <span className="flex items-center gap-2"><Lock className="h-4 w-4" />{t('settings.brandingLocked')}</span>
            {can('subscription:manage') && <Button size="sm" variant="outline" asChild><Link to={`${base}/billing`}>{t('limits.upgrade')}</Link></Button>}
          </div>
        )}
        <fieldset disabled={locked} className="space-y-4 disabled:opacity-60">
          <Field label={t('settings.primaryColor')}><ColorInput value={f.primaryColor} onChange={(v) => setF({ ...f, primaryColor: v })} /></Field>
          <Field label={t('settings.accentColor')}><ColorInput value={f.accentColor} onChange={(v) => setF({ ...f, accentColor: v })} /></Field>
          <Field label={tc('common.customDomain')} hint={tc('common.customDomainHint')}><Input dir="ltr" value={f.customDomain} onChange={(e) => setF({ ...f, customDomain: e.target.value })} /></Field>
          <label className="flex items-center gap-3 text-sm"><Switch checked={f.hidePlatformBranding} onCheckedChange={(c) => setF({ ...f, hidePlatformBranding: c })} />{t('settings.hideBranding')}</label>
        </fieldset>
        <Button type="submit" className="mt-5" loading={saving}>{tc('actions.save')}</Button>
      </Section>
      <Section title={t('settings.preview')}>
        <div className="overflow-hidden rounded-2xl border">
          <div className="h-24" style={{ background: `linear-gradient(135deg, ${f.primaryColor}, ${f.accentColor})` }} />
          <div className="space-y-3 p-5">
            <p className="text-lg font-bold">{b.name}</p>
            <div className="flex gap-2">
              {['10:00', '10:30', '11:00'].map((x, i) => <span key={x} className="num rounded-xl border px-3 py-2 text-sm font-semibold" style={i === 1 ? { background: f.primaryColor, color: '#fff', borderColor: f.primaryColor } : undefined}>{x}</span>)}
            </div>
            <span className="inline-block rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ background: f.primaryColor }}>{tc('booking.confirm')}</span>
          </div>
        </div>
      </Section>
    </form>
  );
}

function useSettingsForm() {
  const { business } = useTenant();
  const [s, setS] = useState<BusinessSettings>(business.settings);
  useEffect(() => {
    setS(business.settings);
  }, [business.settings]);
  return [s, setS] as const;
}

function NumberField({ label, value, onChange, min = 0, max, id }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; id: string }) {
  return <Field label={label} htmlFor={id}><Input id={id} type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} /></Field>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="flex items-center justify-between gap-4 py-1 text-sm font-medium"><span>{label}</span><Switch checked={checked} onCheckedChange={onChange} /></label>;
}

function BookingRulesTab() {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  const { save, saving } = useSave();
  const [s, setS] = useSettingsForm();
  return (
    <form onSubmit={(e) => { e.preventDefault(); save({ settings: { slotInterval: s.slotInterval, minNoticeMinutes: s.minNoticeMinutes, maxAdvanceDays: s.maxAdvanceDays, requireApproval: s.requireApproval, allowGuestBooking: s.allowGuestBooking, allowStaffSelection: s.allowStaffSelection, waitlistEnabled: s.waitlistEnabled } }); }}>
      <Section title={t('settings.booking')}>
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField id="r-int" label={t('settings.slotInterval')} value={s.slotInterval} min={5} max={240} onChange={(v) => setS({ ...s, slotInterval: v })} />
          <NumberField id="r-not" label={t('settings.minNotice')} value={s.minNoticeMinutes} onChange={(v) => setS({ ...s, minNoticeMinutes: v })} />
          <NumberField id="r-adv" label={t('settings.maxAdvance')} value={s.maxAdvanceDays} min={1} max={730} onChange={(v) => setS({ ...s, maxAdvanceDays: v })} />
        </div>
        <div className="mt-5 max-w-lg divide-y">
          <Toggle label={t('settings.requireApproval')} checked={s.requireApproval} onChange={(v) => setS({ ...s, requireApproval: v })} />
          <Toggle label={t('settings.allowGuest')} checked={s.allowGuestBooking} onChange={(v) => setS({ ...s, allowGuestBooking: v })} />
          <Toggle label={t('settings.allowStaffSelection')} checked={s.allowStaffSelection} onChange={(v) => setS({ ...s, allowStaffSelection: v })} />
          <Toggle label={t('settings.waitlistEnabled')} checked={s.waitlistEnabled} onChange={(v) => setS({ ...s, waitlistEnabled: v })} />
        </div>
        <Button type="submit" className="mt-6" loading={saving}>{tc('actions.save')}</Button>
      </Section>
    </form>
  );
}

function PoliciesTab() {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  const { save, saving } = useSave();
  const [s, setS] = useSettingsForm();
  return (
    <form className="grid gap-6 lg:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save({ settings: { payment: s.payment, cancellation: s.cancellation, reschedule: s.reschedule } }); }}>
      <Section title={t('settings.payments')}>
        <div className="space-y-4">
          <Field label={t('settings.paymentMode')} htmlFor="p-mode">
            <NativeSelect id="p-mode" value={s.payment.mode} onChange={(e) => setS({ ...s, payment: { ...s.payment, mode: e.target.value as BusinessSettings['payment']['mode'] } })}>
              {(['none', 'optional', 'deposit', 'full'] as const).map((m) => <option key={m} value={m}>{t(`settings.paymentModes.${m}`)}</option>)}
            </NativeSelect>
          </Field>
          {s.payment.mode === 'deposit' && <NumberField id="p-dep" label={t('settings.depositPercent')} value={s.payment.depositPercent} max={100} onChange={(v) => setS({ ...s, payment: { ...s.payment, depositPercent: v } })} />}
          <Toggle label={t('settings.acceptCash')} checked={s.payment.acceptCash} onChange={(v) => setS({ ...s, payment: { ...s.payment, acceptCash: v } })} />
        </div>
      </Section>
      <Section title={t('settings.policies')}>
        <div className="space-y-4">
          <Toggle label={t('settings.cancelAllowed')} checked={s.cancellation.allowed} onChange={(v) => setS({ ...s, cancellation: { ...s.cancellation, allowed: v } })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField id="c-cut" label={t('settings.cancelCutoff')} value={s.cancellation.cutoffHours} onChange={(v) => setS({ ...s, cancellation: { ...s.cancellation, cutoffHours: v } })} />
            <NumberField id="c-fee" label={t('settings.cancelFee')} value={s.cancellation.feePercent} max={100} onChange={(v) => setS({ ...s, cancellation: { ...s.cancellation, feePercent: v } })} />
          </div>
          <Toggle label={t('settings.rescheduleAllowed')} checked={s.reschedule.allowed} onChange={(v) => setS({ ...s, reschedule: { ...s.reschedule, allowed: v } })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField id="r-cut" label={t('settings.rescheduleCutoff')} value={s.reschedule.cutoffHours} onChange={(v) => setS({ ...s, reschedule: { ...s.reschedule, cutoffHours: v } })} />
            <NumberField id="r-max" label={t('settings.rescheduleMax')} value={s.reschedule.maxTimes} onChange={(v) => setS({ ...s, reschedule: { ...s.reschedule, maxTimes: v } })} />
          </div>
        </div>
      </Section>
      <div className="lg:col-span-2"><Button type="submit" loading={saving}>{tc('actions.save')}</Button></div>
    </form>
  );
}

function NotificationsTab() {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  const { save, saving } = useSave();
  const [s, setS] = useSettingsForm();
  const [rem, setRem] = useState(s.notifications.reminderHours.join(', '));
  return (
    <form onSubmit={(e) => { e.preventDefault(); save({ settings: { notifications: { ...s.notifications, reminderHours: rem.split(',').map((x) => Number(x.trim())).filter((x) => x > 0).slice(0, 3) } } }); }}>
      <Section title={t('settings.notifications')}>
        <div className="max-w-lg divide-y">
          <Toggle label={t('settings.notifyEmail')} checked={s.notifications.email} onChange={(v) => setS({ ...s, notifications: { ...s.notifications, email: v } })} />
          <Toggle label={t('settings.notifyWhatsapp')} checked={s.notifications.whatsapp} onChange={(v) => setS({ ...s, notifications: { ...s.notifications, whatsapp: v } })} />
          <Toggle label={t('settings.notifySms')} checked={s.notifications.sms} onChange={(v) => setS({ ...s, notifications: { ...s.notifications, sms: v } })} />
        </div>
        <Field label={t('settings.reminders')} htmlFor="n-rem" className="mt-4 max-w-xs"><Input id="n-rem" dir="ltr" value={rem} onChange={(e) => setRem(e.target.value)} /></Field>
        <Button type="submit" className="mt-6" loading={saving}>{tc('actions.save')}</Button>
      </Section>
    </form>
  );
}

interface Tpl { _id: string; event: NotificationEvent; channel: string; locale: 'en' | 'ar'; subject?: string; body: string }

function TemplatesTab() {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  const { id } = useTenant();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['templates', id], queryFn: () => api.get<{ defaults: Record<NotificationEvent, Record<'en' | 'ar', { subject: string; body: string }>>; custom: Tpl[]; channels: string[] }>(`/businesses/${id}/templates`) });
  const [sel, setSel] = useState<{ event: NotificationEvent; channel: string; locale: 'en' | 'ar' }>({ event: 'booking.confirmed', channel: 'email', locale: 'en' });
  const [draft, setDraft] = useState({ subject: '', body: '' });
  const [busy, setBusy] = useState(false);
  const custom = q.data?.custom.find((c) => c.event === sel.event && c.channel === sel.channel && c.locale === sel.locale);
  useEffect(() => {
    if (!q.data) return;
    const d = q.data.defaults[sel.event][sel.locale];
    setDraft({ subject: custom?.subject ?? d.subject, body: custom?.body ?? d.body });
  }, [q.data, sel, custom]);
  return (
    <QueryView query={q}>
      {(d) => (
        <Section title={t('settings.templates')} actions={custom ? <Badge tone="primary">{t('settings.templateCustom')}</Badge> : <Badge>{t('settings.templateDefault')}</Badge>}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('settings.templateEvent')} htmlFor="tp-ev"><NativeSelect id="tp-ev" value={sel.event} onChange={(e) => setSel({ ...sel, event: e.target.value as NotificationEvent })}>{NOTIFICATION_EVENTS.map((e) => <option key={e} value={e}>{e}</option>)}</NativeSelect></Field>
            <Field label={t('settings.templateChannel')} htmlFor="tp-ch"><NativeSelect id="tp-ch" value={sel.channel} onChange={(e) => setSel({ ...sel, channel: e.target.value })}>{d.channels.map((c) => <option key={c} value={c}>{c}</option>)}</NativeSelect></Field>
            <Field label={t('settings.templateLocale')} htmlFor="tp-lc"><NativeSelect id="tp-lc" value={sel.locale} onChange={(e) => setSel({ ...sel, locale: e.target.value as 'en' | 'ar' })}><option value="en">English</option><option value="ar">العربية</option></NativeSelect></Field>
          </div>
          <div className="mt-4 space-y-4">
            {sel.channel !== 'sms' && sel.channel !== 'whatsapp' && <Field label={t('settings.templateSubject')} htmlFor="tp-sub"><Input id="tp-sub" dir={sel.locale === 'ar' ? 'rtl' : 'ltr'} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} /></Field>}
            <Field label={t('settings.templateBody')} htmlFor="tp-body"><Textarea id="tp-body" rows={5} dir={sel.locale === 'ar' ? 'rtl' : 'ltr'} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} /></Field>
            <p className="text-xs text-muted-foreground">{t('settings.templatePlaceholders')}: <span dir="ltr" className="font-mono">{TEMPLATE_PLACEHOLDERS.map((p) => `{{${p}}}`).join(' ')}</span></p>
            <div className="flex flex-wrap gap-2">
              <Button loading={busy} onClick={async () => {
                setBusy(true);
                try {
                  await api.put(`/businesses/${id}/templates`, { ...sel, subject: draft.subject, body: draft.body });
                  toast.success(t('settings.templateSaved'));
                  void qc.invalidateQueries({ queryKey: ['templates', id] });
                } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
              }}>{tc('actions.save')}</Button>
              {custom && <Button variant="outline" onClick={async () => { await api.delete(`/businesses/${id}/templates/${custom._id}`); void qc.invalidateQueries({ queryKey: ['templates', id] }); }}>{t('settings.templateReset')}</Button>}
            </div>
          </div>
        </Section>
      )}
    </QueryView>
  );
}

function TeamTab() {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  const { id } = useTenant();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['team', id], queryFn: () => api.get<{ items: Array<{ _id: string; name: string; email: string; role: string; lastLoginAt?: string }> }>(`/businesses/${id}/team`) });
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'manager' | 'staff'>('manager');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<{ _id: string; name: string } | null>(null);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr,360px]">
      <Section title={t('settings.team')}>
        <QueryView query={q}>
          {(d) => (
            <ul className="divide-y">
              {d.items.map((m) => (
                <li key={m._id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0"><p className="font-medium">{m.name}</p><p className="truncate text-sm text-muted-foreground">{m.email}</p></div>
                  <div className="flex items-center gap-2">
                    <Badge tone={m.role === 'owner' ? 'primary' : 'default'}>{t(`settings.teamRoles.${m.role}`)}</Badge>
                    {m.role !== 'owner' && <Button variant="ghost" size="icon-sm" onClick={() => setDel(m)} aria-label={tc('actions.remove')}><Trash2 /></Button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      </Section>
      <Section title={t('settings.teamInvite')} description={t('settings.teamInviteHint')}>
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr('');
          try {
            await api.post(`/businesses/${id}/team`, { email, role });
            toast.success(t('settings.teamAdded'));
            setEmail('');
            void qc.invalidateQueries({ queryKey: ['team', id] });
          } catch (e2) { setErr(errorMessage(e2)); } finally { setBusy(false); }
        }}>
          <Field label={tc('common.email')} error={err} htmlFor="tm-email"><Input id="tm-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label={t('settings.teamRole')} htmlFor="tm-role"><NativeSelect id="tm-role" value={role} onChange={(e) => setRole(e.target.value as typeof role)}><option value="manager">{t('settings.teamRoles.manager')}</option><option value="staff">{t('settings.teamRoles.staff')}</option></NativeSelect></Field>
          <Button type="submit" loading={busy}><UserPlus />{tc('actions.add')}</Button>
        </form>
      </Section>
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title={`${tc('actions.remove')}: ${del?.name ?? ''}`} destructive onConfirm={async () => { await api.delete(`/businesses/${id}/team/${del!._id}`); toast.success(t('settings.teamRemoved')); void qc.invalidateQueries({ queryKey: ['team', id] }); }} />
    </div>
  );
}
