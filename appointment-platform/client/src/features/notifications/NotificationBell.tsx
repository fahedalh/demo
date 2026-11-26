import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown';
import { api } from '@/services/api';
import { getSocket } from '@/services/socket';
import type { Notification, Paginated } from '@/types/extra';
import { fromNow } from '@/utils/format';

export function NotificationBell() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['notifications', 'bell'], queryFn: () => api.get<Paginated<Notification> & { unread: number }>('/notifications', { limit: 8 }), refetchInterval: 120_000 });

  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    const onNotify = (n: Notification) => {
      toast(n.title, { description: n.body });
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    };
    const onBooking = () => void qc.invalidateQueries({ queryKey: ['bookings'] });
    s.on('notification', onNotify);
    s.on('booking:changed', onBooking);
    return () => {
      s.off('notification', onNotify);
      s.off('booking:changed', onBooking);
    };
  }, [qc]);

  const unread = q.data?.unread ?? 0;
  const open = async (n: Notification) => {
    if (!n.readAt) await api.post(`/notifications/${n._id}/read`).catch(() => undefined);
    void qc.invalidateQueries({ queryKey: ['notifications'] });
    if (n.link) navigate(n.link);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`${t('nav.notifications')}${unread ? ` (${unread})` : ''}`} className="relative">
          <Bell className="!size-5" />
          {unread > 0 && <span className="num absolute end-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80">
        <div className="flex items-center justify-between px-2.5 py-1.5">
          <DropdownMenuLabel>{t('nav.notifications')}</DropdownMenuLabel>
          {unread > 0 && (
            <button className="text-xs font-medium text-primary hover:underline" onClick={async () => { await api.post('/notifications/read-all'); void qc.invalidateQueries({ queryKey: ['notifications'] }); }}>
              {t('actions.markAllRead')}
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {q.data?.items.length ? (
          q.data.items.map((n) => (
            <DropdownMenuItem key={n._id} onSelect={() => void open(n)} className="items-start">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? 'bg-transparent' : 'bg-primary'}`} aria-hidden />
              <span className="min-w-0">
                <span className="line-clamp-2 block font-medium">{n.title}</span>
                <span className="block text-xs text-muted-foreground">{fromNow(n.createdAt)}</span>
              </span>
            </DropdownMenuItem>
          ))
        ) : (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('account.noNotifications')}</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
