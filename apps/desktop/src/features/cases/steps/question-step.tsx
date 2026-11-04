import { CornerDownLeft } from 'lucide-react';
import { useId, useState } from 'react';
import type { QuestionStep as QuestionStepContent } from '@bygglov/content-schema';
import { Button } from '@/components/ui/button';
import type { CaseQuestionAnswer, StepAnswer } from '@/engine';
import { OptionButton, type OptionState } from '@/features/study/option-button';
import { useKeydown } from '@/lib/use-keydown';
import { useDigitKeys, useEnterKey } from './keys';
import { StepActions } from './shared';

export interface QuestionStepProps {
  step: QuestionStepContent;
  /** The submitted answer, or null while answering. */
  answer: Extract<StepAnswer, { type: 'fraga' }> | null;
  /** Saved text of an unfinished open answer. */
  draftText?: string;
  onDraft?: (text: string) => void;
  onSubmit: (answer: StepAnswer) => void;
  onSkip?: () => void;
}

/**
 * Fråga i ärendet: flerval, flersvar and sant/falskt with the quiz's answer buttons, or an
 * open answer that is self-assessed afterwards (see StepFeedbackPanel).
 */
export function QuestionStep(props: QuestionStepProps) {
  const { step } = props;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[1.0625rem] leading-snug font-medium whitespace-pre-line">{step.fraga}</p>
      {step.fragetyp === 'flerval' && <Choice {...props} />}
      {step.fragetyp === 'flersvar' && <MultiChoice {...props} />}
      {step.fragetyp === 'sant_falskt' && <TrueFalse {...props} />}
      {step.fragetyp === 'oppen' && <OpenText {...props} />}
    </div>
  );
}

function submitQuestion(props: QuestionStepProps, answer: CaseQuestionAnswer) {
  props.onSubmit({ type: 'fraga', answer });
}

function Choice(props: QuestionStepProps) {
  const { step, answer } = props;
  const alternatives = step.alternativ ?? [];
  const given = answer?.answer.type === 'flerval' ? answer.answer.selected : null;
  const answered = answer !== null;
  useDigitKeys(
    alternatives.length,
    (index) => submitQuestion(props, { type: 'flerval', selected: index }),
    !answered,
  );
  return (
    <>
      <div role="group" aria-label="Svarsalternativ" className="flex flex-col gap-2">
        {alternatives.map((choice, index) => {
          const picked = given === index;
          const state: OptionState = answered
            ? choice.ratt
              ? 'correct'
              : picked
                ? 'incorrect'
                : 'neutral'
            : 'idle';
          return (
            <OptionButton
              key={index}
              shortcut={String(index + 1)}
              state={state}
              className="py-3 text-[0.9375rem]"
              aria-disabled={answered || undefined}
              note={
                answered && choice.forklaring && (picked || choice.ratt)
                  ? choice.forklaring
                  : undefined
              }
              onClick={() =>
                !answered && submitQuestion(props, { type: 'flerval', selected: index })
              }
            >
              {choice.text}
            </OptionButton>
          );
        })}
      </div>
      {!answered && props.onSkip && <StepActions onSkip={props.onSkip} hideSubmit />}
    </>
  );
}

function MultiChoice(props: QuestionStepProps) {
  const { step, answer } = props;
  const alternatives = step.alternativ ?? [];
  const [picked, setPicked] = useState<number[]>([]);
  const answered = answer !== null;
  const chosen = answer?.answer.type === 'flersvar' ? answer.answer.selected : picked;
  const toggle = (index: number) =>
    setPicked((current) =>
      current.includes(index) ? current.filter((i) => i !== index) : [...current, index],
    );
  const submit = () => submitQuestion(props, { type: 'flersvar', selected: picked });
  useDigitKeys(alternatives.length, toggle, !answered);
  useEnterKey(submit, !answered);
  return (
    <>
      <p className="text-sm text-muted">Välj alla som stämmer.</p>
      <div role="group" aria-label="Svarsalternativ" className="flex flex-col gap-2">
        {alternatives.map((choice, index) => {
          const isPicked = chosen.includes(index);
          const state: OptionState = answered
            ? choice.ratt
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
              note={
                answered && choice.forklaring && (isPicked || choice.ratt)
                  ? choice.forklaring
                  : undefined
              }
              onClick={() => !answered && toggle(index)}
            >
              {choice.text}
            </OptionButton>
          );
        })}
      </div>
      {!answered && (
        <StepActions
          submitLabel="Svara"
          onSubmit={submit}
          hint="eller Enter"
          onSkip={props.onSkip}
        />
      )}
    </>
  );
}

function TrueFalse(props: QuestionStepProps) {
  const { step, answer } = props;
  const answered = answer !== null;
  const given = answer?.answer.type === 'sant_falskt' ? answer.answer.value : undefined;
  const options = [
    { value: true, label: 'Sant', keys: ['1', 's'] },
    { value: false, label: 'Falskt', keys: ['2', 'f'] },
  ];
  useKeydown((event) => {
    const option = options.find((o) => o.keys.includes(event.key.toLowerCase()));
    if (!option) return;
    event.preventDefault();
    submitQuestion(props, { type: 'sant_falskt', value: option.value });
  }, !answered);
  return (
    <>
      <div role="group" aria-label="Sant eller falskt" className="grid gap-2 sm:grid-cols-2">
        {options.map((option, index) => {
          const picked = given === option.value;
          const state: OptionState = answered
            ? option.value === step.svar
              ? 'correct'
              : picked
                ? 'incorrect'
                : 'neutral'
            : 'idle';
          return (
            <OptionButton
              key={option.label}
              shortcut={String(index + 1)}
              state={state}
              aria-disabled={answered || undefined}
              onClick={() =>
                !answered && submitQuestion(props, { type: 'sant_falskt', value: option.value })
              }
            >
              {option.label}
            </OptionButton>
          );
        })}
      </div>
      {!answered && props.onSkip && <StepActions onSkip={props.onSkip} hideSubmit />}
    </>
  );
}

function OpenText(props: QuestionStepProps) {
  const { answer, draftText = '', onDraft } = props;
  const id = useId();
  const [text, setText] = useState(draftText);
  const answered = answer !== null;
  const shown = answer?.answer.type === 'oppen' ? answer.answer.text : text;
  const submit = () => submitQuestion(props, { type: 'oppen', text });
  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={id} className="text-sm text-muted">
        Skriv ditt svar med egna ord. Sedan jämför du med bedömningspunkterna.
      </label>
      <textarea
        id={id}
        value={shown}
        readOnly={answered}
        rows={7}
        onChange={(event) => {
          setText(event.target.value);
          onDraft?.(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !answered) {
            event.preventDefault();
            submit();
          }
        }}
        className="w-full rounded-md border border-line-strong bg-paper p-3 text-[0.9375rem] leading-relaxed focus-visible:border-accent"
      />
      {!answered && (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={submit} disabled={text.trim() === ''}>
            Jämför med facit
            <CornerDownLeft aria-hidden="true" />
          </Button>
          <span className="text-sm text-muted">eller Ctrl + Enter</span>
          {props.onSkip && <StepActions onSkip={props.onSkip} hideSubmit />}
        </div>
      )}
    </div>
  );
}
