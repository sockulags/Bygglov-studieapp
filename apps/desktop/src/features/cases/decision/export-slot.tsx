import { FileOutput } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExportDecisionButton } from '../export';

/**
 * "Exportera till handledare" in the comparison view. The decision row is written right
 * after submission; until it exists the button waits.
 */
export function ExportSlot({ decisionId, caseId }: { decisionId: number | null; caseId: string }) {
  if (decisionId !== null) {
    return <ExportDecisionButton decisionId={decisionId} caseId={caseId} size="sm" />;
  }
  return (
    <Button variant="secondary" size="sm" disabled title="Beslutet sparas …">
      <FileOutput aria-hidden="true" />
      Exportera till handledare
    </Button>
  );
}
