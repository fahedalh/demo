/** Passenger layout: map-first home gets a floating header; other pages get a top bar. Mobile uses a bottom tab bar. */
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Bell, Car, Clock3, User, Wallet, LifeBuoy, LogOut } from 'lucide-react';
import {
  api,
  Avatar,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  LanguageToggle,
  Logo,
  logout,
  ThemeToggle,
  useAuth,
  useSocket,
  InstallPrompt,
} from '@masar/ui';
import { useLiveNotifications } from './lib/hooks';

const tabs = [
  { to: '/', icon: Car, key: 'home' },
  { to: '/rides', icon: Clock3, key: 'rides' },
  { to: '/wallet', icon: Wallet, key: 'wallet' },
  { to: '/account', icon: User, key: 'account' },
];

export function NotificationBell({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: () => api.get<{ unread: number }>('/me/notifications?pageSize=1'),
    refetchInterval: 60_000,
  });
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('relative', className)}
      onClick={() => navigate('/notifications')}
      aria-label="Notifications"
    >
      <Bell />
      {!!data?.unread && (
        <span className="absolute end-2 top-2 size-2.5 rounded-full bg-accent ring-2 ring-surface" />
      )}
    </Button>
  );
}

export function UserMenu() {
  const { t } = useTranslation();
  const user = useAuth((s) => s.user)!;
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="rounded-full ring-offset-2 transition hover:ring-2 hover:ring-line"
          aria-label="Account menu"
        >
          <Avatar name={`${user.firstName} ${user.lastName}`} src={user.avatarUrl} size={40} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <div className="px-3 py-2">
          <p className="font-semibold">
            {user.firstName} {user.lastName}
          </p>
          <p className="text-xs text-muted">{user.email ?? user.phone}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/rides')}>
          <Clock3 />
          {t('nav.rides')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/wallet')}>
          <Wallet />
          {t('nav.wallet')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/account')}>
          <User />
          {t('nav.account')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/support')}>
          <LifeBuoy />
          {t('nav.support')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logout()}>
          <LogOut />
          {t('actions.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Shell() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  useSocket();
  useLiveNotifications();
  const isHome = pathname === '/';
  return (
    <div className="flex min-h-dvh flex-col">
      {!isHome && (
        <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
            <NavLink to="/">
              <Logo />
            </NavLink>
            <nav className="hidden items-center gap-1 md:flex">
              {tabs.map((tab) => (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  end
                  className={({ isActive }) =>
                    cn(
                      'rounded-full px-4 py-2 text-sm font-medium transition',
                      isActive ? 'bg-primary text-primary-fg' : 'text-muted hover:text-fg',
                    )
                  }
                >
                  {t(`nav.${tab.key}`)}
                </NavLink>
              ))}
            </nav>
            <div className="flex items-center gap-1">
              <InstallPrompt className="hidden sm:inline-flex" />
              <LanguageToggle className="hidden sm:inline-flex" />
              <ThemeToggle />
              <NotificationBell />
              <UserMenu />
            </div>
          </div>
        </header>
      )}
      <main className={cn('flex-1', !isHome && 'pb-24 md:pb-10')}>
        <Outlet />
      </main>
      {/* Mobile tab bar */}
      <nav
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden',
          isHome && 'hidden',
        )}
      >
        <div className="grid grid-cols-4">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium',
                  isActive ? 'text-fg' : 'text-muted',
                )
              }
            >
              <tab.icon className="size-5" />
              {t(`nav.${tab.key}`)}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
