import type { CaseFile, WritingStep } from '@bygglov/content-schema';
import type { StepFeedback } from '@/engine';
import { ModelDocument } from '../documents/document-viewer';
import { Paper } from '../documents/paper';
import { FullScreen } from '../full-screen';
import { SelfAssessment } from './step-feedback';

/**
 * After a skrivelse is handed in: her text and the model text side by side, with the
 * assessment criteria to tick.
 */
export function WritingComparison({
  caseFile,
  step,
  text,
  feedback,
  open,
  onOpenChange,
  onSelfAssess,
}: {
  caseFile: CaseFile;
  step: WritingStep;
  text: string;
  feedback: StepFeedback | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelfAssess: (checked: number[]) => void;
}) {
  const info = feedback?.selfAssessment ?? null;
  return (
    <FullScreen
      open={open}
      onOpenChange={onOpenChange}
      eyebrow={`${caseFile.id} · ${step.id}`}
      title={`Jämför: ${step.rubrik}`}
    >
      <div className="grid h-full min-h-0 grid-cols-1 overflow-auto min-[1100px]:grid-cols-[1fr_1fr_360px] min-[1100px]:overflow-hidden">
        <section aria-label="Din text" className="min-h-0 overflow-auto p-5">
          <Paper eyebrow="Din text" aria-label="Din text">
            <div className="paper-body whitespace-pre-wrap">{text}</div>
          </Paper>
        </section>
        <section
          aria-label="Modelltext"
          className="min-h-0 overflow-auto border-line p-5 min-[1100px]:border-l"
        >
          {step.modelltext ? (
            <ModelDocument caseFile={caseFile} file={step.modelltext} />
          ) : (
            <p className="text-sm text-muted">Ärendet har ingen modelltext för det här steget.</p>
          )}
        </section>
        <aside
          aria-label="Bedömning"
          className="min-h-0 overflow-auto border-line bg-paper p-5 min-[1100px]:border-l"
        >
          <h3 className="font-semibold">Bedöm din text</h3>
          <p className="mt-1 text-sm text-muted">
            Läs modelltexten och bocka av de punkter din text täcker. Handledaren kan ha egna
            synpunkter.
          </p>
          {info && (
            <SelfAssessment
              key={info.checked?.join(',') ?? 'new'}
              criteria={info.criteria}
              checked={info.checked}
              onSave={onSelfAssess}
            />
          )}
        </aside>
      </div>
    </FullScreen>
  );
}
