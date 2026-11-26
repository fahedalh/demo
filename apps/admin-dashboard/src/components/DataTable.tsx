import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { cn, EmptyState, Input, Pagination, Select, Skeleton } from '@masar/ui';
import { Search } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  loading,
  onRowClick,
  page,
  totalPages,
  onPage,
  total,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  page?: number;
  totalPages?: number;
  onPage?: (p: number) => void;
  total?: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2/60 text-start text-xs font-semibold uppercase tracking-wide text-muted">
              {columns.map((c) => (
                <th key={c.key} className={cn('px-4 py-3 text-start font-semibold', c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loading &&
              !rows &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={columns.length} className="px-4 py-3">
                    <Skeleton className="h-6" />
                  </td>
                </tr>
              ))}
            {rows?.map((r) => (
              <tr
                key={r.id}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={cn('transition', onRowClick && 'cursor-pointer hover:bg-surface-2/60')}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-4 py-3 align-middle', c.className)}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows && rows.length === 0 && <EmptyState title={t('common.none')} />}
      {page != null && totalPages != null && onPage && (
        <div className="flex items-center justify-between border-t border-line px-4 pb-3">
          <span className="pt-4 text-xs text-muted">{total ?? 0}</span>
          <Pagination page={page} totalPages={totalPages} onPage={onPage} />
        </div>
      )}
    </div>
  );
}

export function FilterBar({
  search,
  onSearch,
  children,
}: {
  search?: string;
  onSearch?: (v: string) => void;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [v, setV] = React.useState(search ?? '');
  React.useEffect(() => {
    const id = setTimeout(() => onSearch?.(v), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {onSearch && (
        <div className="relative min-w-60 flex-1 sm:max-w-sm">
          <Search className="absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            value={v}
            onChange={(e) => setV(e.target.value)}
            placeholder={t('common.search')}
            className="h-10 ps-10"
          />
        </div>
      )}
      {children}
    </div>
  );
}

export function FilterSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  const { t } = useTranslation();
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-auto min-w-40"
      aria-label={label}
    >
      <option value="">
        {label}: {t('common.all')}
      </option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
