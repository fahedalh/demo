/**
 * i18n bootstrap. Shared strings live here; each app passes its own dictionaries.
 * Arabic copy is written natively (not word-for-word), and switching language flips the
 * document direction so layouts mirror correctly.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { common } from './common';

type Dict = Record<string, any>;

function deepMerge(a: Dict, b: Dict): Dict {
  const out: Dict = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(a[k] ?? {}, v) : v;
  return out;
}

export function applyDirection(lng: string) {
  const dir = lng === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.setAttribute('dir', dir);
  document.documentElement.setAttribute('lang', lng);
}

export function initI18n(app: { en: Dict; ar: Dict }) {
  let lng = 'en';
  try {
    lng = localStorage.getItem('masar.lang') ?? (navigator.language?.startsWith('ar') ? 'ar' : 'en');
  } catch {
    /* ignore */
  }
  void i18n.use(initReactI18next).init({
    resources: {
      en: { translation: deepMerge(common.en, app.en) },
      ar: { translation: deepMerge(common.ar, app.ar) },
    },
    lng,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  applyDirection(lng);
  i18n.on('languageChanged', (l) => {
    applyDirection(l);
    try {
      localStorage.setItem('masar.lang', l);
    } catch {
      /* ignore */
    }
  });
  return i18n;
}

export { i18n };
