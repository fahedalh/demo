import { useCallback, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  BadgeCheck,
  CircleDollarSign,
  Gauge,
  History,
  LifeBuoy,
  LogOut,
  Map,
  Menu,
  Megaphone,
  Route as RouteIcon,
  Settings,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react';
import {
  Avatar,
  Button,
  cn,
  LanguageToggle,
  Logo,
  logout,
  ThemeToggle,
  toast,
  useAuth,
  useSocket,
  useSocketEvent,
} from '@masar/ui';
import { useCan, type Permission } from './lib/hooks';

const groups: {
  key: string;
  items: { to: string; key: string; icon: React.ComponentType<{ className?: string }>; perm?: Permission }[];
}[] = [
  {
    key: 'operations',
    items: [
      { to: '/', key: 'overview', icon: Gauge },
      { to: '/live', key: 'live', icon: Map, perm: 'rides' },
      { to: '/rides', key: 'rides', icon: RouteIcon, perm: 'rides' },
      { to: '/drivers', key: 'drivers', icon: BadgeCheck, perm: 'drivers' },
      { to: '/users', key: 'users', icon: Users, perm: 'users' },
      { to: '/support', key: 'support', icon: LifeBuoy, perm: 'support' },
    ],
  },
  {
    key: 'business',
    items: [
      { to: '/finance', key: 'finance', icon: CircleDollarSign, perm: 'finance' },
      { to: '/pricing', key: 'pricing', icon: SlidersHorizontal, perm: 'pricing' },
      { to: '/marketing', key: 'marketing', icon: Megaphone, perm: 'marketing' },
    ],
  },
  {
    key: 'system',
    items: [
      { to: '/settings', key: 'settings', icon: Settings, perm: 'settings' },
      { to: '/logs', key: 'logs', icon: History, perm: 'logs' },
    ],
  },
];

export function Layout() {
  const { t } = useTranslation();
  const can = useCan();
  const user = useAuth((s) => s.user)!;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  useSocket();
  // Safety alerts reach every admin instantly.
  useSocketEvent(
    'admin:sos',
    useCallback(
      (p: { ticketId: string; role: string; rideId: string | null }) => {
        toast.error(t('live.sos'), {
          description: t('live.sosHelp'),
          duration: 30_000,
          action: { label: t('common.view'), onClick: () => navigate(`/support?ticket=${p.ticketId}`) },
        });
        void qc.invalidateQueries({ queryKey: ['/admin/tickets'] });
      },
      [t, navigate, qc],
    ),
  );
  useSocketEvent(
    'admin:ride_event',
    useCallback(() => {
      void qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
    }, [qc]),
  );

  const nav = (
    <nav className="flex flex-col gap-5">
      {groups.map((g) => {
        const items = g.items.filter((i) => !i.perm || can(i.perm));
        if (!items.length) return null;
        return (
          <div key={g.key}>
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
              {t(`nav.${g.key}`)}
            </p>
            {items.map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                end={i.to === '/'}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
                    isActive ? 'bg-primary text-primary-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
                  )
                }
              >
                <i.icon className="size-4" /> {t(`nav.${i.key}`)}
              </NavLink>
            ))}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-y-auto border-e border-line bg-surface p-4 lg:flex">
        <Logo suffix="Console" className="mb-6 px-2 py-1" />
        {nav}
      </aside>
      {open && (
        <div className="fixed inset-0 z-[1100] lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 start-0 w-72 overflow-y-auto bg-surface p-4 shadow-float">
            <div className="mb-6 flex items-center justify-between">
              <Logo suffix="Console" />
              <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Close menu">
                <X />
              </Button>
            </div>
            {nav}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur-xl lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu />
          </Button>
          <div className="flex-1" />
          <LanguageToggle />
          <ThemeToggle />
          <div className="flex items-center gap-2 border-s border-line ps-3">
            <Avatar name={`${user.firstName} ${user.lastName}`} size={34} />
            <div className="hidden text-sm leading-tight sm:block">
              <p className="font-semibold">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs text-muted">{user.adminRole?.replace('_', ' ').toLowerCase()}</p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void logout()}
              aria-label={t('actions.signOut')}
            >
              <LogOut />
            </Button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
