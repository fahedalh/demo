import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

export function DriveAside() {
  const { t } = useTranslation();
  return (
    <div className="relative flex h-full flex-col justify-end p-14 text-white">
      <div className="absolute inset-0 grid place-items-center" aria-hidden>
        <motion.div className="relative size-[520px]" initial={{ rotate: -8, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} transition={{ duration: 1.2 }}>
          <div className="absolute inset-0 rounded-full border border-white/10" />
          <div className="absolute inset-16 rounded-full border border-white/10" />
          <div className="absolute inset-32 rounded-full border border-accent/40" />
          <div className="absolute inset-[11.5rem] grid place-items-center rounded-full bg-accent shadow-[0_0_120px_rgba(6,193,103,.45)]">
            <span className="text-3xl font-bold text-white">80%</span>
          </div>
        </motion.div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-ink via-ink/90 to-transparent" />
      <div className="relative max-w-md">
        <h2 className="text-5xl font-bold leading-[1.05] text-white">{t('hero.title')}</h2>
        <p className="mt-4 text-lg text-white/70">{t('hero.subtitle')}</p>
        <ul className="mt-8 space-y-3">
          {['perk1', 'perk2', 'perk3'].map((k) => (
            <li key={k} className="flex items-center gap-3 text-white/90"><span className="grid size-6 place-items-center rounded-full bg-accent"><Check className="size-3.5" /></span>{t(`hero.${k}`)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
