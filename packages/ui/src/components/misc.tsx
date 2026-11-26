import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Languages,
  Moon,
  Star,
  Sun,
  Monitor,
  WifiOff,
  Inbox,
  ChevronLeft,
  ChevronRight,
  Download,
} from 'lucide-react';
import type { RideStatus } from '@masar/shared';
import { cn } from '../lib/cn';
import { useTheme, type Theme } from '../lib/theme';
import { useSocketStatus } from '../lib/socket';
import { i18n } from '../i18n';
import { localizeMessage } from '../i18n/messages';
import { Badge, Button } from './primitives';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './overlays';

export function Logo({
  className,
  suffix,
  inverted,
}: {
  className?: string;
  suffix?: string;
  inverted?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <span className={cn('inline-flex items-center gap-2 font-bold tracking-tight', className)}>
      <span
        className={cn('grid size-8 place-items-center rounded-[10px]', inverted ? 'bg-white' : 'bg-primary')}
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
          <path
            d="M5 18c3.5 0 4-12 7-12s3.5 12 7 12"
            stroke="#06C167"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <circle cx="5" cy="18" r="1.9" fill={inverted ? '#111' : 'var(--primary-fg)'} />
          <circle cx="19" cy="18" r="1.9" fill={inverted ? '#111' : 'var(--primary-fg)'} />
        </svg>
      </span>
      <span className="text-lg">
        {t('brand')}
        {suffix && <span className="ms-1.5 font-medium text-muted">{suffix}</span>}
      </span>
    </span>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={className} aria-label={t('settings.theme')}>
          <Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {(['light', 'dark', 'system'] as Theme[]).map((th) => (
          <DropdownMenuItem
            key={th}
            onSelect={() => setTheme(th)}
            className={cn(theme === th && 'font-semibold')}
          >
            {th === 'light' ? <Sun /> : th === 'dark' ? <Moon /> : <Monitor />}
            {t(`settings.${th}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function LanguageToggle({
  className,
  onChange,
}: {
  className?: string;
  onChange?: (lng: 'en' | 'ar') => void;
}) {
  const { i18n, t } = useTranslation();
  const next = i18n.language === 'ar' ? 'en' : 'ar';
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('gap-1.5 rounded-full', className)}
      onClick={() => {
        void i18n.changeLanguage(next);
        onChange?.(next);
      }}
      aria-label={t('settings.language')}
    >
      <Languages />
      <span>{next === 'ar' ? 'العربية' : 'English'}</span>
    </Button>
  );
}

export function RatingStars({
  value,
  size = 16,
  onChange,
  className,
}: {
  value: number;
  size?: number;
  onChange?: (v: number) => void;
  className?: string;
}) {
  const [hover, setHover] = React.useState<number | null>(null);
  const shown = hover ?? value;
  return (
    <div
      className={cn('inline-flex items-center gap-1', className)}
      role={onChange ? 'radiogroup' : undefined}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          disabled={!onChange}
          aria-label={`${i} star${i > 1 ? 's' : ''}`}
          onMouseEnter={() => onChange && setHover(i)}
          onMouseLeave={() => onChange && setHover(null)}
          onClick={() => onChange?.(i)}
          className={cn('transition-transform', onChange && 'hover:scale-110 active:scale-95')}
        >
          <Star
            style={{ width: size, height: size }}
            className={cn(
              i <= Math.round(shown) ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-line',
            )}
          />
        </button>
      ))}
    </div>
  );
}

const statusTone: Record<RideStatus, 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'dark'> = {
  REQUESTED: 'neutral',
  SEARCHING: 'info',
  ACCEPTED: 'info',
  DRIVER_ARRIVING: 'info',
  ARRIVED: 'warning',
  IN_PROGRESS: 'dark',
  COMPLETED: 'success',
  PAYMENT_PENDING: 'warning',
  PAYMENT_COMPLETED: 'success',
  CANCELLED: 'danger',
  EXPIRED: 'neutral',
  NO_DRIVER_AVAILABLE: 'neutral',
};

export function RideStatusBadge({ status, scheduled }: { status: RideStatus; scheduled?: boolean }) {
  const { t } = useTranslation();
  if (scheduled && status === 'REQUESTED') return <Badge tone="info">{t('ride.scheduled')}</Badge>;
  return <Badge tone={statusTone[status]}>{t(`ride.status.${status}`)}</Badge>;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-surface-2">
        <Icon className="size-6 text-muted" />
      </div>
      <p className="font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-danger/10">
        <AlertTriangle className="size-5 text-danger" />
      </div>
      <p className="font-semibold">{t('state.error')}</p>
      <p className="mt-1 text-sm text-muted">{message ? localizeMessage(message) : t('errors.generic')}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          {t('actions.retry')}
        </Button>
      )}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  trend,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  trend?: number | null;
  className?: string;
}) {
  return (
    <div className={cn('rounded-2xl border border-line bg-surface p-5 shadow-soft', className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted">{label}</span>
        {Icon && (
          <span className="grid size-9 place-items-center rounded-xl bg-surface-2">
            <Icon className="size-4 text-fg" />
          </span>
        )}
      </div>
      <div className="tabular mt-3 text-2xl font-bold tracking-tight">{value}</div>
      {(hint || trend != null) && (
        <div className="mt-1 flex items-center gap-2 text-xs text-muted">
          {trend != null && (
            <span className={cn('font-semibold', trend >= 0 ? 'text-accent-600' : 'text-danger')}>
              {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}%
            </span>
          )}
          {hint}
        </div>
      )}
    </div>
  );
}

/** Thin banner shown while the realtime connection is down (after it was up once). */
export function ConnectionBanner() {
  const { t } = useTranslation();
  const { connected, everConnected } = useSocketStatus();
  const [online, setOnline] = React.useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  React.useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  if ((connected || !everConnected) && online) return null;
  return (
    <motion.div
      initial={{ y: -40 }}
      animate={{ y: 0 }}
      className="fixed inset-x-0 top-0 z-[2000] flex items-center justify-center gap-2 bg-amber-500 py-1.5 text-xs font-semibold text-black"
    >
      <WifiOff className="size-3.5" /> {online ? t('state.offline') : t('errors.network')}
    </motion.div>
  );
}

export function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 pt-4">
      <Button
        variant="outline"
        size="icon-sm"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        aria-label="Previous page"
      >
        <ChevronLeft className="rtl:rotate-180" />
      </Button>
      <span className="tabular text-sm text-muted">
        {page} / {totalPages}
      </span>
      <Button
        variant="outline"
        size="icon-sm"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
        aria-label="Next page"
      >
        <ChevronRight className="rtl:rotate-180" />
      </Button>
    </div>
  );
}

/** PWA install prompt (Chrome/Edge/Android); hidden when unsupported or already installed. */
export function InstallPrompt({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [evt, setEvt] = React.useState<any>(null);
  React.useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault();
      setEvt(e);
    };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);
  if (!evt) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      onClick={async () => {
        evt.prompt();
        await evt.userChoice;
        setEvt(null);
      }}
    >
      <Download /> {t('pwa.install')}
    </Button>
  );
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    if (this.state.error) {
      return (
        <div className="grid min-h-full place-items-center p-6">
          <div className="max-w-sm text-center">
            <AlertTriangle className="mx-auto mb-3 size-8 text-danger" />
            <h1 className="text-xl font-bold">{i18n.t('state.error')}</h1>
            <p className="mt-2 text-sm text-muted">{this.state.error.message}</p>
            <Button className="mt-5" onClick={() => location.reload()}>
              {i18n.t('actions.reload')}
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
