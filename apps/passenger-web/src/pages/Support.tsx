import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { ChevronDown, LifeBuoy, MessageSquarePlus } from 'lucide-react';
import { supportTicketSchema } from '@masar/shared';
import { api, ApiError, Badge, Button, Card, Dialog, DialogContent, EmptyState, Field, FormError, Input, Select, Skeleton, Textarea, toast, useFormat } from '@masar/ui';

interface Ticket { id: string; number: number; subject: string; category: string; status: string; priority: string; description: string; createdAt: string; updatedAt: string; ride: { code: string } | null }

const CATEGORIES = ['RIDE_ISSUE', 'PAYMENT', 'ACCOUNT', 'SAFETY', 'LOST_ITEM', 'OTHER'] as const;

export function NewTicketDialog({ open, onOpenChange, rideId }: { open: boolean; onOpenChange: (o: boolean) => void; rideId?: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof supportTicketSchema>>({ resolver: zodResolver(supportTicketSchema), defaultValues: { subject: '', category: rideId ? 'RIDE_ISSUE' : 'OTHER', description: '', rideId } });
  const e = form.formState.errors;
  const submit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      await api.post('/support/tickets', { ...v, rideId });
      toast.success(t('support.sent'));
      void qc.invalidateQueries({ queryKey: ['tickets'] });
      form.reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('errors.generic'));
    }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('support.newTicket')}>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormError message={error} />
          <Field label={t('support.category')}>
            <Select {...form.register('category')}>{CATEGORIES.map((c) => <option key={c} value={c}>{t(`support.categories.${c}`)}</option>)}</Select>
          </Field>
          <Field label={t('support.subject')} error={e.subject?.message}><Input {...form.register('subject')} invalid={!!e.subject} /></Field>
          <Field label={t('support.description')} error={e.description?.message}><Textarea rows={5} {...form.register('description')} invalid={!!e.description} /></Field>
          <Button type="submit" block loading={form.formState.isSubmitting}>{t('actions.submit')}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SupportPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const [open, setOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['tickets'], queryFn: () => api.get<{ items: Ticket[] }>('/support/tickets').then((r) => r.items) });
  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('support.title')}</h1>
        <Button onClick={() => setOpen(true)}><MessageSquarePlus /> {t('support.newTicket')}</Button>
      </div>
      <Card className="divide-y divide-line">
        <p className="p-4 text-sm font-semibold text-muted">{t('support.faq')}</p>
        {[1, 2, 3].map((i) => (
          <details key={i} className="group p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between font-medium">{t(`support.faq${i}q`)}<ChevronDown className="size-4 transition group-open:rotate-180" /></summary>
            <p className="mt-2 text-sm text-muted">{t(`support.faq${i}a`)}</p>
          </details>
        ))}
      </Card>
      {q.isLoading && <Skeleton className="h-40" />}
      {q.data?.length === 0 && <EmptyState icon={LifeBuoy} title={t('support.none')} />}
      <div className="space-y-3">
        {q.data?.map((tk) => (
          <Card key={tk.id} className="p-4">
            <button className="flex w-full items-start justify-between gap-3 text-start" onClick={() => setOpenId(openId === tk.id ? null : tk.id)}>
              <div>
                <p className="font-semibold">#{tk.number} · {tk.subject}</p>
                <p className="text-sm text-muted">{t(`support.categories.${tk.category}`)} · {f.relative(tk.updatedAt)}{tk.ride ? ` · ${tk.ride.code}` : ''}</p>
              </div>
              <Badge tone={tk.status === 'RESOLVED' || tk.status === 'CLOSED' ? 'success' : tk.status === 'WAITING_ON_USER' ? 'warning' : 'info'}>{t(`support.statuses.${tk.status}`)}</Badge>
            </button>
            {openId === tk.id && <TicketThread id={tk.id} />}
          </Card>
        ))}
      </div>
      <NewTicketDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function TicketThread({ id }: { id: string }) {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const q = useQuery({ queryKey: ['ticket', id], queryFn: () => api.get<Ticket & { messages: { id: string; body: string; createdAt: string; author: { firstName: string; role: string } }[] }>(`/support/tickets/${id}`) });
  const reply = useMutation({
    mutationFn: () => api.post(`/support/tickets/${id}/messages`, { body }),
    onSuccess: () => { setBody(''); void qc.invalidateQueries({ queryKey: ['ticket', id] }); void qc.invalidateQueries({ queryKey: ['tickets'] }); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });
  if (!q.data) return <Skeleton className="mt-3 h-20" />;
  return (
    <div className="mt-4 space-y-3 border-t border-line pt-4">
      <p className="whitespace-pre-wrap text-sm">{q.data.description}</p>
      {q.data.messages.map((m) => (
        <div key={m.id} className={`rounded-2xl p-3 text-sm ${m.author.role === 'ADMIN' ? 'bg-accent/8' : 'bg-surface-2'}`}>
          <p className="mb-1 text-xs font-semibold text-muted">{m.author.role === 'ADMIN' ? `Masar · ${m.author.firstName}` : m.author.firstName} · {f.relative(m.createdAt)}</p>
          <p className="whitespace-pre-wrap">{m.body}</p>
        </div>
      ))}
      {q.data.status !== 'CLOSED' && (
        <div className="flex gap-2">
          <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('support.reply')} />
          <Button disabled={!body.trim()} loading={reply.isPending} onClick={() => reply.mutate()}>{t('actions.send')}</Button>
        </div>
      )}
    </div>
  );
}
