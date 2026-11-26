import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowRight, CalendarCheck2, Check, ChevronDown, Search, Sparkles, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CategoryIcon } from '@/components/common/CategoryIcon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, Skeleton } from '@/components/ui/misc';
import { BusinessCard } from '@/features/search/BusinessCard';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useLocalized } from '@/hooks/useLocalized';
import { api, errorMessage } from '@/services/api';
import type { Business, Category, Plan } from '@/types';
import { fmtDuration, money } from '@/utils/format';

const fade = { initial: { opacity: 0, y: 16 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-60px' }, transition: { duration: 0.45 } };

export function LandingPage() {
  const { t } = useTranslation();
  const loc = useLocalized();
  const navigate = useNavigate();
  useDocumentTitle(t('landing.title') + ' ' + t('landing.titleHighlight'), t('landing.subtitle'));
  const [query, setQuery] = useState('');
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState(false);

  const cats = useQuery({ queryKey: ['categories'], queryFn: () => api.get<{ items: Category[] }>('/categories') });
  const featured = useQuery({ queryKey: ['search', 'featured'], queryFn: () => api.get<{ items: Business[]; total: number }>('/search/businesses', { featured: 'true', limit: 6 }) });
  const popular = useQuery({ queryKey: ['popular-services'], queryFn: () => api.get<{ items: Array<{ _id: string; name: string; price: number; duration: number; business: { name: string; slug: string; currency: string; city?: string } }> }>('/search/services/popular') });
  const plans = useQuery({ queryKey: ['plans'], queryFn: () => api.get<{ items: Plan[] }>('/plans') });

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (city) params.set('city', city);
    const text = query.trim();
    if (text.split(/\s+/).length >= 3) {
      // Natural-language query → structured filters via the AI layer.
      setBusy(true);
      try {
        const { intent } = await api.post<{ intent: Record<string, string | number> }>('/ai/search-intent', { text });
        for (const [k, v] of Object.entries(intent)) {
          if (k === 'date') params.set('availableOn', String(v));
          else if (k === 'maxPrice') params.set('maxPrice', String(v));
          else if (k === 'minRating') params.set('minRating', String(v));
          else if (['q', 'category', 'city'].includes(k) && v) params.set(k, String(v));
        }
        params.set('ai', '1');
      } catch (err) {
        toast.error(errorMessage(err));
        params.set('q', text);
      } finally {
        setBusy(false);
      }
    } else if (text) params.set('q', text);
    navigate(`/explore?${params.toString()}`);
  }

  const totalBusinesses = cats.data?.items.reduce((a, c) => a + (c.businessCount ?? 0), 0) ?? 0;

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,hsl(var(--primary)/.18),transparent_70%),radial-gradient(40%_40%_at_90%_30%,hsl(168_70%_45%/.15),transparent_70%)]" aria-hidden />
        <div className="container pb-16 pt-14 text-center sm:pb-24 sm:pt-24">
          <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border bg-background/70 px-4 py-1.5 text-xs font-semibold text-muted-foreground backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> {t('landing.eyebrow')}
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mx-auto max-w-4xl text-4xl font-extrabold leading-[1.1] sm:text-6xl">
            {t('landing.title')} <span className="text-gradient">{t('landing.titleHighlight')}</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
            {t('landing.subtitle')}
          </motion.p>
          <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} onSubmit={onSearch} className="mx-auto mt-9 flex max-w-3xl flex-col gap-2 rounded-2xl border bg-card p-2 shadow-lift sm:flex-row" role="search">
            <label className="flex flex-1 items-center gap-2 px-3">
              <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
              <span className="sr-only">{t('actions.search')}</span>
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('landing.searchPlaceholder')} className="h-11 border-0 px-0 shadow-none focus-visible:ring-0" />
            </label>
            <label className="flex items-center gap-2 border-t px-3 sm:w-44 sm:border-s sm:border-t-0">
              <span className="sr-only">{t('landing.searchWhere')}</span>
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder={t('landing.searchWhere')} className="h-11 border-0 px-0 shadow-none focus-visible:ring-0" />
            </label>
            <Button type="submit" size="lg" loading={busy} className="sm:px-8">{t('landing.searchCta')}</Button>
          </motion.form>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><Wand2 className="h-3.5 w-3.5" />{t('landing.aiHint')}</p>
          <div className="mx-auto mt-10 flex max-w-lg justify-center gap-10 text-center">
            <div><p className="num text-2xl font-bold">{totalBusinesses || '—'}</p><p className="text-xs text-muted-foreground">{t('landing.stats.businesses')}</p></div>
            <div><p className="num text-2xl font-bold">{cats.data?.items.length ?? '—'}</p><p className="text-xs text-muted-foreground">{t('landing.stats.categories')}</p></div>
            <div><p className="num text-2xl font-bold">2</p><p className="text-xs text-muted-foreground">{t('landing.stats.languages')}</p></div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="container py-16" aria-labelledby="cats">
        <motion.div {...fade} className="mb-8">
          <h2 id="cats" className="text-3xl font-bold">{t('landing.categoriesTitle')}</h2>
          <p className="mt-2 text-muted-foreground">{t('landing.categoriesSubtitle')}</p>
        </motion.div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {cats.isLoading
            ? Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-32" />)
            : cats.data?.items.map((c, i) => (
                <motion.div key={c._id} {...fade} transition={{ duration: 0.4, delay: i * 0.04 }}>
                  <Link to={`/explore?category=${c.slug}`} className="group flex h-full flex-col gap-3 rounded-2xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-lift">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: `${c.color}1f`, color: c.color }}><CategoryIcon name={c.icon} className="h-5 w-5" /></span>
                    <span className="text-sm font-semibold leading-snug">{loc(c.name)}</span>
                    <span className="num mt-auto text-xs text-muted-foreground">{c.businessCount ?? 0}</span>
                  </Link>
                </motion.div>
              ))}
        </div>
      </section>

      {/* Featured */}
      <section className="bg-muted/40 py-16" aria-labelledby="featured">
        <div className="container">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <h2 id="featured" className="text-3xl font-bold">{t('landing.featuredTitle')}</h2>
              <p className="mt-2 text-muted-foreground">{t('landing.featuredSubtitle')}</p>
            </div>
            <Button variant="ghost" asChild><Link to="/explore">{t('actions.viewAll')} <ArrowRight className="rtl:rotate-180" /></Link></Button>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.isLoading ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-72" />) : featured.data?.items.map((b) => <BusinessCard key={b._id} b={b} />)}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="container py-20" aria-labelledby="how">
        <motion.h2 {...fade} id="how" className="mb-10 text-center text-3xl font-bold">{t('landing.howTitle')}</motion.h2>
        <div className="grid gap-6 md:grid-cols-3">
          {(t('landing.how', { returnObjects: true }) as Array<{ title: string; body: string }>).map((s, i) => (
            <motion.div key={i} {...fade} transition={{ duration: 0.4, delay: i * 0.08 }}>
              <Card className="h-full p-6">
                <span className="num flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient font-bold text-white">{i + 1}</span>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Popular services */}
      {popular.data?.items.length ? (
        <section className="container pb-20" aria-labelledby="popular">
          <h2 id="popular" className="mb-6 text-2xl font-bold">{t('landing.popularTitle')}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {popular.data.items.slice(0, 9).map((s) => (
              <Link key={s._id} to={`/b/${s.business.slug}?service=${s._id}`} className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-4 transition-all hover:border-primary hover:shadow-soft">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{s.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{s.business.name} · {fmtDuration(s.duration)}</span>
                </span>
                <span className="num shrink-0 text-sm font-semibold">{s.price ? money(s.price, s.business.currency) : t('common.free')}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* For businesses */}
      <section className="container pb-20">
        <div className="relative overflow-hidden rounded-3xl bg-slate-950 p-8 text-white sm:p-14">
          <div className="absolute inset-0 bg-brand-gradient opacity-30" aria-hidden />
          <div className="relative grid items-center gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold sm:text-4xl">{t('landing.businessTitle')}</h2>
              <p className="mt-4 text-white/80">{t('landing.businessBody')}</p>
              <Button size="lg" className="mt-8 bg-white text-slate-900 hover:bg-white/90" asChild>
                <Link to="/register?type=business">{t('landing.businessCta')} <ArrowRight className="rtl:rotate-180" /></Link>
              </Button>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {(t('landing.businessPoints', { returnObjects: true }) as string[]).map((p) => (
                <li key={p} className="flex items-center gap-3 rounded-2xl bg-white/10 p-4 backdrop-blur">
                  <CalendarCheck2 className="h-5 w-5 shrink-0" /> <span className="text-sm font-medium">{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-muted/40 py-20" aria-labelledby="testi">
        <div className="container">
          <h2 id="testi" className="mb-10 text-center text-3xl font-bold">{t('landing.testimonialsTitle')}</h2>
          <div className="grid gap-5 md:grid-cols-3">
            {(t('landing.testimonials', { returnObjects: true }) as Array<{ quote: string; name: string; role: string }>).map((q) => (
              <motion.figure key={q.name} {...fade}>
                <Card className="h-full p-6">
                  <blockquote className="text-[15px] leading-relaxed">“{q.quote}”</blockquote>
                  <figcaption className="mt-5 text-sm"><span className="font-semibold">{q.name}</span><span className="block text-muted-foreground">{q.role}</span></figcaption>
                </Card>
              </motion.figure>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      {plans.data && (
        <section className="container py-20" aria-labelledby="pricing">
          <h2 id="pricing" className="text-center text-3xl font-bold">{t('pricing.title')}</h2>
          <p className="mt-2 text-center text-muted-foreground">{t('pricing.subtitle')}</p>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {plans.data.items.map((p) => (
              <Card key={p._id} className={`p-6 ${p.highlighted ? 'ring-2 ring-primary' : ''}`}>
                <p className="font-semibold">{p.name}</p>
                <p className="num mt-2 text-3xl font-extrabold">{money(p.price.monthly, p.currency)}<span className="text-sm font-normal text-muted-foreground">{t('pricing.perMonth')}</span></p>
                <ul className="mt-4 space-y-2 text-sm">
                  {p.features.slice(0, 4).map((f) => <li key={f} className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-accent" />{f}</li>)}
                </ul>
              </Card>
            ))}
          </div>
          <div className="mt-8 text-center"><Button variant="outline" asChild><Link to="/pricing">{t('actions.viewAll')}</Link></Button></div>
        </section>
      )}

      {/* FAQ */}
      <section className="container max-w-3xl pb-24" aria-labelledby="faq">
        <h2 id="faq" className="mb-8 text-center text-3xl font-bold">{t('landing.faqTitle')}</h2>
        <div className="space-y-3">
          {(t('landing.faq', { returnObjects: true }) as Array<{ q: string; a: string }>).map((f) => (
            <details key={f.q} className="group rounded-2xl border bg-card p-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                {f.q}
                <ChevronDown className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
