import { Briefcase, Building2, Car, GraduationCap, Landmark, Scissors, Sparkles, Stethoscope, type LucideIcon } from 'lucide-react';

const ICONS: Record<string, LucideIcon> = { Stethoscope, Scissors, GraduationCap, Briefcase, Car, Building2, Landmark, Sparkles };
export const ICON_NAMES = Object.keys(ICONS);

export function CategoryIcon({ name, className }: { name?: string; className?: string }) {
  const Icon = ICONS[name ?? ''] ?? Sparkles;
  return <Icon className={className} aria-hidden />;
}
