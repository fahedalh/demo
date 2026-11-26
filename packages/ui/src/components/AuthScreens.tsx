/**
 * Sign-in / sign-up / password-reset screens shared by the three apps.
 * Each app passes its role, demo credentials and a side visual.
 */
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Sparkles } from 'lucide-react';
import { loginSchema, passwordSchema, phoneSchema, type AuthResponse } from '@masar/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-store';
import { Button, Input } from './primitives';
import { Field, FormError } from './form';
import { LanguageToggle, Logo, ThemeToggle } from './misc';

type Mode = 'login' | 'register' | 'forgot';

export interface AuthScreenProps {
  role: 'PASSENGER' | 'DRIVER' | 'ADMIN';
  suffix?: string;
  allowRegister?: boolean;
  demo?: { identifier: string; password: string; label?: string }[];
  aside: React.ReactNode;
  onAuthenticated?: (res: AuthResponse) => void;
}

export function AuthScreen({ role, suffix, allowRegister = true, demo, aside, onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = React.useState<Mode>('login');
  const { t } = useTranslation();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex min-h-dvh flex-col px-5 py-6 sm:px-10">
        <header className="flex items-center justify-between">
          <Logo suffix={suffix} />
          <div className="flex items-center gap-1">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-10">
          <motion.div key={mode} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            {mode === 'login' && <LoginForm demo={demo} onForgot={() => setMode('forgot')} onAuthenticated={onAuthenticated} />}
            {mode === 'register' && <RegisterForm role={role as 'PASSENGER' | 'DRIVER'} onAuthenticated={onAuthenticated} />}
            {mode === 'forgot' && <ForgotForm onDone={() => setMode('login')} />}
            <div className="mt-8 text-center text-sm text-muted">
              {mode === 'login' && allowRegister && (
                <>
                  {t('auth.noAccount')}{' '}
                  <button className="font-semibold text-fg underline-offset-4 hover:underline" onClick={() => setMode('register')}>
                    {t('auth.signUp')}
                  </button>
                </>
              )}
              {mode !== 'login' && (
                <>
                  {t('auth.haveAccount')}{' '}
                  <button className="font-semibold text-fg underline-offset-4 hover:underline" onClick={() => setMode('login')}>
                    {t('auth.signIn')}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </main>
        <footer className="text-center text-xs text-muted">{t('auth.terms')}</footer>
      </div>
      <aside className="relative hidden overflow-hidden bg-ink lg:block">{aside}</aside>
    </div>
  );
}

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? 'text' : 'password'} className="pe-12" />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute end-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted hover:text-fg" aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function SocialButtons() {
  const { t } = useTranslation();
  const tryProvider = async (p: 'google' | 'apple') => {
    try {
      await api.post(`/auth/social/${p}`, {});
    } catch (e) {
      toast.info(t('auth.socialUnavailable'), { description: e instanceof ApiError ? e.message : undefined });
    }
  };
  return (
    <div className="grid grid-cols-2 gap-3">
      <Button type="button" variant="outline" onClick={() => tryProvider('google')}>
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
          <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.8-5.4 3.8-3.3 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" />
        </svg>
        Google
      </Button>
      <Button type="button" variant="outline" onClick={() => tryProvider('apple')}>
        <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden>
          <path d="M16.4 12.6c0-2.5 2-3.7 2.1-3.8-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9s-2-.9-3.3-.9c-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8s2 .8 3.3.8c1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.8-1-2.8-4.2zM14 5.1c.7-.8 1.2-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4z" />
        </svg>
        Apple
      </Button>
    </div>
  );
}

function LoginForm({ demo, onForgot, onAuthenticated }: { demo?: AuthScreenProps['demo']; onForgot: () => void; onAuthenticated?: (r: AuthResponse) => void }) {
  const { t } = useTranslation();
  const setSession = useAuth((s) => s.setSession);
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema), defaultValues: { identifier: '', password: '' } });
  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const res = await api.post<AuthResponse>('/auth/login', values);
      setSession(res.user, res.accessToken);
      onAuthenticated?.(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.generic'));
    }
  });
  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div>
        <h1 className="text-3xl font-bold">{t('auth.welcome')}</h1>
      </div>
      {demo && demo.length > 0 && (
        <div className="rounded-2xl border border-dashed border-accent/50 bg-accent/5 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-accent" /> {t('auth.demo')}
          </div>
          <div className="flex flex-wrap gap-2">
            {demo.map((d) => (
              <button
                key={d.identifier}
                type="button"
                onClick={() => {
                  form.setValue('identifier', d.identifier);
                  form.setValue('password', d.password);
                }}
                className="rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-fg ring-1 ring-line transition hover:ring-fg"
              >
                {d.label ?? d.identifier}
              </button>
            ))}
          </div>
        </div>
      )}
      <FormError message={error} />
      <Field label={t('auth.emailOrPhone')} error={form.formState.errors.identifier?.message} htmlFor="identifier">
        <Input id="identifier" autoComplete="username" {...form.register('identifier')} invalid={!!form.formState.errors.identifier} />
      </Field>
      <Field label={t('auth.password')} error={form.formState.errors.password?.message} htmlFor="password">
        <PasswordInput id="password" autoComplete="current-password" {...form.register('password')} invalid={!!form.formState.errors.password} />
      </Field>
      <div className="flex justify-end">
        <button type="button" onClick={onForgot} className="text-sm font-medium text-muted hover:text-fg">
          {t('auth.forgot')}
        </button>
      </div>
      <Button type="submit" size="lg" block loading={form.formState.isSubmitting}>
        {t('auth.signIn')}
      </Button>
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" /> {t('auth.or')} <span className="h-px flex-1 bg-line" />
      </div>
      <SocialButtons />
    </form>
  );
}

const registerForm = z
  .object({
    firstName: z.string().trim().min(1, 'Required'),
    lastName: z.string().trim().min(1, 'Required'),
    email: z.string().trim().email('Enter a valid email address'),
    phone: phoneSchema,
    password: passwordSchema,
  });

function RegisterForm({ role, onAuthenticated }: { role: 'PASSENGER' | 'DRIVER'; onAuthenticated?: (r: AuthResponse) => void }) {
  const { t, i18n } = useTranslation();
  const setSession = useAuth((s) => s.setSession);
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<z.infer<typeof registerForm>>({ resolver: zodResolver(registerForm), defaultValues: { firstName: '', lastName: '', email: '', phone: '+971', password: '' } });
  const e = form.formState.errors;
  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const res = await api.post<AuthResponse>('/auth/register', { ...values, role, locale: i18n.language === 'ar' ? 'ar' : 'en' });
      setSession(res.user, res.accessToken);
      onAuthenticated?.(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  });
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <h1 className="text-3xl font-bold">{t('auth.createTitle')}</h1>
      <FormError message={error} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('auth.firstName')} error={e.firstName?.message} htmlFor="firstName">
          <Input id="firstName" autoComplete="given-name" {...form.register('firstName')} invalid={!!e.firstName} />
        </Field>
        <Field label={t('auth.lastName')} error={e.lastName?.message} htmlFor="lastName">
          <Input id="lastName" autoComplete="family-name" {...form.register('lastName')} invalid={!!e.lastName} />
        </Field>
      </div>
      <Field label={t('auth.email')} error={e.email?.message} htmlFor="email">
        <Input id="email" type="email" autoComplete="email" {...form.register('email')} invalid={!!e.email} />
      </Field>
      <Field label={t('auth.phone')} error={e.phone?.message} htmlFor="phone">
        <Input id="phone" type="tel" dir="ltr" autoComplete="tel" {...form.register('phone')} invalid={!!e.phone} />
      </Field>
      <Field label={t('auth.password')} error={e.password?.message} hint={t('auth.passwordHint')} htmlFor="new-password">
        <PasswordInput id="new-password" autoComplete="new-password" {...form.register('password')} invalid={!!e.password} />
      </Field>
      <Button type="submit" size="lg" block loading={form.formState.isSubmitting}>
        {t('auth.signUp')}
      </Button>
    </form>
  );
}

const forgotSchema = z.object({ identifier: z.string().trim().min(3, 'Required') });
const resetSchema = z.object({ code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'), password: passwordSchema });

function ForgotForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [identifier, setIdentifier] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const f1 = useForm<z.infer<typeof forgotSchema>>({ resolver: zodResolver(forgotSchema) });
  const f2 = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema) });

  if (!identifier) {
    return (
      <form
        className="space-y-5"
        noValidate
        onSubmit={f1.handleSubmit(async (v) => {
          setError(null);
          try {
            await api.post('/auth/password/forgot', v);
            setIdentifier(v.identifier.trim().toLowerCase());
            toast.success(t('auth.codeSent'));
          } catch (e) {
            setError(e instanceof Error ? e.message : t('errors.generic'));
          }
        })}
      >
        <div>
          <h1 className="text-3xl font-bold">{t('auth.resetTitle')}</h1>
          <p className="mt-2 text-muted">{t('auth.resetHelp')}</p>
        </div>
        <FormError message={error} />
        <Field label={t('auth.emailOrPhone')} error={f1.formState.errors.identifier?.message}>
          <Input autoComplete="username" {...f1.register('identifier')} />
        </Field>
        <Button type="submit" size="lg" block loading={f1.formState.isSubmitting}>
          {t('auth.sendCode')}
        </Button>
      </form>
    );
  }
  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={f2.handleSubmit(async (v) => {
        setError(null);
        try {
          await api.post('/auth/password/reset', { identifier, ...v });
          toast.success(t('auth.resetDone'));
          onDone();
        } catch (e) {
          setError(e instanceof Error ? e.message : t('errors.generic'));
        }
      })}
    >
      <div>
        <h1 className="text-3xl font-bold">{t('auth.reset')}</h1>
        <p className="mt-2 text-muted">{t('auth.verifyHelp', { target: identifier })}</p>
      </div>
      <FormError message={error} />
      <Field label={t('auth.code')} error={f2.formState.errors.code?.message}>
        <Input inputMode="numeric" maxLength={6} dir="ltr" className="tracking-[0.5em] text-center text-lg font-semibold" {...f2.register('code')} />
      </Field>
      <Field label={t('auth.newPassword')} error={f2.formState.errors.password?.message} hint={t('auth.passwordHint')}>
        <PasswordInput autoComplete="new-password" {...f2.register('password')} />
      </Field>
      <Button type="submit" size="lg" block loading={f2.formState.isSubmitting}>
        {t('auth.reset')}
      </Button>
    </form>
  );
}
