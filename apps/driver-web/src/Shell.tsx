import { useCallback, useEffect } from 'react';
import { NavLink, Outlet, useLocation as useRouterLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CarFront, ClipboardList, LogOut, User, Wallet } from 'lucide-react';
import type { NotificationDTO } from '@masar/shared';
import {
  cn,
  LanguageToggle,
  Logo,
  logout,
  ThemeToggle,
  toast,
  useSocket,
  useSocketEvent,
  InstallPrompt,
} from '@masar/ui';
import { startEngine, stopEngine } from './lib/location';

const tabs = [
  { to: '/', icon: CarFront, key: 'drive' },
  { to: '/earnings', icon: Wallet, key: 'earnings' },
  { to: '/trips', icon: ClipboardList, key: 'trips' },
  { to: '/account', icon: User, key: 'account' },
];

export function Shell() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { pathname } = useRouterLocation();
  useSocket();
  useEffect(() => {
    startEngine();
    return () => stopEngine();
  }, []);
  const onNotification = useCallback(
    (n: NotificationDTO) => {
      if (n.type !== 'RIDE_MESSAGE') toast(n.title, { description: n.body || undefined });
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      if (n.type.startsWith('PAYOUT')) void qc.invalidateQueries({ queryKey: ['driver'] });
    },
    [qc],
  );
  useSocketEvent('notification', onNotification);
  const isDrive = pathname === '/';
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-e border-line bg-surface p-4 md:flex">
        <Logo suffix="Driver" className="px-2 py-2" />
        <nav className="mt-6 flex flex-col gap-1">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition',
                  isActive ? 'bg-primary text-primary-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
                )
              }
            >
              <tab.icon className="size-5" /> {t(`nav.${tab.key}`)}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-2">
          <InstallPrompt className="w-full" />
          <div className="flex items-center gap-1">
            <LanguageToggle />
            <ThemeToggle />
          </div>
          <button
            onClick={() => void logout()}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-fg"
          >
            <LogOut className="size-5" /> {t('actions.signOut')}
          </button>
        </div>
      </aside>
      <main className={cn('min-w-0 flex-1', !isDrive && 'pb-24 md:pb-8')}>
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-[700] border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        <div className="grid grid-cols-4">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold',
                  isActive ? 'text-fg' : 'text-muted',
                )
              }
            >
              <tab.icon className="size-5" /> {t(`nav.${tab.key}`)}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
