import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { X } from 'lucide-react';
import { cn } from '../lib/cn';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/** Centered dialog on desktop, bottom sheet on mobile. */
export function DialogContent({
  className,
  children,
  title,
  description,
  hideClose,
  ...props
}: Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, 'title'> & { title?: React.ReactNode; description?: React.ReactNode; hideClose?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[1000] bg-black/40 backdrop-blur-[2px]" />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-[1001] max-h-[92dvh] w-full overflow-y-auto bg-surface p-6 shadow-float outline-none',
          'inset-x-0 bottom-0 rounded-t-3xl sm:inset-auto sm:start-1/2 sm:top-1/2 sm:w-[min(92vw,520px)] sm:-translate-y-1/2 sm:rounded-3xl ltr:sm:-translate-x-1/2 rtl:sm:translate-x-1/2',
          className,
        )}
        {...props}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line sm:hidden" />
        {title ? <DialogPrimitive.Title className="pe-8 text-xl font-bold">{title}</DialogPrimitive.Title> : <DialogPrimitive.Title className="sr-only">Dialog</DialogPrimitive.Title>}
        {description ? (
          <DialogPrimitive.Description className="mt-1.5 text-sm text-muted">{description}</DialogPrimitive.Description>
        ) : (
          <DialogPrimitive.Description className="sr-only">Dialog</DialogPrimitive.Description>
        )}
        <div className={title ? 'mt-5' : ''}>{children}</div>
        {!hideClose && (
          <DialogPrimitive.Close className="absolute end-4 top-4 rounded-full p-2 text-muted transition hover:bg-surface-2 hover:text-fg" aria-label="Close">
            <X className="size-5" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const DropdownMenu = Dropdown.Root;
export const DropdownMenuTrigger = Dropdown.Trigger;
export function DropdownMenuContent({ className, align = 'end', ...props }: React.ComponentPropsWithoutRef<typeof Dropdown.Content>) {
  return (
    <Dropdown.Portal>
      <Dropdown.Content
        align={align}
        sideOffset={8}
        className={cn('z-[1002] min-w-48 rounded-2xl border border-line bg-surface p-1.5 shadow-float', className)}
        {...props}
      />
    </Dropdown.Portal>
  );
}
export function DropdownMenuItem({ className, ...props }: React.ComponentPropsWithoutRef<typeof Dropdown.Item>) {
  return (
    <Dropdown.Item
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-fg outline-none transition data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted',
        className,
      )}
      {...props}
    />
  );
}
export const DropdownMenuSeparator = () => <Dropdown.Separator className="my-1 h-px bg-line" />;
export const DropdownMenuLabel = ({ children }: { children: string }) => (
  <Dropdown.Label className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">{children}</Dropdown.Label>
);

/** Confirmation dialog for destructive or important actions. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  loading,
  danger,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  loading?: boolean;
  danger?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description}>
        {children}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-12 flex-1 rounded-xl bg-surface-2 font-semibold text-fg transition hover:bg-line"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className={cn('h-12 flex-1 rounded-xl font-semibold text-white transition disabled:opacity-60', danger ? 'bg-danger' : 'bg-primary text-primary-fg')}
          >
            {loading ? '…' : confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
