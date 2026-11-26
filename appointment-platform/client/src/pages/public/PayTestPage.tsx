import { useMutation, useQuery } from '@tanstack/react-query';
import { FlaskConical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ErrorState } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, Skeleton } from '@/components/ui/misc';
import { api, errorMessage } from '@/services/api';
import { money } from '@/utils/format';

export function PayTestPage() {
  const { paymentId = '' } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['pay-test', paymentId], queryFn: () => api.get<{ payment: { amount: number; currency: string; status: string; kind: string; purpose?: string; business: { name: string } }; booking: { reference: string; snapshot: { serviceName: string } } | null }>(`/payments/test/${paymentId}`) });
  const act = useMutation({
    mutationFn: (action: 'approve' | 'decline') => api.post<{ status: string; returnTo: string }>(`/payments/test/${paymentId}/${action}`),
    onSuccess: (r) => {
      if (r.status === 'succeeded') toast.success(t('pay.done', { status: t('status.succeeded') }));
      else toast.error(t('pay.done', { status: t('status.failed') }));
      navigate(`${r.returnTo}${r.returnTo.includes('?') ? '&' : '?'}payment=${r.status === 'succeeded' ? 'success' : 'cancelled'}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="container max-w-md py-16">
      {q.isLoading ? <Skeleton className="h-72" /> : q.error ? <ErrorState error={q.error} /> : (
        <Card className="p-6 text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600"><FlaskConical /></span>
          <h1 className="text-xl font-bold">{t('pay.title')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t('pay.notice')}</p>
          <div className="my-6 rounded-2xl bg-muted/60 p-5">
            <p className="text-sm text-muted-foreground">{q.data!.payment.business.name}</p>
            <p className="num text-3xl font-extrabold">{money(q.data!.payment.amount, q.data!.payment.currency)}</p>
            {q.data!.booking && <p className="mt-1 text-sm">{q.data!.booking.snapshot.serviceName} · <span className="num">{q.data!.booking.reference}</span></p>}
          </div>
          {q.data!.payment.status !== 'pending' ? (
            <p className="text-sm font-medium">{t('pay.already', { status: t(`status.${q.data!.payment.status}`) })}</p>
          ) : (
            <div className="flex flex-col gap-2">
              <Button size="lg" loading={act.isPending && act.variables === 'approve'} onClick={() => act.mutate('approve')}>{t('pay.approve')}</Button>
              <Button variant="ghost" loading={act.isPending && act.variables === 'decline'} onClick={() => act.mutate('decline')}>{t('pay.decline')}</Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
