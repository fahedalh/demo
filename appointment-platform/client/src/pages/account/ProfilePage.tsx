import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { Field, PageHeader, Section } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Switch } from '@/components/ui/misc';
import { useAuth } from '@/contexts/AuthContext';
import { applyServerErrors, useApiForm } from '@/hooks/useApiForm';
import { api, errorMessage } from '@/services/api';
import type { User } from '@/types';

const profileSchema = z.object({ name: z.string().trim().min(2).max(120), phone: z.string().trim().max(30), locale: z.enum(['en', 'ar']), avatar: z.string().url().or(z.literal('')) });
const pwSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).regex(/[A-Za-z]/).regex(/\d/) });

export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const { user, setUser } = useAuth();
  const form = useApiForm(profileSchema, { name: user?.name ?? '', phone: user?.phone ?? '', locale: user?.locale ?? 'en', avatar: user?.avatar ?? '' });
  const pw = useApiForm(pwSchema, { currentPassword: '', newPassword: '' });
  const prefs = useMutation({
    mutationFn: (p: Partial<NonNullable<User['notificationPrefs']>>) => api.patch<{ user: User }>('/auth/me', { notificationPrefs: p }),
    onSuccess: (r) => setUser(r.user),
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!user) return null;
  return (
    <>
      <PageHeader title={t('account.profile')} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={t('account.profile')}>
          <form
            className="space-y-4"
            noValidate
            onSubmit={form.handleSubmit(async (v) => {
              try {
                const r = await api.patch<{ user: User }>('/auth/me', v);
                setUser(r.user);
                if (v.locale !== i18n.language) await i18n.changeLanguage(v.locale);
                toast.success(t('account.profileSaved'));
              } catch (e) {
                applyServerErrors(form, e);
              }
            })}
          >
            <Field label={t('common.name')} error={form.formState.errors.name?.message} htmlFor="p-name"><Input id="p-name" {...form.register('name')} /></Field>
            <Field label={t('common.email')} htmlFor="p-email"><Input id="p-email" value={user.email} disabled /></Field>
            <Field label={t('common.phone')} htmlFor="p-phone"><Input id="p-phone" dir="ltr" {...form.register('phone')} /></Field>
            <Field label={t('common.avatarUrl')} error={form.formState.errors.avatar?.message} htmlFor="p-avatar"><Input id="p-avatar" dir="ltr" {...form.register('avatar')} /></Field>
            <Field label={t('account.language')} htmlFor="p-locale">
              <NativeSelect id="p-locale" {...form.register('locale')}><option value="en">English</option><option value="ar">العربية</option></NativeSelect>
            </Field>
            <Button type="submit" loading={form.formState.isSubmitting}>{t('actions.save')}</Button>
          </form>
        </Section>
        <div className="space-y-6">
          <Section title={t('account.notificationPrefs')}>
            <div className="space-y-4">
              {(['email', 'whatsapp', 'sms'] as const).map((k) => (
                <label key={k} className="flex items-center justify-between gap-4">
                  <span className="text-sm font-medium">{t(`account.pref${k === 'email' ? 'Email' : k === 'whatsapp' ? 'Whatsapp' : 'Sms'}`)}</span>
                  <Switch checked={!!user.notificationPrefs?.[k]} disabled={prefs.isPending} onCheckedChange={(c) => prefs.mutate({ [k]: c })} />
                </label>
              ))}
            </div>
          </Section>
          <Section title={t('account.changePassword')}>
            <form
              className="space-y-4"
              noValidate
              onSubmit={pw.handleSubmit(async (v) => {
                try {
                  await api.post('/auth/change-password', v);
                  pw.reset();
                  toast.success(t('account.passwordChanged'));
                } catch (e) {
                  applyServerErrors(pw, e);
                }
              })}
            >
              <Field label={t('account.currentPassword')} error={pw.formState.errors.currentPassword?.message} htmlFor="pw-c"><Input id="pw-c" type="password" autoComplete="current-password" {...pw.register('currentPassword')} /></Field>
              <Field label={t('account.newPassword')} error={pw.formState.errors.newPassword && t('auth.passwordHint')} hint={t('auth.passwordHint')} htmlFor="pw-n"><Input id="pw-n" type="password" autoComplete="new-password" {...pw.register('newPassword')} /></Field>
              <Button type="submit" variant="outline" loading={pw.formState.isSubmitting}>{t('account.changePassword')}</Button>
            </form>
          </Section>
        </div>
      </div>
    </>
  );
}
