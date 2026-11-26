import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Globe, Heart, Mail, MapPin, Phone, Share2, Users, Video } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ErrorState, Stars } from '@/components/common';
import { CategoryIcon } from '@/components/common/CategoryIcon';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, Card, Skeleton } from '@/components/ui/misc';
import { useAuth } from '@/contexts/AuthContext';
import { BookingWizard, type PublicBusinessPayload } from '@/features/booking/BookingWizard';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useLocalized } from '@/hooks/useLocalized';
import { hexToRgbTriplet } from '@/lib/utils';
import { api, errorMessage } from '@/services/api';
import type { Review } from '@/types';
import { fmtDate, fmtDuration, money } from '@/utils/format';

const MapView = lazy(() => import('@/features/search/MapView'));

export function BusinessPage() {
  const { slug = '' } = useParams();
  const [sp] = useSearchParams();
  const { t } = useTranslation();
  const loc = useLocalized();
  const { user, setUser } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['public-business', slug], queryFn: () => api.get<PublicBusinessPayload & { reviews: Review[] }>(`/public/businesses/${slug}`) });
  const b = q.data?.business;
  useDocumentTitle(b?.name, b?.tagline ?? b?.description);

  // White-label: tint the page with the business brand colour.
  useEffect(() => {
    const rgb = hexToRgbTriplet(b?.branding?.primaryColor);
    if (rgb) document.documentElement.style.setProperty('--brand', rgb);
    return () => void document.documentElement.style.removeProperty('--brand');
  }, [b?.branding?.primaryColor]);

  // SEO: LocalBusiness structured data.
  useEffect(() => {
    if (!b) return;
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: b.name,
      description: b.description,
      address: { '@type': 'PostalAddress', addressLocality: b.address?.city, addressCountry: b.address?.country },
      aggregateRating: b.rating?.count ? { '@type': 'AggregateRating', ratingValue: b.rating.average, reviewCount: b.rating.count } : undefined,
    });
    document.head.appendChild(el);
    return () => el.remove();
  }, [b]);

  const isFav = !!(b && user?.favorites?.includes(b._id));
  const fav = useMutation({
    mutationFn: () => (isFav ? api.delete(`/me/favorites/${b!._id}`) : api.put(`/me/favorites/${b!._id}`)),
    onSuccess: () => {
      if (user && b) setUser({ ...user, favorites: isFav ? user.favorites.filter((x) => x !== b._id) : [...(user.favorites ?? []), b._id] });
      void qc.invalidateQueries({ queryKey: ['favorites'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const branch = q.data?.branches[0];
  const hours = useMemo(() => branch?.workingHours ?? [], [branch]);

  if (q.isLoading) return <div className="container space-y-4 py-10"><Skeleton className="h-56" /><Skeleton className="h-96" /></div>;
  if (q.error || !q.data || !b) return <div className="container py-16"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>;
  const data = q.data;
  const cat = data.business.category;
  const guestBlocked = !user && !b.settings.allowGuestBooking;
  const gradient = `linear-gradient(135deg, ${b.branding.primaryColor}, ${b.branding.accentColor})`;

  return (
    <div className="pb-16">
      <div className="relative h-48 sm:h-64" style={{ background: gradient }}>
        {b.cover && <img src={b.cover} alt="" className="h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" aria-hidden />
      </div>
      <div className="container -mt-16 sm:-mt-20">
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl border-4 border-background bg-card text-3xl font-bold shadow-lift sm:h-32 sm:w-32" style={{ color: b.branding.primaryColor }}>
            {b.logo ? <img src={b.logo} alt={b.name} className="h-full w-full object-cover" /> : b.name[0]}
          </div>
          <div className="min-w-0 flex-1 sm:pb-2">
            <div className="flex flex-wrap items-center gap-2">
              {cat && <Badge tone="primary"><CategoryIcon name={cat.icon} className="h-3.5 w-3.5" />{loc(cat.name)}</Badge>}
              {b.settings.requireApproval && <Badge tone="warning">{t('status.pending')}</Badge>}
            </div>
            <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">{b.name}</h1>
            {b.tagline && <p className="mt-1 text-muted-foreground">{b.tagline}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              {b.rating.count > 0 && <span className="flex items-center gap-1.5"><Stars value={b.rating.average} /><span className="num font-semibold">{b.rating.average.toFixed(1)}</span><span className="text-muted-foreground">({t('common.reviews', { count: b.rating.count })})</span></span>}
              {b.address?.city && <span className="flex items-center gap-1 text-muted-foreground"><MapPin className="h-4 w-4" />{[b.address.line1, b.address.city, b.address.country].filter(Boolean).join(', ')}</span>}
            </div>
          </div>
          <div className="flex gap-2 sm:pb-2">
            {user && (
              <Button variant="outline" onClick={() => fav.mutate()} loading={fav.isPending} aria-pressed={isFav}>
                <Heart className={isFav ? 'fill-rose-500 text-rose-500' : ''} />{isFav ? t('business.favorited') : t('business.favorite')}
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              aria-label={t('business.share')}
              onClick={async () => {
                const url = window.location.href;
                if (navigator.share) await navigator.share({ title: b.name, url }).catch(() => undefined);
                else {
                  await navigator.clipboard.writeText(url);
                  toast.success(t('actions.copied'));
                }
              }}
            >
              <Share2 />
            </Button>
          </div>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr,440px]">
          <div className="order-2 space-y-8 lg:order-1">
            {b.description && (
              <section aria-labelledby="about">
                <h2 id="about" className="mb-3 text-xl font-bold">{t('business.about')}</h2>
                <p className="whitespace-pre-line leading-relaxed text-muted-foreground">{b.description}</p>
              </section>
            )}

            <section aria-labelledby="services">
              <h2 id="services" className="mb-3 text-xl font-bold">{t('business.services')}</h2>
              <div className="divide-y rounded-2xl border bg-card">
                {data.services.map((s) => (
                  <div key={s._id} className="flex items-center gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{s.name}</p>
                      {s.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{s.description}</p>}
                      <p className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{fmtDuration(s.duration)}</span>
                        {s.capacity > 1 && <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{s.capacity}</span>}
                        {s.sessionModes.includes('online') && <span className="flex items-center gap-1"><Video className="h-3.5 w-3.5" />{t('common.online')}</span>}
                      </p>
                    </div>
                    <p className="num shrink-0 font-bold">{s.price ? money(s.price, b.currency) : t('common.free')}</p>
                  </div>
                ))}
              </div>
            </section>

            {data.staff.length > 0 && (
              <section aria-labelledby="team">
                <h2 id="team" className="mb-3 text-xl font-bold">{t('business.team')}</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.staff.map((s) => (
                    <Card key={s._id} className="flex items-start gap-3 p-4">
                      <Avatar name={s.name} src={s.avatar} color={s.color} className="h-12 w-12" />
                      <div className="min-w-0">
                        <p className="font-semibold">{s.name}</p>
                        <p className="text-sm text-muted-foreground">{s.title}</p>
                        {s.rating?.count ? <p className="mt-1 flex items-center gap-1 text-xs"><Stars value={s.rating.average} /> <span className="num">{s.rating.average.toFixed(1)}</span></p> : null}
                        {s.bio && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{s.bio}</p>}
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            <section aria-labelledby="reviews">
              <h2 id="reviews" className="mb-3 text-xl font-bold">{t('business.reviews')}</h2>
              {data.reviews.length ? (
                <div className="space-y-3">
                  {data.reviews.map((r) => (
                    <Card key={r._id} className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{r.authorName}</span>
                        <span className="text-xs text-muted-foreground">{fmtDate(r.createdAt)}</span>
                      </div>
                      <Stars value={r.rating} className="mt-1" />
                      {r.comment && <p className="mt-2 text-sm">{r.comment}</p>}
                      {r.reply?.text && <div className="mt-3 rounded-xl bg-muted/60 p-3 text-sm"><p className="mb-1 text-xs font-semibold">{t('business.reply')}</p>{r.reply.text}</div>}
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('business.noReviews')}</p>
              )}
            </section>

            <section aria-labelledby="location">
              <h2 id="location" className="mb-3 text-xl font-bold">{t('business.location')}</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="p-5">
                  <p className="mb-3 font-semibold">{t('business.hours')}</p>
                  <dl className="space-y-1.5 text-sm">
                    {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                      const h = hours.find((x) => x.day === d);
                      return (
                        <div key={d} className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">{t(`days.${d}`)}</dt>
                          <dd className="num">{h?.enabled && h.intervals.length ? h.intervals.map((i) => `${i.start}–${i.end}`).join(', ') : t('business.closed')}</dd>
                        </div>
                      );
                    })}
                  </dl>
                  <div className="mt-4 space-y-1.5 border-t pt-4 text-sm">
                    {b.contact?.phone && <a href={`tel:${b.contact.phone}`} className="flex items-center gap-2 hover:text-primary"><Phone className="h-4 w-4" /><span dir="ltr">{b.contact.phone}</span></a>}
                    {b.contact?.email && <a href={`mailto:${b.contact.email}`} className="flex items-center gap-2 hover:text-primary"><Mail className="h-4 w-4" />{b.contact.email}</a>}
                    {b.contact?.website && <a href={b.contact.website} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-primary"><Globe className="h-4 w-4" />{b.contact.website}</a>}
                  </div>
                </Card>
                {b.address?.location?.coordinates && (
                  <Suspense fallback={<Skeleton className="h-64" />}>
                    <MapView items={[b]} className="h-64 w-full md:h-full" />
                  </Suspense>
                )}
              </div>
            </section>
          </div>

          <aside className="order-1 lg:order-2">
            <Card className="p-5 lg:sticky lg:top-24" id="book">
              <h2 className="mb-4 text-lg font-bold">{t('business.book')}</h2>
              {b.settings.requireApproval && <p className="mb-4 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">{t('business.pendingNotice')}</p>}
              {guestBlocked ? (
                <div className="space-y-3 text-center">
                  <p className="text-sm text-muted-foreground">{t('business.guestNotAllowed')}</p>
                  <Button variant="brand" asChild><Link to={`/login?next=/b/${b.slug}`}>{t('nav.login')}</Link></Button>
                </div>
              ) : (
                <BookingWizard data={data} initialService={sp.get('service') ?? undefined} />
              )}
              {!b.branding.hidePlatformBranding && <p className="mt-4 text-center text-[11px] text-muted-foreground">{t('common.poweredBy')}</p>}
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
