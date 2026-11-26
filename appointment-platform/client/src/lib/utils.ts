import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "#4f46e5" → "79 70 229" for the --brand CSS variable. */
export function hexToRgbTriplet(hex?: string | null) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

export function initials(name?: string) {
  return (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

const TITLES = /^(dr|mr|mrs|ms|miss|prof|eng|sheikh|د|أ|م)\.?$/i;
/** First name for greetings, skipping honorifics ("Dr. Rania Nour" → "Rania"). */
export function firstName(name?: string) {
  const parts = (name ?? '').split(/\s+/).filter(Boolean);
  return parts.find((p) => !TITLES.test(p)) ?? parts[0] ?? '';
}
