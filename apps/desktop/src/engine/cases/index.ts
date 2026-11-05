/**
 * engine/cases — the case engine (ärendemotorn): case state, steps, events, simulated time,
 * the 9 kap. 99 § deadline and the decision assessment. Pure TypeScript without React,
 * Tauri or I/O.
 */
export * from './types';
export { CaseEngineError, type CaseEngineErrorCode } from './errors';
export {
  advanceDays,
  caseFacts,
  currentStep,
  diary,
  extendDeadline,
  isCaseComplete,
  markDocumentSeen,
  markReviewed,
  selfAssessStep,
  skipStep,
  startCase,
  stepById,
  stepFeedback,
  stepOverview,
  submitDecision,
  submitStep,
  visibleDocuments,
  type StartCaseOptions,
  type VisibleCaseDocument,
} from './engine';
export {
  evaluateTriggers,
  injunctionKind,
  isStepMissed,
  randomDraw,
  triggerHolds,
} from './triggers';
export { criteriaOf, gradeStepAnswer, isSelfAssessedStep, selectionStats } from './grading';
export {
  assessDecision,
  assessmentScore,
  DECISION_OUTCOME_LABELS,
  DELIVERY_METHOD_LABELS,
  emptyDecisionDraft,
  isGrant,
  objectingNeighbours,
} from './decision';
export {
  calculateFee,
  caseDeadline,
  computeDeadline,
  deadlineStatus,
  DEADLINE_DAYS,
  DEFAULT_REDUCTION_PER_WEEK,
  formatKronor,
  INJUNCTION_WINDOW_DAYS,
  MAX_EXTENSION_WEEKS,
  suspensionLawRef,
  SUSPENSION_REASON_TEXT,
  type DeadlineInput,
} from './deadline';
export {
  ANNOUNCEMENT_DELAY_DAYS,
  caseTemplateValues,
  hasTemplateVariables,
  renderCaseTexts,
  renderDocumentText,
  renderStep,
  renderTemplate,
  type TemplateValues,
} from './templates';
export { chapterNineRefs, sectionExistsInChapterNine, type ChapterNineRef } from './law';
export { addDays, daysBetween, formatSwedishDate, isNonWorkingDay, nextWorkingDay } from './dates';
export {
  CaseStateSchema,
  DecisionDraftSchema,
  restoreCaseState,
  StepAnswerSchema,
  type RestoreResult,
} from './schema';
export {
  toCaseStatusPatch,
  toCaseStatusValue,
  toNewCaseEvents,
  toNewCaseStatus,
  toNewCaseStep,
} from './persistence';
