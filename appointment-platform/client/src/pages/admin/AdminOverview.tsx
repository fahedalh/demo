import { useQuery } from '@tanstack/react-query';
import { Building2, CalendarCheck, Clock, Coins, TrendingUp, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHeader, QueryView, StatCard } from '@/components/common';
import { NativeSelect } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/misc';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { api } from '@/services/api';
import { fmtShortDate, money } from '@/utils/format';

interface A {
  kpis: { businesses: number; activeBusinesses: number; pendingBusinesses: number; users: number; bookings: number; mrr: number; gmv: Array<{ _id: string; sum: number }> };
  roles: Record<string, number>;
  series: Array<{ date: string; bookings: number; signups: number }>;
  plans: Array<{ name: string; subscribers: number }>;
  categories: Array<{ name: string; businesses: number }>;
  topBusinesses: Array<{ name: string; slug: string; bookings: number }>;
}

export function AdminOverview() {
  const { t } = useTranslation('dashboard');
  useDocumentTitle(t('admin.nav.overview'));
  const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: ['admin', 'analytics', days], queryFn: () => api.get<A>('/admin/analytics', { days }) });
  const tip = { borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' };
  return (
    <>
      <PageHeader title={t('admin.nav.overview')} actions={<NativeSelect value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-40" aria-label="Range">{[7, 30, 90, 365].map((d) => <option key={d} value={d}>{t('overview.range', { days: d })}</option>)}</NativeSelect>} />
      <QueryView query={q}>
        {(d) => (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <StatCard label={t('admin.kpiBusinesses')} value={d.kpis.businesses} icon={<Building2 />} />
              <StatCard label={t('admin.kpiActive')} value={d.kpis.activeBusinesses} icon={<TrendingUp />} tone="accent" />
              <StatCard label={t('admin.kpiPending')} value={<Link to="/admin/businesses?status=pending" className="hover:underline">{d.kpis.pendingBusinesses}</Link>} icon={<Clock />} tone="amber" />
              <StatCard label={t('admin.kpiUsers')} value={d.kpis.users} icon={<Users />} />
              <StatCard label={t('admin.kpiBookings')} value={d.kpis.bookings} icon={<CalendarCheck />} tone="accent" />
              <StatCard label={t('admin.kpiMrr')} value={money(d.kpis.mrr, 'USD')} hint={d.kpis.gmv.map((g) => money(g.sum, g._id)).join(' · ') || undefined} icon={<Coins />} tone="rose" />
            </div>
            <div className="grid gap-6 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <CardHeader><CardTitle>{t('overview.kpiBookings')} · {t('admin.signups')}</CardTitle></CardHeader>
                <CardContent className="h-72" dir="ltr">
                  <ResponsiveContainer>
                    <LineChart data={d.series} margin={{ left: -16, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={(v: string) => fmtShortDate(v)} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} minTickGap={24} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={tip} labelFormatter={(v: string) => fmtShortDate(v)} />
                      <Line type="monotone" dataKey="bookings" stroke="hsl(243 75% 58%)" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="signups" stroke="hsl(168 70% 40%)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>{t('admin.topBusinesses')}</CardTitle></CardHeader>
                <CardContent>
                  <ol className="space-y-2">{d.topBusinesses.map((b, i) => <li key={b.slug} className="flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2"><span className="num w-5 text-muted-foreground">{i + 1}</span><a href={`/b/${b.slug}`} target="_blank" rel="noreferrer" className="font-medium hover:underline">{b.name}</a></span><span className="num font-semibold">{b.bookings}</span></li>)}</ol>
                </CardContent>
              </Card>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>{t('admin.byCategory')}</CardTitle></CardHeader>
                <CardContent className="h-64" dir="ltr">
                  <ResponsiveContainer><BarChart data={d.categories} layout="vertical" margin={{ left: 16 }}><XAxis type="number" hide allowDecimals={false} /><YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} /><Tooltip contentStyle={tip} cursor={{ fill: 'hsl(var(--muted))' }} /><Bar dataKey="businesses" fill="hsl(243 75% 58%)" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>{t('admin.byPlan')}</CardTitle></CardHeader>
                <CardContent className="h-64" dir="ltr">
                  <ResponsiveContainer><BarChart data={d.plans}><XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} /><Tooltip contentStyle={tip} cursor={{ fill: 'hsl(var(--muted))' }} /><Bar dataKey="subscribers" fill="hsl(168 70% 40%)" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </QueryView>
    </>
  );
}
