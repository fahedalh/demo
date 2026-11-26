import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { DateTime } from 'luxon';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorState } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import { api } from '@/services/api';
import type { Slot } from '@/types';

interface Props {
  /** `/public/businesses/:slug` or `/businesses/:id/bookings` */
  base: string;
  service: string;
  staff?: string;
  branch?: string;
  attendees?: number;
  exclude?: string;
  timezone: string;
  value?: Slot | null;
  onChange: (slot: Slot | null, date: string) => void;
  onNoSlots?: (date: string) => void;
  /** Pre-select a local date (YYYY-MM-DD), e.g. from a calendar click. */
  initialDate?: string;
}

const PAGE = 14;

export function SlotPicker({ base, service, staff, branch, attendees, exclude, timezone, value, onChange, onNoSlots, initialDate }: Props) {
  const { t, i18n } = useTranslation();
  const today = DateTime.now().setZone(timezone).startOf('day');
  const initial = initialDate ? DateTime.fromISO(initialDate, { zone: timezone }).startOf('day') : null;
  const [from, setFrom] = useState(initial && initial > today ? initial : today);
  const [date, setDate] = useState<string | null>(initial && initial >= today ? initialDate! : null);
  const params = { service, staff, branch, attendees, exclude };

  const days = useQuery({
    queryKey: ['availability-days', base, params, from.toISODate()],
    queryFn: () => api.get<{ days: Array<{ date: string; slots: number }> }>(`${base}/availability/days`, { ...params, from: from.toISODate(), days: PAGE }),
  });

  // Auto-select the first day with availability.
  useEffect(() => {
    if (!date && days.data) {
      const first = days.data.days.find((d) => d.slots > 0);
      setDate(first?.date ?? days.data.days[0]?.date ?? null);
    }
  }, [days.data, date]);

  const slots = useQuery({
    queryKey: ['availability', base, params, date],
    queryFn: () => api.get<{ slots: Slot[]; timezone: string }>(`${base}/availability`, { ...params, date: date! }),
    enabled: !!date,
  });

  useEffect(() => {
    if (date && slots.data && slots.data.slots.length === 0) onNoSlots?.(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots.data, date]);

  const groups = useMemo(() => {
    const out: Record<'morning' | 'afternoon' | 'evening', Slot[]> = { morning: [], afternoon: [], evening: [] };
    for (const s of slots.data?.slots ?? []) {
      const h = DateTime.fromISO(s.start).setZone(timezone).hour;
      out[h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'].push(s);
    }
    return out;
  }, [slots.data, timezone]);

  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  const groupLabels = locale === 'ar' ? { morning: 'صباحاً', afternoon: 'ظهراً', evening: 'مساءً' } : { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">{from.setLocale(locale).toFormat('LLLL yyyy')}</p>
          <div className="flex gap-1">
            <Button variant="outline" size="icon-sm" disabled={from <= today} onClick={() => setFrom(from.minus({ days: PAGE }) < today ? today : from.minus({ days: PAGE }))} aria-label={t('common.previous')}>
              <ChevronLeft className="rtl:rotate-180" />
            </Button>
            <Button variant="outline" size="icon-sm" onClick={() => setFrom(from.plus({ days: PAGE }))} aria-label={t('common.next')}>
              <ChevronRight className="rtl:rotate-180" />
            </Button>
          </div>
        </div>
        {days.error ? (
          <ErrorState error={days.error} onRetry={() => days.refetch()} />
        ) : (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 scrollbar-thin" role="listbox" aria-label={t('booking.chooseDate')}>
            {days.isLoading
              ? Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-20 w-16 shrink-0" />)
              : days.data?.days.map((d) => {
                  const dd = DateTime.fromISO(d.date).setLocale(locale);
                  const selected = d.date === date;
                  const none = d.slots === 0;
                  return (
                    <button
                      key={d.date}
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        setDate(d.date);
                        onChange(null, d.date);
                      }}
                      className={cn(
                        'flex w-16 shrink-0 flex-col items-center rounded-2xl border px-2 py-2.5 text-center transition-all',
                        selected ? 'border-brand bg-brand text-white shadow-lift' : 'hover:border-brand/50 hover:bg-muted',
                        none && !selected && 'opacity-45',
                      )}
                    >
                      <span className="text-[11px] font-medium uppercase">{dd.toFormat('ccc')}</span>
                      <span className="num text-lg font-bold">{dd.toFormat('d')}</span>
                      <span className={cn('mt-0.5 h-1.5 w-1.5 rounded-full', none ? 'bg-transparent' : selected ? 'bg-white' : 'bg-emerald-500')} aria-hidden />
                    </button>
                  );
                })}
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{t('booking.chooseTime')}</p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" />{t('common.timezoneNote', { tz: timezone })}</p>
        </div>
        {slots.isLoading || !date ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
        ) : slots.error ? (
          <ErrorState error={slots.error} onRetry={() => slots.refetch()} />
        ) : !slots.data?.slots.length ? (
          <div className="rounded-2xl border border-dashed p-6 text-center">
            <p className="font-medium">{t('booking.noSlots')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('booking.noSlotsHint')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {(Object.keys(groups) as Array<keyof typeof groups>).map((g) =>
              groups[g].length ? (
                <div key={g}>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">{groupLabels[g]}</p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {groups[g].map((s) => {
                      const selected = value?.start === s.start;
                      return (
                        <button
                          key={s.start}
                          onClick={() => onChange(s, date)}
                          aria-pressed={selected}
                          className={cn('num rounded-xl border px-2 py-2.5 text-sm font-semibold transition-all', selected ? 'border-brand bg-brand text-white shadow-lift' : 'hover:border-brand hover:text-brand')}
                        >
                          {DateTime.fromISO(s.start).setZone(timezone).setLocale(locale).toLocaleString(DateTime.TIME_SIMPLE)}
                          {s.remaining > 1 && <span className="block text-[10px] font-medium opacity-80">{t('booking.seatsLeft', { count: s.remaining })}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null,
            )}
          </div>
        )}
      </div>
    </div>
  );
}
