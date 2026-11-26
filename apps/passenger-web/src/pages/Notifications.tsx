import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { BellOff } from 'lucide-react';
import type { NotificationDTO, Paginated } from '@masar/shared';
import { api, Button, cn, EmptyState, Skeleton, useFormat } from '@masar/ui';

export function NotificationsPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['notifications', 'list'], queryFn: () => api.get<Paginated<NotificationDTO> & { unread: number }>('/me/notifications?pageSize=50') });
  const readAll = useMutation({ mutationFn: () => api.post('/me/notifications/read-all'), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const open = async (n: NotificationDTO) => {
    if (!n.readAt) await api.post(`/me/notifications/${n.id}/read`).catch(() => undefined);
    void qc.invalidateQueries({ queryKey: ['notifications'] });
    const rideId = (n.data as any)?.rideId;
    if (rideId) navigate(`/rides/${rideId}`);
  };
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('notifications.title')}</h1>
        {!!q.data?.unread && <Button variant="ghost" size="sm" onClick={() => readAll.mutate()}>{t('notifications.markAll')}</Button>}
      </div>
      {q.isLoading && <Skeleton className="h-60" />}
      {q.data?.items.length === 0 && <EmptyState icon={BellOff} title={t('notifications.none')} />}
      <div className="space-y-2">
        {q.data?.items.map((n) => (
          <button key={n.id} onClick={() => void open(n)} className={cn('flex w-full gap-3 rounded-2xl border p-4 text-start transition', n.readAt ? 'border-line bg-surface' : 'border-accent/30 bg-accent/5')}>
            <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-accent')} />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{n.title}</span>
              {n.body && <span className="block text-sm text-muted">{n.body}</span>}
              <span className="mt-1 block text-xs text-muted">{f.relative(n.createdAt)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
