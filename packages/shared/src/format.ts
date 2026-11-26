/** Locale-aware formatting helpers (usable on server for receipts and in the browser). */
export function formatMoney(minor: number, currency = 'AED', locale = 'en'): string {
  try {
    return new Intl.NumberFormat(locale === 'ar' ? 'ar-AE' : 'en-AE', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

export function formatDistance(meters: number, locale = 'en'): string {
  const ar = locale === 'ar';
  if (meters < 1000) return `${Math.round(meters)} ${ar ? 'م' : 'm'}`;
  const km = new Intl.NumberFormat(ar ? 'ar-AE' : 'en', { maximumFractionDigits: 1 }).format(meters / 1000);
  return `${km} ${ar ? 'كم' : 'km'}`;
}

export function formatDuration(seconds: number, locale = 'en'): string {
  const ar = locale === 'ar';
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} ${ar ? 'د' : 'min'}`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return ar ? `${h} س ${m} د` : `${h} h ${m} min`;
}
