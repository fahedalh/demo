import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  BadgeCheck,
  Car,
  CheckCircle2,
  CircleDollarSign,
  LifeBuoy,
  Users,
  XCircle,
} from 'lucide-react';
import type { Paginated, RideDTO } from '@masar/shared';
import {
  api,
  Card,
  RideStatusBadge,
  Skeleton,
  StatCard,
  Tabs,
  TabsList,
  TabsTrigger,
  useFormat,
} from '@masar/ui';
import { PageHeader } from '../components/DataTable';
import { useCan } from '../lib/hooks';

interface Overview {
  passengers: number;
  drivers: number;
  approvedDrivers: number;
  pendingDrivers: number;
  onlineDrivers: number;
  busyDrivers: number;
  activeRides: number;
  completedRides: number;
  cancelledRides: number;
  totalRevenue: number;
  platformCommission: number;
  today: { revenue: number; commission: number; rides: number };
  openTickets: number;
  currency: string;
}
interface Series {
  period: string;
  series: {
    date: string;
    rides: number;
    completed: number;
    cancelled: number;
    revenue: number;
    commission: number;
    passengers: number;
    drivers: number;
  }[];
  byCategory: { name: string; rides: number }[];
}

const tooltipStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 12,
  fontSize: 12,
};

export function OverviewPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const can = useCan();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const o = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => api.get<Overview>('/admin/stats/overview'),
    refetchInterval: 20_000,
  });
  const s = useQuery({
    queryKey: ['admin', 'series', period],
    queryFn: () => api.get<Series>(`/admin/stats/timeseries?period=${period}`),
  });
  const recent = useQuery({
    queryKey: ['admin', 'recent-rides'],
    queryFn: () => api.get<Paginated<RideDTO>>('/admin/rides?pageSize=8'),
    enabled: can('rides'),
    refetchInterval: 20_000,
  });
  const d = o.data;
  const rtl = document.documentElement.dir === 'rtl';
  const label = (date: string) =>
    f.date(date, period === 'monthly' ? { month: 'short' } : { day: 'numeric', month: 'short' });
  const series = s.data?.series.map((x) => ({
    ...x,
    label: label(x.date),
    revenueMajor: x.revenue / 100,
    commissionMajor: x.commission / 100,
  }));

  return (
    <div>
      <PageHeader title={t('overview.title')} subtitle={f.date(new Date(), { dateStyle: 'full' })} />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {!d ? (
          Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-32" />)
        ) : (
          <>
            <StatCard
              label={t('overview.revenue')}
              value={f.money(d.totalRevenue)}
              hint={`${t('overview.todayRevenue')}: ${f.money(d.today.revenue)}`}
              icon={CircleDollarSign}
            />
            <StatCard
              label={t('overview.commission')}
              value={f.money(d.platformCommission)}
              hint={`${t('overview.todayRevenue')}: ${f.money(d.today.commission)}`}
              icon={CircleDollarSign}
            />
            <StatCard
              label={t('overview.activeRides')}
              value={d.activeRides}
              hint={`${t('common.today')}: ${d.today.rides}`}
              icon={Activity}
            />
            <StatCard
              label={t('overview.onlineDrivers')}
              value={d.onlineDrivers}
              hint={t('overview.busy', { count: d.busyDrivers })}
              icon={Car}
            />
            <StatCard
              label={t('overview.completed')}
              value={f.number(d.completedRides)}
              icon={CheckCircle2}
            />
            <StatCard label={t('overview.cancelled')} value={f.number(d.cancelledRides)} icon={XCircle} />
            <StatCard
              label={t('overview.passengers')}
              value={f.number(d.passengers)}
              hint={`${t('overview.drivers')}: ${d.drivers}`}
              icon={Users}
            />
            <button onClick={() => navigate('/drivers')} className="text-start">
              <StatCard
                label={t('overview.pending')}
                value={d.pendingDrivers}
                hint={`${t('overview.tickets')}: ${d.openTickets}`}
                icon={d.pendingDrivers ? BadgeCheck : LifeBuoy}
                className={d.pendingDrivers ? 'ring-2 ring-accent/40' : ''}
              />
            </button>
          </>
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <Tabs value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
          <TabsList>
            <TabsTrigger value="daily">{t('overview.daily')}</TabsTrigger>
            <TabsTrigger value="weekly">{t('overview.weekly')}</TabsTrigger>
            <TabsTrigger value="monthly">{t('overview.monthly')}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">{t('overview.revenueChart')}</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={series} margin={{ left: -10, right: 8 }}>
                <defs>
                  <linearGradient id="rev" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#06C167" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#06C167" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  stroke="var(--muted)"
                  reversed={rtl}
                  minTickGap={16}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  stroke="var(--muted)"
                  orientation={rtl ? 'right' : 'left'}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number, n: string) => [
                    f.money(Math.round(v * 100)),
                    n === 'revenueMajor' ? t('overview.revenue') : t('overview.commission'),
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="revenueMajor"
                  stroke="#06C167"
                  strokeWidth={2.5}
                  fill="url(#rev)"
                />
                <Area
                  type="monotone"
                  dataKey="commissionMajor"
                  stroke="var(--fg)"
                  strokeWidth={1.5}
                  fill="transparent"
                  strokeDasharray="4 4"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">{t('overview.ridesChart')}</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={series} margin={{ left: -20, right: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  stroke="var(--muted)"
                  reversed={rtl}
                  minTickGap={16}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  stroke="var(--muted)"
                  allowDecimals={false}
                  orientation={rtl ? 'right' : 'left'}
                />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-2)' }} />
                <Bar
                  dataKey="completed"
                  stackId="a"
                  fill="var(--fg)"
                  name={t('overview.completed')}
                  radius={[0, 0, 0, 0]}
                  maxBarSize={28}
                />
                <Bar
                  dataKey="cancelled"
                  stackId="a"
                  fill="#e11d48"
                  name={t('overview.cancelled')}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_2fr]">
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">{t('overview.byCategory')}</h2>
          <div className="space-y-3">
            {s.data?.byCategory.map((c) => {
              const max = Math.max(1, ...(s.data?.byCategory.map((x) => x.rides) ?? [1]));
              return (
                <div key={c.name}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{c.name}</span>
                    <span className="tabular font-semibold">{c.rides}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${(c.rides / max) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        {can('rides') && (
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">{t('overview.recent')}</h2>
              <Link to="/rides" className="text-sm font-medium text-muted hover:text-fg">
                {t('actions.viewAll')}
              </Link>
            </div>
            <div className="divide-y divide-line">
              {recent.data?.items.map((r) => (
                <Link
                  key={r.id}
                  to={`/rides/${r.id}`}
                  className="flex items-center gap-3 py-2.5 text-sm hover:bg-surface-2/50"
                >
                  <span className="w-24 shrink-0 font-mono text-xs">{r.code}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {r.pickup.address.split(',')[0]} → {r.dropoff.address.split(',')[0]}
                  </span>
                  <span className="hidden w-28 text-xs text-muted md:block">{f.relative(r.createdAt)}</span>
                  <RideStatusBadge status={r.status} scheduled={!!r.scheduledAt} />
                  <span className="tabular w-24 text-end font-semibold">
                    {f.money(r.finalFare ?? r.estimatedFare, r.currency)}
                  </span>
                </Link>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
