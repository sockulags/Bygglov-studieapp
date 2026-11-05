import { useState } from 'react';
import type { CaseFile } from '@bygglov/content-schema';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { emptyDecisionDraft, type CaseState, type DecisionDraft } from '@/engine';
import { deadlineSummary } from '../case-model';
import { FullScreen } from '../full-screen';
import { useMediaQuery, WIDE_QUERY } from '../use-media-query';
import { DecisionForm } from './decision-form';
import { DecisionPreview } from './decision-preview';

export interface DecisionScreenProps {
  caseFile: CaseFile;
  state: CaseState;
  stepId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Saved draft of the form, if she started before. */
  initialDraft?: DecisionDraft | undefined;
  onDraftChange: (draft: DecisionDraft) => void;
  onSubmit: (draft: DecisionDraft) => void;
  diaryNumber?: string | undefined;
}

/** The decision form in full screen, with a live A4 preview of the decision beside it. */
export function DecisionScreen({
  caseFile,
  state,
  stepId,
  open,
  onOpenChange,
  initialDraft,
  onDraftChange,
  onSubmit,
  diaryNumber,
}: DecisionScreenProps) {
  const [draft, setDraft] = useState<DecisionDraft>(() => initialDraft ?? emptyDecisionDraft());
  const [tab, setTab] = useState('formular');
  const wide = useMediaQuery(WIDE_QUERY);
  const deadline = deadlineSummary(state);
  const change = (next: DecisionDraft) => {
    setDraft(next);
    onDraftChange(next);
  };
  const form = (
    <DecisionForm
      caseFile={caseFile}
      draft={draft}
      onChange={change}
      onSubmit={onSubmit}
      diaryNumber={diaryNumber}
    />
  );
  const preview = (
    <DecisionPreview caseFile={caseFile} state={state} draft={draft} diaryNumber={diaryNumber} />
  );
  return (
    <FullScreen
      open={open}
      onOpenChange={onOpenChange}
      eyebrow={`${caseFile.id} · ${stepId} · beslutsdatum ${state.simDate}`}
      title={`Beslut: ${caseFile.titel}, ${caseFile.fastighet.split(',')[0] ?? ''}`}
      description={`Tidsfrist enligt 9 kap. 99 §${state.notification ? ' och 6 kap. 5 § PBF' : ''}: ${deadline.label}. Utkastet sparas medan du skriver.`}
    >
      {wide ? (
        <div className="grid h-full min-h-0 grid-cols-[minmax(440px,560px)_1fr]">
          <section aria-label="Formulär" className="min-h-0 overflow-auto p-5 pb-0">
            {form}
          </section>
          <section
            aria-label="Förhandsvisning"
            className="min-h-0 overflow-auto border-l border-line bg-bg p-6"
          >
            <p className="mb-3 text-xs font-semibold tracking-[0.08em] text-muted uppercase">
              Förhandsvisning
            </p>
            {preview}
          </section>
        </div>
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="flex h-full min-h-0 flex-col">
          <TabsList className="mx-4 mt-3 self-start" aria-label="Beslut">
            <TabsTrigger value="formular">Formulär</TabsTrigger>
            <TabsTrigger value="forhandsvisning">Förhandsvisning</TabsTrigger>
          </TabsList>
          <TabsContent value="formular" className="min-h-0 flex-1 overflow-auto px-4 pb-0">
            {form}
          </TabsContent>
          <TabsContent value="forhandsvisning" className="min-h-0 flex-1 overflow-auto p-4">
            {preview}
          </TabsContent>
        </Tabs>
      )}
    </FullScreen>
  );
}
