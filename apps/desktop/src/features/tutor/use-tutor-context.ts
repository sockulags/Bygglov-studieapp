import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { CaseFile, Question } from '@bygglov/content-schema';
import {
  currentStep,
  renderCaseTexts,
  renderDocumentText,
  visibleDocuments,
  type CaseState,
  type DecisionDraft,
  type GradeResult,
  type QuizAnswer,
} from '@/engine';
import { documentFormat, fetchCaseText } from '@/features/cases/documents/use-document-text';
import type { ParsedDocument } from '@/features/cases/documents/front-matter';
import { buildCaseContext, buildQuestionContext } from './context';
import type { TutorContext } from './types';

/** Context for a quiz question; pass the response once she has answered. */
export function useQuestionTutorContext(
  question: Question,
  response?: { answer: QuizAnswer; result: GradeResult } | null,
): TutorContext {
  return useMemo(
    () => buildQuestionContext(question, response?.answer ?? null, response?.result ?? null),
    [question, response],
  );
}

/** What the case view knows about the case in progress (a subset of the case store's ActiveCase). */
export interface CaseTutorSource {
  state: CaseState;
  notes: string;
  /** Unsaved drafts per step; a decision draft is passed to the tutor for first feedback. */
  drafts?: Readonly<Record<string, { text: string } | { decision: DecisionDraft }>>;
}

function documentText(parsed: ParsedDocument): string {
  const meta = [
    parsed.meta.rubrik && `Rubrik: ${parsed.meta.rubrik}`,
    parsed.meta.avsandare && `Avsändare: ${parsed.meta.avsandare}`,
    parsed.meta.datum && `Datum: ${parsed.meta.datum}`,
  ].filter(Boolean);
  return meta.length > 0 ? `${meta.join('\n')}\n\n${parsed.body.trim()}` : parsed.body.trim();
}

/**
 * Context for a case: the case view's work area (`includeModelAnswers: false`) or the
 * comparison view after the decision (`includeModelAnswers: true`). Loads the text of the
 * visible Markdown documents, and of the model decision when the answer key is included.
 */
export function useCaseTutorContext(
  caseFile: CaseFile,
  source: CaseTutorSource,
  options: { includeModelAnswers: boolean },
): TutorContext {
  const { state, notes, drafts } = source;
  const { includeModelAnswers } = options;
  const files = useMemo(
    () => caseFiles(caseFile, state, includeModelAnswers),
    [caseFile, state, includeModelAnswers],
  );

  // A stable `combine` keeps the result referentially equal while the queries do not change.
  const texts = useQueries({
    queries: files.all.map((file) => ({
      queryKey: ['case-document', caseFile.id, file],
      queryFn: () => fetchCaseText(caseFile.id, file),
      staleTime: Infinity,
      retry: false,
    })),
    combine: dataOf,
  });

  const draft = useMemo(() => {
    for (const value of Object.values(drafts ?? {})) if ('decision' in value) return value.decision;
    return null;
  }, [drafts]);

  return useMemo(() => {
    // Template variables ({{beslutsdatum}} …) are rendered as in the case view, so the tutor
    // sees the same dates as she does.
    const documentTexts: Record<string, string> = {};
    files.documents.forEach(({ document: doc, receivedDate }, i) => {
      const parsed = texts[i];
      if (parsed)
        documentTexts[doc.id] = renderDocumentText(documentText(parsed), state, receivedDate);
    });
    const modelParsed = files.modelPath ? texts[files.documents.length] : undefined;
    const rendered = renderCaseTexts(caseFile, state);
    return buildCaseContext(rendered, state, currentStep(rendered, state), {
      includeModelAnswers,
      documentTexts,
      notes,
      draft,
      modelDecisionText: modelParsed ? renderDocumentText(modelParsed.body, state, null) : null,
    });
  }, [caseFile, state, notes, draft, includeModelAnswers, files, texts]);
}

/** Module-level so `useQueries` keeps the combined array stable between renders. */
function dataOf(results: { data?: ParsedDocument | undefined }[]): (ParsedDocument | undefined)[] {
  return results.map((r) => r.data);
}

/** The Markdown files the case context needs: visible documents, then the model decision. */
function caseFiles(caseFile: CaseFile, state: CaseState, includeModelAnswers: boolean) {
  const documents = visibleDocuments(caseFile, state).filter(
    (v) => documentFormat(v.document.fil) === 'markdown',
  );
  const decision = state.decisions.at(-1) ?? null;
  const modelPath = includeModelAnswers && decision ? decision.assessment.modelDecisionPath : null;
  return {
    documents,
    modelPath,
    all: [...documents.map((d) => d.document.fil), ...(modelPath ? [modelPath] : [])],
  };
}
