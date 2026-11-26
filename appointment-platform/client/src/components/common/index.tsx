import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Star } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { BookingStatus } from '@bookly/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';
import { Badge, Card, Label, Skeleton } from '@/components/ui/misc';
import { errorMessage } from '@/services/api';
import { cn } from '@/lib/utils';

export function PageHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold sm:text-[1.75rem]">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon, tone = 'primary' }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: 'primary' | 'accent' | 'amber' | 'rose' }) {
  const tones = { primary: 'bg-primary/10 text-primary', accent: 'bg-accent/10 text-accent', amber: 'bg-amber-500/10 text-amber-600', rose: 'bg-rose-500/10 text-rose-600' };
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="num mt-1.5 text-2xl font-bold">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {icon && <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5', tones[tone])}>{icon}</div>}
      </div>
    </Card>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-14 text-center', className)}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground [&_svg]:size-6">{icon ?? <Inbox />}</div>
      <p className="font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-col items-center rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <AlertTriangle className="mb-3 h-6 w-6 text-destructive" />
      <p className="font-semibold">{t('common.error')}</p>
      <p className="mt-1 text-sm text-muted-foreground">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          {t('actions.retry')}
        </Button>
      )}
    </div>
  );
}

export function ListSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16" />
      ))}
    </div>
  );
}

/** Renders loading / error / content for a TanStack query result. */
export function QueryView<T>({ query, children, skeleton }: { query: { data: T | undefined; isLoading: boolean; error: unknown; refetch: () => unknown }; children: (data: T) => ReactNode; skeleton?: ReactNode }) {
  if (query.isLoading) return <>{skeleton ?? <ListSkeleton />}</>;
  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (query.data === undefined) return null;
  return <>{children(query.data)}</>;
}

export function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  const { t } = useTranslation();
  if (pages <= 1) return null;
  return (
    <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Pagination">
      <p className="text-sm text-muted-foreground">{t('common.page', { page, pages })}</p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft className="rtl:rotate-180" /> {t('common.previous')}
        </Button>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          {t('common.next')} <ChevronRight className="rtl:rotate-180" />
        </Button>
      </div>
    </nav>
  );
}

const STATUS_TONE: Record<string, 'warning' | 'primary' | 'success' | 'muted' | 'danger' | 'orange' | 'info' | 'default'> = {
  pending: 'warning',
  confirmed: 'primary',
  completed: 'success',
  cancelled: 'muted',
  rejected: 'danger',
  no_show: 'orange',
  paid: 'success',
  partially_paid: 'info',
  unpaid: 'warning',
  refunded: 'muted',
  succeeded: 'success',
  failed: 'danger',
  active: 'success',
  suspended: 'danger',
  inactive: 'muted',
  published: 'success',
  hidden: 'muted',
  waiting: 'warning',
  notified: 'info',
  booked: 'success',
  trialing: 'info',
  past_due: 'danger',
};
export const STATUS_COLOR: Record<BookingStatus, string> = {
  pending: '#f59e0b',
  confirmed: '#6366f1',
  completed: '#10b981',
  cancelled: '#94a3b8',
  rejected: '#f43f5e',
  no_show: '#f97316',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const { t } = useTranslation();
  return (
    <Badge tone={STATUS_TONE[status] ?? 'default'} className={className}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {t(`status.${status}`, { defaultValue: status })}
    </Badge>
  );
}

export function Stars({ value, size = 'sm', className }: { value: number; size?: 'sm' | 'md'; className?: string }) {
  const s = size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5';
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} aria-label={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn(s, i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30')} aria-hidden />
      ))}
    </span>
  );
}

export function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" role="radio" aria-checked={value === i} aria-label={`${i}`} onClick={() => onChange(i)} className="rounded-md p-1 transition-transform hover:scale-110">
          <Star className={cn('h-8 w-8', i <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')} />
        </button>
      ))}
    </div>
  );
}

/** Confirmation dialog with optional reason input. onConfirm may throw; errors are shown inline. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  withReason,
  reasonLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  withReason?: boolean;
  reasonLabel?: string;
  onConfirm: (reason?: string) => Promise<unknown> | unknown;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setReason('');
          setErr(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent title={title} description={description} size="sm">
        {withReason && (
          <div className="space-y-2">
            <Label htmlFor="confirm-reason">{reasonLabel}</Label>
            <Textarea id="confirm-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </div>
        )}
        {err && <p className="mt-3 text-sm text-destructive" role="alert">{err}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('actions.cancel')}</Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                await onConfirm(reason || undefined);
                setReason('');
                onOpenChange(false);
              } catch (e) {
                setErr(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel ?? t('actions.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Field({ label, error, hint, children, htmlFor, className, required }: { label?: ReactNode; error?: string; hint?: ReactNode; children: ReactNode; htmlFor?: string; className?: string; required?: boolean }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <Label htmlFor={htmlFor}>
          {label}
          {required && <span className="ms-0.5 text-destructive">*</span>}
        </Label>
      )}
      {children}
      {error ? <p className="text-xs font-medium text-destructive" role="alert">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Section({ title, description, children, actions }: { title: ReactNode; description?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-4 border-b p-5">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="p-5">{children}</div>
    </Card>
  );
}

/** Period-over-period change, e.g. "+12%" in green. Renders nothing without a baseline. */
export function Delta({ current, previous, invert }: { current: number; previous?: number; invert?: boolean }) {
  if (previous === undefined || previous === 0) return null;
  const change = (current - previous) / previous;
  const up = change >= 0;
  const good = invert ? !up : up;
  return (
    <span className={cn('num inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold', good ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400')}>
      {up ? '▲' : '▼'} {Math.abs(Math.round(change * 100))}%
    </span>
  );
}
