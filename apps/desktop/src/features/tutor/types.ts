import type { AiContextKind } from '@/data';

export type {
  TutorEffort,
  TutorEvent,
  TutorKeyTestResult,
  TutorMessage,
  TutorRequest,
  TutorSystemBlock,
  TutorUsage,
} from '@/lib/tauri';

/**
 * What the tutor gets to know about what she is looking at. Built by `buildQuestionContext`
 * or `buildCaseContext` (context.ts) and passed to `<TutorPanel>` / `<AskTutorButton>`.
 */
export interface TutorContext {
  /**
   * Identifies the conversation, e.g. "question:lov-001" or "case:A002". Each key has its
   * own chat in the tutor store, so the chat about a question survives closing the panel.
   */
  key: string;
  kind: AiContextKind;
  /** Short Swedish heading for the panel, e.g. "Fråga lov-001" or "A002 Tillbyggnad". */
  title: string;
  /**
   * Plain Swedish text describing what she sees; goes last in the system prompt, uncached.
   * At most `MAX_CONTEXT_CHARS` characters.
   */
  text: string;
  /**
   * Whether she has answered (question) or submitted the decision (case). When false the
   * text holds no answer key and the system prompt forbids revealing one.
   */
  answered: boolean;
}
