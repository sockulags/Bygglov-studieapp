import { useId, useState } from 'react';
import type { CalculationStep as CalculationStepContent } from '@bygglov/content-schema';
import type { StepAnswer, StepFeedback } from '@/engine';
import { cn } from '@/lib/cn';
import { splitUnit } from '../case-model';
import { StepActions } from './shared';

export interface CalculationStepProps {
  step: CalculationStepContent;
  answer: Extract<StepAnswer, { type: 'berakning' }> | null;
  feedback: StepFeedback | null;
  onSubmit: (answer: StepAnswer) => void;
  onSkip?: () => void;
}

/** Beräkning: one numeric field per calculation, with its unit. */
export function CalculationStep({
  step,
  answer,
  feedback,
  onSubmit,
  onSkip,
}: CalculationStepProps) {
  const baseId = useId();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(step.fragor.map((f) => [f.id, ''])),
  );
  const answered = answer !== null;
  const filled = step.fragor.filter((f) => (values[f.id] ?? '').trim() !== '').length;
  const submit = () => onSubmit({ type: 'berakning', values });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!answered) submit();
      }}
    >
      <p className="text-sm text-muted">
        Decimalkomma går bra. Svara med det du mäter och räknar ut.
      </p>
      <ul className="flex flex-col gap-3">
        {step.fragor.map((item, index) => {
          const { label, unit } = splitUnit(item.text, item.enhet);
          const result = feedback?.items[index];
          const id = `${baseId}-${item.id}`;
          const given = answer ? String(answer.values[item.id] ?? '') : (values[item.id] ?? '');
          return (
            <li key={item.id} className="flex flex-col gap-1.5">
              <label htmlFor={id} className="text-[0.9375rem] leading-snug">
                {label}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={id}
                  inputMode="decimal"
                  autoComplete="off"
                  value={given}
                  readOnly={answered}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [item.id]: event.target.value }))
                  }
                  className={cn(
                    'h-10 w-36 rounded-md border bg-paper px-3 text-base tabular-nums',
                    result
                      ? result.correct
                        ? 'border-success bg-success-soft'
                        : 'border-brick bg-brick-soft'
                      : 'border-line-strong focus-visible:border-accent',
                  )}
                />
                {unit && <span className="text-muted">{unit}</span>}
              </div>
              {result && !result.correct && (
                <p className="text-sm">
                  Rätt svar: <strong className="font-semibold">{result.expected}</strong>
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {!answered && (
        <div className="flex">
          <StepActions
            onSubmit={submit}
            hint={`${filled} av ${step.fragor.length} ifyllda · Enter lämnar in`}
            onSkip={onSkip}
          />
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </div>
      )}
    </form>
  );
}
