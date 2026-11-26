import type { ThemePreset } from '@bookly/shared';
import type { Business, Category } from '@/types';

/**
 * Industry theme presets. A preset is pure configuration: which layout variants the public
 * business page uses and which CSS token set (`.theme-<preset>` in index.css) applies.
 * Brand colours still come from the business; presets set typography, surfaces and structure.
 */
export interface IndustryTheme {
  preset: ThemePreset;
  /** Hero composition on the public business page. */
  hero: 'standard' | 'editorial' | 'clinical';
  /** How the team is presented. */
  team: 'cards' | 'portraits' | 'directory';
  /** Show bookable resources (rooms, bays) as their own section. */
  showSpaces: boolean;
  /** Show service groups as quick-filter chips (e.g. medical specialties). */
  groupChips: boolean;
  /** Serif display typeface for headings. */
  serif: boolean;
}

export const THEMES: Record<ThemePreset, IndustryTheme> = {
  default: { preset: 'default', hero: 'standard', team: 'cards', showSpaces: false, groupChips: false, serif: false },
  clinical: { preset: 'clinical', hero: 'clinical', team: 'directory', showSpaces: false, groupChips: true, serif: false },
  luxe: { preset: 'luxe', hero: 'editorial', team: 'portraits', showSpaces: false, groupChips: true, serif: true },
  academic: { preset: 'academic', hero: 'standard', team: 'cards', showSpaces: false, groupChips: true, serif: false },
  professional: { preset: 'professional', hero: 'standard', team: 'directory', showSpaces: false, groupChips: false, serif: true },
  automotive: { preset: 'automotive', hero: 'standard', team: 'cards', showSpaces: true, groupChips: true, serif: false },
  hospitality: { preset: 'hospitality', hero: 'editorial', team: 'cards', showSpaces: true, groupChips: false, serif: true },
  civic: { preset: 'civic', hero: 'standard', team: 'cards', showSpaces: false, groupChips: false, serif: false },
};

/** Business override → category default → platform default. */
export function themeFor(business: Pick<Business, 'branding' | 'category'>): IndustryTheme {
  const cat = typeof business.category === 'object' ? (business.category as Category) : null;
  const key = business.branding?.theme ?? cat?.theme ?? 'default';
  return THEMES[key] ?? THEMES.default;
}
