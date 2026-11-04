import {
  Check,
  CircleCheck,
  CircleDashed,
  CircleX,
  FileText,
  FileWarning,
  Megaphone,
  NotebookPen,
  SkipForward,
} from 'lucide-react';
import { useState } from 'react';
import type { CaseFile } from '@bygglov/content-schema';
import { Button } from '@/components/ui/button';
import { LawRefChip } from '@/components/ui/law-ref-chip';
import type { StepFeedback } from '@/engine';
import { cn } from '@/lib/cn';
import type { CaseOutcome } from '../case-store';

function headline(feedback: StepFeedback) {
  if (feedback.skipped) {
    return { icon: SkipForward, text: 'Överhoppat', tone: 'text-brick', border: 'border-brick/50' };
  }
  if (feedback.outcome === null) {
    return {
      icon: NotebookPen,
      text: 'Jämför och bedöm själv',
      tone: 'text-accent',
      border: 'border-accent/40',
    };
  }
  const score = feedback.score ?? 0;
  if (feedback.selfAssessment && feedback.selfAssessment.checked !== null) {
    return {
      icon: NotebookPen,
      text: `Din bedömning: ${feedback.selfAssessment.checked.length} av ${feedback.selfAssessment.criteria.length} punkter`,
      tone: 'text-accent',
      border: 'border-accent/40',
    };
  }
  if (feedback.outcome === 'correct') {
    return { icon: CircleCheck, text: 'Rätt', tone: 'text-success', border: 'border-success/50' };
  }
  if (feedback.outcome === 'partial') {
    return {
      icon: CircleDashed,
      text: `Delvis rätt, ${Math.round(score * 100)} %`,
      tone: 'text-ink',
      border: 'border-plan-yellow',
    };
  }
  return { icon: CircleX, text: 'Inte rätt', tone: 'text-brick', border: 'border-brick/50' };
}

/** Draft marker and legal state of the case, shown under every explanation. */
export function CaseReviewNote({ caseFile }: { caseFile: CaseFile }) {
  const draft = caseFile.status === 'utkast';
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
      {draft && (
        <span className="inline-flex items-center gap-1">
          <FileWarning className="size-3.5" aria-hidden="true" />
          Utkast, ej granskat av handledare
        </span>
      )}
      {draft && <span aria-hidden="true">·</span>}
      <span>Rättsläge {caseFile.rattslage}</span>
    </p>
  );
}

/** "Förklaringen är belöningen": result, explanation and law references after a step. */
export function StepFeedbackPanel({
  caseFile,
  feedback,
  onSelfAssess,
}: {
  caseFile: CaseFile;
  feedback: StepFeedback;
  onSelfAssess?: (checked: number[]) => void;
}) {
  const head = headline(feedback);
  const Icon = head.icon;
  return (
    <section
      aria-label="Återkoppling"
      aria-live="polite"
      className={cn('fade-in-up rounded-lg border border-l-4 bg-paper p-4', head.border)}
    >
      <h3 className={cn('flex items-center gap-2 font-semibold', head.tone)}>
        <Icon className="size-5" strokeWidth={2} aria-hidden="true" />
        {head.text}
      </h3>
      {feedback.skipped && (
        <p className="mt-2 text-[0.9375rem]">
          Steget räknas som inte gjort. Det kan få följder längre fram i ärendet.
        </p>
      )}
      {feedback.selfAssessment && onSelfAssess && (
        <SelfAssessment
          key={feedback.selfAssessment.checked?.join(',') ?? 'new'}
          criteria={feedback.selfAssessment.criteria}
          checked={feedback.selfAssessment.checked}
          modelAnswer={feedback.selfAssessment.modelAnswer}
          onSave={onSelfAssess}
        />
      )}
      {feedback.explanation && (
        <p className="mt-3 text-[0.9375rem] leading-relaxed">{feedback.explanation}</p>
      )}
      {feedback.lawRefs.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-sm text-muted">Lagrum</span>
          {feedback.lawRefs.map((ref) => (
            <LawRefChip key={ref} reference={ref} />
          ))}
        </div>
      )}
      <div className="mt-4 border-t border-line pt-2.5">
        <CaseReviewNote caseFile={caseFile} />
      </div>
    </section>
  );
}

/** Tick the criteria you covered; the score is saved with the step. */
export function SelfAssessment({
  criteria,
  checked,
  modelAnswer,
  onSave,
  saveLabel = 'Spara min bedömning',
}: {
  criteria: readonly string[];
  checked: readonly number[] | null;
  modelAnswer?: string | null;
  onSave: (checked: number[]) => void;
  saveLabel?: string;
}) {
  const [ticked, setTicked] = useState<number[]>(() => [...(checked ?? [])]);
  const saved = checked !== null && [...checked].sort().join() === [...ticked].sort().join();
  return (
    <div className="mt-3 flex flex-col gap-3">
      {modelAnswer && (
        <div className="rounded-md bg-bg px-3 py-2.5">
          <p className="mb-1 text-sm font-semibold">Modellsvar</p>
          <p className="font-serif leading-relaxed whitespace-pre-line">{modelAnswer}</p>
        </div>
      )}
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">
          Bedömningspunkter: vad fick du med?
        </legend>
        <ul className="flex flex-col gap-1">
          {criteria.map((criterion, index) => (
            <li key={index}>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-md p-1 text-[0.9375rem] leading-snug hover:bg-accent-soft/50">
                <input
                  type="checkbox"
                  checked={ticked.includes(index)}
                  onChange={() =>
                    setTicked((current) =>
                      current.includes(index)
                        ? current.filter((i) => i !== index)
                        : [...current, index],
                    )
                  }
                  className="mt-1 size-4 shrink-0 accent-[var(--accent)]"
                />
                <span>{criterion}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant={saved ? 'secondary' : 'primary'} onClick={() => onSave(ticked)}>
          <Check aria-hidden="true" />
          {saveLabel}
        </Button>
        {saved && (
          <span className="text-sm text-muted" role="status">
            Sparad: {checked.length} av {criteria.length}
          </span>
        )}
      </div>
    </div>
  );
}

/** "Nytt i diariet": documents and messages that an action brought, with a stamp. */
export function NewInDiary({
  caseFile,
  outcome,
  onOpenDocument,
}: {
  caseFile: CaseFile;
  outcome: CaseOutcome;
  onOpenDocument: (documentId: string) => void;
}) {
  const messages = outcome.newEntries.filter((e) => e.kind === 'handelse' || e.kind === 'beslut');
  const days = outcome.newEntries
    .filter((e) => e.kind === 'tid')
    .reduce((sum, e) => sum + (Number(/^(\d+)/.exec(e.text)?.[1]) || 0), 0);
  const documents = outcome.newDocumentIds.flatMap((id) => {
    const doc = caseFile.handlingar.find((d) => d.id === id);
    return doc ? [doc] : [];
  });
  if (messages.length === 0 && documents.length === 0 && days === 0) return null;
  return (
    <section
      aria-label="Nytt i diariet"
      aria-live="polite"
      className="fade-in-up rounded-lg border border-brick/40 bg-brick-soft/60 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold">Nytt i diariet</h3>
        <span className="arrival-stamp stamp-animate text-[0.625rem]">
          <span>Inkom</span>
        </span>
      </div>
      {days > 0 && (
        <p className="mt-1 text-sm text-muted">
          {days} {days === 1 ? 'dag' : 'dagar'} har gått i ärendet.
        </p>
      )}
      <ul className="mt-3 flex flex-col gap-2">
        {messages.map((entry, index) => (
          <li key={`m${index}`} className="flex items-start gap-2 text-[0.9375rem] leading-snug">
            <Megaphone className="mt-0.5 size-4 shrink-0 text-brick" aria-hidden="true" />
            <span>
              <span className="text-xs text-muted tabular-nums">{entry.date} </span>
              {entry.text}
            </span>
          </li>
        ))}
        {documents.map((doc) => (
          <li key={doc.id}>
            <button
              type="button"
              onClick={() => onOpenDocument(doc.id)}
              className="flex w-full items-start gap-2 rounded-md border border-line-strong bg-paper px-3 py-2 text-left text-[0.9375rem] hover:border-accent hover:bg-accent-soft"
            >
              <FileText className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{doc.titel}</span>
                <span className="block text-xs text-muted">Öppna handlingen {doc.id}</span>
              </span>
              <span className="rounded-sm bg-brick px-1.5 py-0.5 text-[0.625rem] font-bold tracking-[0.1em] text-paper">
                NY
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
