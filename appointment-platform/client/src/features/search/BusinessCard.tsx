import { MapPin, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CategoryIcon } from '@/components/common/CategoryIcon';
import { Badge, Card } from '@/components/ui/misc';
import { useLocalized } from '@/hooks/useLocalized';
import type { Business, Category } from '@/types';
import { fmtShortDate, fmtTime, money } from '@/utils/format';

export function BusinessCard({ b }: { b: Business }) {
  const { t } = useTranslation();
  const loc = useLocalized();
  const cat = typeof b.category === 'object' ? (b.category as Category) : null;
  const color = b.branding?.primaryColor ?? '#4f46e5';
  return (
    <Link to={`/b/${b.slug}`} className="group block focus-visible:rounded-2xl">
      <Card className="h-full overflow-hidden transition-all group-hover:-translate-y-0.5 group-hover:shadow-lift">
        <div className="relative h-32 overflow-hidden" style={{ background: `linear-gradient(135deg, ${color}, ${b.branding?.accentColor ?? color})` }}>
          {b.cover && <img src={b.cover} alt="" className="h-full w-full object-cover" loading="lazy" />}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,.35),transparent_45%)]" aria-hidden />
          {cat && (
            <span className="absolute start-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-slate-800 backdrop-blur">
              <CategoryIcon name={cat.icon} className="h-3.5 w-3.5" />
              {loc(cat.name)}
            </span>
          )}
          {b.featured && <Badge className="absolute end-3 top-3 bg-amber-400 text-amber-950">★</Badge>}
          <div className="absolute -bottom-6 start-4 flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border-4 border-card bg-card text-lg font-bold" style={{ color }}>
            {b.logo ? <img src={b.logo} alt="" className="h-full w-full object-cover" /> : b.name[0]}
          </div>
        </div>
        <div className="p-4 pt-8">
          <h3 className="truncate font-semibold group-hover:text-primary">{b.name}</h3>
          {b.tagline && <p className="mt-0.5 line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">{b.tagline}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {b.rating?.count > 0 ? (
              <span className="flex items-center gap-1 font-semibold"><Star className="h-4 w-4 fill-amber-400 text-amber-400" /><span className="num">{b.rating.average.toFixed(1)}</span><span className="font-normal text-muted-foreground num">({b.rating.count})</span></span>
            ) : null}
            {b.address?.city && <span className="flex items-center gap-1 text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{b.address.city}{b.distance !== undefined && <span className="num"> · {(b.distance / 1000).toFixed(1)} km</span>}</span>}
            {b.priceRange?.max > 0 && <span className="num ms-auto font-medium">{t('common.from')} {money(b.priceRange.min, b.currency)}</span>}
          </div>
          {b.nextSlot && <p className="mt-2 text-xs font-medium text-emerald-600">{t('explore.nextSlot', { time: `${fmtShortDate(b.nextSlot, b.timezone)} ${fmtTime(b.nextSlot, b.timezone)}` })}</p>}
        </div>
      </Card>
    </Link>
  );
}
