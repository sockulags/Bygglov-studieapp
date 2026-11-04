import { useState } from 'react';
import type { SelectionStep as SelectionStepContent } from '@bygglov/content-schema';
import type { StepAnswer, StepFeedback } from '@/engine';
import { OptionButton, type OptionState } from '@/features/study/option-button';
import { useDigitKeys, useEnterKey } from './keys';
import { StepActions } from './shared';

export interface SelectionStepProps {
  step: SelectionStepContent;
  answer: Extract<StepAnswer, { type: 'urval' }> | null;
  feedback: StepFeedback | null;
  onSubmit: (answer: StepAnswer) => void;
  onSkip?: () => void;
}

/** Urval: choose the right ones (e.g. which neighbours to notify). */
export function SelectionStep({ step, answer, feedback, onSubmit, onSkip }: SelectionStepProps) {
  const [picked, setPicked] = useState<number[]>([]);
  const answered = answer !== null;
  const chosen = answer ? answer.selected : picked;
  const toggle = (index: number) =>
    setPicked((current) =>
      current.includes(index) ? current.filter((i) => i !== index) : [...current, index],
    );
  const submit = () => onSubmit({ type: 'urval', selected: [...picked].sort((a, b) => a - b) });
  useDigitKeys(step.alternativ.length, toggle, !answered);
  useEnterKey(submit, !answered);

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Alternativ" className="flex flex-col gap-2">
        {step.alternativ.map((alt, index) => {
          const isPicked = chosen.includes(index);
          const state: OptionState = answered
            ? alt.ratt
              ? isPicked
                ? 'correct'
                : 'missed'
              : isPicked
                ? 'incorrect'
                : 'neutral'
            : isPicked
              ? 'selected'
              : 'idle';
          return (
            <OptionButton
              key={index}
              checkbox
              shortcut={String(index + 1)}
              state={state}
              className="py-3 text-[0.9375rem]"
              aria-pressed={isPicked}
              aria-disabled={answered || undefined}
              note={answered ? (feedback?.items[index]?.explanation ?? alt.kommentar) : undefined}
              onClick={() => !answered && toggle(index)}
            >
              {alt.text}
            </OptionButton>
          );
        })}
      </div>
      {answered && feedback?.selection && (
        <p className="text-sm text-muted">
          {feedback.selection.truePositives} rätt valda, {feedback.selection.falsePositives} i
          onödan, {feedback.selection.falseNegatives} saknas.
        </p>
      )}
      {!answered && (
        <StepActions
          onSubmit={submit}
          hint={`${picked.length} valda · Enter lämnar in`}
          onSkip={onSkip}
        />
      )}
    </div>
  );
}
