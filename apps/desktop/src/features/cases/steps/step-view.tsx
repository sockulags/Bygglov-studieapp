import { Gavel } from 'lucide-react';
import type { CaseFile, CaseStep } from '@bygglov/content-schema';
import { Button } from '@/components/ui/button';
import type { StepAnswer, StepFeedback } from '@/engine';
import type { StepDraft } from '../case-store';
import { CalculationStep } from './calculation-step';
import { ChecklistStep } from './checklist-step';
import { QuestionStep } from './question-step';
import { SelectionStep } from './selection-step';
import { WritingStep } from './writing-step';

const TYPE_LABEL: Record<CaseStep['typ'], string> = {
  checklista: 'Checklista',
  fraga: 'Fråga',
  berakning: 'Beräkning',
  urval: 'Urval',
  skrivelse: 'Skrivelse',
  beslut: 'Beslut',
};

export interface StepViewProps {
  caseFile: CaseFile;
  step: CaseStep;
  /** The submitted answer (read-only view), null while the step is open. */
  answer: StepAnswer | null;
  feedback: StepFeedback | null;
  draft?: StepDraft | undefined;
  onDraft?: (draft: StepDraft) => void;
  onSubmit: (answer: StepAnswer) => void;
  onSkip?: () => void;
  onCompareWriting?: () => void;
  onOpenDecision?: () => void;
}

/** One step: heading, instruction and the form for its type. */
export function StepView({
  step,
  answer,
  feedback,
  draft,
  onDraft,
  onSubmit,
  onSkip,
  onCompareWriting,
  onOpenDecision,
}: StepViewProps) {
  const draftText = draft && 'text' in draft ? draft.text : '';
  const textDraft = onDraft ? (text: string) => onDraft({ text }) : undefined;
  const skip = answer === null ? onSkip : undefined;
  return (
    <article className="flex flex-col gap-3" aria-labelledby={`step-${step.id}`}>
      <header>
        <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
          {step.id} · {TYPE_LABEL[step.typ]}
        </p>
        <h3 id={`step-${step.id}`} className="text-lg leading-snug font-semibold">
          {step.rubrik}
        </h3>
        {step.instruktion && (
          <p className="mt-1 text-[0.9375rem] leading-relaxed text-muted">{step.instruktion}</p>
        )}
      </header>
      {step.typ === 'checklista' && (
        <ChecklistStep
          step={step}
          answer={answer?.type === 'checklista' ? answer : null}
          feedback={feedback}
          onSubmit={onSubmit}
          {...(skip ? { onSkip: skip } : {})}
        />
      )}
      {step.typ === 'fraga' && (
        <QuestionStep
          step={step}
          answer={answer?.type === 'fraga' ? answer : null}
          draftText={draftText}
          {...(textDraft ? { onDraft: textDraft } : {})}
          onSubmit={onSubmit}
          {...(skip ? { onSkip: skip } : {})}
        />
      )}
      {step.typ === 'berakning' && (
        <CalculationStep
          step={step}
          answer={answer?.type === 'berakning' ? answer : null}
          feedback={feedback}
          onSubmit={onSubmit}
          {...(skip ? { onSkip: skip } : {})}
        />
      )}
      {step.typ === 'urval' && (
        <SelectionStep
          step={step}
          answer={answer?.type === 'urval' ? answer : null}
          feedback={feedback}
          onSubmit={onSubmit}
          {...(skip ? { onSkip: skip } : {})}
        />
      )}
      {step.typ === 'skrivelse' && (
        <WritingStep
          step={step}
          answer={answer?.type === 'skrivelse' ? answer : null}
          draftText={draftText}
          {...(textDraft ? { onDraft: textDraft } : {})}
          onSubmit={onSubmit}
          {...(skip ? { onSkip: skip } : {})}
          {...(onCompareWriting ? { onCompare: onCompareWriting } : {})}
        />
      )}
      {step.typ === 'beslut' && answer === null && (
        <div className="rounded-lg border border-accent/40 bg-accent-soft/50 p-4">
          <p className="text-[0.9375rem] leading-relaxed">
            Nu är det dags att fatta beslut. Formuläret följer hur ett riktigt beslut ser ut:
            beslut, lagstöd, motivering, villkor och upplysningar, avgift, hur man överklagar och
            expediering. Förhandsvisningen uppdateras medan du skriver.
          </p>
          <Button className="mt-3" onClick={onOpenDecision}>
            <Gavel aria-hidden="true" />
            Öppna beslutsformuläret
          </Button>
        </div>
      )}
    </article>
  );
}
