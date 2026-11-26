import { Menu, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LanguageSwitch, Logo, ThemeToggle, UserMenu } from '@/components/common/HeaderControls';
import { Button } from '@/components/ui/button';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { cn } from '@/lib/utils';

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
  badge?: ReactNode;
}
export interface NavSection {
  title?: string;
  items: NavItem[];
}

export function DashboardLayout({ sections, header, footer }: { sections: NavSection[]; header?: ReactNode; footer?: ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);

  const nav = (
    <nav className="flex h-full flex-col gap-5 overflow-y-auto p-4 scrollbar-thin" aria-label="Dashboard">
      {header}
      {sections.map((s, i) => (
        <div key={i}>
          {s.title && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{s.title}</p>}
          <ul className="space-y-0.5">
            {s.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn('flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-[18px]', isActive && 'bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary')
                  }
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                  {item.badge && <span className="ms-auto">{item.badge}</span>}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {footer && <div className="mt-auto">{footer}</div>}
    </nav>
  );

  return (
    <div className="min-h-screen bg-muted/30">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 flex-col border-e bg-background lg:flex">
        <div className="flex h-16 items-center border-b px-5"><Logo /></div>
        {nav}
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-950/40" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 start-0 flex w-72 flex-col bg-background shadow-lift animate-in slide-in-from-left rtl:slide-in-from-right">
            <div className="flex h-16 items-center justify-between border-b px-5">
              <Logo />
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label={t('actions.close')}><X /></Button>
            </div>
            {nav}
          </aside>
        </div>
      )}
      <div className="lg:ps-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-lg sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label={t('nav.menu')}><Menu /></Button>
          <div className="lg:hidden"><Logo /></div>
          <div className="ms-auto flex items-center gap-1">
            <LanguageSwitch compact />
            <ThemeToggle />
            <NotificationBell />
            <UserMenu />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1400px] p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
