import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { LanguageSwitch, Logo, ThemeToggle, UserMenu } from '@/components/common/HeaderControls';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { cn } from '@/lib/utils';

export function PublicLayout() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [loc.pathname]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);
  const links = [
    { to: '/explore', label: t('nav.explore') },
    { to: '/pricing', label: t('nav.pricing') },
    { to: '/track', label: t('nav.track') },
    { to: '/contact', label: t('nav.contact') },
  ];
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground">
        {t('nav.skip')}
      </a>
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-lg">
        <div className="container flex h-16 items-center gap-6">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => cn('rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground', isActive && 'text-foreground')}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-1">
            <div className="hidden sm:block"><LanguageSwitch /></div>
            <ThemeToggle />
            {user ? (
              <>
                <NotificationBell />
                <UserMenu />
              </>
            ) : (
              <div className="hidden items-center gap-2 sm:flex">
                <Button variant="ghost" asChild><Link to="/login">{t('nav.login')}</Link></Button>
                <Button asChild><Link to="/register">{t('nav.signup')}</Link></Button>
              </div>
            )}
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={t('nav.menu')}>
              {open ? <X /> : <Menu />}
            </Button>
          </div>
        </div>
        {open && (
          <nav className="border-t bg-background md:hidden" aria-label="Mobile">
            <div className="container flex flex-col py-3">
              {links.map((l) => (
                <NavLink key={l.to} to={l.to} className="rounded-lg px-3 py-3 font-medium hover:bg-muted">{l.label}</NavLink>
              ))}
              <div className="mt-2 flex items-center gap-2 border-t pt-3">
                <LanguageSwitch />
                {!user && (
                  <>
                    <Button variant="outline" asChild className="flex-1"><Link to="/login">{t('nav.login')}</Link></Button>
                    <Button asChild className="flex-1"><Link to="/register">{t('nav.signup')}</Link></Button>
                  </>
                )}
              </div>
            </div>
          </nav>
        )}
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="border-t bg-muted/30">
      <div className="container grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">{t('landing.subtitle')}</p>
        </div>
        <div>
          <p className="mb-3 text-sm font-semibold">{t('nav.explore')}</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link className="hover:text-foreground" to="/explore?category=healthcare">Healthcare</Link></li>
            <li><Link className="hover:text-foreground" to="/explore?category=beauty">Beauty</Link></li>
            <li><Link className="hover:text-foreground" to="/explore?category=education">Education</Link></li>
            <li><Link className="hover:text-foreground" to="/explore?category=hospitality">Hospitality</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-sm font-semibold">{t('nav.forBusiness')}</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link className="hover:text-foreground" to="/pricing">{t('nav.pricing')}</Link></li>
            <li><Link className="hover:text-foreground" to="/register?type=business">{t('landing.businessCta')}</Link></li>
            <li><Link className="hover:text-foreground" to="/login">{t('nav.login')}</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-sm font-semibold">{t('nav.contact')}</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link className="hover:text-foreground" to="/contact">{t('nav.contact')}</Link></li>
            <li><Link className="hover:text-foreground" to="/track">{t('nav.track')}</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t py-5 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} Bookly</div>
    </footer>
  );
}
