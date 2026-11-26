import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { QueryView } from '@/components/common';
import { Button } from '@/components/ui/button';
import { ManageBooking } from '@/features/booking/ManageBooking';
import { api } from '@/services/api';
import type { Booking } from '@/types';

export function BookingDetailPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const [sp] = useSearchParams();
  const q = useQuery({ queryKey: ['me', 'booking', id], queryFn: () => api.get<Booking>(`/me/bookings/${id}`) });
  useEffect(() => {
    const p = sp.get('payment');
    if (p === 'success') toast.success(t('manage.paymentSuccess'));
    if (p === 'cancelled') toast.message(t('manage.paymentCancelled'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <Button variant="ghost" size="sm" className="mb-4" asChild><Link to="/account/bookings"><ArrowLeft className="rtl:rotate-180" />{t('account.bookings')}</Link></Button>
      <QueryView query={q}>{(b) => <ManageBooking booking={b} access={{ kind: 'user' }} onChanged={() => q.refetch()} />}</QueryView>
    </>
  );
}
