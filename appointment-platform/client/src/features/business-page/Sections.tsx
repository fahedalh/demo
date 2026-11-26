import { CalendarCheck, Clock, Heart, MapPin, Share2, ShieldCheck, Star, Users, Video } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Stars } from '@/components/common';
import { CategoryIcon } from '@/components/common/CategoryIcon';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, Badge, Card } from '@/components/ui/misc';
import { useLocalized } from '@/hooks/useLocalized';
import { cn } from '@/lib/utils';
import type { Business, Category, Resource, Review, Service, Staff } from '@/types';
import { fmtDate, fmtDuration, money } from '@/utils/format';
import type { IndustryTheme } from '@/features/themes/industryThemes';

type Biz = Business & { category: Category };

export interface HeroProps {
  business: Biz;
  theme: IndustryTheme;
  isFav: boolean;
  canFav: boolean;
  favBusy: boolean;
  onFav: () => void;
  onShare: () => void;
  onBook: () => void;
}

/** Hero composition per industry theme. */
export function Hero(p: HeroProps) {
  if (p.theme.hero === 'editorial') return <EditorialHero {...p} />;
  if (p.theme.hero === 'clinical') return <ClinicalHero {...p} />;
  return <StandardHero {...p} />;
}

function Meta({ b }: { b: Biz }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      {b.rating.count > 0 && (
        <span className="flex items-center gap-1.5">
          <Stars value={b.rating.average} />
          <span className="num font-semibold">{b.rating.average.toFixed(1)}</span>
          <span className="text-muted-foreground">({t('common.reviews', { count: b.rating.count })})</span>
        </span>
      )}
      {b.address?.city && (
        <span className="flex items-center gap-1 text-muted-foreground"><MapPin className="h-4 w-4" />{[b.address.line1, b.address.city, b.address.country].filter(Boolean).join(', ')}</span>
      )}
    </div>
  );
}

function Actions({ isFav, canFav, favBusy, onFav, onShare }: HeroProps) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2">
      {canFav && (
        <Button variant="outline" onClick={onFav} loading={favBusy} aria-pressed={isFav} className="bg-card/80 backdrop-blur">
          <Heart className={isFav ? 'fill-rose-500 text-rose-500' : ''} />{isFav ? t('business.favorited') : t('business.favorite')}
        </Button>
      )}
      <Button variant="outline" size="icon" aria-label={t('business.share')} onClick={onShare} className="bg-card/80 backdrop-blur"><Share2 /></Button>
    </div>
  );
}

function CategoryBadge({ b }: { b: Biz }) {
  const loc = useLocalized();
  if (!b.category) return null;
  return (
    <Badge className="bg-white/90 text-slate-800 shadow-sm backdrop-blur dark:bg-slate-900/80 dark:text-slate-100">
      <CategoryIcon name={b.category.icon} className="h-3.5 w-3.5" />
      {loc(b.category.name)}
    </Badge>
  );
}

function StandardHero(p: HeroProps) {
  const b = p.business;
  const gradient = `linear-gradient(135deg, ${b.branding.primaryColor}, ${b.branding.accentColor})`;
  return (
    <>
      <div className="relative h-48 sm:h-64" style={{ background: gradient }}>
        {b.cover && <img src={b.cover} alt="" className="h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" aria-hidden />
      </div>
      <div className="container -mt-16 sm:-mt-20">
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end">
          <Logo b={b} className="h-24 w-24 rounded-3xl border-4 border-background text-3xl shadow-lift sm:h-32 sm:w-32" />
          <div className="min-w-0 flex-1 sm:pb-2">
            <CategoryBadge b={b} />
            <h1 className="font-display mt-2 text-3xl font-extrabold sm:text-4xl">{b.name}</h1>
            {b.tagline && <p className="mt-1 text-muted-foreground">{b.tagline}</p>}
            <div className="mt-2"><Meta b={b} /></div>
          </div>
          <div className="sm:pb-2"><Actions {...p} /></div>
        </div>
      </div>
    </>
  );
}

/** Quiet-luxury editorial hero: generous whitespace, serif display, arched image frame. */
function EditorialHero(p: HeroProps) {
  const { t } = useTranslation();
  const b = p.business;
  return (
    <section className="border-b" style={{ background: `linear-gradient(180deg, ${b.branding.accentColor}33, transparent 70%)` }}>
      <div className="container grid items-center gap-10 py-12 md:grid-cols-[1.1fr,1fr] md:py-20">
        <div>
          <div className="flex items-center gap-3">
            <Logo b={b} className="h-12 w-12 rounded-full border text-lg" />
            <span className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">{b.name}</span>
          </div>
          <h1 className="font-display mt-8 text-5xl leading-[1.05] sm:text-6xl" style={{ color: b.branding.primaryColor }}>
            {b.tagline || b.name}
          </h1>
          {b.description && <p className="mt-6 max-w-md text-[15px] leading-relaxed text-muted-foreground">{b.description}</p>}
          <div className="mt-6"><Meta b={b} /></div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" variant="brand" className="rounded-md px-8 uppercase tracking-[0.15em] text-xs" onClick={p.onBook}>{t('business.bookExperience')}</Button>
            <Actions {...p} />
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-sm">
          <div className="absolute -inset-4 rounded-t-full border" style={{ borderColor: `${b.branding.primaryColor}40` }} aria-hidden />
          <div className="relative aspect-[4/5] overflow-hidden rounded-t-full" style={{ background: `linear-gradient(160deg, ${b.branding.accentColor}, ${b.branding.primaryColor})` }}>
            {b.cover ? (
              <img src={b.cover} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center">
                <span className="font-display text-[9rem] leading-none text-white/85">{b.name[0]}</span>
              </div>
            )}
          </div>
          <div className="absolute -bottom-5 start-1/2 -translate-x-1/2 rtl:translate-x-1/2"><CategoryBadge b={b} /></div>
        </div>
      </div>
    </section>
  );
}

/** Clinical hero: calm, information-dense, trust signals up front. */
function ClinicalHero(p: HeroProps) {
  const { t } = useTranslation();
  const b = p.business;
  return (
    <section className="border-b bg-card">
      <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${b.branding.primaryColor}, ${b.branding.accentColor})` }} />
      <div className="container flex flex-col gap-6 py-8 md:flex-row md:items-center">
        <Logo b={b} className="h-20 w-20 rounded-2xl border text-2xl" />
        <div className="min-w-0 flex-1">
          <CategoryBadge b={b} />
          <h1 className="font-display mt-2 text-3xl font-bold sm:text-4xl">{b.name}</h1>
          {b.tagline && <p className="mt-1 text-muted-foreground">{b.tagline}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Meta b={b} />
            <Badge tone="success"><ShieldCheck className="h-3.5 w-3.5" />{t('business.available')}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="brand" size="lg" onClick={p.onBook}><CalendarCheck />{t('actions.bookNow')}</Button>
          <Actions {...p} />
        </div>
      </div>
    </section>
  );
}

function Logo({ b, className }: { b: Biz; className?: string }) {
  return (
    <div className={cn('flex shrink-0 items-center justify-center overflow-hidden bg-card font-bold', className)} style={{ color: b.branding.primaryColor }}>
      {b.logo ? <img src={b.logo} alt={b.name} className="h-full w-full object-cover" /> : b.name[0]}
    </div>
  );
}

/** Service list with optional group chips (specialties, treatment types). */
export function ServicesSection({ services, business, theme, onBook }: { services: Service[]; business: Biz; theme: IndustryTheme; onBook: (serviceId: string) => void }) {
  const { t } = useTranslation();
  const groups = useMemo(() => [...new Set(services.map((s) => s.group).filter(Boolean))] as string[], [services]);
  const [group, setGroup] = useState<string | null>(null);
  const list = group ? services.filter((s) => s.group === group) : services;
  return (
    <section aria-labelledby="services">
      <h2 id="services" className="font-display mb-3 text-2xl font-bold">{theme.preset === 'clinical' ? t('business.specialties') : t('business.services')}</h2>
      {theme.groupChips && groups.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2" role="group">
          {[null, ...groups].map((g) => (
            <button key={g ?? 'all'} onClick={() => setGroup(g)} aria-pressed={group === g} className={cn('rounded-full border px-3.5 py-1.5 text-sm transition-colors', group === g ? 'border-brand bg-brand text-white' : 'bg-card hover:border-brand/50')}>
              {g ?? t('business.allServices')}
            </button>
          ))}
        </div>
      )}
      <div className="divide-y rounded-2xl border bg-card">
        {list.map((s) => (
          <div key={s._id} className="group flex items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <p className={cn('font-semibold', theme.serif && 'font-display text-lg')}>{s.name}</p>
              {s.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{s.description}</p>}
              <p className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{fmtDuration(s.duration)}</span>
                {s.capacity > 1 && <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{s.capacity}</span>}
                {s.sessionModes.includes('online') && <span className="flex items-center gap-1"><Video className="h-3.5 w-3.5" />{t('common.online')}</span>}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <p className="num font-bold">{s.price ? money(s.price, business.currency) : t('common.free')}</p>
              <Button size="sm" variant="outline" onClick={() => onBook(s._id)}>{t('business.book')}</Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

interface TeamProps {
  staff: Staff[];
  services: Service[];
  reviews: Review[];
  business: Biz;
  theme: IndustryTheme;
  staffTerm: string;
  onBook: (staffId: string) => void;
}

/** Team presentation per theme: cards (default), round portraits (luxe), directory + detail (clinical). */
export function TeamSection(p: TeamProps) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<Staff | null>(null);
  if (!p.staff.length) return null;
  const servicesOf = (s: Staff) => p.services.filter((x) => x.staff.includes(s._id));
  const title = p.theme.team === 'portraits' ? t('business.meetTeam') : p.theme.team === 'directory' ? t('business.findDoctor', { staff: p.staffTerm.toLowerCase() }) : t('business.team');

  return (
    <section aria-labelledby="team">
      <h2 id="team" className="font-display mb-4 text-2xl font-bold">{title}</h2>

      {p.theme.team === 'portraits' && (
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
          {p.staff.map((s) => (
            <button key={s._id} onClick={() => setDetail(s)} className="group text-center">
              <span className="mx-auto block h-28 w-28 rounded-full p-1 ring-1 ring-border transition-all group-hover:ring-2 group-hover:ring-brand">
                <Avatar name={s.name} src={s.avatar} color={s.color} className="h-full w-full text-2xl" />
              </span>
              <span className="font-display mt-3 block text-lg">{s.name}</span>
              <span className="block text-xs uppercase tracking-widest text-muted-foreground">{s.title}</span>
            </button>
          ))}
        </div>
      )}

      {p.theme.team === 'directory' && (
        <div className="grid gap-3 sm:grid-cols-2">
          {p.staff.map((s) => {
            const svc = servicesOf(s);
            const minPrice = svc.length ? Math.min(...svc.map((x) => x.price)) : 0;
            return (
              <Card key={s._id} className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar name={s.name} src={s.avatar} color={s.color} className="h-14 w-14 rounded-2xl" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{s.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{s.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                      {s.rating?.count ? <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /><span className="num">{s.rating.average.toFixed(1)}</span></span> : null}
                      {minPrice > 0 && <span className="num">{t('common.from')} {money(minPrice, p.business.currency)}</span>}
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button size="sm" variant="brand" onClick={() => p.onBook(s._id)}>{t('business.book')}</Button>
                  <Button size="sm" variant="outline" onClick={() => setDetail(s)}>{t('business.details')}</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {p.theme.team === 'cards' && (
        <div className="grid gap-3 sm:grid-cols-2">
          {p.staff.map((s) => (
            <button key={s._id} onClick={() => setDetail(s)} className="text-start">
              <Card className="flex items-start gap-3 p-4 transition-shadow hover:shadow-lift">
                <Avatar name={s.name} src={s.avatar} color={s.color} className="h-12 w-12" />
                <div className="min-w-0">
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-sm text-muted-foreground">{s.title}</p>
                  {s.rating?.count ? <p className="mt-1 flex items-center gap-1 text-xs"><Stars value={s.rating.average} /> <span className="num">{s.rating.average.toFixed(1)}</span></p> : null}
                  {s.bio && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{s.bio}</p>}
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}

      <StaffDetail staff={detail} onClose={() => setDetail(null)} services={detail ? servicesOf(detail) : []} reviews={detail ? p.reviews.filter((r) => String(r.staff) === detail._id) : []} business={p.business} onBook={(id) => { setDetail(null); p.onBook(id); }} />
    </section>
  );
}

function StaffDetail({ staff: s, onClose, services, reviews, business, onBook }: { staff: Staff | null; onClose: () => void; services: Service[]; reviews: Review[]; business: Biz; onBook: (id: string) => void }) {
  const { t } = useTranslation();
  return (
    <Dialog open={!!s} onOpenChange={(o) => !o && onClose()}>
      <DialogContent side="right" title={s?.name ?? ''} description={s?.title}>
        {s && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <Avatar name={s.name} src={s.avatar} color={s.color} className="h-20 w-20 rounded-2xl text-xl" />
              <div>
                {s.rating?.count ? <p className="flex items-center gap-2"><Stars value={s.rating.average} size="md" /><span className="num font-semibold">{s.rating.average.toFixed(1)}</span><span className="text-sm text-muted-foreground">({t('common.reviews', { count: s.rating.count })})</span></p> : null}
              </div>
            </div>
            {s.bio && <section><h3 className="mb-1 text-sm font-semibold">{t('business.bio')}</h3><p className="text-sm leading-relaxed text-muted-foreground">{s.bio}</p></section>}
            {services.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-semibold">{t('business.offers')}</h3>
                <ul className="divide-y rounded-xl border text-sm">
                  {services.map((x) => <li key={x._id} className="flex justify-between gap-3 p-3"><span>{x.name} <span className="text-muted-foreground">· {fmtDuration(x.duration)}</span></span><span className="num font-semibold">{x.price ? money(x.price, business.currency) : t('common.free')}</span></li>)}
                </ul>
              </section>
            )}
            <section>
              <h3 className="mb-2 text-sm font-semibold">{t('business.reviews')}</h3>
              {reviews.length ? (
                <ul className="space-y-3">
                  {reviews.slice(0, 5).map((r) => (
                    <li key={r._id} className="rounded-xl bg-muted/60 p-3 text-sm">
                      <div className="flex justify-between"><Stars value={r.rating} /><span className="text-xs text-muted-foreground">{r.authorName} · {fmtDate(r.createdAt)}</span></div>
                      {r.comment && <p className="mt-1.5">{r.comment}</p>}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">{t('business.noStaffReviews', { name: s.name })}</p>}
            </section>
            <Button variant="brand" size="lg" className="w-full" onClick={() => onBook(s._id)}>{t('business.bookWith', { name: s.name })}</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Bookable spaces (meeting rooms, service bays) for resource-first industries. */
export function SpacesSection({ resources, theme }: { resources: Resource[]; theme: IndustryTheme }) {
  const { t } = useTranslation();
  if (!theme.showSpaces || !resources.length) return null;
  return (
    <section aria-labelledby="spaces">
      <h2 id="spaces" className="font-display mb-3 text-2xl font-bold">{t('business.spaces')}</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {resources.map((r) => (
          <Card key={r._id} className="p-4">
            <p className="font-semibold">{r.name}</p>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{r.type}</p>
            {r.capacity > 1 && <p className="mt-2 flex items-center gap-1.5 text-sm"><Users className="h-4 w-4" />{t('business.capacity', { count: r.capacity })}</p>}
            {r.description && <p className="mt-1 text-xs text-muted-foreground">{r.description}</p>}
          </Card>
        ))}
      </div>
    </section>
  );
}
