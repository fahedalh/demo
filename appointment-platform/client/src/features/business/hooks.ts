import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Paginated } from '@bookly/shared';
import { useTenant } from '@/contexts/TenantContext';
import { api, errorMessage } from '@/services/api';

/** Tenant-scoped list query for a CRUD resource. */
export function useTenantList<T>(resource: string, params: Record<string, string | number | undefined> = {}, enabled = true) {
  const { id } = useTenant();
  return useQuery({
    queryKey: [resource, id, params],
    queryFn: () => api.get<Paginated<T>>(`/businesses/${id}/${resource}`, { limit: 200, ...params }),
    enabled,
  });
}

export function useTenantMutation<V, R = unknown>(fn: (base: string, v: V) => Promise<R>, opts: { invalidate?: string[]; success?: string; onSuccess?: (r: R) => void } = {}) {
  const { id } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: V) => fn(`/businesses/${id}`, v),
    onSuccess: (r) => {
      for (const k of opts.invalidate ?? []) void qc.invalidateQueries({ queryKey: [k, id] });
      if (opts.success) toast.success(opts.success);
      opts.onSuccess?.(r);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
