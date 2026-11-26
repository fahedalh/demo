import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { LayoutGrid, LocateFixed, Map as MapIcon, Search, SlidersHorizontal, Wand2, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { EmptyState, ErrorState, Pagination } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Card, Skeleton } from '@/components/ui/misc';
import { BusinessCard } from '@/features/search/BusinessCard';
import { useDebounce } from '@/hooks/useDebounce';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useLocalized } from '@/hooks/useLocalized';
import { cn } from '@/lib/utils';
import { api } from '@/services/api';
import type { Business, Category } from '@/types';

const MapView = lazy(() => import('@/features/search/MapView'));

export function ExplorePage() {
  const { t } = useTranslation();
  const loc = useLocalized();
  useDocumentTitle(t('explore.title'), t('explore.subtitle'));
  const [sp, setSp] = useSearchParams();
  const [view, setView] = useState<'list' | 'map'>('list');
  const [showFilters, setShowFilters] = useState(false);
  const [q, setQ] = useState(sp.get('q') ?? '');
  const dq = useDebounce(q, 350);

  const get = (k: string) => sp.get(k) ?? '';
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    next.delete('ai');
    setSp(next, { replace: true });
  };
  useEffect(() => {
    if (dq !== get('q')) set('q', dq || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);

  const cats = useQuery({ queryKey: ['categories'], queryFn: () => api.get<{ items: Category[] }>('/categories') });
  const params = Object.fromEntries(sp.entries());
  delete params.ai;
  const results = useQuery({
    queryKey: ['search', params],
    queryFn: () => api.get<{ items: Business[]; total: number; page: number; pages: number }>('/search/businesses', { ...params, limit: 12 }),
    placeholderData: keepPreviousData,
  });

  function nearMe() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = new URLSearchParams(sp);
        next.set('lat', pos.coords.latitude.toFixed(4));
        next.set('lng', pos.coords.longitude.toFixed(4));
        next.set('sort', 'distance');
        next.delete('city');
        setSp(next, { replace: true });
      },
      () => toast.error('Location permission denied'),
    );
  }

  const activeFilters = ['category', 'city', 'maxPrice', 'minRating', 'availableOn', 'lat'].filter((k) => sp.get(k));
  const aiSummary = sp.get('ai') ? activeFilters.map((k) => `${k === 'availableOn' ? t('explore.availableOn') : k === 'maxPrice' ? t('explore.priceMax') : k === 'minRating' ? t('explore.rating') : k === 'category' ? t('explore.category') : t('explore.city')}: ${get(k)}`).join(' · ') : '';

  const filters = (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="f-cat">{t('explore.category')}</label>
        <NativeSelect id="f-cat" value={get('category')} onChange={(e) => set('category', e.target.value || null)}>
          <option value="">{t('common.all')}</option>
          {cats.data?.items.map((c) => <option key={c._id} value={c.slug}>{loc(c.name)}</option>)}
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="f-city">{t('explore.city')}</label>
        <Input id="f-city" defaultValue={get('city')} key={get('city')} onBlur={(e) => set('city', e.target.value.trim() || null)} onKeyDown={(e) => e.key === 'Enter' && set('city', (e.target as HTMLInputElement).value.trim() || null)} />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="f-price">{t('explore.priceMax')}</label>
        <Input id="f-price" type="number" min={0} defaultValue={get('maxPrice')} key={get('maxPrice')} onBlur={(e) => set('maxPrice', e.target.value || null)} />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="f-rating">{t('explore.rating')}</label>
        <NativeSelect id="f-rating" value={get('minRating')} onChange={(e) => set('minRating', e.target.value || null)}>
          <option value="">{t('explore.anyRating')}</option>
          {[4.5, 4, 3.5, 3].map((r) => <option key={r} value={r}>{r}+ ★</option>)}
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="f-date">{t('explore.availableOn')}</label>
        <Input id="f-date" type="date" value={get('availableOn')} min={new Date().toISOString().slice(0, 10)} onChange={(e) => set('availableOn', e.target.value || null)} />
      </div>
      <Button variant="outline" className="w-full" onClick={nearMe}><LocateFixed />{t('explore.nearMe')}</Button>
      {activeFilters.length > 0 && (
        <Button variant="ghost" className="w-full" onClick={() => setSp(new URLSearchParams(q ? { q } : {}), { replace: true })}><X />{t('actions.clear')}</Button>
      )}
    </div>
  );

  return (
    <div className="container py-8 sm:py-10">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('explore.title')}</h1>
          <p className="mt-1 text-muted-foreground">{t('explore.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <NativeSelect aria-label={t('explore.sort')} value={get('sort') || 'relevance'} onChange={(e) => set('sort', e.target.value)} className="w-44">
            {(['relevance', 'rating', 'price', 'newest', ...(sp.get('lat') ? ['distance'] : [])] as const).map((s) => <option key={s} value={s}>{t(`explore.sortOptions.${s}`)}</option>)}
          </NativeSelect>
          <div className="flex rounded-xl border p-1" role="group">
            <Button size="icon-sm" variant={view === 'list' ? 'secondary' : 'ghost'} onClick={() => setView('list')} aria-label={t('explore.list')} aria-pressed={view === 'list'}><LayoutGrid /></Button>
            <Button size="icon-sm" variant={view === 'map' ? 'secondary' : 'ghost'} onClick={() => setView('map')} aria-label={t('explore.map')} aria-pressed={view === 'map'}><MapIcon /></Button>
          </div>
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="absolute start-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('common.search')} className="h-12 ps-11 text-base" aria-label={t('actions.search')} />
      </div>
      {aiSummary && <p className="mb-4 flex items-center gap-2 rounded-xl bg-primary/5 px-4 py-2.5 text-sm text-primary"><Wand2 className="h-4 w-4 shrink-0" />{t('explore.aiApplied', { summary: aiSummary })}</p>}
      {sp.get('lat') && <p className="mb-4 text-sm text-muted-foreground">{t('explore.nearMeOn')}</p>}

      <div className="grid gap-6 lg:grid-cols-[260px,1fr]">
        <aside className="hidden lg:block">
          <Card className="sticky top-24 p-5">{filters}</Card>
        </aside>
        <div className="lg:hidden">
          <Button variant="outline" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
            <SlidersHorizontal />{t('actions.filters')}{activeFilters.length ? ` (${activeFilters.length})` : ''}
          </Button>
          {showFilters && <Card className="mt-3 p-5">{filters}</Card>}
        </div>

        <section aria-live="polite" className={cn(results.isFetching && 'opacity-70 transition-opacity')}>
          {results.error ? (
            <ErrorState error={results.error} onRetry={() => results.refetch()} />
          ) : results.isLoading ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-72" />)}</div>
          ) : !results.data?.items.length ? (
            <EmptyState icon={<Search />} title={t('explore.noResults')} description={t('explore.noResultsHint')} />
          ) : (
            <>
              <p className="mb-3 text-sm text-muted-foreground">{t('common.results', { count: results.data.total })}</p>
              {view === 'map' ? (
                <Suspense fallback={<Skeleton className="h-[520px]" />}>
                  <MapView items={results.data.items} center={sp.get('lat') ? [Number(sp.get('lat')), Number(sp.get('lng'))] : undefined} />
                </Suspense>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{results.data.items.map((b) => <BusinessCard key={b._id} b={b} />)}</div>
              )}
              <Pagination page={results.data.page} pages={results.data.pages} onChange={(p) => set('page', String(p))} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
