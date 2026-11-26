import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Hourglass, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { EmptyState, PageHeader, QueryView, StatusBadge } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/misc';
import { useTenant } from '@/contexts/TenantContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { api, errorMessage } from '@/services/api';
import { fmtDate } from '@/utils/format';

interface Entry { _id: string; date: string; name: string; email: string; phone?: string; note?: string; status: string; service?: { name: string }; staff?: { name: string } }

export function WaitlistPage() {
  const { t } = useTranslation('dashboard');
  const { id, can } = useTenant();
  useDocumentTitle(t('waitlist.title'));
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['waitlist', id], queryFn: () => api.get<{ items: Entry[] }>(`/businesses/${id}/waitlist`) });
  const set = async (e: Entry, status: string) => {
    try {
      await api.patch(`/businesses/${id}/waitlist/${e._id}`, { status });
      void qc.invalidateQueries({ queryKey: ['waitlist', id] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <>
      <PageHeader title={t('waitlist.title')} description={t('waitlist.subtitle')} />
      <QueryView query={q}>
        {(d) => d.items.length ? (
          <Card className="divide-y">
            {d.items.map((e) => (
              <div key={e._id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{e.name} <span className="font-normal text-muted-foreground">· {e.email}</span></p>
                  <p className="text-sm text-muted-foreground">{e.service?.name}{e.staff ? ` · ${e.staff.name}` : ''} · {fmtDate(e.date)}</p>
                </div>
                <StatusBadge status={e.status} />
                {can('bookings:manage') && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => set(e, 'booked')}><Check />{t('waitlist.markBooked')}</Button>
                    <Button size="sm" variant="ghost" onClick={() => set(e, 'removed')}><X />{t('waitlist.remove')}</Button>
                  </div>
                )}
              </div>
            ))}
          </Card>
        ) : <EmptyState icon={<Hourglass />} title={t('waitlist.empty')} />}
      </QueryView>
    </>
  );
}
