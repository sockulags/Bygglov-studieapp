import { Scale } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface LawRefChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** The reference as written in content, e.g. "PBL 9 kap. 4 a §". */
  reference: string;
}

/**
 * Small chip for a lagrum. Rendered as a button so it can open the reference
 * in Uppslag later; without an onClick it is presentational.
 */
export function LawRefChip({ reference, className, onClick, ...props }: LawRefChipProps) {
  const interactive = typeof onClick === 'function';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-sm border border-accent/30 bg-accent-soft px-2 text-xs font-medium text-accent',
        'disabled:cursor-default',
        interactive && 'hover:border-accent/60 hover:brightness-95',
        className,
      )}
      {...props}
    >
      <Scale className="size-3.5" aria-hidden="true" />
      <span className="font-serif text-[0.8125rem] tracking-tight">{reference}</span>
    </button>
  );
}
