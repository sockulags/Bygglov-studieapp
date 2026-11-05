/**
 * features/tutor — Studiehjälp: the AI tutor ("Fråga handledaren").
 *
 * Mount `<AskTutorButton context={…} suggestions={…} />` in a view; it opens `<TutorPanel>`.
 * Build the context with `useQuestionTutorContext` (quiz) or `useCaseTutorContext` (case
 * view and comparison view), or with the pure `buildQuestionContext` / `buildCaseContext`.
 * Inställningar → Studiehjälp is `<TutorSettingsSection />`.
 */
export { AskTutorButton, type AskTutorButtonProps } from './ask-tutor-button';
export { TutorPanel, type TutorPanelProps } from './tutor-panel';
export { TutorSettingsSection } from './settings-section';
export {
  buildCaseContext,
  buildGeneralContext,
  buildQuestionContext,
  clipText,
  MAX_CONTEXT_CHARS,
  type CaseContextOptions,
  type StudyStatus,
} from './context';
export {
  useCaseTutorContext,
  useQuestionTutorContext,
  type CaseTutorSource,
} from './use-tutor-context';
export {
  CASE_SUGGESTIONS,
  caseSuggestions,
  DECISION_SUGGESTIONS,
  GENERAL_SUGGESTIONS,
  QUESTION_SUGGESTIONS,
  questionSuggestions,
} from './suggestions';
export {
  getTutorTransport,
  setTutorTransport,
  TauriTransport,
  type TutorTransport,
} from './transport';
export { MockTransport, MOCK_NOTICE } from './mock-transport';
export { useHasTutorKey } from './keys';
export type { TutorContext } from './types';
