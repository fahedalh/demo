import { describe, expect, it } from 'vitest';
import arCommon from './locales/ar/common.json';
import arDashboard from './locales/ar/dashboard.json';
import enCommon from './locales/en/common.json';
import enDashboard from './locales/en/dashboard.json';

function keys(obj: unknown, prefix = ''): string[] {
  if (Array.isArray(obj)) return [`${prefix}[${obj.length}]`, ...obj.flatMap((v, i) => keys(v, `${prefix}[${i}]`))];
  if (obj && typeof obj === 'object') return Object.entries(obj).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
  return [prefix];
}

describe('translations', () => {
  it('Arabic has exactly the same keys as English (common)', () => {
    expect(keys(arCommon).sort()).toEqual(keys(enCommon).sort());
  });
  it('Arabic has exactly the same keys as English (dashboard)', () => {
    expect(keys(arDashboard).sort()).toEqual(keys(enDashboard).sort());
  });
  it('keeps interpolation placeholders consistent', () => {
    const flat = (o: unknown, p = ''): Record<string, string> =>
      o && typeof o === 'object' ? Object.assign({}, ...Object.entries(o).map(([k, v]) => flat(v, p ? `${p}.${k}` : k))) : { [p]: String(o) };
    const en = { ...flat(enCommon), ...flat(enDashboard, 'd') };
    const ar = { ...flat(arCommon), ...flat(arDashboard, 'd') };
    for (const [k, v] of Object.entries(en)) {
      const vars = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort().join();
      expect(vars(ar[k] ?? ''), k).toBe(vars(v));
    }
  });
});
