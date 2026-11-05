import { CircleCheck, CircleDashed, CircleX, FileWarning, NotebookPen } from 'lucide-react';
import { useMemo } from 'react';
import type { Question } from '@bygglov/content-schema';
import { LawRefChip } from '@/components/ui/law-ref-chip';
import type { GradeResult, QuizAnswer } from '@/engine';
import { AskTutorButton, buildQuestionContext, questionSuggestions } from '@/features/tutor';
import { cn } from '@/lib/cn';

export interface ExplanationPanelProps {
  question: Question;
  result: GradeResult;
  /** Her answer; passed to the tutor so it can explain what went wrong. */
  answer?: QuizAnswer | null;
  className?: string;
}

function headline(result: GradeResult) {
  if (result.kind === 'self_graded') {
    return {
      icon: NotebookPen,
      text: 'Jämför med facit',
      tone: 'text-accent',
      border: 'border-accent/40',
    };
  }
  if (result.outcome === 'correct') {
    return { icon: CircleCheck, text: 'Rätt', tone: 'text-success', border: 'border-success/50' };
  }
  if (result.outcome === 'partial') {
    return {
      icon: CircleDashed,
      text: `Delvis rätt, ${Math.round(result.score * 100)} %`,
      tone: 'text-ink',
      border: 'border-plan-yellow',
    };
  }
  return { icon: CircleX, text: 'Inte rätt', tone: 'text-brick', border: 'border-brick/50' };
}

/** Draft marker and legal state, shown discreetly under every explanation. */
export function ReviewStatusNote({ question }: { question: Question }) {
  const draft = question.status === 'utkast';
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
      {draft && (
        <span className="inline-flex items-center gap-1">
          <FileWarning className="size-3.5" aria-hidden="true" />
          Utkast, ej granskad av handledare
        </span>
      )}
      {draft && <span aria-hidden="true">·</span>}
      <span>Rättsläge {question.rattslage}</span>
    </p>
  );
}

/**
 * "Förklaringen är belöningen" (docs/04): result, explanation, worked solution and law
 * references after each answer.
 */
export function ExplanationPanel({
  question,
  result,
  answer = null,
  className,
}: ExplanationPanelProps) {
  const tutorContext = useMemo(
    () => buildQuestionContext(question, answer, result),
    [question, answer, result],
  );
  const head = headline(result);
  const Icon = head.icon;
  const solution = result.kind === 'graded' ? result.solution : undefined;
  return (
    <section
      aria-label="Förklaring"
      aria-live="polite"
      className={cn(
        'rounded-lg border border-l-4 bg-paper p-6',
        'motion-safe:animate-[fade-in_var(--duration-base)_var(--ease-out)]',
        head.border,
        className,
      )}
    >
      <h3 className={cn('flex items-center gap-2 text-lg font-semibold', head.tone)}>
        <Icon className="size-5" strokeWidth={2} aria-hidden="true" />
        {head.text}
      </h3>
      {result.explanation && (
        <p className="mt-3 max-w-prose text-[1.0625rem] leading-relaxed">{result.explanation}</p>
      )}
      {solution && (
        <div className="mt-4 rounded-md bg-bg px-4 py-3">
          <p className="text-sm font-semibold">Lösning</p>
          <p className="mt-1 text-[0.9375rem] leading-relaxed whitespace-pre-line">{solution}</p>
        </div>
      )}
      {result.lawRefs.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">Lagrum</span>
          {result.lawRefs.map((ref) => (
            <LawRefChip key={ref} reference={ref} uncertain={result.lawRefsUncertain} />
          ))}
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <ReviewStatusNote question={question} />
        <AskTutorButton
          context={tutorContext}
          suggestions={questionSuggestions(question, answer)}
        />
      </div>
    </section>
  );
}
