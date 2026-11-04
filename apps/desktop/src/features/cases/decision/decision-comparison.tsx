import { CircleCheck, CircleX, Lightbulb, TriangleAlert } from 'lucide-react';
import { useId, useState } from 'react';
import type { CaseFile } from '@bygglov/content-schema';
import { LawRefChip } from '@/components/ui/law-ref-chip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DECISION_OUTCOME_LABELS,
  type CaseState,
  type DecisionCheck,
  type SubmittedDecision,
} from '@/engine';
import { cn } from '@/lib/cn';
import { ModelDocument } from '../documents/document-viewer';
import { CaseReviewNote, SelfAssessment } from '../steps/step-feedback';
import { useMediaQuery, WIDE_QUERY } from '../use-media-query';
import { DecisionPreview } from './decision-preview';

export interface DecisionComparisonProps {
  caseFile: CaseFile;
  state: CaseState;
  decision: SubmittedDecision;
  diaryNumber?: string | undefined;
  reflection: string;
  onReflectionChange: (text: string) => void;
  onSelfAssess: (checked: number[]) => void;
}

function CheckItem({ check }: { check: DecisionCheck }) {
  const tip = check.severity === 'tip';
  const Icon = check.passed
    ? CircleCheck
    : tip
      ? Lightbulb
      : check.severity === 'warning'
        ? TriangleAlert
        : CircleX;
  return (
    <li
      className={cn(
        'rounded-md border border-l-4 bg-paper px-3 py-2.5',
        check.passed
          ? 'border-success/40 border-l-success'
          : tip
            ? 'border-plan-yellow/60 border-l-plan-yellow'
            : 'border-brick/40 border-l-brick',
      )}
    >
      <p className="flex items-start gap-2 font-medium">
        <Icon
          className={cn(
            'mt-0.5 size-4 shrink-0',
            check.passed ? 'text-success' : tip ? 'text-ink' : 'text-brick',
          )}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          {check.title}
          <span className="sr-only">
            {check.passed ? ': godkänd' : tip ? ': tips' : ': inte godkänd'}
          </span>
        </span>
      </p>
      <p className="mt-1 pl-6 text-sm leading-relaxed">{check.message}</p>
      {check.details.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-0.5 pl-6 text-xs leading-relaxed text-muted">
          {check.details.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
      {check.lawRefs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 pl-6">
          {check.lawRefs.map((ref) => (
            <LawRefChip key={ref} reference={ref} />
          ))}
        </div>
      )}
    </li>
  );
}

function Assessment({
  caseFile,
  decision,
  reflection,
  onReflectionChange,
  onSelfAssess,
}: Omit<DecisionComparisonProps, 'state' | 'diaryNumber'>) {
  const id = useId();
  const { assessment } = decision;
  const counted = assessment.checks.filter((c) => c.severity !== 'tip');
  const tips = assessment.checks.filter((c) => c.severity === 'tip');
  const outcomeRight = assessment.checks.find((c) => c.id === 'utfall')?.passed ?? false;
  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby={`${id}-summary`}>
        <h3 id={`${id}-summary`} className="font-semibold">
          Automatiska kontroller
        </h3>
        <p className="mt-1 text-sm text-muted">
          {assessment.passedChecks} av {assessment.totalChecks} godkända. Ditt beslut:{' '}
          {DECISION_OUTCOME_LABELS[decision.draft.utfall].toLowerCase()}
          {outcomeRight
            ? ', som förväntat.'
            : `. Förväntat: ${DECISION_OUTCOME_LABELS[assessment.expectedOutcome].toLowerCase()}.`}
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {counted.map((check) => (
            <CheckItem key={check.id} check={check} />
          ))}
        </ul>
        {tips.length > 0 && (
          <>
            <h4 className="mt-4 text-sm font-semibold">Tips</h4>
            <ul className="mt-2 flex flex-col gap-2">
              {tips.map((check) => (
                <CheckItem key={check.id} check={check} />
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby={`${id}-criteria`}>
        <h3 id={`${id}-criteria`} className="font-semibold">
          Bedömningspunkter
        </h3>
        <p className="mt-1 text-sm text-muted">
          Jämför med modellbeslutet och bocka av det ditt beslut täcker.
        </p>
        <SelfAssessment
          key={decision.checkedCriteria?.join(',') ?? 'new'}
          criteria={assessment.criteria}
          checked={decision.checkedCriteria}
          onSave={onSelfAssess}
        />
      </section>

      {assessment.commonMistakes.length > 0 && (
        <section aria-labelledby={`${id}-mistakes`}>
          <h3 id={`${id}-mistakes`} className="font-semibold">
            Vanliga fel i det här ärendet
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
            {assessment.commonMistakes.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby={`${id}-reflection`}>
        <h3 id={`${id}-reflection`} className="font-semibold">
          <label htmlFor={`${id}-reflection-text`}>Egna reflektioner</label>
        </h3>
        <p className="mt-1 text-sm text-muted">
          Vad tar du med dig? Det följer med när du exporterar till handledaren.
        </p>
        <textarea
          id={`${id}-reflection-text`}
          value={reflection}
          rows={6}
          onChange={(event) => onReflectionChange(event.target.value)}
          className="mt-2 w-full rounded-md border border-line-strong bg-paper p-3 text-[0.9375rem] leading-relaxed focus-visible:border-accent"
        />
      </section>

      <CaseReviewNote caseFile={caseFile} />
    </div>
  );
}

/**
 * After submission: her decision and the model decision side by side, the automatic
 * checks with their law references, the criteria to tick and her own reflections.
 */
export function DecisionComparison(props: DecisionComparisonProps) {
  const { caseFile, state, decision, diaryNumber } = props;
  const [tab, setTab] = useState('hennes');
  const wide = useMediaQuery(WIDE_QUERY);
  const modelPath = decision.assessment.modelDecisionPath;
  const mine = (
    <DecisionPreview
      caseFile={caseFile}
      state={state}
      draft={decision.draft}
      diaryNumber={diaryNumber}
      decisionDate={decision.date}
      label="Ditt beslut"
    />
  );
  const model = modelPath ? (
    <ModelDocument caseFile={caseFile} file={modelPath} eyebrow="Modellbeslut" />
  ) : (
    <p className="text-sm text-muted">Ärendet har inget modellbeslut.</p>
  );
  const assessment = <Assessment {...props} />;
  if (wide) {
    return (
      <div className="grid h-full min-h-0 grid-cols-[1fr_1fr_400px]">
        <section aria-label="Ditt beslut" className="min-h-0 overflow-auto p-5">
          <p className="mb-3 text-xs font-semibold tracking-[0.08em] text-muted uppercase">
            Ditt beslut
          </p>
          {mine}
        </section>
        <section
          aria-label="Modellbeslut"
          className="min-h-0 overflow-auto border-l border-line p-5"
        >
          <p className="mb-3 text-xs font-semibold tracking-[0.08em] text-muted uppercase">
            Modellbeslut
          </p>
          {model}
        </section>
        <aside
          aria-label="Bedömning"
          className="min-h-0 overflow-auto border-l border-line bg-bg p-5"
        >
          {assessment}
        </aside>
      </div>
    );
  }
  return (
    <Tabs value={tab} onValueChange={setTab} className="flex h-full min-h-0 flex-col">
      <TabsList className="mx-4 mt-3 self-start" aria-label="Jämförelse">
        <TabsTrigger value="hennes">Ditt beslut</TabsTrigger>
        <TabsTrigger value="modell">Modellbeslut</TabsTrigger>
        <TabsTrigger value="bedomning">Bedömning</TabsTrigger>
      </TabsList>
      <TabsContent value="hennes" className="min-h-0 flex-1 overflow-auto p-4">
        {mine}
      </TabsContent>
      <TabsContent value="modell" className="min-h-0 flex-1 overflow-auto p-4">
        {model}
      </TabsContent>
      <TabsContent value="bedomning" className="min-h-0 flex-1 overflow-auto p-4">
        {assessment}
      </TabsContent>
    </Tabs>
  );
}
