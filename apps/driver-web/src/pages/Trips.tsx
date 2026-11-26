import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ClipboardList } from 'lucide-react';
import type { Paginated, RideDTO } from '@masar/shared';
import { api, Button, Card, EmptyState, RatingStars, RideStatusBadge, Skeleton, useFormat } from '@masar/ui';

export function TripsPage() {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const q = useInfiniteQuery({
    queryKey: ['driver', 'trips'],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<Paginated<RideDTO>>(`/rides?scope=past&page=${pageParam}&pageSize=15`),
    getNextPageParam: (l) => (l.page < l.totalPages ? l.page + 1 : undefined),
  });
  const rides = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="mx-auto max-w-3xl space-y-3 px-4 py-6">
      <h1 className="mb-2 text-2xl font-bold">{t('trips.title')}</h1>
      {q.isLoading && <Skeleton className="h-60" />}
      {!q.isLoading && rides.length === 0 && <EmptyState icon={ClipboardList} title={t('trips.none')} />}
      {rides.map((r) => (
        <Card key={r.id} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-muted">
                {f.dateTime(r.completedAt ?? r.requestedAt)} · <span className="font-mono">{r.code}</span> ·{' '}
                {i18n.language === 'ar' ? r.category.nameAr : r.category.name}
              </p>
              <p className="mt-1 truncate font-semibold">{r.pickup.address}</p>
              <p className="truncate text-sm text-muted">→ {r.dropoff.address}</p>
              <div className="mt-2 flex items-center gap-2">
                <RideStatusBadge status={r.status} />
                {r.myRating && <RatingStars value={r.myRating.score} size={12} />}
              </div>
            </div>
            <div className="text-end">
              <p className="tabular font-bold">{f.money((r.driverEarning?.net ?? 0) + r.tip, r.currency)}</p>
              <p className="text-xs text-muted">{t(`ride.payment.${r.paymentType}`)}</p>
              {r.tip > 0 && <p className="text-xs text-accent-600">+{f.money(r.tip, r.currency)}</p>}
            </div>
          </div>
        </Card>
      ))}
      {q.hasNextPage && (
        <Button variant="outline" block loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
          {t('actions.loadMore')}
        </Button>
      )}
    </div>
  );
}
