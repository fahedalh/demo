import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Paginated } from '@masar/shared';
import { api } from '@masar/ui';

export type Permission =
  'users' | 'drivers' | 'rides' | 'finance' | 'pricing' | 'marketing' | 'support' | 'settings' | 'logs';

export function useAdminMe() {
  return useQuery({
    queryKey: ['admin', 'me'],
    queryFn: () => api.get<{ permissions: Permission[] }>('/admin/me'),
    staleTime: 60_000,
  });
}

export function useCan() {
  const { data } = useAdminMe();
  return (p: Permission) => !!data?.permissions.includes(p);
}

/** Paginated + filterable list backed by an admin endpoint. */
export function usePaged<T>(path: string, initial: Record<string, string> = {}, pageSize = 20) {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>(initial);
  const qs = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
  });
  const query = useQuery({
    queryKey: [path, page, filters],
    queryFn: () => api.get<Paginated<T>>(`${path}?${qs}`),
    placeholderData: keepPreviousData,
  });
  return {
    ...query,
    page,
    setPage,
    filters,
    setFilter: (k: string, v: string) => {
      setPage(1);
      setFilters((f) => ({ ...f, [k]: v }));
    },
  };
}

export function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export const toMinor = (major: string | number) => Math.round(Number(major) * 100);
export const toMajor = (minor: number) => (minor / 100).toFixed(2);
