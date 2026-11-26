import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

/** Brand visual on the sign-in screen: an abstract animated city route. */
export function AuthAside() {
  const { t } = useTranslation();
  return (
    <div className="relative flex h-full flex-col justify-end p-14 text-white">
      <svg className="absolute inset-0 h-full w-full opacity-60" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="600" height="800" fill="url(#grid)" />
        {[120, 260, 400, 520].map((x) => <path key={x} d={`M${x} 0V800`} stroke="rgba(255,255,255,.07)" strokeWidth="14" />)}
        {[160, 340, 560, 700].map((y) => <path key={y} d={`M0 ${y}H600`} stroke="rgba(255,255,255,.07)" strokeWidth="14" />)}
        <motion.path d="M80 720 C 200 640, 160 480, 300 430 S 470 250, 520 110" fill="none" stroke="#06C167" strokeWidth="6" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2.4, ease: 'easeInOut' }} />
        <circle cx="80" cy="720" r="12" fill="#fff" />
        <rect x="508" y="98" width="24" height="24" rx="4" fill="#fff" />
      </svg>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-ink via-ink/85 to-transparent" aria-hidden />
      <div className="relative max-w-md">
        <h2 className="text-5xl font-bold leading-[1.05] text-white">{t('hero.title')}</h2>
        <p className="mt-4 text-lg text-white/70">{t('hero.subtitle')}</p>
        <ul className="mt-8 space-y-3">
          {['perk1', 'perk2', 'perk3'].map((k) => (
            <li key={k} className="flex items-center gap-3 text-white/90">
              <span className="grid size-6 place-items-center rounded-full bg-accent"><Check className="size-3.5" /></span>
              {t(`hero.${k}`)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
