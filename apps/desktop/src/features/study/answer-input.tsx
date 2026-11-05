import { ArrowDown, ArrowUp, Check, CornerDownLeft, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { GAP_PATTERN, type Question } from '@bygglov/content-schema';
import { Button } from '@/components/ui/button';
import type { GradeResult, QuizAnswer, SessionItem } from '@/engine';
import { cn } from '@/lib/cn';
import { useKeydown } from '@/lib/use-keydown';
import { OptionButton, type OptionState } from './option-button';

type Of<T extends Question['typ']> = Extract<Question, { typ: T }>;

export interface AnswerInputProps {
  item: SessionItem;
  /** False in Tentaläge: answers are taken without showing right or wrong. */
  revealFeedback: boolean;
  onSubmit: (answer: QuizAnswer) => void;
  onSelfAssess: (checked: number[]) => void;
}

/** The answer controls for one question, chosen by question type. */
export function AnswerInput({ item, revealFeedback, onSubmit, onSelfAssess }: AnswerInputProps) {
  const { question } = item;
  const result = item.response?.result ?? null;
  const given = item.response?.answer ?? null;
  const shown = revealFeedback ? result : null;
  switch (question.typ) {
    case 'flerval':
      return (
        <MultipleChoice
          question={question}
          selected={given?.type === 'flerval' ? given.selected : null}
          answered={result !== null}
          reveal={shown !== null}
          onSubmit={onSubmit}
        />
      );
    case 'flersvar':
      return (
        <MultipleAnswer
          question={question}
          given={given?.type === 'flersvar' ? given.selected : null}
          reveal={shown !== null}
          answered={result !== null}
          onSubmit={onSubmit}
        />
      );
    case 'sant_falskt':
      return (
        <TrueFalse
          question={question}
          given={given?.type === 'sant_falskt' ? given.value : undefined}
          reveal={shown !== null}
          onSubmit={onSubmit}
        />
      );
    case 'lucktext':
      return (
        <Cloze question={question} result={shown} answered={result !== null} onSubmit={onSubmit} />
      );
    case 'para_ihop':
      return (
        <Matching
          question={question}
          rightOrder={item.presentation.rightOrder ?? question.par.map((_, i) => i)}
          result={shown}
          answered={result !== null}
          onSubmit={onSubmit}
        />
      );
    case 'ordning':
      return (
        <Ordering
          question={question}
          initialOrder={item.presentation.initialOrder ?? question.poster.map((_, i) => i)}
          result={shown}
          answered={result !== null}
          onSubmit={onSubmit}
        />
      );
    case 'berakning':
      return (
        <NumericAnswer
          unit={question.enhet}
          result={shown}
          answered={result !== null}
          onSubmit={(value) => onSubmit({ type: 'berakning', value })}
        />
      );
    case 'oppen':
      return <OpenAnswer result={result} onSubmit={onSubmit} onSelfAssess={onSelfAssess} />;
    case 'ritning':
      return question.svar !== undefined ? (
        <NumericAnswer
          unit={question.enhet}
          result={shown}
          answered={result !== null}
          // Focus stays off the field so M reaches the drawing's measuring tool at once.
          autoFocus={false}
          onSubmit={(value) => onSubmit({ type: 'ritning', value })}
        />
      ) : (
        <OpenAnswer
          result={result}
          autoFocus={false}
          onSubmit={(answer) =>
            onSubmit({ type: 'ritning', text: answer.type === 'oppen' ? answer.text : '' })
          }
          onSelfAssess={onSelfAssess}
        />
      );
  }
}

/* ------------------------------------------------------------------- choice answers */

function digitOf(event: KeyboardEvent): number | null {
  if (!/^[1-9]$/.test(event.key)) return null;
  return Number(event.key) - 1;
}

function MultipleChoice({
  question,
  selected,
  answered,
  reveal,
  onSubmit,
}: {
  question: Of<'flerval'>;
  selected: number | null;
  answered: boolean;
  reveal: boolean;
  onSubmit: (answer: QuizAnswer) => void;
}) {
  useKeydown((event) => {
    const index = digitOf(event);
    if (index === null || index >= question.alternativ.length) return;
    event.preventDefault();
    onSubmit({ type: 'flerval', selected: index });
  }, !answered);

  return (
    <div role="group" aria-label="Svarsalternativ" className="flex flex-col gap-2.5">
      {question.alternativ.map((choice, index) => {
        const picked = selected === index;
        let state: OptionState = 'idle';
        if (answered && !reveal) state = picked ? 'selected' : 'neutral';
        if (reveal) state = choice.ratt ? 'correct' : picked ? 'incorrect' : 'neutral';
        const note =
          reveal && choice.forklaring && (picked || choice.ratt) ? choice.forklaring : undefined;
        return (
          <OptionButton
            key={index}
            shortcut={String(index + 1)}
            state={state}
            note={note}
            aria-disabled={answered || undefined}
            onClick={() => !answered && onSubmit({ type: 'flerval', selected: index })}
          >
            {choice.text}
          </OptionButton>
        );
      })}
    </div>
  );
}

function MultipleAnswer({
  question,
  given,
  answered,
  reveal,
  onSubmit,
}: {
  question: Of<'flersvar'>;
  given: readonly number[] | null;
  answered: boolean;
  reveal: boolean;
  onSubmit: (answer: QuizAnswer) => void;
}) {
  const [picked, setPicked] = useState<number[]>([]);
  const chosen = given ?? picked;
  const toggle = (index: number) =>
    setPicked((current) =>
      current.includes(index) ? current.filter((i) => i !== index) : [...current, index],
    );
  const submit = () => onSubmit({ type: 'flersvar', selected: picked });

  useKeydown((event) => {
    const index = digitOf(event);
    if (index !== null && index < question.alternativ.length) {
      event.preventDefault();
      toggle(index);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  }, !answered);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">Välj alla som stämmer. Det kan vara ett eller flera.</p>
      <div role="group" aria-label="Svarsalternativ" className="flex flex-col gap-2.5">
        {question.alternativ.map((choice, index) => {
          const isPicked = chosen.includes(index);
          let state: OptionState = isPicked ? 'selected' : 'idle';
          if (answered && !reveal) state = isPicked ? 'selected' : 'neutral';
          if (reveal) {
            state = choice.ratt
              ? isPicked
                ? 'correct'
                : 'missed'
              : isPicked
                ? 'incorrect'
                : 'neutral';
          }
          return (
            <OptionButton
              key={index}
              checkbox
              shortcut={String(index + 1)}
              state={state}
              aria-pressed={isPicked}
              aria-disabled={answered || undefined}
              note={
                reveal && choice.forklaring && (isPicked || choice.ratt)
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
        <div>
          <Button size="lg" onClick={submit}>
            Svara
            <CornerDownLeft aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}

function TrueFalse({
  question,
  given,
  reveal,
  onSubmit,
}: {
  question: Of<'sant_falskt'>;
  given: boolean | null | undefined;
  reveal: boolean;
  onSubmit: (answer: QuizAnswer) => void;
}) {
  const answered = given !== undefined;
  const options = [
    { value: true, label: 'Sant', keys: ['1', 's'] },
    { value: false, label: 'Falskt', keys: ['2', 'f'] },
  ];
  useKeydown((event) => {
    const option = options.find((o) => o.keys.includes(event.key.toLowerCase()));
    if (!option) return;
    event.preventDefault();
    onSubmit({ type: 'sant_falskt', value: option.value });
  }, !answered);

  return (
    <div role="group" aria-label="Sant eller falskt" className="grid gap-2.5 sm:grid-cols-2">
      {options.map((option, index) => {
        const picked = given === option.value;
        let state: OptionState = 'idle';
        if (answered && !reveal) state = picked ? 'selected' : 'neutral';
        if (reveal)
          state = option.value === question.svar ? 'correct' : picked ? 'incorrect' : 'neutral';
        return (
          <OptionButton
            key={option.label}
            shortcut={String(index + 1)}
            state={state}
            aria-disabled={answered || undefined}
            onClick={() => !answered && onSubmit({ type: 'sant_falskt', value: option.value })}
          >
            {option.label}
          </OptionButton>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------------- text answers */

function feedbackBorder(result: GradeResult | null, index: number): string {
  if (!result || result.kind !== 'graded') return 'border-line-strong focus-visible:border-accent';
  return result.items[index]?.correct
    ? 'border-success bg-success-soft'
    : 'border-brick bg-brick-soft';
}

function Cloze({
  question,
  result,
  answered,
  onSubmit,
}: {
  question: Of<'lucktext'>;
  result: GradeResult | null;
  answered: boolean;
  onSubmit: (answer: QuizAnswer) => void;
}) {
  const parts = question.fraga.split(GAP_PATTERN);
  const [gaps, setGaps] = useState<string[]>(() => question.svar.map(() => ''));
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!answered) onSubmit({ type: 'lucktext', gaps });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <p className="text-lg leading-[2.4]">
        {parts.map((part, index) => (
          <span key={index}>
            {part}
            {index < parts.length - 1 && (
              <input
                ref={index === 0 ? first : undefined}
                aria-label={`Lucka ${index + 1}`}
                value={gaps[index] ?? ''}
                readOnly={answered}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) =>
                  setGaps((current) =>
                    current.map((value, i) => (i === index ? event.target.value : value)),
                  )
                }
                className={cn(
                  'mx-1 inline-block h-9 w-32 rounded-md border bg-paper px-2 text-center text-base align-baseline',
                  feedbackBorder(result, index),
                )}
              />
            )}
          </span>
        ))}
      </p>
      {result?.kind === 'graded' && result.items.some((i) => !i.correct) && (
        <ul className="flex flex-col gap-1 text-sm">
          {result.items
            .filter((i) => !i.correct)
            .map((i) => (
              <li key={i.index}>
                <span className="text-muted">Lucka {i.index + 1}:</span> rätt svar{' '}
                <strong className="font-semibold">{i.expected}</strong>
                {i.given ? <span className="text-muted"> (du skrev {i.given})</span> : null}
              </li>
            ))}
        </ul>
      )}
      {!answered && (
        <div>
          <Button type="submit" size="lg">
            Svara
            <CornerDownLeft aria-hidden="true" />
          </Button>
        </div>
      )}
    </form>
  );
}

function NumericAnswer({
  unit,
  result,
  answered,
  autoFocus = true,
  onSubmit,
}: {
  unit: string | undefined;
  result: GradeResult | null;
  answered: boolean;
  autoFocus?: boolean;
  onSubmit: (value: string) => void;
}) {
  const id = useId();
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);
  const item = result?.kind === 'graded' ? result.items[0] : undefined;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!answered) onSubmit(value);
      }}
      className="flex flex-col gap-4"
    >
      <label htmlFor={id} className="text-sm text-muted">
        Ditt svar (decimalkomma går bra)
      </label>
      <div className="flex items-center gap-3">
        <input
          id={id}
          ref={input}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          readOnly={answered}
          onChange={(event) => setValue(event.target.value)}
          className={cn(
            'h-12 w-48 rounded-md border bg-paper px-3 text-lg tabular-nums',
            feedbackBorder(result, 0),
          )}
        />
        {unit && <span className="text-lg text-muted">{unit}</span>}
      </div>
      {item && !item.correct && (
        <p className="text-sm">
          Rätt svar: <strong className="font-semibold">{item.expected}</strong>
        </p>
      )}
      {!answered && (
        <div>
          <Button type="submit" size="lg">
            Svara
            <CornerDownLeft aria-hidden="true" />
          </Button>
        </div>
      )}
    </form>
  );
}

/* ---------------------------------------------------------- matching and ordering */

function Matching({
  question,
  rightOrder,
  result,
  answered,
  onSubmit,
}: {
  question: Of<'para_ihop'>;
  rightOrder: readonly number[];
  result: GradeResult | null;
  answered: boolean;
  onSubmit: (answer: QuizAnswer) => void;
}) {
  const [matches, setMatches] = useState<(number | null)[]>(() => question.par.map(() => null));
  const baseId = useId();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!answered) onSubmit({ type: 'para_ihop', matches });
      }}
      className="flex flex-col gap-4"
    >
      <p className="text-sm text-muted">Para ihop varje rad till vänster med rätt alternativ.</p>
      <ul className="flex flex-col gap-3">
        {question.par.map((pair, index) => {
          const feedback = result?.kind === 'graded' ? result.items[index] : undefined;
          return (
            <li
              key={index}
              className="grid gap-2 rounded-lg border border-line bg-bg/60 p-3 md:grid-cols-[1fr_1.2fr] md:items-center"
            >
              <label htmlFor={`${baseId}-${index}`} className="font-medium">
                {pair.vanster}
              </label>
              <div className="flex flex-col gap-1">
                <select
                  id={`${baseId}-${index}`}
                  value={matches[index] ?? ''}
                  disabled={answered}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !answered && matches.every((m) => m !== null)) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  onChange={(event) =>
                    setMatches((current) =>
                      current.map((m, i) =>
                        i === index
                          ? event.target.value === ''
                            ? null
                            : Number(event.target.value)
                          : m,
                      ),
                    )
                  }
                  className={cn(
                    'h-11 w-full rounded-md border bg-paper px-2 text-[0.9375rem] text-ink disabled:opacity-100',
                    feedbackBorder(result, index),
                  )}
                >
                  <option value="">Välj …</option>
                  {rightOrder.map((i) => (
                    <option key={i} value={i}>
                      {question.par[i]?.hoger}
                    </option>
                  ))}
                </select>
                {feedback && !feedback.correct && (
                  <span className="text-sm">
                    Rätt: <strong className="font-semibold">{feedback.expected}</strong>
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {!answered && (
        <div>
          <Button type="submit" size="lg">
            Svara
          </Button>
        </div>
      )}
    </form>
  );
}

function Ordering({
  question,
  initialOrder,
  result,
  answered,
  onSubmit,
}: {
  question: Of<'ordning'>;
  initialOrder: readonly number[];
  result: GradeResult | null;
  answered: boolean;
  onSubmit: (answer: QuizAnswer) => void;
}) {
  const [order, setOrder] = useState<number[]>(() => [...initialOrder]);
  const move = (position: number, delta: -1 | 1) =>
    setOrder((current) => {
      const target = position + delta;
      if (target < 0 || target >= current.length) return current;
      const copy = [...current];
      const a = copy[position];
      const b = copy[target];
      if (a === undefined || b === undefined) return current;
      copy[position] = b;
      copy[target] = a;
      return copy;
    });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Sätt stegen i rätt ordning med pilknapparna. Det första steget överst.
      </p>
      <ol className="flex flex-col gap-2" aria-label="Ordning">
        {order.map((itemIndex, position) => {
          const feedback = result?.kind === 'graded' ? result.items[position] : undefined;
          return (
            <li
              key={itemIndex}
              className={cn(
                'flex items-center gap-3 rounded-lg border bg-paper px-3 py-2.5',
                feedback
                  ? feedback.correct
                    ? 'border-success bg-success-soft'
                    : 'border-brick bg-brick-soft'
                  : 'border-line-strong',
              )}
            >
              <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-line-strong bg-bg text-sm font-semibold tabular-nums text-muted">
                {position + 1}
              </span>
              <span className="min-w-0 flex-1">{question.poster[itemIndex]}</span>
              {!answered && (
                <span className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-8 px-0"
                    aria-label={`Flytta upp: ${question.poster[itemIndex]}`}
                    disabled={position === 0}
                    onClick={() => move(position, -1)}
                  >
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-8 px-0"
                    aria-label={`Flytta ned: ${question.poster[itemIndex]}`}
                    disabled={position === order.length - 1}
                    onClick={() => move(position, 1)}
                  >
                    <ArrowDown aria-hidden="true" />
                  </Button>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {result?.kind === 'graded' && result.score < 1 && (
        <div className="rounded-lg border border-line bg-bg/60 p-4">
          <p className="mb-2 text-sm font-semibold">Rätt ordning</p>
          <ol className="list-decimal space-y-1 pl-5 text-[0.9375rem]">
            {question.poster.map((text, index) => (
              <li key={index}>{text}</li>
            ))}
          </ol>
        </div>
      )}
      {!answered && (
        <div>
          <Button size="lg" onClick={() => onSubmit({ type: 'ordning', order })}>
            Svara
          </Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ open questions */

function OpenAnswer({
  result,
  autoFocus = true,
  onSubmit,
  onSelfAssess,
}: {
  result: GradeResult | null;
  autoFocus?: boolean;
  onSubmit: (answer: QuizAnswer) => void;
  onSelfAssess: (checked: number[]) => void;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [checked, setChecked] = useState<number[]>([]);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus) textarea.current?.focus();
  }, [autoFocus]);
  const answered = result !== null;

  return (
    <div className="flex flex-col gap-4">
      <label htmlFor={id} className="text-sm text-muted">
        Skriv ditt svar med egna ord. Sedan jämför du med facit och bockar av vad du fick med.
      </label>
      <textarea
        id={id}
        ref={textarea}
        value={text}
        readOnly={answered}
        rows={6}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !answered) {
            event.preventDefault();
            onSubmit({ type: 'oppen', text });
          }
        }}
        className="w-full rounded-md border border-line-strong bg-paper p-3 text-base leading-relaxed focus-visible:border-accent"
      />
      {!answered && (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={() => onSubmit({ type: 'oppen', text })}>
            Jämför med facit
          </Button>
          <span className="text-sm text-muted">eller Ctrl + Enter</span>
        </div>
      )}

      {result?.kind === 'self_graded' && (
        <div className="flex flex-col gap-4 rounded-lg border border-line bg-bg/60 p-5">
          {result.modelAnswer && (
            <div>
              <p className="mb-1 text-sm font-semibold">Modellsvar</p>
              <p className="font-serif text-[1.0625rem] leading-relaxed whitespace-pre-line">
                {result.modelAnswer}
              </p>
            </div>
          )}
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Vad fick du med?</legend>
            <ul className="flex flex-col gap-2">
              {result.criteria.map((criterion, index) => (
                <li key={index}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-md p-1 hover:bg-accent-soft/50">
                    <input
                      type="checkbox"
                      checked={checked.includes(index)}
                      onChange={() =>
                        setChecked((current) =>
                          current.includes(index)
                            ? current.filter((i) => i !== index)
                            : [...current, index],
                        )
                      }
                      className="mt-1 size-4 accent-[var(--accent)]"
                    />
                    <span>{criterion}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <div>
            <Button onClick={() => onSelfAssess(checked)}>
              <Check aria-hidden="true" />
              Spara min bedömning
            </Button>
          </div>
        </div>
      )}

      {result?.kind === 'graded' && (
        <ul className="flex flex-col gap-1.5 rounded-lg border border-line bg-bg/60 p-4 text-[0.9375rem]">
          {result.items.map((item) => (
            <li key={item.index} className="flex items-start gap-2">
              {item.correct ? (
                <Check className="mt-0.5 size-4 shrink-0 text-success" aria-label="Med" />
              ) : (
                <X className="mt-0.5 size-4 shrink-0 text-brick" aria-label="Saknades" />
              )}
              <span>{item.expected}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
