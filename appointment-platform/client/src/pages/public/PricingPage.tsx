import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ErrorState } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Badge, Card, Skeleton } from '@/components/ui/misc';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { cn } from '@/lib/utils';
import { api } from '@/services/api';
import type { Plan } from '@/types';
import { money } from '@/utils/format';

export function PricingPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('pricing.title'), t('pricing.subtitle'));
  const [annual, setAnnual] = useState(false);
  const q = useQuery({ queryKey: ['plans'], queryFn: () => api.get<{ items: Plan[] }>('/plans') });
  const lim = (n: number) => (n < 0 ? t('common.unlimited') : String(n));
  return (
    <div className="container py-14 sm:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-extrabold">{t('pricing.title')}</h1>
        <p className="mt-3 text-muted-foreground">{t('pricing.subtitle')}</p>
        <div className="mt-8 inline-flex rounded-xl bg-muted p-1" role="group">
          <button className={cn('rounded-lg px-4 py-2 text-sm font-semibold', !annual && 'bg-background shadow-sm')} aria-pressed={!annual} onClick={() => setAnnual(false)}>{t('pricing.monthly')}</button>
          <button className={cn('rounded-lg px-4 py-2 text-sm font-semibold', annual && 'bg-background shadow-sm')} aria-pressed={annual} onClick={() => setAnnual(true)}>{t('pricing.annual')} <Badge tone="success" className="ms-1">{t('pricing.save')}</Badge></button>
        </div>
      </div>
      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {q.isLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[28rem]" />) : q.data?.items.map((p) => (
            <Card key={p._id} className={cn('relative flex flex-col p-6', p.highlighted && 'ring-2 ring-primary shadow-lift')}>
              {p.highlighted && <Badge tone="primary" className="absolute -top-3 start-6 bg-primary text-primary-foreground">{t('pricing.popular')}</Badge>}
              <p className="text-lg font-bold">{p.name}</p>
              <p className="mt-1 min-h-[2.5rem] text-sm text-muted-foreground">{p.description}</p>
              <p className="num mt-4 text-4xl font-extrabold">{money(annual ? p.price.annual : p.price.monthly, p.currency)}<span className="text-sm font-normal text-muted-foreground">{annual ? t('pricing.perYear') : t('pricing.perMonth')}</span></p>
              <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                <li className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-accent" />{t('pricing.staff', { count: lim(p.limits.staff) as never })}</li>
                <li className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-accent" />{t('pricing.branches', { count: lim(p.limits.branches) as never })}</li>
                <li className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-accent" />{t('pricing.bookings', { count: lim(p.limits.bookingsPerMonth) as never })}</li>
                {p.features.map((f) => <li key={f} className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-accent" />{f}</li>)}
              </ul>
              <Button className="mt-8" variant={p.highlighted ? 'default' : 'outline'} asChild>
                <Link to={`/register?type=business&plan=${p.key}`}>{t('pricing.cta', { plan: p.name })}</Link>
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
