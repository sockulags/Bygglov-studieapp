import type { DecisionOutcome, StepType } from '@bygglov/content-schema';
import type { GradeOutcome, ItemFeedback, QuizAnswer } from '../quiz/types';

/**
 * Types for the case engine (ärendemotorn). Everything in `CaseState` is plain JSON so the
 * whole state can be stored as one JSON value and restored with `restoreCaseState`.
 */

/** Bump when the shape of `CaseState` changes incompatibly. */
export const CASE_STATE_VERSION = 1;

/** pagar: in progress · inlamnat: decision submitted · bedomt: reviewed by the supervisor. */
export type CaseProgress = 'pagar' | 'inlamnat' | 'bedomt';

/* ------------------------------------------------------------------- step answers */

/** The question types a `fraga` step can have. */
export type CaseQuestionAnswer = Extract<
  QuizAnswer,
  { type: 'flerval' | 'flersvar' | 'sant_falskt' | 'oppen' }
>;

/**
 * A learner's answer to one step. Indices always refer to the order in the case file.
 */
export type StepAnswer =
  /** One mark per entry in `poster`: true = finns, false = saknas, null = not marked. */
  | { type: 'checklista'; marks: readonly (boolean | null)[] }
  /**
   * `answer.type` must match the step's `fragetyp`. For `oppen` the learner can tick the
   * assessment criteria right away (`checkedCriteria`) or later with `selfAssessStep`.
   */
  | { type: 'fraga'; answer: CaseQuestionAnswer; checkedCriteria?: readonly number[] }
  /** Value per calculation id (`fragor[].id`); strings may use comma and carry a unit. */
  | { type: 'berakning'; values: Readonly<Record<string, string | number | null>> }
  /** Indices of the chosen alternatives. */
  | { type: 'urval'; selected: readonly number[] }
  /** The written text; criteria can be ticked now or later with `selfAssessStep`. */
  | { type: 'skrivelse'; text: string; checkedCriteria?: readonly number[] }
  | { type: 'beslut'; draft: DecisionDraft };

/* ------------------------------------------------------------------------- decision */

export type DeliveryMethod = 'delges' | 'meddelande' | 'skickas';

export interface DecisionRecipient {
  /** Free text, e.g. "Sökanden", "Ägaren till Björken 8". */
  mottagare: string;
  satt: DeliveryMethod;
}

/** The decision form (beslutsmallen, docs/03). */
export interface DecisionDraft {
  utfall: DecisionOutcome;
  /** Law references, e.g. "PBL 9 kap. 56 §". Free text entries are allowed. */
  lagstod: string[];
  motivering: string;
  villkor_upplysningar: string;
  /** Fee in SEK, null when not filled in. */
  avgift: number | null;
  overklagandehanvisning: boolean;
  expediering: DecisionRecipient[];
}

export type { DecisionOutcome };

/* -------------------------------------------------------------------------- state */

export interface StepResult {
  stepId: string;
  stepType: StepType;
  /** Simulated date the step was completed or skipped. */
  date: string;
  skipped: boolean;
  /** Null when skipped. */
  answer: StepAnswer | null;
  /** 0..1; null when skipped or while a self-assessment is pending. */
  score: number | null;
  /** Null when skipped or while a self-assessment is pending. */
  outcome: GradeOutcome | null;
  /** Ticked assessment criteria for self-graded steps, null until assessed. */
  checkedCriteria: number[] | null;
}

export interface VisibleDocument {
  documentId: string;
  /** Simulated arrival date shown in the diary. */
  receivedDate: string;
  /** Shown as "NY" until the learner opens it (`markDocumentSeen`). */
  unseen: boolean;
}

export interface FiredEvent {
  eventId: string;
  /** Simulated date when the event fired (before its own time shift). */
  date: string;
}

export interface Injunction {
  /** Normalised kind, e.g. "komplettering"; matched against `om_forelagt`. */
  kind: string;
  date: string;
  stepId: string;
}

export type DiaryKind =
  | 'registrering' // case registered
  | 'handling' // a document arrived
  | 'steg' // a step was completed
  | 'hoppat' // a step was skipped
  | 'handelse' // message from an event
  | 'tid' // simulated time passed
  | 'frist' // the 99 § deadline changed
  | 'beslut'; // decision made

export interface DiaryEntry {
  date: string;
  kind: DiaryKind;
  /** Swedish text for the diary. */
  text: string;
  documentId?: string;
  stepId?: string;
  eventId?: string;
}

export interface SubmittedDecision {
  stepId: string;
  date: string;
  draft: DecisionDraft;
}

export interface CaseState {
  version: typeof CASE_STATE_VERSION;
  caseId: string;
  /** Numeric seed for the case's random events (`slump`). */
  seed: number;
  /** Real-world timestamp (ISO 8601) when the learner started the case. */
  startedAt: string;
  /** Today in the simulation, YYYY-MM-DD. */
  simDate: string;
  /** Ansökningsdagen: the case's `startdatum`. */
  applicationDate: string;
  /** Date the deficiencies were remedied (set by `satt_komplett_datum`), null until then. */
  completionDate: string | null;
  /** Weeks the 99 § deadline has been extended (0 = not extended, at most 10). */
  extensionWeeks: number;
  /** Decision deadline under 9 kap. 99 §, null while waiting for a requested completion. */
  deadlineDate: string | null;
  /** Step ids in order: the ordinary steps plus steps inserted by events. */
  queue: string[];
  /** Index into `queue` of the current step; `queue.length` when every step is done. */
  currentIndex: number;
  /** Keyed by step id. */
  stepResults: Record<string, StepResult>;
  visibleDocuments: VisibleDocument[];
  firedEvents: FiredEvent[];
  injunctions: Injunction[];
  /** Changed facts from `andrade_fakta`, merged in firing order. */
  facts: Record<string, unknown>;
  decisions: SubmittedDecision[];
  /** Chronological. */
  diary: DiaryEntry[];
  status: CaseProgress;
}

/* ----------------------------------------------------------------------- feedback */

export interface SelfAssessmentInfo {
  criteria: string[];
  /** Null until the learner has ticked the criteria. */
  checked: number[] | null;
  /** `modellsvar` of an open question. */
  modelAnswer: string | null;
  /** Path of the model text (`modelltext`) or model decision inside the case folder. */
  modelTextPath: string | null;
}

export interface SelectionStats {
  /** Share of the chosen alternatives that are right; 0 when nothing was chosen. */
  precision: number;
  /** Share of the right alternatives that were chosen. */
  recall: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
}

export interface StepFeedback {
  stepId: string;
  stepType: StepType;
  skipped: boolean;
  /** 0..1, null while a self-assessment is pending or when skipped. */
  score: number | null;
  outcome: GradeOutcome | null;
  /** True when the step counts as missed for `om_missat` (skipped or answered wrongly). */
  missed: boolean;
  explanation: string | null;
  lawRefs: string[];
  /** Per post, alternative or calculation, in file order. */
  items: ItemFeedback[];
  selfAssessment: SelfAssessmentInfo | null;
  selection: SelectionStats | null;
  /** Only for `beslut` steps. */
  decision: DecisionAssessment | null;
}

/* --------------------------------------------------------------------- assessment */

export type CheckSeverity = 'error' | 'warning' | 'tip';

export interface DecisionCheck {
  /** Stable id, e.g. "utfall", "avgift", "delgivning_sokande". */
  id: string;
  /** Short Swedish heading. */
  title: string;
  passed: boolean;
  /** How serious a failed check is. */
  severity: CheckSeverity;
  /** Swedish explanation of the result. */
  message: string;
  lawRefs: string[];
  /** Extra lines, e.g. the fee calculation. */
  details: string[];
}

export type DeadlineBasis = 'ansokningsdagen' | 'komplettering' | 'vantar_pa_komplettering';

export interface CaseDeadline {
  applicationDate: string;
  /** The day the ten weeks run from; null while waiting for a requested completion. */
  startDate: string | null;
  basis: DeadlineBasis;
  /** First injunction to complete the application, if any. */
  injunctionDate: string | null;
  /** Whether that injunction was issued within three weeks of the application day. */
  injunctionInTime: boolean | null;
  extensionWeeks: number;
  /** Last day for a timely decision; null while waiting for a completion. */
  deadlineDate: string | null;
  /** Swedish explanation with law references. */
  explanation: string;
}

export interface DeadlineStatus extends CaseDeadline {
  /** The date the status is computed for. */
  onDate: string;
  /** Days since `startDate` (0 on that day), null when the deadline is not running. */
  daysElapsed: number | null;
  /** Days left until `deadlineDate` (negative when overdue), null when not running. */
  daysLeft: number | null;
  /** Started weeks past the deadline (12 kap. 8 a §), 0 when in time. */
  weeksOverdue: number;
}

export interface FeeLine {
  /** Key in the case's `taxa`. */
  key: string;
  baseAmount: number;
  /** Amount after the reduction, rounded to whole kronor. */
  expectedAmount: number;
}

export interface FeeCalculation {
  decisionDate: string;
  deadline: DeadlineStatus;
  /** Reduction per started week, from `taxa.reduktion_per_vecka` (default 1/5). */
  reductionPerWeek: number;
  weeksOverdue: number;
  /** Total reduction share 0..1. */
  reduction: number;
  lines: FeeLine[];
  /** Swedish step-by-step calculation. */
  explanation: string[];
}

export interface DecisionAssessment {
  caseId: string;
  stepId: string;
  decisionDate: string;
  expectedOutcome: DecisionOutcome;
  /** Automatic structured checks, in display order. */
  checks: DecisionCheck[];
  /** Checks with severity error or warning that passed / were evaluated. */
  passedChecks: number;
  totalChecks: number;
  fee: FeeCalculation;
  /** Assessment criteria (bedomningspunkter) for self-assessment. */
  criteria: string[];
  /** Model decision (Markdown) inside the case folder, shown after submission. */
  modelDecisionPath: string | null;
  /** `facit.vanliga_fel`. */
  commonMistakes: string[];
}

/* -------------------------------------------------------------------------- results */

export interface TriggerContext {
  /** Outcome of a decision that is being (or has been) made. Defaults to the latest one. */
  decision?: DecisionOutcome;
}

export interface StepOutcome {
  state: CaseState;
  feedback: StepFeedback;
  /** Ids of the events that fired, in firing order. */
  firedEvents: string[];
}

export interface DecisionOutcomeResult extends StepOutcome {
  assessment: DecisionAssessment;
}
