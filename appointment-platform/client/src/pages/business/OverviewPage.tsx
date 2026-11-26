import { firstName } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Brain, CalendarCheck, Coins, Lock, Star, UserPlus, UserX } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState, PageHeader, QueryView, STATUS_COLOR, StatCard, StatusBadge } from '@/components/common';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/input';
import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@/components/ui/misc';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { BookingSheet } from '@/features/business/BookingSheet';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { api } from '@/services/api';
import type { Booking } from '@/types';
import { fmtShortDate, fmtTime, money, pct } from '@/utils/format';

interface Analytics {
  currency: string;
  kpis: { bookings: number; revenue: number; bookedValue: number; newCustomers: number; cancellationRate: number; noShowRate: number; rating: number; reviews: number; pending: number };
  status: Record<string, number>;
  series: Array<{ date: string; bookings: number; revenue: number }>;
  topServices: Array<{ name: string; bookings: number; value: number }>;
  staffLoad: Array<{ name: string; hours: number; bookings: number }>;
  heatmap: Array<{ day: number; hour: number; n: number }> | null;
  today: Booking[];
}

export function OverviewPage() {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  const { user } = useAuth();
  const { id, business, can, base } = useTenant();
  useDocumentTitle(t('overview.title'));
  const [days, setDays] = useState(30);
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['analytics', id, days], queryFn: () => api.get<Analytics>(`/businesses/${id}/analytics`, { days }) });
  const ai = useQuery({ queryKey: ['ai-insights', id], queryFn: () => api.get<{ risks: Array<{ booking: { _id: string; reference: string; start: string; customerName: string; serviceName: string }; score: number; level: string; reasons: string[] }>; recommendations: string[] }>(`/businesses/${id}/ai/insights`), enabled: can('analytics:read') });
  const tz = business.timezone;

  return (
    <>
      <PageHeader
        title={t('overview.greeting', { name: firstName(user?.name) })}
        description={business.name}
        actions={
          <NativeSelect value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-40" aria-label="Range">
            {[7, 30, 90, 365].map((d) => <option key={d} value={d}>{t('overview.range', { days: d })}</option>)}
          </NativeSelect>
        }
      />
      <QueryView query={q} skeleton={<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>}>
        {(d) => (
          <div className="space-y-6">
            {d.kpis.pending > 0 && (
              <Card className="flex flex-wrap items-center justify-between gap-3 border-amber-500/40 bg-amber-500/5 p-4">
                <p className="flex items-center gap-2 font-medium"><AlertTriangle className="h-5 w-5 text-amber-600" />{t('overview.pending', { count: d.kpis.pending })}</p>
                <Button size="sm" asChild><Link to={`${base}/bookings?tab=pending`}>{t('overview.review')}</Link></Button>
              </Card>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label={t('overview.kpiBookings')} value={d.kpis.bookings} icon={<CalendarCheck />} />
              {can('payments:read') && <StatCard label={t('overview.kpiRevenue')} value={money(d.kpis.revenue, d.currency)} hint={`${money(d.kpis.bookedValue, d.currency)} booked`} icon={<Coins />} tone="accent" />}
              <StatCard label={t('overview.kpiCustomers')} value={d.kpis.newCustomers} icon={<UserPlus />} tone="amber" />
              <StatCard label={t('overview.kpiNoShow')} value={pct(d.kpis.noShowRate)} hint={`${t('overview.kpiCancel')}: ${pct(d.kpis.cancellationRate)}`} icon={<UserX />} tone="rose" />
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <CardHeader><CardTitle>{t('overview.chartBookings')}</CardTitle></CardHeader>
                <CardContent className="h-72" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={d.series} margin={{ left: -16, right: 8 }}>
                      <defs>
                        <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(243 75% 58%)" stopOpacity={0.35} /><stop offset="100%" stopColor="hsl(243 75% 58%)" stopOpacity={0} /></linearGradient>
                        <linearGradient id="gR" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(168 70% 40%)" stopOpacity={0.3} /><stop offset="100%" stopColor="hsl(168 70% 40%)" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={(v: string) => fmtShortDate(v)} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} minTickGap={24} />
                      <YAxis yAxisId="l" allowDecimals={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="r" orientation="right" hide />
                      <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} labelFormatter={(v: string) => fmtShortDate(v)} formatter={(v: number, n: string) => (n === 'revenue' ? money(v, d.currency) : v)} />
                      <Area yAxisId="l" type="monotone" dataKey="bookings" stroke="hsl(243 75% 58%)" fill="url(#gB)" strokeWidth={2} name="bookings" />
                      {can('payments:read') && <Area yAxisId="r" type="monotone" dataKey="revenue" stroke="hsl(168 70% 40%)" fill="url(#gR)" strokeWidth={2} name="revenue" />}
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>{t('overview.today')}</CardTitle></CardHeader>
                <CardContent>
                  {d.today.length ? (
                    <ul className="space-y-2">
                      {d.today.map((b) => (
                        <li key={b._id}>
                          <button onClick={() => setOpen(b._id)} className="flex w-full items-center gap-3 rounded-xl p-2 text-start hover:bg-muted">
                            <span className="num w-14 shrink-0 text-sm font-semibold">{fmtTime(b.start, tz)}</span>
                            <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: (b.staff as { color?: string } | null)?.color ?? (b.service as { color?: string } | null)?.color ?? '#6366f1' }} />
                            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{b.snapshot.customerName}</span><span className="block truncate text-xs text-muted-foreground">{b.snapshot.serviceName}{b.snapshot.staffName ? ` · ${b.snapshot.staffName}` : ''}</span></span>
                            <StatusBadge status={b.status} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : <EmptyState title={t('overview.noToday')} className="py-8" />}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Card>
                <CardHeader><CardTitle>{t('overview.topServices')}</CardTitle></CardHeader>
                <CardContent className="h-64" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d.topServices} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <XAxis type="number" hide allowDecimals={false} />
                      <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={{ borderRadius: 12, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                      <Bar dataKey="bookings" fill="hsl(243 75% 58%)" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>{t('overview.statusBreakdown')}</CardTitle></CardHeader>
                <CardContent className="flex h-64 items-center gap-4" dir="ltr">
                  <ResponsiveContainer width="55%" height="100%">
                    <PieChart>
                      <Pie data={Object.entries(d.status).map(([k, v]) => ({ name: k, value: v }))} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={2}>
                        {Object.keys(d.status).map((k) => <Cell key={k} fill={STATUS_COLOR[k as keyof typeof STATUS_COLOR] ?? '#94a3b8'} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <ul className="space-y-1.5 text-sm">
                    {Object.entries(d.status).map(([k, v]) => <li key={k} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[k as keyof typeof STATUS_COLOR] }} />{tc(`status.${k}`)} <span className="num font-semibold">{v}</span></li>)}
                  </ul>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>{t('overview.staffLoad')}</CardTitle></CardHeader>
                <CardContent>
                  {d.staffLoad.length ? (
                    <ul className="space-y-3">
                      {d.staffLoad.map((s) => {
                        const max = Math.max(...d.staffLoad.map((x) => x.hours), 1);
                        return (
                          <li key={s.name}>
                            <div className="mb-1 flex justify-between text-sm"><span>{s.name}</span><span className="num text-muted-foreground">{s.hours}h</span></div>
                            <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-accent" style={{ width: `${(s.hours / max) * 100}%` }} /></div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : <p className="text-sm text-muted-foreground">—</p>}
                  <div className="mt-5 flex items-center gap-2 border-t pt-4 text-sm"><Star className="h-4 w-4 fill-amber-400 text-amber-400" /><span className="num font-semibold">{d.kpis.rating || '—'}</span><span className="text-muted-foreground">· {tc('common.reviews', { count: d.kpis.reviews })}</span></div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>{t('overview.heatmap')}</CardTitle></CardHeader>
                <CardContent>
                  {d.heatmap ? <Heatmap cells={d.heatmap} /> : (
                    <div className="flex flex-col items-center gap-3 rounded-2xl bg-muted/50 py-10 text-center text-sm text-muted-foreground">
                      <Lock className="h-5 w-5" />{t('overview.heatmapLocked')}
                      {can('subscription:manage') && <Button size="sm" variant="outline" asChild><Link to={`${base}/billing`}>{t('limits.upgrade')}</Link></Button>}
                    </div>
                  )}
                </CardContent>
              </Card>
              {can('analytics:read') && (
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><Brain className="h-5 w-5 text-primary" />{t('overview.ai')}</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {ai.isLoading ? <Skeleton className="h-32" /> : ai.data && (
                      <>
                        <div>
                          <p className="mb-2 text-sm font-semibold">{t('overview.aiRisk')}</p>
                          {ai.data.risks.filter((r) => r.level !== 'low').length ? (
                            <ul className="space-y-2">
                              {ai.data.risks.filter((r) => r.level !== 'low').slice(0, 5).map((r) => (
                                <li key={r.booking._id}>
                                  <button className="flex w-full items-center justify-between gap-3 rounded-xl border p-2.5 text-start text-sm hover:bg-muted" onClick={() => setOpen(r.booking._id)}>
                                    <span className="min-w-0"><span className="block truncate font-medium">{r.booking.customerName} · {r.booking.serviceName}</span><span className="block truncate text-xs text-muted-foreground">{fmtShortDate(r.booking.start, tz)} {fmtTime(r.booking.start, tz)} · {r.reasons.join(', ')}</span></span>
                                    <Badge tone={r.level === 'high' ? 'danger' : 'warning'} className="num">{Math.round(r.score * 100)}%</Badge>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : <p className="text-sm text-muted-foreground">{t('overview.aiNone')}</p>}
                        </div>
                        {ai.data.recommendations.length > 0 && (
                          <div>
                            <p className="mb-2 text-sm font-semibold">{t('overview.aiRecommendations')}</p>
                            <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground">{ai.data.recommendations.map((r) => <li key={r}>{r}</li>)}</ul>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </QueryView>
      <BookingSheet bookingId={open} onOpenChange={(o) => !o && setOpen(null)} />
    </>
  );
}

function Heatmap({ cells }: { cells: Array<{ day: number; hour: number; n: number }> }) {
  const { t } = useTranslation();
  const hours = Array.from({ length: 16 }, (_, i) => i + 6);
  const max = Math.max(1, ...cells.map((c) => c.n));
  return (
    <div className="overflow-x-auto" dir="ltr">
      <table className="w-full border-separate border-spacing-1 text-[10px]">
        <thead><tr><th />{hours.map((h) => <th key={h} className="num font-normal text-muted-foreground">{h}</th>)}</tr></thead>
        <tbody>
          {[0, 1, 2, 3, 4, 5, 6].map((d) => (
            <tr key={d}>
              <th className="pe-1 text-end font-normal text-muted-foreground">{t(`days.${d}`).slice(0, 3)}</th>
              {hours.map((h) => {
                const n = cells.find((c) => c.day === d && c.hour === h)?.n ?? 0;
                return <td key={h} title={`${n}`} className="h-6 min-w-[18px] rounded" style={{ background: n ? `hsl(243 75% 58% / ${0.12 + (n / max) * 0.88})` : 'hsl(var(--muted))' }} />;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
