import { CornerDownLeft, SkipForward } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/** Submit button with an optional hint and "Hoppa över" for the current step. */
export function StepActions({
  submitLabel = 'Lämna in',
  onSubmit,
  hideSubmit = false,
  disabled = false,
  hint,
  onSkip,
}: {
  submitLabel?: string;
  onSubmit?: () => void;
  /** Only the skip button (steps that are answered by clicking an alternative). */
  hideSubmit?: boolean;
  disabled?: boolean;
  hint?: ReactNode;
  onSkip?: (() => void) | undefined;
}) {
  return (
    <div className="flex flex-1 flex-wrap items-center gap-3 pt-1">
      {!hideSubmit && (
        <Button onClick={onSubmit} disabled={disabled}>
          {submitLabel}
          <CornerDownLeft aria-hidden="true" />
        </Button>
      )}
      {hint && <span className="text-sm text-muted">{hint}</span>}
      {onSkip && (
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-muted"
          onClick={onSkip}
          title="Steget räknas som inte gjort. Ärendet går vidare, med de följder det får."
        >
          <SkipForward aria-hidden="true" />
          Hoppa över
        </Button>
      )}
    </div>
  );
}
