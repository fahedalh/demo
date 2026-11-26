import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, MessageSquare, Star } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Paginated } from '@bookly/shared';
import { EmptyState, PageHeader, Pagination, QueryView, Stars, StatusBadge } from '@/components/common';
import { Button } from '@/components/ui/button';
import { NativeSelect, Textarea } from '@/components/ui/input';
import { Card } from '@/components/ui/misc';
import { useTenant } from '@/contexts/TenantContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { api, errorMessage } from '@/services/api';
import type { Review } from '@/types';
import { fmtDate } from '@/utils/format';

export function ReviewsPage() {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  const { id, business } = useTenant();
  useDocumentTitle(t('reviews.title'));
  const qc = useQueryClient();
  const [rating, setRating] = useState('');
  const [page, setPage] = useState(1);
  const [replying, setReplying] = useState<string | null>(null);
  const [text, setText] = useState('');
  const list = useQuery({ queryKey: ['reviews', id, rating, page], queryFn: () => api.get<Paginated<Review> & { distribution: Record<string, number> }>(`/businesses/${id}/reviews`, { rating: rating || undefined, page }), placeholderData: keepPreviousData });
  const update = async (r: Review, body: { reply?: string; status?: string }) => {
    try {
      await api.patch(`/businesses/${id}/reviews/${r._id}`, body);
      toast.success(t('reviews.saved'));
      setReplying(null);
      void qc.invalidateQueries({ queryKey: ['reviews', id] });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <>
      <PageHeader title={t('reviews.title')} description={t('reviews.subtitle')} />
      <QueryView query={list}>
        {(d) => (
          <div className="grid gap-6 lg:grid-cols-[280px,1fr]">
            <Card className="h-fit p-5">
              <p className="text-sm text-muted-foreground">{t('reviews.average')}</p>
              <p className="num mt-1 flex items-center gap-2 text-3xl font-bold"><Star className="h-7 w-7 fill-amber-400 text-amber-400" />{business.rating.average || '—'}</p>
              <p className="text-sm text-muted-foreground">{tc('common.reviews', { count: business.rating.count })}</p>
              <div className="mt-5 space-y-2">
                {[5, 4, 3, 2, 1].map((r) => {
                  const total = Object.values(d.distribution).reduce((a, b) => a + b, 0) || 1;
                  return (
                    <button key={r} onClick={() => { setRating(rating === String(r) ? '' : String(r)); setPage(1); }} className={`flex w-full items-center gap-2 rounded-lg p-1 text-sm ${rating === String(r) ? 'bg-muted' : ''}`}>
                      <span className="num w-3">{r}</span><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      <span className="h-2 flex-1 rounded-full bg-muted"><span className="block h-2 rounded-full bg-amber-400" style={{ width: `${(d.distribution[r] / total) * 100}%` }} /></span>
                      <span className="num w-8 text-end text-muted-foreground">{d.distribution[r]}</span>
                    </button>
                  );
                })}
              </div>
              <NativeSelect className="mt-4 lg:hidden" value={rating} onChange={(e) => setRating(e.target.value)} aria-label="Rating"><option value="">{tc('common.all')}</option>{[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r}★</option>)}</NativeSelect>
            </Card>
            <div>
              {d.items.length ? (
                <div className="space-y-3">
                  {d.items.map((r) => (
                    <Card key={r._id} className={`p-5 ${r.status === 'hidden' ? 'opacity-60' : ''}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3"><span className="font-semibold">{r.authorName}</span><Stars value={r.rating} /></div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">{r.service?.name}{typeof r.staff === 'object' && r.staff?.name ? ` · ${r.staff.name}` : ''} · {fmtDate(r.createdAt)}{r.status === 'hidden' && <StatusBadge status="hidden" />}</div>
                      </div>
                      {r.comment && <p className="mt-2 text-sm">{r.comment}</p>}
                      {r.reply?.text && replying !== r._id && <div className="mt-3 rounded-xl bg-muted/60 p-3 text-sm"><p className="mb-1 text-xs font-semibold">{tc('business.reply')}</p>{r.reply.text}</div>}
                      {replying === r._id ? (
                        <div className="mt-3 space-y-2">
                          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t('reviews.replyPh')} maxLength={1000} aria-label={t('reviews.replyPh')} />
                          <div className="flex gap-2"><Button size="sm" onClick={() => update(r, { reply: text })}>{tc('actions.save')}</Button><Button size="sm" variant="ghost" onClick={() => setReplying(null)}>{tc('actions.cancel')}</Button></div>
                        </div>
                      ) : (
                        <div className="mt-3 flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => { setReplying(r._id); setText(r.reply?.text ?? ''); }}><MessageSquare />{t('reviews.reply')}</Button>
                          <Button size="sm" variant="ghost" onClick={() => update(r, { status: r.status === 'hidden' ? 'published' : 'hidden' })}>{r.status === 'hidden' ? <><Eye />{t('reviews.show')}</> : <><EyeOff />{t('reviews.hide')}</>}</Button>
                        </div>
                      )}
                    </Card>
                  ))}
                  <Pagination page={d.page} pages={d.pages} onChange={setPage} />
                </div>
              ) : <EmptyState icon={<Star />} title={t('reviews.empty')} />}
            </div>
          </div>
        )}
      </QueryView>
    </>
  );
}
