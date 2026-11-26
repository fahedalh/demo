import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type DefaultValues, type FieldValues, type Path, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import type { ZodType } from 'zod';
import { ApiError, errorMessage } from '@/services/api';

/** React Hook Form + Zod with server-side field errors mapped back onto inputs. */
export function useApiForm<T extends FieldValues>(schema: ZodType<T>, defaultValues: DefaultValues<T>) {
  return useForm<T>({ resolver: zodResolver(schema), defaultValues, mode: 'onTouched' });
}

export function applyServerErrors<T extends FieldValues>(form: UseFormReturn<T>, e: unknown, opts: { toast?: boolean } = { toast: true }) {
  if (e instanceof ApiError && e.details?.fields) {
    for (const [field, msgs] of Object.entries(e.details.fields)) {
      form.setError(field as Path<T>, { message: msgs?.[0] ?? 'Invalid' });
    }
  }
  if (opts.toast) toast.error(errorMessage(e));
}
