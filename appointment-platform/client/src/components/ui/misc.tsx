import * as AvatarPrimitive from '@radix-ui/react-avatar';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as LabelPrimitive from '@radix-ui/react-label';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cva, type VariantProps } from 'class-variance-authority';
import { Check } from 'lucide-react';
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn, initials } from '@/lib/utils';

export const Label = forwardRef<HTMLLabelElement, LabelPrimitive.LabelProps>(({ className, ...p }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn('text-sm font-medium leading-none', className)} {...p} />
));
Label.displayName = 'Label';

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl border bg-card text-card-foreground shadow-soft', className)} {...p} />;
}
export function CardHeader({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 p-5 pb-3', className)} {...p} />;
}
export function CardTitle({ className, ...p }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-base font-semibold', className)} {...p} />;
}
export function CardDescription({ className, ...p }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...p} />;
}
export function CardContent({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 pt-0', className)} {...p} />;
}

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', {
  variants: {
    tone: {
      default: 'bg-muted text-foreground',
      primary: 'bg-primary/10 text-primary',
      success: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
      warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
      danger: 'bg-rose-500/12 text-rose-700 dark:text-rose-400',
      info: 'bg-sky-500/12 text-sky-700 dark:text-sky-400',
      orange: 'bg-orange-500/12 text-orange-700 dark:text-orange-400',
      muted: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
    },
  },
  defaultVariants: { tone: 'default' },
});
export function Badge({ className, tone, ...p }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...p} />;
}

export function Skeleton({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-xl bg-muted', className)} {...p} />;
}

export function Separator({ className }: { className?: string }) {
  return <div role="separator" className={cn('h-px w-full bg-border', className)} />;
}

export const Switch = forwardRef<HTMLButtonElement, SwitchPrimitive.SwitchProps>(({ className, ...p }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    dir="ltr" /* thumb position handled in index.css so it mirrors correctly in RTL */
    className={cn('peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors data-[state=checked]:bg-primary data-[state=unchecked]:bg-input disabled:opacity-50', className)}
    {...p}
  >
    <SwitchPrimitive.Thumb className="switch-thumb pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg transition-transform" />
  </SwitchPrimitive.Root>
));
Switch.displayName = 'Switch';

export const Checkbox = forwardRef<HTMLButtonElement, CheckboxPrimitive.CheckboxProps>(({ className, ...p }, ref) => (
  <CheckboxPrimitive.Root ref={ref} className={cn('peer h-5 w-5 shrink-0 rounded-md border border-input shadow-sm data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground', className)} {...p}>
    <CheckboxPrimitive.Indicator className="flex items-center justify-center">
      <Check className="h-3.5 w-3.5" strokeWidth={3} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = 'Checkbox';

export const Tabs = TabsPrimitive.Root;
export const TabsList = forwardRef<HTMLDivElement, TabsPrimitive.TabsListProps>(({ className, ...p }, ref) => (
  <TabsPrimitive.List ref={ref} className={cn('inline-flex h-10 items-center gap-1 overflow-x-auto rounded-xl bg-muted p-1 text-muted-foreground scrollbar-thin', className)} {...p} />
));
TabsList.displayName = 'TabsList';
export const TabsTrigger = forwardRef<HTMLButtonElement, TabsPrimitive.TabsTriggerProps>(({ className, ...p }, ref) => (
  <TabsPrimitive.Trigger ref={ref} className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm', className)} {...p} />
));
TabsTrigger.displayName = 'TabsTrigger';
export const TabsContent = forwardRef<HTMLDivElement, TabsPrimitive.TabsContentProps>(({ className, ...p }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn('mt-4 focus-visible:outline-none', className)} {...p} />
));
TabsContent.displayName = 'TabsContent';

export function Avatar({ name, src, className, color }: { name?: string; src?: string; className?: string; color?: string }) {
  return (
    <AvatarPrimitive.Root className={cn('relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full', className)}>
      {src && <AvatarPrimitive.Image src={src} alt={name} className="aspect-square h-full w-full object-cover" />}
      <AvatarPrimitive.Fallback className="flex h-full w-full items-center justify-center text-xs font-semibold text-white" style={{ background: color ?? 'hsl(var(--primary))' }}>
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content sideOffset={6} className="z-50 rounded-lg bg-foreground px-2.5 py-1.5 text-xs text-background shadow-md animate-in fade-in-0">
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
