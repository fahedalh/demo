import { Languages, LayoutDashboard, LogOut, Moon, Shield, Sun, User as UserIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown';
import { Avatar } from '@/components/ui/misc';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { api } from '@/services/api';

export function LanguageSwitch({ compact }: { compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const { user, setUser } = useAuth();
  const next = i18n.language === 'ar' ? 'en' : 'ar';
  return (
    <Button
      variant="ghost"
      size={compact ? 'icon' : 'sm'}
      aria-label={t('nav.language')}
      onClick={async () => {
        await i18n.changeLanguage(next);
        if (user) api.patch<{ user: typeof user }>('/auth/me', { locale: next }).then((r) => setUser(r.user)).catch(() => undefined);
      }}
    >
      <Languages className="!size-[18px]" />
      {!compact && <span className={next === 'ar' ? 'font-arabic' : ''}>{t('nav.language')}</span>}
    </Button>
  );
}

export function ThemeToggle() {
  const { t } = useTranslation();
  const { theme, toggle } = useTheme();
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label={t('nav.theme')}>
      {theme === 'dark' ? <Sun className="!size-[18px]" /> : <Moon className="!size-[18px]" />}
    </Button>
  );
}

export function UserMenu() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="rounded-full ring-offset-2 ring-offset-background focus-visible:ring-2" aria-label={t('nav.account')}>
          <Avatar name={user.name} src={user.avatar} className="h-9 w-9" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>
          <span className="block truncate text-sm font-semibold text-foreground">{user.name}</span>
          <span className="block truncate font-normal">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.role === 'super_admin' && (
          <DropdownMenuItem onSelect={() => navigate('/admin')}><Shield /> {t('nav.admin')}</DropdownMenuItem>
        )}
        {user.memberships.map((m) => (
          <DropdownMenuItem key={m.business} onSelect={() => navigate(`/dashboard/${m.business}`)}>
            <LayoutDashboard /> <span className="truncate">{m.businessInfo?.name ?? t('nav.dashboard')}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={() => navigate('/account')}><UserIcon /> {t('nav.account')}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await logout();
            navigate('/');
          }}
        >
          <LogOut className="rtl:rotate-180" /> {t('nav.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Logo({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <Link to="/" className={`flex items-center gap-2 font-extrabold tracking-tight ${className ?? ''}`} aria-label={t('brand')}>
      <img src="/favicon.svg" alt="" className="h-8 w-8" />
      <span className="text-lg">{t('brand')}</span>
    </Link>
  );
}
