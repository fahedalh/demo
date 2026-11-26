import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { SUPPORTED_CURRENCIES } from '@bookly/shared';
import { Field } from '@/components/common';
import { CategoryIcon } from '@/components/common/CategoryIcon';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Card } from '@/components/ui/misc';
import { useAuth } from '@/contexts/AuthContext';
import { applyServerErrors, useApiForm } from '@/hooks/useApiForm';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useLocalized } from '@/hooks/useLocalized';
import { cn } from '@/lib/utils';
import { api } from '@/services/api';
import type { Business, Category } from '@/types';

const schema = z.object({
  name: z.string().trim().min(2),
  category: z.string().min(1),
  tagline: z.string().max(160).optional(),
  city: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  timezone: z.string().min(1),
  currency: z.string().length(3),
  locale: z.enum(['en', 'ar']),
});

export function OnboardingPage() {
  const { t, i18n } = useTranslation();
  useDocumentTitle(t('onboarding.title'));
  const loc = useLocalized();
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const cats = useQuery({ queryKey: ['categories'], queryFn: () => api.get<{ items: Category[] }>('/categories') });
  const form = useApiForm(schema, { name: '', category: '', tagline: '', city: '', country: '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Riyadh', currency: 'USD', locale: i18n.language === 'ar' ? 'ar' : 'en' });
  const err = form.formState.errors;
  const category = form.watch('category');
  return (
    <div className="container max-w-3xl py-12">
      <h1 className="text-3xl font-bold">{t('onboarding.title')}</h1>
      <p className="mt-2 text-muted-foreground">{t('onboarding.subtitle')}</p>
      <Card className="mt-8 p-6">
        <form
          className="space-y-6"
          noValidate
          onSubmit={form.handleSubmit(async (v) => {
            try {
              const b = await api.post<Business>('/businesses', { name: v.name, category: v.category, tagline: v.tagline || undefined, timezone: v.timezone, currency: v.currency, locale: v.locale, address: { city: v.city || undefined, country: v.country || undefined } });
              await refreshProfile();
              toast.success(t('onboarding.created'));
              navigate(`/dashboard/${b._id}/services`);
            } catch (e) {
              applyServerErrors(form, e);
            }
          })}
        >
          <Field label={t('onboarding.name')} error={err.name && t('common.required')} htmlFor="ob-name" required><Input id="ob-name" {...form.register('name')} /></Field>
          <Field label={t('onboarding.category')} error={err.category && t('common.required')} required>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup">
              {cats.data?.items.map((c) => (
                <button key={c._id} type="button" role="radio" aria-checked={category === c._id} onClick={() => form.setValue('category', c._id, { shouldValidate: true })} className={cn('flex flex-col items-center gap-2 rounded-2xl border p-3 text-center text-xs font-medium transition-all', category === c._id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-primary/40')}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `${c.color}1f`, color: c.color }}><CategoryIcon name={c.icon} className="h-5 w-5" /></span>
                  {loc(c.name)}
                </button>
              ))}
            </div>
          </Field>
          <Field label={t('onboarding.tagline')} htmlFor="ob-tag"><Input id="ob-tag" placeholder={t('onboarding.taglinePh')} {...form.register('tagline')} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('common.city')} htmlFor="ob-city"><Input id="ob-city" {...form.register('city')} /></Field>
            <Field label={t('common.country')} htmlFor="ob-country"><Input id="ob-country" {...form.register('country')} /></Field>
            <Field label={t('onboarding.timezone')} error={err.timezone?.message} htmlFor="ob-tz"><Input id="ob-tz" dir="ltr" {...form.register('timezone')} /></Field>
            <Field label={t('onboarding.currency')} htmlFor="ob-cur"><NativeSelect id="ob-cur" {...form.register('currency')}>{SUPPORTED_CURRENCIES.map((c) => <option key={c}>{c}</option>)}</NativeSelect></Field>
            <Field label={t('onboarding.locale')} htmlFor="ob-loc"><NativeSelect id="ob-loc" {...form.register('locale')}><option value="en">English</option><option value="ar">العربية</option></NativeSelect></Field>
          </div>
          <Button type="submit" size="lg" loading={form.formState.isSubmitting}>{t('actions.create')}</Button>
        </form>
      </Card>
    </div>
  );
}
