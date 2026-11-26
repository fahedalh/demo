import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bell, CarFront, LifeBuoy, LogOut, Plus, Star } from 'lucide-react';
import type { NotificationDTO, Paginated } from '@masar/shared';
import { api, ApiError, Avatar, Badge, Button, Card, Dialog, DialogContent, EmptyState, fileUrl, Input, LanguageToggle, logout, RatingStars, Select, Textarea, ThemeToggle, toast, useAuth, useFormat } from '@masar/ui';
import { useDriverProfile } from '../App';
import { DocumentsStep, VehicleForm } from './Onboarding';

export function AccountPage() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user)!;
  const { data } = useDriverProfile();
  const [addVehicle, setAddVehicle] = useState(false);
  const [ticket, setTicket] = useState(false);
  const reviews = useQuery({ queryKey: ['driver', 'reviews'], queryFn: () => api.get<{ items: { id: string; score: number; comment: string | null; tags: string[]; createdAt: string }[]; distribution: { score: number; count: number }[] }>('/driver/reviews') });
  const notifications = useQuery({ queryKey: ['notifications'], queryFn: () => api.get<Paginated<NotificationDTO> & { unread: number }>('/me/notifications?pageSize=10') });
  const activate = useMutation({
    mutationFn: (id: string) => api.post(`/driver/vehicles/${id}/activate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['driver', 'profile'] }),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });
  const total = reviews.data?.distribution.reduce((a, b) => a + b.count, 0) || 1;

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      <Card className="flex flex-wrap items-center gap-5 p-6">
        <Avatar name={`${user.firstName} ${user.lastName}`} src={fileUrl(user.avatarUrl)} size={72} />
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{user.firstName} {user.lastName}</h1>
          <p className="text-sm text-muted" dir="ltr">{user.phone} · {user.email}</p>
          <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold"><Star className="size-4 fill-amber-400 text-amber-400" />{data?.profile.rating.toFixed(2)} · {data?.profile.completedRides} {t('stats.trips')}</p>
        </div>
        <div className="flex items-center gap-1"><LanguageToggle /><ThemeToggle /><Button variant="ghost" size="icon" onClick={() => void logout()} aria-label={t('actions.signOut')}><LogOut /></Button></div>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">{t('account.vehicles')}</h2>
          <Button size="sm" variant="outline" onClick={() => setAddVehicle(true)}><Plus /> {t('account.addVehicle')}</Button>
        </div>
        <div className="space-y-2">
          {data?.vehicles.map((v) => (
            <div key={v.id} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-4">
              <CarFront className="size-5" />
              <div className="flex-1">
                <p className="font-semibold">{v.year} {v.make} {v.model} · {v.color}</p>
                <p className="text-sm text-muted"><span className="font-mono" dir="ltr">{v.plateNumber}</span> · {i18n.language === 'ar' ? v.category.nameAr : v.category.name}</p>
              </div>
              <Badge tone={v.status === 'APPROVED' ? 'success' : v.status === 'REJECTED' ? 'danger' : 'info'}>{t(`onboarding.docStatus.${v.status}`)}</Badge>
              {data.profile.activeVehicleId === v.id ? <Badge tone="dark">{t('account.active')}</Badge> : v.status === 'APPROVED' && <Button size="sm" variant="ghost" onClick={() => activate.mutate(v.id)}>{t('account.activate')}</Button>}
            </div>
          ))}
        </div>
      </Card>

      {data && <DocumentsStep locked={false} documents={data.documents} showTitle={false} />}

      <Card className="p-5">
        <h2 className="mb-4 font-semibold">{t('account.reviews')}</h2>
        <div className="grid gap-6 md:grid-cols-[200px_1fr]">
          <div className="space-y-1.5">
            {[5, 4, 3, 2, 1].map((s) => {
              const c = reviews.data?.distribution.find((d) => d.score === s)?.count ?? 0;
              return (
                <div key={s} className="flex items-center gap-2 text-xs">
                  <span className="w-3">{s}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-amber-400" style={{ width: `${(c / total) * 100}%` }} /></div>
                  <span className="tabular w-6 text-end text-muted">{c}</span>
                </div>
              );
            })}
          </div>
          <div className="max-h-80 space-y-3 overflow-y-auto">
            {reviews.data?.items.filter((r) => r.comment || r.tags.length).slice(0, 20).map((r) => (
              <div key={r.id} className="rounded-2xl bg-surface-2 p-3">
                <div className="flex items-center justify-between"><RatingStars value={r.score} size={12} /><span className="text-xs text-muted">{f.relative(r.createdAt)}</span></div>
                {r.comment && <p className="mt-1 text-sm">{r.comment}</p>}
                {r.tags.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{r.tags.map((tg) => <Badge key={tg}>{tg}</Badge>)}</div>}
              </div>
            ))}
            {reviews.data?.items.length === 0 && <EmptyState title={t('account.noReviews')} />}
          </div>
        </div>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><Bell className="size-4" /> {t('nav.notifications')}</h2>
          <div className="divide-y divide-line text-sm">
            {notifications.data?.items.map((n) => (
              <div key={n.id} className="py-2.5"><p className="font-medium">{n.title}</p>{n.body && <p className="text-muted">{n.body}</p>}<p className="text-xs text-muted">{f.relative(n.createdAt)}</p></div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="mb-2 flex items-center gap-2 font-semibold"><LifeBuoy className="size-4" /> {t('account.support')}</h2>
          <Button variant="outline" onClick={() => setTicket(true)}>{t('account.newTicket')}</Button>
        </Card>
      </div>

      <Dialog open={addVehicle} onOpenChange={setAddVehicle}>
        <DialogContent title={t('account.addVehicle')}><VehicleForm onSaved={() => setAddVehicle(false)} /></DialogContent>
      </Dialog>
      <TicketDialog open={ticket} onOpenChange={setTicket} />
    </div>
  );
}

function TicketDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('OTHER');
  const [description, setDescription] = useState('');
  const send = useMutation({
    mutationFn: () => api.post('/support/tickets', { subject, category, description }),
    onSuccess: () => { toast.success(t('actions.submit')); onOpenChange(false); setSubject(''); setDescription(''); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('errors.generic')),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('account.newTicket')}>
        <div className="space-y-3">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {['RIDE_ISSUE', 'PAYMENT', 'ACCOUNT', 'SAFETY', 'DRIVER_ONBOARDING', 'OTHER'].map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ').toLowerCase()}</option>)}
          </Select>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Describe the issue (10+ characters)" />
          <Button block disabled={subject.length < 3 || description.length < 10} loading={send.isPending} onClick={() => send.mutate()}>{t('actions.submit')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
