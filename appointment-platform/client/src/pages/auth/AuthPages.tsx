import { Briefcase, CalendarCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { Field } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/misc';
import { homeFor, useAuth } from '@/contexts/AuthContext';
import { applyServerErrors, useApiForm } from '@/hooks/useApiForm';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { cn } from '@/lib/utils';

const loginSchema = z.object({ email: z.string().trim().email(), password: z.string().min(1) });
const registerSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().email(),
  phone: z.string().trim().max(30).optional(),
  password: z.string().min(8).regex(/[A-Za-z]/).regex(/\d/),
});

function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
}

export function LoginPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('auth.loginTitle'));
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const form = useApiForm(loginSchema, { email: '', password: '' });
  const err = form.formState.errors;
  if (user) return <Navigate to={safeNext(sp.get('next')) ?? homeFor(user)} replace />;
  const demo = [
    ['Admin', 'admin@bookly.dev', 'Admin123!'],
    ['Clinic owner', 'clinic@bookly.dev', 'Owner123!'],
    ['Staff', 'layla@bookly.dev', 'Staff123!'],
    ['Customer', 'sara@example.com', 'Customer123!'],
  ];
  return (
    <AuthShell title={t('auth.loginTitle')} subtitle={t('auth.loginSubtitle')}>
      <form
        className="space-y-4"
        noValidate
        onSubmit={form.handleSubmit(async (v) => {
          try {
            const u = await login(v.email, v.password);
            toast.success(t('auth.welcome', { name: u.name.split(' ')[0] }));
            navigate(safeNext(sp.get('next')) ?? homeFor(u), { replace: true });
          } catch (e) {
            applyServerErrors(form, e);
          }
        })}
      >
        <Field label={t('common.email')} error={err.email && t('common.required')} htmlFor="l-email"><Input id="l-email" type="email" autoComplete="email" {...form.register('email')} aria-invalid={!!err.email} /></Field>
        <Field label={t('common.password')} error={err.password && t('common.required')} htmlFor="l-pw"><Input id="l-pw" type="password" autoComplete="current-password" {...form.register('password')} aria-invalid={!!err.password} /></Field>
        <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>{t('auth.login')}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">{t('auth.noAccount')} <Link to="/register" className="font-semibold text-primary hover:underline">{t('auth.create')}</Link></p>
      {import.meta.env.DEV && (
        <div className="mt-6 rounded-2xl border border-dashed p-4">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">{t('auth.demo')}</p>
          <div className="grid grid-cols-2 gap-2">
            {demo.map(([label, email, pw]) => (
              <Button key={email} type="button" variant="secondary" size="sm" onClick={() => { form.setValue('email', email); form.setValue('password', pw); }}>{label}</Button>
            ))}
          </div>
        </div>
      )}
    </AuthShell>
  );
}

export function RegisterPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('auth.registerTitle'));
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const [type, setType] = useState<'customer' | 'business'>(sp.get('type') === 'business' ? 'business' : 'customer');
  const form = useApiForm(registerSchema, { name: '', email: '', phone: '', password: '' });
  const err = form.formState.errors;
  if (user) return <Navigate to={homeFor(user)} replace />;
  return (
    <AuthShell title={t('auth.registerTitle')} subtitle={type === 'business' ? t('auth.registerBusinessSubtitle') : t('auth.registerSubtitle')}>
      <div className="mb-5">
        <p className="mb-2 text-sm font-medium">{t('auth.accountType')}</p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup">
          {([['customer', <CalendarCheck key="c" />, t('auth.asCustomer')], ['business', <Briefcase key="b" />, t('auth.asBusiness')]] as const).map(([k, icon, label]) => (
            <button key={k} type="button" role="radio" aria-checked={type === k} onClick={() => setType(k)} className={cn('flex flex-col items-center gap-2 rounded-2xl border p-4 text-center text-sm font-medium transition-all [&_svg]:size-5', type === k ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary' : 'hover:border-primary/40')}>
              {icon}{label}
            </button>
          ))}
        </div>
      </div>
      <form
        className="space-y-4"
        noValidate
        onSubmit={form.handleSubmit(async (v) => {
          try {
            const u = await register({ ...v, phone: v.phone || undefined, accountType: type });
            toast.success(t('auth.welcome', { name: u.name.split(' ')[0] }));
            navigate(type === 'business' ? '/onboarding' : safeNext(sp.get('next')) ?? '/account', { replace: true });
          } catch (e) {
            applyServerErrors(form, e);
          }
        })}
      >
        <Field label={t('common.name')} error={err.name && t('common.required')} htmlFor="r-name" required><Input id="r-name" autoComplete="name" {...form.register('name')} aria-invalid={!!err.name} /></Field>
        <Field label={t('common.email')} error={err.email?.message && (err.email.type === 'custom' ? err.email.message : t('common.required'))} htmlFor="r-email" required><Input id="r-email" type="email" autoComplete="email" {...form.register('email')} aria-invalid={!!err.email} /></Field>
        <Field label={t('common.phone')} htmlFor="r-phone"><Input id="r-phone" type="tel" dir="ltr" autoComplete="tel" {...form.register('phone')} /></Field>
        <Field label={t('common.password')} error={err.password && t('auth.passwordHint')} hint={t('auth.passwordHint')} htmlFor="r-pw" required><Input id="r-pw" type="password" autoComplete="new-password" {...form.register('password')} aria-invalid={!!err.password} /></Field>
        <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>{t('auth.create')}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">{t('auth.haveAccount')} <Link to="/login" className="font-semibold text-primary hover:underline">{t('auth.login')}</Link></p>
    </AuthShell>
  );
}

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(50%_40%_at_50%_0%,hsl(var(--primary)/.14),transparent_70%)]" aria-hidden />
      <div className="container flex justify-center py-12 sm:py-20">
        <Card className="w-full max-w-md p-6 sm:p-8">
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mb-6 mt-1 text-sm text-muted-foreground">{subtitle}</p>
          {children}
        </Card>
      </div>
    </div>
  );
}
