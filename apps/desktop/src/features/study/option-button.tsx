import { Check, X } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type OptionState = 'idle' | 'selected' | 'correct' | 'incorrect' | 'missed' | 'neutral';

export interface OptionButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> {
  /** Keyboard shortcut shown in the badge, e.g. "1". */
  shortcut?: string;
  state: OptionState;
  children: ReactNode;
  /** Extra text under the label, e.g. the explanation for this alternative. */
  note?: ReactNode;
  /** Square checkbox look for "flera rätt". */
  checkbox?: boolean;
}

const stateClass: Record<OptionState, string> = {
  idle: 'border-line-strong bg-paper hover:border-accent hover:bg-accent-soft/60',
  selected: 'border-accent bg-accent-soft',
  correct: 'border-success bg-success-soft',
  incorrect: 'border-brick bg-brick-soft',
  missed: 'border-success border-dashed bg-paper',
  neutral: 'border-line bg-paper text-muted',
};

const stateLabel: Partial<Record<OptionState, string>> = {
  correct: 'Rätt',
  incorrect: 'Fel',
  missed: 'Rätt svar, inte valt',
};

/** Large answer button used by flerval, flersvar and sant/falskt. */
export function OptionButton({
  shortcut,
  state,
  children,
  note,
  checkbox = false,
  className,
  ...props
}: OptionButtonProps) {
  const label = stateLabel[state];
  return (
    <button
      type="button"
      className={cn(
        'group flex w-full items-start gap-4 rounded-lg border px-4 py-3.5 text-left text-base leading-snug',
        'transition-colors duration-[var(--duration-fast)] disabled:cursor-default',
        stateClass[state],
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 inline-flex size-7 shrink-0 items-center justify-center border text-sm font-semibold tabular-nums',
          checkbox ? 'rounded-sm' : 'rounded-md',
          state === 'correct'
            ? 'border-success bg-success text-paper'
            : state === 'missed'
              ? 'border-success bg-transparent text-success'
              : state === 'incorrect'
                ? 'border-brick bg-brick text-paper'
                : state === 'selected'
                  ? 'border-accent bg-accent text-accent-ink'
                  : 'border-line-strong bg-bg text-muted',
        )}
      >
        {state === 'correct' || state === 'missed' ? (
          <Check className="size-4" strokeWidth={2.5} />
        ) : state === 'incorrect' ? (
          <X className="size-4" strokeWidth={2.5} />
        ) : checkbox && state === 'selected' ? (
          <Check className="size-4" strokeWidth={2.5} />
        ) : (
          shortcut
        )}
      </span>
      <span className="min-w-0 flex-1 pt-0.5">
        <span className="block text-ink">{children}</span>
        {label && state !== 'missed' && <span className="sr-only">. {label}</span>}
        {note && <span className="mt-1.5 block text-sm text-muted">{note}</span>}
      </span>
      {state === 'missed' && (
        <span className="mt-0.5 shrink-0 rounded-sm border border-success/60 px-1.5 py-0.5 text-xs font-medium text-success">
          {label}
        </span>
      )}
    </button>
  );
}
