import { Check, X } from 'lucide-react';
import { useState } from 'react';
import type { ChecklistStep as ChecklistStepContent } from '@bygglov/content-schema';
import type { StepAnswer, StepFeedback } from '@/engine';
import { cn } from '@/lib/cn';
import { useDigitKeys, useEnterKey } from './keys';
import { StepActions } from './shared';

type Mark = boolean | null;

export interface ChecklistStepProps {
  step: ChecklistStepContent;
  /** The submitted answer; the list is read-only with right and wrong marked. */
  answer: Extract<StepAnswer, { type: 'checklista' }> | null;
  feedback: StepFeedback | null;
  onSubmit: (answer: StepAnswer) => void;
  onSkip?: () => void;
}

/** Checklista: mark each post as "finns" or "saknas"; the comment is shown afterwards. */
export function ChecklistStep({ step, answer, feedback, onSubmit, onSkip }: ChecklistStepProps) {
  const [marks, setMarks] = useState<Mark[]>(() => step.poster.map(() => null));
  const answered = answer !== null;
  const shown = answer ? answer.marks : marks;
  const marked = marks.filter((m) => m !== null).length;
  const complete = marked === step.poster.length;

  const setMark = (index: number, value: Mark) =>
    setMarks((current) => current.map((m, i) => (i === index ? value : m)));
  // 1–9 toggles a post: unmarked → finns → saknas → finns …
  useDigitKeys(step.poster.length, (index) => setMark(index, marks[index] !== true), !answered);
  const submit = () => {
    if (complete) onSubmit({ type: 'checklista', marks });
  };
  useEnterKey(submit, !answered && complete);

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2" aria-label="Checklista">
        {step.poster.map((post, index) => {
          const mark = shown[index] ?? null;
          const item = feedback?.items[index];
          const label = `${index + 1}. ${post.text}`;
          return (
            <li
              key={index}
              className={cn(
                'rounded-lg border px-3 py-2.5',
                item
                  ? item.correct
                    ? 'border-success/60 bg-success-soft'
                    : 'border-brick/60 bg-brick-soft'
                  : 'border-line-strong bg-paper',
              )}
            >
              <div
                role="radiogroup"
                aria-label={label}
                className="flex flex-wrap items-center gap-x-3 gap-y-2"
              >
                <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm border border-line-strong bg-bg text-xs font-semibold tabular-nums text-muted">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 text-[0.9375rem] leading-snug">{post.text}</span>
                <span className="flex shrink-0 gap-1">
                  <MarkButton
                    label="Finns"
                    checked={mark === true}
                    disabled={answered}
                    onClick={() => setMark(index, true)}
                  />
                  <MarkButton
                    label="Saknas"
                    checked={mark === false}
                    disabled={answered}
                    onClick={() => setMark(index, false)}
                  />
                </span>
              </div>
              {item && (
                <p className="mt-2 flex items-start gap-1.5 pl-9 text-sm">
                  {item.correct ? (
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                  ) : (
                    <X className="mt-0.5 size-4 shrink-0 text-brick" aria-hidden="true" />
                  )}
                  <span>
                    <span className="font-medium">
                      {item.correct ? 'Rätt' : 'Fel'}: {item.expected}.
                    </span>
                    {item.explanation && <span className="text-muted"> {item.explanation}</span>}
                  </span>
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {!answered && (
        <StepActions
          onSubmit={submit}
          disabled={!complete}
          hint={complete ? 'eller Enter' : `${marked} av ${step.poster.length} markerade`}
          onSkip={onSkip}
        />
      )}
    </div>
  );
}

function MarkButton({
  label,
  checked,
  disabled,
  onClick,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      onClick={() => !disabled && onClick()}
      className={cn(
        'h-8 rounded-md border px-3 text-sm font-medium transition-colors duration-[var(--duration-fast)]',
        checked
          ? 'border-accent bg-accent text-accent-ink'
          : 'border-line-strong bg-paper text-ink',
        !disabled && !checked && 'hover:border-accent hover:bg-accent-soft',
        disabled && 'cursor-default',
      )}
    >
      {label}
    </button>
  );
}
