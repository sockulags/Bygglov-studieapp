import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface StampProps extends HTMLAttributes<HTMLSpanElement> {
  /** Main text, e.g. "INKOM" or "BEVILJAT". Rendered in uppercase. */
  children: ReactNode;
  /** Secondary line, e.g. a date "2026-03-02" or a diary number. */
  detail?: string;
  tone?: 'brick' | 'accent' | 'success' | 'ink';
  size?: 'sm' | 'md';
  /** Slight rotation to look hand-stamped. */
  tilt?: boolean;
}

const toneClass = {
  brick: 'text-brick border-brick',
  accent: 'text-accent border-accent',
  success: 'text-success border-success',
  ink: 'text-ink border-ink',
} as const;

/** A document stamp ("INKOM 2026-03-02") for handlingar and beslut. */
export function Stamp({
  children,
  detail,
  tone = 'brick',
  size = 'md',
  tilt = true,
  className,
  ...props
}: StampProps) {
  return (
    <span
      className={cn(
        'inline-flex flex-col items-center justify-center rounded-sm border-2 bg-transparent font-sans font-bold tracking-[0.12em] uppercase select-none',
        'opacity-90 mix-blend-multiply dark:mix-blend-normal',
        size === 'sm' ? 'px-2 py-0.5 text-[0.625rem]' : 'px-3 py-1 text-xs',
        tilt && '-rotate-3',
        toneClass[tone],
        className,
      )}
      {...props}
    >
      <span>{children}</span>
      {detail && (
        <span className={cn('font-semibold tracking-normal', size === 'sm' ? 'text-[0.6rem]' : 'text-[0.7rem]')}>
          {detail}
        </span>
      )}
    </span>
  );
}
