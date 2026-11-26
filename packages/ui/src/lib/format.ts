import { useTranslation } from 'react-i18next';
import { formatDistance, formatDuration, formatMoney } from '@masar/shared';

/** Locale-aware formatters bound to the current UI language. */
export function useFormat() {
  const { i18n } = useTranslation();
  const lng = i18n.language === 'ar' ? 'ar' : 'en';
  const locale = lng === 'ar' ? 'ar-AE' : 'en-GB';
  return {
    lng,
    money: (minor: number, currency = 'AED') => formatMoney(minor, currency, lng),
    distance: (m: number) => formatDistance(m, lng),
    duration: (s: number) => formatDuration(s, lng),
    date: (d: string | Date, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) =>
      new Intl.DateTimeFormat(locale, opts).format(new Date(d)),
    dateTime: (d: string | Date) =>
      new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d)),
    time: (d: string | Date) => new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(new Date(d)),
    number: (n: number, digits = 0) =>
      new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(n),
    relative: (d: string | Date) => {
      const diff = (new Date(d).getTime() - Date.now()) / 1000;
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
      const abs = Math.abs(diff);
      if (abs < 60) return rtf.format(Math.round(diff), 'second');
      if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
      if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
      return rtf.format(Math.round(diff / 86400), 'day');
    },
  };
}
