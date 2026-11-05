import { Link } from '@tanstack/react-router';
import {
  ArrowRight,
  BookMarked,
  CheckCircle2,
  Circle,
  CircleDot,
  Columns2,
  Gavel,
  SkipForward,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { CaseFile } from '@bygglov/content-schema';
import { Button } from '@/components/ui/button';
import { LawRefChip } from '@/components/ui/law-ref-chip';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  currentStep,
  isSelfAssessedStep,
  stepById,
  stepFeedback,
  stepOverview,
  visibleDocuments,
  type StepAnswer,
} from '@/engine';
import { AskTutorButton, caseSuggestions, useCaseTutorContext } from '@/features/tutor';
import { cn } from '@/lib/cn';
import { isActivatableTarget, useKeydown } from '@/lib/use-keydown';
import { caseLawRefs, factLabel, factValue } from './case-model';
import {
  dismissCaseOutcome,
  saveStepDraft,
  selfAssessCaseStep,
  setCaseNotes,
  skipCaseStep,
  submitCaseStep,
  type ActiveCase,
} from './case-store';
import { NewInDiary, StepFeedbackPanel } from './steps/step-feedback';
import { StepView } from './steps/step-view';

export interface WorkPanelProps {
  caseFile: CaseFile;
  active: ActiveCase;
  onOpenDocument: (documentId: string) => void;
  onOpenDecision: () => void;
  onOpenComparison: () => void;
  onCompareWriting: (stepId: string) => void;
}

export type WorkTab = 'steg' | 'fakta' | 'uppslag';

/**
 * The tab panels are focusable (Radix gives them tabIndex 0 so the content can be scrolled
 * with the keyboard); show where focus is, inside the panel's edge.
 */
const PANEL_FOCUS =
  'focus-visible:[outline:2px_solid_var(--ring)] focus-visible:[outline-offset:-2px]';

/** Arbetsytan: the current step, facts and law references, and her notes. */
export function WorkPanel(props: WorkPanelProps) {
  const [tab, setTab] = useState<WorkTab>('steg');
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as WorkTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="mx-3 mt-3 self-start" aria-label="Arbetsytan">
          <TabsTrigger value="steg">Steg</TabsTrigger>
          <TabsTrigger value="fakta">Planbestämmelser och fakta</TabsTrigger>
          <TabsTrigger value="uppslag">Uppslag</TabsTrigger>
        </TabsList>
        <TabsContent
          value="steg"
          className={cn('mt-0 min-h-0 flex-1 overflow-auto p-4', PANEL_FOCUS)}
        >
          <StepTab {...props} />
        </TabsContent>
        <TabsContent
          value="fakta"
          className={cn('mt-0 min-h-0 flex-1 overflow-auto p-4', PANEL_FOCUS)}
        >
          <FactsTab caseFile={props.caseFile} active={props.active} />
        </TabsContent>
        <TabsContent
          value="uppslag"
          className={cn('mt-0 min-h-0 flex-1 overflow-auto p-4', PANEL_FOCUS)}
        >
          <LookupTab caseFile={props.caseFile} active={props.active} />
        </TabsContent>
      </Tabs>
      <Notes caseFile={props.caseFile} notes={props.active.notes} />
    </div>
  );
}

/* --------------------------------------------------------------------------- steps */

function StepTab({
  caseFile,
  active,
  onOpenDocument,
  onOpenDecision,
  onOpenComparison,
  onCompareWriting,
}: WorkPanelProps) {
  const { state, lastOutcome } = active;
  const step = currentStep(caseFile, state);
  const overview = stepOverview(caseFile, state);
  const position = Math.min(state.currentIndex + (lastOutcome ? 0 : 1), state.queue.length);
  const nextButton = useRef<HTMLButtonElement>(null);
  const outcomeStep = lastOutcome ? stepById(caseFile, lastOutcome.stepId) : null;
  const outcomeKey = lastOutcome ? `${lastOutcome.stepId}-${state.diary.length}` : null;

  const top = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);

  // "Fråga handledaren" about the case so far; no answer key before the decision.
  const tutorContext = useCaseTutorContext(caseFile, active, { includeModelAnswers: false });
  const hasDecisionDraft = Object.values(active.drafts).some((d) => 'decision' in d);

  // After an answer: bring the feedback into view and focus "Nästa steg".
  useEffect(() => {
    if (!outcomeKey) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    feedbackRef.current?.scrollIntoView?.({
      block: 'start',
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
    nextButton.current?.focus({ preventScroll: true });
  }, [outcomeKey]);

  // A new step starts at the top of the panel.
  const stepKey = lastOutcome ? null : (step?.id ?? 'done');
  useEffect(() => {
    if (stepKey) top.current?.scrollIntoView?.({ block: 'start' });
  }, [stepKey]);

  useKeydown((event) => {
    if (event.key !== 'Enter' || isActivatableTarget(event.target)) return;
    event.preventDefault();
    dismissCaseOutcome();
  }, lastOutcome !== null);

  const submit = (stepId: string) => (answer: StepAnswer) => {
    const outcome = submitCaseStep(caseFile, stepId, answer);
    const done = stepById(caseFile, stepId);
    if (outcome && done?.typ === 'skrivelse') onCompareWriting(stepId);
  };

  return (
    <div ref={top} className="flex scroll-mt-4 flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p className="text-sm text-muted tabular-nums" aria-live="polite">
            {step || lastOutcome
              ? `Steg ${Math.max(position, 1)} av ${state.queue.length}`
              : `Alla ${state.queue.length} steg klara`}
          </p>
          <AskTutorButton
            context={tutorContext}
            suggestions={caseSuggestions({ hasDecisionDraft })}
          />
        </div>
        <Progress
          value={(state.currentIndex / Math.max(state.queue.length, 1)) * 100}
          label={`${state.currentIndex} av ${state.queue.length} steg klara`}
        />
      </div>

      {lastOutcome && outcomeStep ? (
        <div className="flex flex-col gap-4">
          {outcomeStep.typ === 'beslut' ? (
            <section className="scroll-mt-4 rounded-lg border border-accent/40 bg-accent-soft/50 p-4">
              <div ref={feedbackRef} className="h-0 scroll-mt-8" aria-hidden="true" />
              <h3 className="flex items-center gap-2 font-semibold">
                <Gavel className="size-5 text-accent" aria-hidden="true" />
                Beslutet är inlämnat
              </h3>
              {lastOutcome.feedback.decision && (
                <p className="mt-1 text-sm">
                  {lastOutcome.feedback.decision.passedChecks} av{' '}
                  {lastOutcome.feedback.decision.totalChecks} automatiska kontroller godkända.
                </p>
              )}
              <Button className="mt-3" variant="secondary" onClick={onOpenComparison}>
                <Columns2 aria-hidden="true" />
                Visa jämförelsen
              </Button>
            </section>
          ) : (
            <>
              <StepView
                key={`done-${outcomeStep.id}`}
                caseFile={caseFile}
                step={outcomeStep}
                answer={state.stepResults[outcomeStep.id]?.answer ?? null}
                feedback={stepFeedback(caseFile, state, outcomeStep.id)}
                onSubmit={() => {}}
                onCompareWriting={() => onCompareWriting(outcomeStep.id)}
              />
              <div ref={feedbackRef} className="-mb-4 h-0 scroll-mt-4" aria-hidden="true" />
              <StepFeedbackPanel
                caseFile={caseFile}
                feedback={stepFeedback(caseFile, state, outcomeStep.id) ?? lastOutcome.feedback}
                {...(isSelfAssessedStep(outcomeStep) && outcomeStep.typ !== 'skrivelse'
                  ? {
                      onSelfAssess: (checked: number[]) =>
                        selfAssessCaseStep(caseFile, outcomeStep.id, checked),
                    }
                  : {})}
              />
            </>
          )}
          <NewInDiary caseFile={caseFile} outcome={lastOutcome} onOpenDocument={onOpenDocument} />
          <div className="flex flex-wrap items-center gap-3">
            <Button ref={nextButton} size="lg" onClick={dismissCaseOutcome}>
              {step ? 'Nästa steg' : 'Klart'}
              <ArrowRight aria-hidden="true" />
            </Button>
            <span className="text-sm text-muted">eller Enter</span>
          </div>
        </div>
      ) : step ? (
        <StepView
          key={`open-${step.id}`}
          caseFile={caseFile}
          step={step}
          answer={null}
          feedback={null}
          draft={active.drafts[step.id]}
          onDraft={(draft) => saveStepDraft(caseFile, step.id, draft)}
          onSubmit={submit(step.id)}
          onSkip={() => skipCaseStep(caseFile, step.id)}
          onOpenDecision={onOpenDecision}
        />
      ) : (
        <section className="rounded-lg border border-success/50 bg-success-soft p-4">
          <h3 className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
            Ärendet är avslutat
          </h3>
          <p className="mt-1 text-[0.9375rem]">
            Alla steg är klara. Gå igenom jämförelsen med modellbeslutet och skriv dina reflektioner
            innan du exporterar till handledaren.
          </p>
          {state.decisions.length > 0 && (
            <Button className="mt-3" variant="secondary" onClick={onOpenComparison}>
              <Columns2 aria-hidden="true" />
              Visa jämförelsen
            </Button>
          )}
        </section>
      )}

      <section aria-labelledby="step-overview" className="border-t border-line pt-4">
        <h3 id="step-overview" className="mb-2 text-sm font-semibold text-muted">
          Ärendets steg
        </h3>
        <ol className="flex flex-col gap-1">
          {overview.map(({ step: s, result, current }) => {
            const Icon = result
              ? result.skipped
                ? SkipForward
                : CheckCircle2
              : current
                ? CircleDot
                : Circle;
            return (
              <li
                key={s.id}
                className={cn(
                  'flex items-start gap-2 text-sm leading-snug',
                  current ? 'font-medium text-ink' : 'text-muted',
                )}
                aria-current={current ? 'step' : undefined}
              >
                <Icon
                  className={cn(
                    'mt-0.5 size-4 shrink-0',
                    result?.skipped
                      ? 'text-brick'
                      : result
                        ? 'text-success'
                        : current
                          ? 'text-accent'
                          : '',
                  )}
                  aria-label={
                    result
                      ? result.skipped
                        ? 'Överhoppat'
                        : 'Klart'
                      : current
                        ? 'Aktuellt'
                        : 'Kommer'
                  }
                />
                <span>
                  {s.rubrik}
                  {result && result.score !== null && !result.skipped && (
                    <span className="text-muted tabular-nums">
                      {' '}
                      · {Math.round(result.score * 100)} %
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

/* --------------------------------------------------------------------------- facts */

function FactList({ facts }: { facts: Record<string, unknown> }) {
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 text-sm">
      {Object.entries(facts).map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-muted">{factLabel(key)}</dt>
          <dd className="text-right font-medium tabular-nums">{factValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function FactsTab({ caseFile, active }: { caseFile: CaseFile; active: ActiveCase }) {
  const documents = visibleDocuments(caseFile, active.state).filter(
    ({ document }) => document.fakta && Object.keys(document.fakta).length > 0,
  );
  const changed = active.state.facts;
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted">
        Uppgifter ur handlingarna i diariet: planbestämmelser, mått och annat som ärendet bygger på.
      </p>
      {documents.length === 0 && Object.keys(changed).length === 0 && (
        <p className="text-sm">Inga uppgifter ännu.</p>
      )}
      {documents.map(({ document }) => (
        <section
          key={document.id}
          aria-label={document.titel}
          className={cn(
            'rounded-lg border bg-paper p-4',
            document.typ === 'planbestammelser' ? 'border-plan-yellow' : 'border-line',
          )}
        >
          <h3 className="mb-2 font-semibold">
            {document.titel}
            <span className="ml-1.5 text-xs font-normal text-muted">{document.id}</span>
          </h3>
          <FactList facts={document.fakta ?? {}} />
        </section>
      ))}
      {Object.keys(changed).length > 0 && (
        <section className="rounded-lg border border-brick/40 bg-brick-soft/50 p-4">
          <h3 className="mb-2 font-semibold">Ändrade uppgifter under ärendet</h3>
          <FactList facts={changed} />
        </section>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- lookup */

function LookupTab({ caseFile, active }: { caseFile: CaseFile; active: ActiveCase }) {
  const refs = caseLawRefs(caseFile, active.state);
  return (
    <div className="flex flex-col gap-5">
      <section>
        <h3 className="mb-2 font-semibold">Lagrum i ärendet</h3>
        {refs.length === 0 ? (
          <p className="text-sm text-muted">Ärendet anger inga lagrum ännu.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {refs.map((ref) => (
              <LawRefChip key={ref} reference={ref} />
            ))}
          </div>
        )}
        <p className="mt-3 text-sm text-muted">
          PBL 9 kap. har ny numrering sedan 1 december 2025. Rättsläge för ärendet:{' '}
          {caseFile.rattslage}.
        </p>
      </section>
      <section>
        <h3 className="mb-2 font-semibold">Lärandemål</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
          {caseFile.larandemal.map((goal) => (
            <li key={goal}>{goal}</li>
          ))}
        </ul>
      </section>
      <Link to="/lookup" className="inline-flex items-center gap-1.5 text-sm font-medium">
        <BookMarked className="size-4" aria-hidden="true" />
        Öppna Uppslag
      </Link>
    </div>
  );
}

/* --------------------------------------------------------------------------- notes */

function Notes({ caseFile, notes }: { caseFile: CaseFile; notes: string }) {
  const id = useId();
  return (
    <details className="group border-t border-line bg-paper" open={notes !== '' || undefined}>
      <summary className="flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm font-semibold select-none">
        <span>Mina anteckningar</span>
        <span className="text-xs font-normal text-muted">Sparas automatiskt</span>
      </summary>
      <div className="px-4 pb-3">
        <textarea
          id={id}
          aria-label="Mina anteckningar"
          value={notes}
          rows={4}
          placeholder="Egna noteringar om ärendet, t.ex. vad du vill fråga handledaren."
          onChange={(event) => setCaseNotes(caseFile, event.target.value)}
          className="w-full resize-y rounded-md border border-line-strong bg-bg p-2.5 text-sm leading-relaxed focus-visible:border-accent"
        />
      </div>
    </details>
  );
}
