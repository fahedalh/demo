import { create } from 'zustand';

export type Theme = 'light' | 'dark' | 'system';

function apply(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b0b0c' : '#ffffff');
}

const stored = (() => {
  try {
    return (localStorage.getItem('masar.theme') as Theme) || 'system';
  } catch {
    return 'system' as Theme;
  }
})();

export const useTheme = create<{ theme: Theme; setTheme: (t: Theme) => void; isDark: () => boolean }>((set, get) => ({
  theme: stored,
  setTheme: (theme) => {
    try {
      localStorage.setItem('masar.theme', theme);
    } catch {
      /* ignore */
    }
    apply(theme);
    set({ theme });
  },
  isDark: () => document.documentElement.classList.contains('dark'),
}));

export function initTheme() {
  apply(useTheme.getState().theme);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (useTheme.getState().theme === 'system') apply('system');
  });
}
