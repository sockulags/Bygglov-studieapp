import { CircleHelp, Scale } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { Tooltip } from './tooltip';

export const UNCERTAIN_LAW_REF_HINT = 'Kontrollera paragrafen i Lagtextens byggregler';

export interface LawRefChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** The reference as written in content, e.g. "PBL 9 kap." or "FL 25 §". */
  reference: string;
  /** The paragraph number is not verified (`lagrum_osaker`); shows a question mark. */
  uncertain?: boolean;
}

const chipClass =
  'inline-flex h-7 items-center gap-1.5 rounded-sm border border-accent/30 bg-accent-soft px-2 text-xs font-medium text-accent';

function UncertainMark() {
  return (
    <Tooltip content={UNCERTAIN_LAW_REF_HINT}>
      <span
        tabIndex={0}
        role="img"
        aria-label={`Osäker paragraf. ${UNCERTAIN_LAW_REF_HINT}.`}
        className="-mr-0.5 inline-flex rounded-full text-brick outline-offset-1"
      >
        <CircleHelp className="size-3.5" aria-hidden="true" />
      </span>
    </Tooltip>
  );
}

/**
 * Small chip for a lagrum. With an onClick it is a button (e.g. to open the reference in
 * Uppslag); without one it is plain text, so the uncertainty tooltip can still be reached.
 */
export function LawRefChip({
  reference,
  uncertain = false,
  className,
  onClick,
  ...props
}: LawRefChipProps) {
  const label = (
    <>
      <Scale className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="font-serif text-[0.8125rem] tracking-tight">{reference}</span>
    </>
  );
  if (typeof onClick !== 'function') {
    return (
      <span className={cn(chipClass, className)} data-uncertain={uncertain || undefined}>
        {label}
        {uncertain && <UncertainMark />}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={onClick}
        className={cn(chipClass, 'hover:border-accent/60 hover:brightness-95', className)}
        {...props}
      >
        {label}
      </button>
      {uncertain && <UncertainMark />}
    </span>
  );
}
