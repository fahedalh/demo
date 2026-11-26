import { DateTime } from 'luxon';
import i18n from '@/i18n';

const loc = () => (i18n.language === 'ar' ? 'ar' : 'en');

export function money(amount: number | undefined | null, currency = 'USD') {
  const value = amount ?? 0;
  try {
    return new Intl.NumberFormat(loc() === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { style: 'currency', currency, maximumFractionDigits: value % 1 === 0 ? 0 : 2 }).format(value);
  } catch {
    return `${currency} ${value}`;
  }
}

export function dt(iso: string | Date | undefined | null, tz?: string) {
  if (!iso) return DateTime.invalid('empty');
  const d = typeof iso === 'string' ? DateTime.fromISO(iso) : DateTime.fromJSDate(iso);
  return (tz ? d.setZone(tz) : d).setLocale(loc());
}

export const fmtDate = (iso: string | Date | undefined | null, tz?: string) => dt(iso, tz).toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY);
export const fmtShortDate = (iso: string | Date | undefined | null, tz?: string) => dt(iso, tz).toLocaleString({ month: 'short', day: 'numeric' });
export const fmtTime = (iso: string | Date | undefined | null, tz?: string) => dt(iso, tz).toLocaleString(DateTime.TIME_SIMPLE);
export const fmtDateTime = (iso: string | Date | undefined | null, tz?: string) => `${fmtDate(iso, tz)} · ${fmtTime(iso, tz)}`;
export const fromNow = (iso: string | Date | undefined | null) => dt(iso).toRelative() ?? '';
export const fmtDuration = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}` : `${min}m`);
export const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
