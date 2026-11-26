import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ZodType } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { useTenant } from '@/contexts/TenantContext';
import { ApiError, api, errorMessage } from '@/services/api';

export type Errors = Record<string, string>;

/**
 * Generic create/edit dialog for tenant resources. Validates with Zod on the client and maps
 * server-side field errors back to the form.
 */
export function EntityDialog<T extends Record<string, unknown>>({
  open,
  onOpenChange,
  title,
  resource,
  editingId,
  value,
  schema,
  toPayload,
  successMessage,
  size = 'lg',
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  resource: string;
  editingId?: string | null;
  value: T;
  schema: ZodType<unknown>;
  toPayload?: (v: T) => unknown;
  successMessage: string;
  size?: 'md' | 'lg' | 'xl';
  children: (errors: Errors) => ReactNode;
}) {
  const { t } = useTranslation();
  const { id } = useTenant();
  const qc = useQueryClient();
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    const payload = toPayload ? toPayload(value) : value;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const fe = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
      setErrors(Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v?.[0] ?? t('common.required')])));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      if (editingId) await api.patch(`/businesses/${id}/${resource}/${editingId}`, parsed.data);
      else await api.post(`/businesses/${id}/${resource}`, parsed.data);
      toast.success(successMessage);
      void qc.invalidateQueries({ queryKey: [resource, id] });
      void qc.invalidateQueries({ queryKey: ['tenant', id] });
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError && e.details?.fields) setErrors(Object.fromEntries(Object.entries(e.details.fields).map(([k, v]) => [k, v[0]])));
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setErrors({}); onOpenChange(o); }}>
      <DialogContent title={title} size={size}>
        <form onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
          <div className="space-y-5">{children(errors)}</div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('actions.cancel')}</Button>
            <Button type="submit" loading={busy}>{t('actions.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
