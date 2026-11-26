import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, Mail, Phone } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ErrorState, Stars } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, Skeleton } from '@/components/ui/misc';
import { useAuth } from '@/contexts/AuthContext';
import { BookingWizard, type PublicBusinessPayload } from '@/features/booking/BookingWizard';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useLocalized } from '@/hooks/useLocalized';
import { cn, hexToRgbTriplet } from '@/lib/utils';
import { Hero, ServicesSection, SpacesSection, TeamSection } from '@/features/business-page/Sections';
import { themeFor } from '@/features/themes/industryThemes';
import { api, errorMessage } from '@/services/api';
import type { Resource, Review } from '@/types';
import { fmtDate } from '@/utils/format';

const MapView = lazy(() => import('@/features/search/MapView'));

export function BusinessPage() {
  const { slug = '' } = useParams();
  const [sp] = useSearchParams();
  const { t } = useTranslation();
  const loc = useLocalized();
  const { user, setUser } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['public-business', slug], queryFn: () => api.get<PublicBusinessPayload & { reviews: Review[]; resources: Resource[] }>(`/public/businesses/${slug}`) });
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
  const [preset, setPreset] = useState<{ service?: string; staff?: string; nonce: number }>(() => ({ service: sp.get('service') ?? undefined, nonce: 0 }));
  const startBooking = (p: { service?: string; staff?: string } = {}) => {
    setPreset((x) => ({ ...p, nonce: x.nonce + 1 }));
    document.getElementById('book')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (q.isLoading) return <div className="container space-y-4 py-10"><Skeleton className="h-56" /><Skeleton className="h-96" /></div>;
  if (q.error || !q.data || !b) return <div className="container py-16"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>;
  const data = q.data;
  const theme = themeFor(data.business);
  const guestBlocked = !user && !b.settings.allowGuestBooking;
  const staffTerm = loc(data.business.category?.terminology?.staff) || t('common.staff');
  const share = async () => {
    const url = window.location.href;
    if (navigator.share) await navigator.share({ title: b.name, url }).catch(() => undefined);
    else {
      await navigator.clipboard.writeText(url);
      toast.success(t('actions.copied'));
    }
  };

  return (
    <div className={cn('pb-16', `theme-${theme.preset}`, theme.serif && 'theme-serif')} data-theme-preset={theme.preset}>
      <Hero business={data.business} theme={theme} isFav={isFav} canFav={!!user} favBusy={fav.isPending} onFav={() => fav.mutate()} onShare={share} onBook={() => startBooking()} />
      <div className="container">
        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr,440px]">
          <div className="order-2 space-y-10 lg:order-1">
            {b.description && theme.hero !== 'editorial' && (
              <section aria-labelledby="about">
                <h2 id="about" className="font-display mb-3 text-2xl font-bold">{t('business.about')}</h2>
                <p className="whitespace-pre-line leading-relaxed text-muted-foreground">{b.description}</p>
              </section>
            )}
            {theme.team === 'directory' && <TeamSection staff={data.staff} services={data.services} reviews={data.reviews} business={data.business} theme={theme} staffTerm={staffTerm} onBook={(staff) => startBooking({ staff })} />}
            <ServicesSection services={data.services} business={data.business} theme={theme} onBook={(service) => startBooking({ service })} />
            <SpacesSection resources={data.resources ?? []} theme={theme} />
            {theme.team !== 'directory' && <TeamSection staff={data.staff} services={data.services} reviews={data.reviews} business={data.business} theme={theme} staffTerm={staffTerm} onBook={(staff) => startBooking({ staff })} />}

            <section aria-labelledby="reviews">
              <h2 id="reviews" className="font-display mb-3 text-2xl font-bold">{t('business.reviews')}</h2>
              {data.reviews.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.reviews.slice(0, 6).map((r) => (
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
              <h2 id="location" className="font-display mb-3 text-2xl font-bold">{t('business.location')}</h2>
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
            <Card className="scroll-mt-24 p-5 lg:sticky lg:top-24" id="book">
              <h2 className="font-display mb-4 text-xl font-bold">{theme.hero === 'editorial' ? t('business.visitTitle') : t('business.book')}</h2>
              {b.settings.requireApproval && <p className="mb-4 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">{t('business.pendingNotice')}</p>}
              {guestBlocked ? (
                <div className="space-y-3 text-center">
                  <p className="text-sm text-muted-foreground">{t('business.guestNotAllowed')}</p>
                  <Button variant="brand" asChild><Link to={`/login?next=/b/${b.slug}`}>{t('nav.login')}</Link></Button>
                </div>
              ) : (
                <BookingWizard key={preset.nonce} data={data} initialService={preset.service} initialStaff={preset.staff} />
              )}
              {!b.branding.hidePlatformBranding && <p className="mt-4 text-center text-[11px] text-muted-foreground">{t('common.poweredBy')}</p>}
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
