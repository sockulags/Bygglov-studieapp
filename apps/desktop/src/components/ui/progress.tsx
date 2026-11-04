import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  /** 0–100 */
  value: number;
  tone?: 'accent' | 'success' | 'brick' | 'yellow';
  /** Thin bars are used for the per-module overview on Hem. */
  thin?: boolean;
  label?: string;
}

const toneClass = {
  accent: 'bg-accent',
  success: 'bg-success',
  brick: 'bg-brick',
  yellow: 'bg-plan-yellow',
} as const;

export function Progress({
  value,
  tone = 'accent',
  thin = false,
  label,
  className,
  ...props
}: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label={label}
      className={cn('w-full overflow-hidden rounded-full bg-line', thin ? 'h-1' : 'h-2', className)}
      {...props}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-300', toneClass[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export interface MasteryRingProps {
  /** 0–100 */
  value: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** Text inside the ring; defaults to the percentage. */
  children?: ReactNode;
  label?: string;
}

/** Circular mastery indicator used on module cards (Plugga) and in Mina resultat. */
export function MasteryRing({
  value,
  size = 56,
  strokeWidth = 5,
  className,
  children,
  label,
}: MasteryRingProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const tone =
    clamped >= 80 ? 'var(--success)' : clamped >= 40 ? 'var(--accent)' : 'var(--plan-yellow)';

  return (
    <div
      role="img"
      aria-label={label ?? `Behärskning ${Math.round(clamped)} %`}
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--line)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="absolute text-xs font-semibold tabular-nums">
        {children ?? `${Math.round(clamped)}%`}
      </span>
    </div>
  );
}
