import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ErrorState, Field } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, Skeleton } from '@/components/ui/misc';
import { ManageBooking } from '@/features/booking/ManageBooking';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { api } from '@/services/api';
import type { Booking } from '@/types';

export function TrackPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('track.title'));
  const [sp, setSp] = useSearchParams();
  const [reference, setReference] = useState(sp.get('ref') ?? '');
  const [email, setEmail] = useState(sp.get('email') ?? '');
  const [query, setQuery] = useState<{ reference: string; email: string } | null>(sp.get('ref') && sp.get('email') ? { reference: sp.get('ref')!.toUpperCase(), email: sp.get('email')! } : null);

  useEffect(() => {
    const p = sp.get('payment');
    if (p === 'success') toast.success(t('manage.paymentSuccess'));
    if (p === 'cancelled') toast.message(t('manage.paymentCancelled'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = useQuery({ queryKey: ['track', query], queryFn: () => api.get<Booking>('/public/bookings/track', query!), enabled: !!query, retry: false });

  return (
    <div className="container max-w-5xl py-10 sm:py-14">
      <div className="mx-auto max-w-xl text-center">
        <h1 className="text-3xl font-bold">{t('track.title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('track.subtitle')}</p>
      </div>
      <Card className="mx-auto mt-8 max-w-xl p-5">
        <form
          className="grid gap-3 sm:grid-cols-[1fr,1fr,auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const ref = reference.trim().toUpperCase();
            if (!/^BK-[A-Z0-9]{6}$/.test(ref) || !email.includes('@')) return;
            setQuery({ reference: ref, email: email.trim().toLowerCase() });
            setSp({ ref, email: email.trim().toLowerCase() }, { replace: true });
          }}
        >
          <Field label={t('track.reference')} htmlFor="tr-ref"><Input id="tr-ref" placeholder="BK-XXXXXX" value={reference} onChange={(e) => setReference(e.target.value)} dir="ltr" required pattern="[Bb][Kk]-[A-Za-z0-9]{6}" /></Field>
          <Field label={t('track.email')} htmlFor="tr-email"><Input id="tr-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <Button type="submit" loading={q.isFetching}><Search />{t('track.find')}</Button>
        </form>
      </Card>
      <div className="mt-8">
        {q.isLoading && query && <Skeleton className="h-80" />}
        {q.error && <ErrorState error={q.error} />}
        {q.data && query && <ManageBooking booking={q.data} access={{ kind: 'guest', email: query.email }} onChanged={() => q.refetch()} />}
      </div>
    </div>
  );
}
