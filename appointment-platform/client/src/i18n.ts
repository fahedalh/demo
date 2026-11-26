import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import arCommon from './locales/ar/common.json';
import arDashboard from './locales/ar/dashboard.json';
import enCommon from './locales/en/common.json';
import enDashboard from './locales/en/dashboard.json';

/** Additional languages: add `locales/<lng>/*.json` and register them here. */
export const resources = {
  en: { common: enCommon, dashboard: enDashboard },
  ar: { common: arCommon, dashboard: arDashboard },
} as const;

export const RTL = new Set(['ar']);

function initialLanguage() {
  try {
    const saved = localStorage.getItem('bk-lang');
    if (saved && saved in resources) return saved;
  } catch {
    /* storage unavailable */
  }
  return navigator.language?.startsWith('ar') ? 'ar' : 'en';
}

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage(),
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: ['common', 'dashboard'],
  interpolation: { escapeValue: false },
  returnObjects: true,
});

export function applyDocumentLanguage(lng: string) {
  document.documentElement.lang = lng;
  document.documentElement.dir = RTL.has(lng) ? 'rtl' : 'ltr';
}
applyDocumentLanguage(i18n.language);
i18n.on('languageChanged', (lng) => {
  applyDocumentLanguage(lng);
  try {
    localStorage.setItem('bk-lang', lng);
  } catch {
    /* ignore */
  }
});

export default i18n;
