import { FileOutput } from 'lucide-react';
import type { ComponentType } from 'react';
import { Button } from '@/components/ui/button';

/** Props of the export agent's button (features/cases/export). */
export interface ExportDecisionButtonProps {
  /** Id of the decision row in the data store (`Decision.id`). */
  decisionId: number;
  /** Case id, e.g. "A002". */
  caseId: string;
}

/*
 * The export feature lives in ./export and is built separately. It is picked up here when
 * it exists (a glob that matches nothing is simply empty), so this view builds with or
 * without it.
 */
const exportModules = import.meta.glob<{
  ExportDecisionButton?: ComponentType<ExportDecisionButtonProps>;
}>(['../export/index.ts', '../export/index.tsx'], { eager: true });

const ExportDecisionButton = Object.values(exportModules).find(
  (m) => m.ExportDecisionButton !== undefined,
)?.ExportDecisionButton;

/** "Exportera till handledare": the export button, or a disabled placeholder. */
export function ExportSlot({ decisionId, caseId }: { decisionId: number | null; caseId: string }) {
  if (ExportDecisionButton && decisionId !== null) {
    return <ExportDecisionButton decisionId={decisionId} caseId={caseId} />;
  }
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled
      title={decisionId === null ? 'Beslutet sparas …' : 'Exporten till handledaren kommer snart.'}
    >
      <FileOutput aria-hidden="true" />
      Exportera till handledare
    </Button>
  );
}
