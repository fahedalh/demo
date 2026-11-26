import * as React from 'react';
import { cn } from '../lib/cn';
import { Label } from './primitives';
import { localizeMessage } from '../i18n/messages';

/** Label + control + inline error, wired for react-hook-form. */
export function Field({
  label,
  error,
  hint,
  htmlFor,
  className,
  children,
}: {
  label?: React.ReactNode;
  error?: string;
  hint?: React.ReactNode;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-0', className)}>
      {label && <Label htmlFor={htmlFor}>{label}</Label>}
      {children}
      {error ? (
        <p role="alert" className="mt-1.5 text-sm text-danger">
          {localizeMessage(error)}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-xl border border-danger/30 bg-danger/8 px-4 py-3 text-sm font-medium text-danger"
    >
      {localizeMessage(message)}
    </div>
  );
}
