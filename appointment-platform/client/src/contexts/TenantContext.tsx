import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Permission } from '@bookly/shared';
import { api } from '@/services/api';
import type { TenantInfo } from '@/types';
import { useLocalized } from '@/hooks/useLocalized';

interface TenantCtx extends TenantInfo {
  id: string;
  can: (...p: Permission[]) => boolean;
  terms: { staff: string; service: string; resource: string };
  base: string;
}

const Ctx = createContext<TenantCtx | null>(null);

export function useTenantQuery(id: string) {
  return useQuery({ queryKey: ['tenant', id], queryFn: () => api.get<TenantInfo>(`/businesses/${id}`), staleTime: 60_000 });
}

export function TenantProvider({ id, info, children }: { id: string; info: TenantInfo; children: ReactNode }) {
  const loc = useLocalized();
  const value = useMemo<TenantCtx>(() => {
    const perms = new Set(info.permissions);
    const term = info.business.category?.terminology;
    return {
      ...info,
      id,
      base: `/dashboard/${id}`,
      can: (...p) => p.some((x) => perms.has(x)),
      terms: { staff: loc(term?.staff) || 'Staff', service: loc(term?.service) || 'Service', resource: loc(term?.resource) || 'Resource' },
    };
  }, [id, info, loc]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTenant() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTenant must be used inside TenantProvider');
  return c;
}
