import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { DateTime } from 'luxon';
import { useMemo, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Paginated, WeeklySchedule } from '@bookly/shared';
import { ErrorState, PageHeader, STATUS_COLOR } from '@/components/common';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/input';
import { Avatar, Card, Skeleton, Tabs, TabsList, TabsTrigger } from '@/components/ui/misc';
import { useTenant } from '@/contexts/TenantContext';
import { BookingSheet } from '@/features/business/BookingSheet';
import { useTenantList } from '@/features/business/hooks';
import { NewBookingDialog } from '@/features/business/NewBookingDialog';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { cn } from '@/lib/utils';
import { api, errorMessage } from '@/services/api';
import type { Booking, Branch, Staff } from '@/types';

type View = 'day' | 'week' | 'month';
const HOUR_PX = 56;
const SNAP = 15; // minutes

export function CalendarPage() {
  const { t, i18n } = useTranslation('dashboard');
  const { id, business, can, staffId: myStaff } = useTenant();
  useDocumentTitle(t('calendar.title'));
  const tz = business.timezone;
  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  const qc = useQueryClient();
  const [view, setView] = useState<View>(() => (window.innerWidth < 768 ? 'day' : 'week'));
  const [cursor, setCursor] = useState<DateTime>(() => DateTime.now().setZone(tz).startOf('day'));
  const [staffFilter, setStaffFilter] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const canMove = can('bookings:manage', 'bookings:own');

  const staff = useTenantList<Staff>('staff', { active: 'true' });
  const branches = useTenantList<Branch>('branches', { active: 'true' });
  const hours: WeeklySchedule = branches.data?.items[0]?.workingHours ?? [];

  const range = useMemo(() => {
    if (view === 'day') return { from: cursor, to: cursor.plus({ days: 1 }) };
    if (view === 'week') {
      const start = cursor.minus({ days: cursor.weekday % 7 }); // Sunday-first week
      return { from: start, to: start.plus({ days: 7 }) };
    }
    const start = cursor.startOf('month');
    const gridStart = start.minus({ days: start.weekday % 7 });
    return { from: gridStart, to: gridStart.plus({ days: 42 }) };
  }, [view, cursor]);

  const q = useQuery({
    queryKey: ['bookings', id, 'calendar', range.from.toISO(), range.to.toISO(), staffFilter],
    queryFn: () => api.get<Paginated<Booking>>(`/businesses/${id}/bookings`, { from: range.from.toUTC().toISO()!, to: range.to.toUTC().toISO()!, status: 'pending,confirmed,completed,no_show', staff: staffFilter || undefined, limit: 500, sort: 'start' }),
    placeholderData: keepPreviousData,
  });
  const bookings = q.data?.items ?? [];

  // Visible hour window from branch hours (fallback 7–21).
  const [minH, maxH] = useMemo(() => {
    const all = hours.flatMap((d) => (d.enabled ? d.intervals : []));
    if (!all.length) return [7, 21];
    const lo = Math.min(...all.map((i) => Number(i.start.slice(0, 2))));
    const hi = Math.max(...all.map((i) => Math.ceil(Number(i.end.slice(0, 2)) + Number(i.end.slice(3)) / 60)));
    return [Math.max(0, lo - 1), Math.min(24, hi + 1)];
  }, [hours]);

  async function move(b: Booking, start: DateTime, staffTarget?: string) {
    if (start.toMillis() === DateTime.fromISO(b.start).toMillis() && (!staffTarget || staffTarget === b.staff?._id)) return;
    try {
      await api.post(`/businesses/${id}/bookings/${b._id}/reschedule`, { start: start.toUTC().toISO(), staff: staffTarget && staffTarget !== b.staff?._id ? staffTarget : undefined });
      toast.success(t('calendar.moved'));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      void qc.invalidateQueries({ queryKey: ['bookings', id] });
    }
  }

  const step = (dir: 1 | -1) => setCursor((c) => (view === 'day' ? c.plus({ days: dir }) : view === 'week' ? c.plus({ weeks: dir }) : c.plus({ months: dir })));
  const title = view === 'month' ? cursor.setLocale(locale).toFormat('LLLL yyyy') : view === 'week' ? `${range.from.setLocale(locale).toFormat('d LLL')} – ${range.to.minus({ days: 1 }).setLocale(locale).toFormat('d LLL yyyy')}` : cursor.setLocale(locale).toFormat('cccc, d LLLL yyyy');

  // Day view columns: staff members (or a single column for resource/counter businesses).
  const visibleStaff = (staff.data?.items ?? []).filter((s) => (!staffFilter || s._id === staffFilter) && (can('bookings:read') || s._id === myStaff));
  const dayColumns: Array<{ key: string; label: string; staff?: Staff }> = visibleStaff.length ? visibleStaff.map((s) => ({ key: s._id, label: s.name, staff: s })) : [{ key: 'all', label: business.name }];

  return (
    <>
      <PageHeader
        title={t('calendar.title')}
        description={t('calendar.dragHint')}
        actions={can('bookings:manage', 'bookings:own') && <Button onClick={() => setCreating(true)}><Plus />{t('calendar.newBooking')}</Button>}
      />
      <Card className="mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => step(-1)} aria-label="Previous"><ChevronLeft className="rtl:rotate-180" /></Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(DateTime.now().setZone(tz).startOf('day'))}>{t('calendar.today')}</Button>
          <Button variant="outline" size="icon-sm" onClick={() => step(1)} aria-label="Next"><ChevronRight className="rtl:rotate-180" /></Button>
        </div>
        <h2 className="text-base font-semibold">{title}</h2>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          {can('bookings:read') && (staff.data?.items.length ?? 0) > 0 && (
            <NativeSelect value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} className="h-9 w-44" aria-label={t('calendar.allStaff')}>
              <option value="">{t('calendar.allStaff')}</option>
              {staff.data!.items.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </NativeSelect>
          )}
          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList className="h-9">
              <TabsTrigger value="day">{t('calendar.day')}</TabsTrigger>
              <TabsTrigger value="week">{t('calendar.week')}</TabsTrigger>
              <TabsTrigger value="month">{t('calendar.month')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </Card>

      {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.isLoading ? <Skeleton className="h-[600px]" /> : view === 'month' ? (
        <MonthGrid from={range.from} cursor={cursor} bookings={bookings} tz={tz} locale={locale} canMove={canMove} onOpen={setOpen} onDay={(d) => { setCursor(d); setView('day'); }} onMove={move} />
      ) : (
        <TimeGrid
          columns={view === 'day' ? dayColumns.map((c) => ({ ...c, date: cursor })) : Array.from({ length: 7 }, (_, i) => { const d = range.from.plus({ days: i }); return { key: d.toISODate()!, label: d.setLocale(locale).toFormat('ccc d'), date: d }; })}
          bookings={bookings}
          tz={tz}
          minH={minH}
          maxH={maxH}
          hours={hours}
          canMove={canMove}
          byStaff={view === 'day' && visibleStaff.length > 0}
          onOpen={setOpen}
          onMove={move}
        />
      )}

      <BookingSheet bookingId={open} onOpenChange={(o) => !o && setOpen(null)} />
      <NewBookingDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

function colorFor(b: Booking) {
  return b.staff?.color ?? b.service?.color ?? '#6366f1';
}

function TimeGrid({ columns, bookings, tz, minH, maxH, hours, canMove, byStaff, onOpen, onMove }: {
  columns: Array<{ key: string; label: string; date: DateTime; staff?: Staff }>;
  bookings: Booking[];
  tz: string;
  minH: number;
  maxH: number;
  hours: WeeklySchedule;
  canMove: boolean;
  byStaff: boolean;
  onOpen: (id: string) => void;
  onMove: (b: Booking, start: DateTime, staff?: string) => void;
}) {
  const { t } = useTranslation('dashboard');
  const [dragOver, setDragOver] = useState<string | null>(null);
  const height = (maxH - minH) * HOUR_PX;
  const now = DateTime.now().setZone(tz);

  const onDrop = (e: DragEvent<HTMLDivElement>, col: (typeof columns)[number]) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData('text/booking');
    const offset = Number(e.dataTransfer.getData('text/offset') || 0);
    const b = bookings.find((x) => x._id === id);
    if (!b) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top - offset;
    const minutes = Math.max(0, Math.round(((y / HOUR_PX) * 60) / SNAP) * SNAP);
    const start = col.date.startOf('day').plus({ hours: minH, minutes });
    onMove(b, start, byStaff ? col.staff?._id : undefined);
  };

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[640px]" style={{ display: 'grid', gridTemplateColumns: `56px repeat(${columns.length}, minmax(140px, 1fr))` }}>
          <div className="sticky top-0 z-10 border-b bg-card" />
          {columns.map((c) => {
            const isToday = c.date.hasSame(now, 'day') && !byStaff;
            return (
              <div key={c.key} className={cn('sticky top-0 z-10 flex items-center justify-center gap-2 border-b border-s bg-card px-2 py-3 text-sm font-semibold', isToday && 'text-primary')}>
                {c.staff && <Avatar name={c.staff.name} color={c.staff.color} className="h-6 w-6 text-[9px]" />}
                <span className="truncate">{c.label}</span>
              </div>
            );
          })}
          {/* hour labels */}
          <div className="relative" style={{ height }} dir="ltr">
            {Array.from({ length: maxH - minH }, (_, i) => (
              <span key={i} className="num absolute end-2 -translate-y-1/2 text-[11px] text-muted-foreground" style={{ top: i * HOUR_PX }}>{String(minH + i).padStart(2, '0')}:00</span>
            ))}
          </div>
          {columns.map((c) => {
            const day = c.date.weekday % 7;
            const open = hours.find((h) => h.day === day);
            const colBookings = bookings.filter((b) => {
              const s = DateTime.fromISO(b.start).setZone(tz);
              return s.hasSame(c.date, 'day') && (!byStaff || b.staff?._id === c.staff?._id);
            });
            return (
              <div
                key={c.key}
                className={cn('relative border-s transition-colors', dragOver === c.key && 'bg-primary/5')}
                style={{ height, backgroundImage: `repeating-linear-gradient(to bottom, hsl(var(--border)) 0 1px, transparent 1px ${HOUR_PX / 2}px)` }}
                onDragOver={(e) => { if (canMove) { e.preventDefault(); setDragOver(c.key); } }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => onDrop(e, c)}
              >
                {/* closed shading */}
                {hours.length > 0 && (!open?.enabled ? (
                  <div className="absolute inset-0 bg-muted/60" aria-label={t('calendar.closed')} />
                ) : (
                  closedBlocks(open.intervals, minH, maxH).map(([a, b2], i) => <div key={i} className="absolute inset-x-0 bg-muted/60" style={{ top: (a - minH * 60) * (HOUR_PX / 60), height: (b2 - a) * (HOUR_PX / 60) }} />)
                ))}
                {c.date.hasSame(now, 'day') && now.hour >= minH && now.hour < maxH && (
                  <div className="absolute inset-x-0 z-[5] h-0.5 bg-rose-500" style={{ top: ((now.hour - minH) * 60 + now.minute) * (HOUR_PX / 60) }} aria-hidden />
                )}
                {layout(colBookings, tz).map(({ b, col, cols }) => {
                  const s = DateTime.fromISO(b.start).setZone(tz);
                  const e = DateTime.fromISO(b.end).setZone(tz);
                  const top = ((s.hour - minH) * 60 + s.minute) * (HOUR_PX / 60);
                  const h = Math.max(22, e.diff(s, 'minutes').minutes * (HOUR_PX / 60) - 2);
                  const color = colorFor(b);
                  return (
                    <button
                      key={b._id}
                      draggable={canMove && ['pending', 'confirmed'].includes(b.status)}
                      onDragStart={(ev) => {
                        ev.dataTransfer.setData('text/booking', b._id);
                        ev.dataTransfer.setData('text/offset', String(ev.clientY - ev.currentTarget.getBoundingClientRect().top));
                        ev.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={() => onOpen(b._id)}
                      className={cn('absolute z-[6] overflow-hidden rounded-lg border-s-[3px] px-2 py-1 text-start text-xs shadow-sm transition-shadow hover:z-10 hover:shadow-lift', b.status === 'pending' && 'border-dashed', ['completed', 'no_show'].includes(b.status) && 'opacity-70')}
                      style={{ top, height: h, insetInlineStart: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)`, background: `${color}22`, borderColor: color }}
                      title={`${b.snapshot.customerName} · ${b.snapshot.serviceName}`}
                    >
                      <span className="num block font-semibold" style={{ color }}>{s.toFormat('HH:mm')}</span>
                      <span className="block truncate font-medium text-foreground">{b.snapshot.customerName}</span>
                      {h > 44 && <span className="block truncate text-muted-foreground">{b.snapshot.serviceName}</span>}
                      <span className="absolute end-1 top-1 h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[b.status] }} aria-label={b.status} />
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function closedBlocks(intervals: Array<{ start: string; end: string }>, minH: number, maxH: number): Array<[number, number]> {
  const m = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
  const sorted = [...intervals].sort((a, b) => m(a.start) - m(b.start));
  const out: Array<[number, number]> = [];
  let cur = minH * 60;
  for (const iv of sorted) {
    if (m(iv.start) > cur) out.push([cur, m(iv.start)]);
    cur = Math.max(cur, m(iv.end));
  }
  if (cur < maxH * 60) out.push([cur, maxH * 60]);
  return out;
}

/** Side-by-side layout for overlapping bookings in one column. */
function layout(list: Booking[], tz: string) {
  const items = list.map((b) => ({ b, s: DateTime.fromISO(b.start).setZone(tz).toMillis(), e: DateTime.fromISO(b.end).setZone(tz).toMillis(), col: 0, cols: 1 })).sort((a, z) => a.s - z.s);
  let group: typeof items = [];
  let groupEnd = 0;
  const flush = () => {
    const ends: number[] = [];
    for (const it of group) {
      let c = ends.findIndex((e) => e <= it.s);
      if (c < 0) c = ends.push(0) - 1;
      ends[c] = it.e;
      it.col = c;
    }
    group.forEach((it) => (it.cols = ends.length));
    group = [];
  };
  for (const it of items) {
    if (group.length && it.s >= groupEnd) flush();
    group.push(it);
    groupEnd = Math.max(groupEnd, it.e);
  }
  flush();
  return items;
}

function MonthGrid({ from, cursor, bookings, tz, locale, canMove, onOpen, onDay, onMove }: { from: DateTime; cursor: DateTime; bookings: Booking[]; tz: string; locale: string; canMove: boolean; onOpen: (id: string) => void; onDay: (d: DateTime) => void; onMove: (b: Booking, start: DateTime) => void }) {
  const { t } = useTranslation('dashboard');
  const tc = useTranslation().t;
  const now = DateTime.now().setZone(tz);
  const [over, setOver] = useState<string | null>(null);
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-semibold text-muted-foreground">
        {[0, 1, 2, 3, 4, 5, 6].map((d) => <div key={d} className="py-2">{tc(`days.${d}`).slice(0, 3)}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: 42 }, (_, i) => {
          const d = from.plus({ days: i });
          const key = d.toISODate()!;
          const list = bookings.filter((b) => DateTime.fromISO(b.start).setZone(tz).hasSame(d, 'day'));
          return (
            <div
              key={key}
              className={cn('min-h-[110px] border-b border-s p-1.5', !d.hasSame(cursor, 'month') && 'bg-muted/30 text-muted-foreground', over === key && 'bg-primary/5')}
              onDragOver={(e) => { if (canMove) { e.preventDefault(); setOver(key); } }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const b = bookings.find((x) => x._id === e.dataTransfer.getData('text/booking'));
                if (!b) return;
                const s = DateTime.fromISO(b.start).setZone(tz);
                onMove(b, d.set({ hour: s.hour, minute: s.minute }));
              }}
            >
              <button onClick={() => onDay(d)} className={cn('num mb-1 flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold hover:bg-muted', d.hasSame(now, 'day') && 'bg-primary text-primary-foreground hover:bg-primary')}>{d.setLocale(locale).toFormat('d')}</button>
              <div className="space-y-1">
                {list.slice(0, 3).map((b) => (
                  <button
                    key={b._id}
                    draggable={canMove && ['pending', 'confirmed'].includes(b.status)}
                    onDragStart={(e) => e.dataTransfer.setData('text/booking', b._id)}
                    onClick={() => onOpen(b._id)}
                    className="flex w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-start text-[11px]"
                    style={{ background: `${colorFor(b)}22` }}
                  >
                    <span className="num font-semibold" style={{ color: colorFor(b) }}>{DateTime.fromISO(b.start).setZone(tz).toFormat('HH:mm')}</span>
                    <span className="truncate text-foreground">{b.snapshot.customerName}</span>
                  </button>
                ))}
                {list.length > 3 && <button onClick={() => onDay(d)} className="px-1.5 text-[11px] font-medium text-primary hover:underline">{t('calendar.more', { count: list.length - 3 })}</button>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
