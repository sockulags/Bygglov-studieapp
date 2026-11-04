import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap ' +
  'transition-colors duration-[var(--duration-fast)] select-none ' +
  'disabled:pointer-events-none disabled:opacity-50 ' +
  '[&_svg]:size-4 [&_svg]:shrink-0';

export const buttonVariantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-110 active:brightness-95',
  secondary:
    'bg-paper text-ink border border-line-strong hover:bg-accent-soft hover:border-accent/40',
  ghost: 'bg-transparent text-ink hover:bg-accent-soft',
  danger: 'bg-brick-soft text-brick border border-brick/30 hover:bg-brick hover:text-white',
};

export const buttonSizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-[0.9375rem]',
  lg: 'h-12 px-6 text-base',
};

/** Class names for a button look on non-button elements (e.g. router links). */
export function buttonVariants({
  variant = 'primary',
  size = 'md',
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return cn(buttonBase, buttonVariantClasses[variant], buttonSizeClasses[size], className);
}
