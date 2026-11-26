import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Field } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Card } from '@/components/ui/misc';
import { applyServerErrors, useApiForm } from '@/hooks/useApiForm';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { api } from '@/services/api';

const schema = z.object({ name: z.string().trim().min(2), email: z.string().trim().email(), subject: z.string().max(200).optional(), message: z.string().trim().min(10).max(4000) });

export function ContactPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('contact.title'), t('contact.subtitle'));
  const form = useApiForm(schema, { name: '', email: '', subject: '', message: '' });
  const m = useMutation({ mutationFn: (v: z.infer<typeof schema>) => api.post('/settings/contact', v), onError: (e) => applyServerErrors(form, e) });
  const err = form.formState.errors;
  return (
    <div className="container grid max-w-5xl gap-10 py-14 lg:grid-cols-[1fr,1.3fr]">
      <div>
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Mail /></span>
        <h1 className="text-3xl font-bold">{t('contact.title')}</h1>
        <p className="mt-3 text-muted-foreground">{t('contact.subtitle')}</p>
      </div>
      <Card className="p-6">
        {m.isSuccess ? (
          <div className="py-10 text-center" role="status">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <p className="mt-3 font-semibold">{t('contact.sent')}</p>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={form.handleSubmit((v) => m.mutate(v))} noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('common.name')} error={err.name && t('common.required')} htmlFor="c-name" required><Input id="c-name" {...form.register('name')} aria-invalid={!!err.name} /></Field>
              <Field label={t('common.email')} error={err.email && t('common.required')} htmlFor="c-email" required><Input id="c-email" type="email" {...form.register('email')} aria-invalid={!!err.email} /></Field>
            </div>
            <Field label={t('contact.subject')} htmlFor="c-subject"><Input id="c-subject" {...form.register('subject')} /></Field>
            <Field label={t('contact.message')} error={err.message?.message} htmlFor="c-msg" required><Textarea id="c-msg" rows={6} {...form.register('message')} aria-invalid={!!err.message} /></Field>
            <Button type="submit" loading={m.isPending} className="w-full sm:w-auto">{t('actions.send')}</Button>
          </form>
        )}
      </Card>
    </div>
  );
}
