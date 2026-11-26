import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { CalendarClock, ChevronRight, Clock3 } from 'lucide-react';
import type { Paginated, RideDTO } from '@masar/shared';
import {
  api,
  Button,
  EmptyState,
  ErrorState,
  RideStatusBadge,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  useFormat,
} from '@masar/ui';
import { CarIllustration } from '../booking/CarIllustration';

export function RidesPage() {
  const { t } = useTranslation();
  const [scope, setScope] = useState<'past' | 'scheduled'>('past');
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('rides.title')}</h1>
        <Tabs value={scope} onValueChange={(v) => setScope(v as 'past' | 'scheduled')}>
          <TabsList>
            <TabsTrigger value="past">{t('rides.past')}</TabsTrigger>
            <TabsTrigger value="scheduled">{t('rides.upcoming')}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <RideList scope={scope} key={scope} />
    </div>
  );
}

function RideList({ scope }: { scope: 'past' | 'scheduled' }) {
  const { t, i18n } = useTranslation();
  const f = useFormat();
  const ar = i18n.language === 'ar';
  const q = useInfiniteQuery({
    queryKey: ['rides', scope],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<Paginated<RideDTO>>(`/rides?scope=${scope}&page=${pageParam}&pageSize=10`),
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
  });
  if (q.isLoading)
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  if (q.isError) return <ErrorState onRetry={() => void q.refetch()} />;
  const rides = q.data?.pages.flatMap((p) => p.items) ?? [];
  if (!rides.length)
    return (
      <EmptyState
        icon={scope === 'scheduled' ? CalendarClock : Clock3}
        title={scope === 'scheduled' ? t('rides.noUpcoming') : t('rides.none')}
        description={t('rides.noneHelp')}
        action={
          <Button asChild>
            <Link to="/">{t('book.whereTo')}</Link>
          </Button>
        }
      />
    );
  return (
    <div className="space-y-3">
      {rides.map((r) => (
        <Link
          key={r.id}
          to={`/rides/${r.id}`}
          className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 shadow-soft transition hover:border-fg/30"
        >
          <CarIllustration code={r.category.code} className="hidden h-12 w-16 shrink-0 sm:block" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-semibold">{r.dropoff.address}</p>
            </div>
            <p className="text-sm text-muted">
              {f.dateTime(r.scheduledAt ?? r.requestedAt)} · {ar ? r.category.nameAr : r.category.name}
            </p>
            <div className="mt-1.5">
              <RideStatusBadge status={r.status} scheduled={!!r.scheduledAt} />
            </div>
          </div>
          <div className="text-end">
            <p className="tabular font-bold">
              {f.money(r.finalFare ?? (r.cancellationFee || r.estimatedFare), r.currency)}
            </p>
            <ChevronRight className="ms-auto mt-1 size-4 text-muted rtl:rotate-180" />
          </div>
        </Link>
      ))}
      {q.hasNextPage && (
        <Button variant="outline" block loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
          {t('actions.loadMore')}
        </Button>
      )}
    </div>
  );
}
