import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Briefcase, Clock, Home, MapPin, Navigation, Star, Tag } from 'lucide-react';
import { api, Button, PlaceResults, PlaceSearchInput, useAuth, type PlaceResult } from '@masar/ui';
import { useBooking, type Place } from './store';
import { RideOptions } from './RideOptions';

interface SavedPlace {
  id: string;
  label: string;
  type: 'HOME' | 'WORK' | 'FAVORITE';
  address: string;
  lat: number;
  lng: number;
}

const placeIcon = { HOME: Home, WORK: Briefcase, FAVORITE: Star };

export function BookingPanel({ userPos, geoDenied, mapCenter }: { userPos: { lat: number; lng: number } | null; geoDenied: boolean; mapCenter: { lat: number; lng: number } | null }) {
  const b = useBooking();
  if (b.stage === 'options') return <RideOptions />;
  if (b.stage === 'pin') return <PinPicker mapCenter={mapCenter} />;
  if (b.stage === 'search') return <SearchStage userPos={userPos} />;
  return <HomeStage geoDenied={geoDenied} />;
}

function useSavedPlaces() {
  return useQuery({ queryKey: ['places'], queryFn: () => api.get<{ items: SavedPlace[] }>('/me/places').then((r) => r.items) });
}

function HomeStage({ geoDenied }: { geoDenied: boolean }) {
  const { t } = useTranslation();
  const user = useAuth((s) => s.user)!;
  const b = useBooking();
  const { data: places } = useSavedPlaces();
  const { data: promos } = useQuery({
    queryKey: ['promotions'],
    queryFn: () => api.get<{ items: { id: string; title: string; titleAr: string; description: string | null; descriptionAr: string | null; coupons: { code: string }[] }[] }>('/catalog/promotions').then((r) => r.items),
    staleTime: 300_000,
  });
  const { i18n } = useTranslation();
  const ar = i18n.language === 'ar';

  const goTo = (p: Place) => {
    b.set({ dropoff: p, stage: b.pickup ? 'options' : 'search', focus: 'pickup' });
  };

  return (
    <div className="p-5">
      <p className="text-sm text-muted">{t('book.greeting', { name: user.firstName })}</p>
      <h1 className="mt-1 text-2xl font-bold">{t('book.whereTo')}</h1>
      <button
        onClick={() => b.set({ stage: 'search', focus: 'dropoff' })}
        className="mt-4 flex h-14 w-full items-center gap-3 rounded-2xl bg-surface-2 px-4 text-start text-[17px] font-semibold text-muted transition hover:bg-line"
      >
        <span className="size-2.5 bg-fg" /> {t('book.dropoffPlaceholder')}
      </button>
      {geoDenied && <p className="mt-3 text-xs text-muted">{t('book.locationDenied')}</p>}

      {!!places?.length && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t('book.saved')}</p>
          <div className="divide-y divide-line">
            {places.map((p) => {
              const Icon = placeIcon[p.type];
              return (
                <button key={p.id} onClick={() => goTo({ address: p.address, lat: p.lat, lng: p.lng })} className="flex w-full items-center gap-3 py-3 text-start">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2"><Icon className="size-4" /></span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{p.label}</span>
                    <span className="block truncate text-sm text-muted">{p.address}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {promos?.map((p) => (
        <div key={p.id} className="mt-5 flex items-center gap-4 overflow-hidden rounded-2xl bg-ink p-4 text-white">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent"><Tag className="size-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-white">{ar ? p.titleAr : p.title}</p>
            <p className="text-sm text-white/70">{ar ? p.descriptionAr : p.description}</p>
          </div>
          {p.coupons[0] && (
            <button onClick={() => b.set({ couponCode: p.coupons[0].code })} className="rounded-full bg-white/10 px-3 py-1.5 font-mono text-xs font-semibold text-white hover:bg-white/20">
              {p.coupons[0].code}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function SearchStage({ userPos }: { userPos: { lat: number; lng: number } | null }) {
  const { t } = useTranslation();
  const b = useBooking();
  const [pickupQ, setPickupQ] = useState(b.pickup?.address ?? '');
  const [dropQ, setDropQ] = useState(b.dropoff?.address ?? '');
  const { data: places } = useSavedPlaces();
  const query = b.focus === 'pickup' ? pickupQ : dropQ;

  const choose = (p: PlaceResult | Place, label?: string) => {
    const place = { address: label ?? ('name' in p ? `${p.name}` : p.address), lat: p.lat, lng: p.lng };
    if (b.focus === 'pickup') {
      setPickupQ(place.address);
      b.set({ pickup: place, focus: b.dropoff ? 'pickup' : 'dropoff', stage: b.dropoff ? 'options' : 'search' });
    } else {
      setDropQ(place.address);
      b.set({ dropoff: place, stage: b.pickup ? 'options' : 'search', focus: 'pickup' });
    }
  };

  return (
    <div className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" onClick={() => b.set({ stage: 'home' })} aria-label={t('actions.back')}>
          <ArrowLeft className="rtl:rotate-180" />
        </Button>
        <h2 className="text-lg font-bold">{t('book.whereTo')}</h2>
      </div>
      <div className="relative space-y-2">
        <span className="absolute start-[21px] top-6 bottom-6 w-px bg-line" aria-hidden />
        <PlaceSearchInput icon="pickup" value={pickupQ} onChange={setPickupQ} placeholder={t('book.pickupPlaceholder')} onFocus={() => b.set({ focus: 'pickup' })} autoFocus={b.focus === 'pickup'} />
        <PlaceSearchInput icon="dropoff" value={dropQ} onChange={setDropQ} placeholder={t('book.dropoffPlaceholder')} onFocus={() => b.set({ focus: 'dropoff' })} autoFocus={b.focus === 'dropoff'} />
      </div>
      <div className="mt-3">
        <PlaceResults
          query={query === (b.focus === 'pickup' ? b.pickup?.address : b.dropoff?.address) ? '' : query}
          near={userPos}
          onSelect={(p) => choose(p, p.name)}
          extra={
            <div className="divide-y divide-line">
              {b.focus === 'pickup' && userPos && (
                <button onClick={() => choose({ address: t('book.currentLocation'), ...userPos })} className="flex w-full items-center gap-3 py-3 text-start">
                  <span className="grid size-9 place-items-center rounded-full bg-info/10"><Navigation className="size-4 text-info" /></span>
                  <span className="font-medium">{t('book.currentLocation')}</span>
                </button>
              )}
              <button onClick={() => b.set({ stage: 'pin', pinTarget: b.focus })} className="flex w-full items-center gap-3 py-3 text-start">
                <span className="grid size-9 place-items-center rounded-full bg-surface-2"><MapPin className="size-4" /></span>
                <span className="font-medium">{t('book.setOnMap')}</span>
              </button>
              {places?.map((p) => {
                const Icon = placeIcon[p.type];
                return (
                  <button key={p.id} onClick={() => choose({ address: p.address, lat: p.lat, lng: p.lng }, p.label === p.address ? p.address : `${p.label} · ${p.address.split(',')[0]}`)} className="flex w-full items-center gap-3 py-3 text-start">
                    <span className="grid size-9 place-items-center rounded-full bg-surface-2"><Icon className="size-4" /></span>
                    <span className="min-w-0"><span className="block font-medium">{p.label}</span><span className="block truncate text-sm text-muted">{p.address}</span></span>
                  </button>
                );
              })}
              <div className="flex items-center gap-2 py-3 text-xs text-muted"><Clock className="size-3.5" /> {t('book.dragMap')}</div>
            </div>
          }
        />
      </div>
    </div>
  );
}

function PinPicker({ mapCenter }: { mapCenter: { lat: number; lng: number } | null }) {
  const { t, i18n } = useTranslation();
  const b = useBooking();
  const { data, isFetching } = useQuery({
    queryKey: ['reverse', mapCenter?.lat.toFixed(5), mapCenter?.lng.toFixed(5), i18n.language],
    enabled: !!mapCenter,
    queryFn: () => api.get<{ name: string; address: string }>(`/geo/reverse?lat=${mapCenter!.lat}&lng=${mapCenter!.lng}&locale=${i18n.language === 'ar' ? 'ar' : 'en'}`),
  });
  const confirm = () => {
    if (!mapCenter) return;
    const place = { address: data?.name ?? `${mapCenter.lat.toFixed(5)}, ${mapCenter.lng.toFixed(5)}`, ...mapCenter };
    if (b.pinTarget === 'pickup') b.set({ pickup: place, stage: b.dropoff ? 'options' : 'search', focus: 'dropoff' });
    else b.set({ dropoff: place, stage: b.pickup ? 'options' : 'search', focus: 'pickup' });
  };
  return (
    <div className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" onClick={() => b.set({ stage: 'search' })} aria-label={t('actions.back')}>
          <ArrowLeft className="rtl:rotate-180" />
        </Button>
        <p className="text-sm text-muted">{t('book.dragMap')}</p>
      </div>
      <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-4">
        <MapPin className="size-5 shrink-0" />
        <div className="min-w-0">
          <p className="truncate font-semibold">{isFetching ? t('state.loading') : data?.name ?? '—'}</p>
          <p className="truncate text-sm text-muted">{data?.address}</p>
        </div>
      </div>
      <Button size="lg" block className="mt-4" onClick={confirm} disabled={!mapCenter}>
        {t('book.confirmPin')}
      </Button>
    </div>
  );
}
