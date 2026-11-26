/** Debounced address autocomplete backed by the API's geo provider (keys stay server-side). */
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MapPin, Search, X, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/cn';

export interface PlaceResult {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function usePlaceSearch(query: string, near?: { lat: number; lng: number } | null) {
  const { i18n } = useTranslation();
  const q = useDebounced(query.trim());
  return useQuery({
    queryKey: ['geo', 'autocomplete', q, i18n.language, near?.lat.toFixed(2), near?.lng.toFixed(2)],
    enabled: q.length >= 2,
    staleTime: 60_000,
    queryFn: () =>
      api.get<{ items: PlaceResult[] }>(
        `/geo/autocomplete?q=${encodeURIComponent(q)}&locale=${i18n.language === 'ar' ? 'ar' : 'en'}${near ? `&lat=${near.lat}&lng=${near.lng}` : ''}`,
      ),
  });
}

export function PlaceSearchInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  icon = 'search',
  className,
  onFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  icon?: 'search' | 'pickup' | 'dropoff';
  className?: string;
  onFocus?: () => void;
}) {
  return (
    <div className={cn('relative flex items-center', className)}>
      <span className="pointer-events-none absolute start-4 grid place-items-center">
        {icon === 'pickup' ? (
          <span className="size-2.5 rounded-full bg-fg ring-4 ring-fg/15" />
        ) : icon === 'dropoff' ? (
          <span className="size-2.5 bg-fg ring-4 ring-fg/15" />
        ) : (
          <Search className="size-4 text-muted" />
        )}
      </span>
      <input
        value={value}
        autoFocus={autoFocus}
        onFocus={onFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-12 w-full rounded-xl bg-surface-2 ps-11 pe-10 text-[15px] font-medium text-fg outline-none placeholder:font-normal placeholder:text-muted focus:ring-2 focus:ring-fg/80"
      />
      {value && (
        <button type="button" onClick={() => onChange('')} className="absolute end-3 rounded-full p-1 text-muted hover:text-fg" aria-label="Clear">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

export function PlaceResults({
  query,
  near,
  onSelect,
  extra,
}: {
  query: string;
  near?: { lat: number; lng: number } | null;
  onSelect: (p: PlaceResult) => void;
  extra?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { data, isFetching, isError } = usePlaceSearch(query, near);
  const items = data?.items ?? [];
  if (query.trim().length < 2) return <>{extra}</>;
  return (
    <div className="divide-y divide-line">
      {isFetching && items.length === 0 && (
        <div className="flex items-center gap-2 px-2 py-4 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" /> {t('state.loading')}
        </div>
      )}
      {isError && <div className="px-2 py-4 text-sm text-danger">{t('errors.generic')}</div>}
      {!isFetching && !isError && items.length === 0 && <div className="px-2 py-4 text-sm text-muted">{t('state.empty')}</div>}
      {items.map((p) => (
        <button key={p.id} type="button" onClick={() => onSelect(p)} className="flex w-full items-center gap-3 px-2 py-3 text-start transition hover:bg-surface-2 rounded-xl">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2">
            <MapPin className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{p.name}</span>
            <span className="block truncate text-sm text-muted">{p.address}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
