/**
 * Domain types and repository interfaces for the local data layer.
 *
 * Content (questions, cases, modules) is bundled with the app and is NOT stored here;
 * the database only references content ids (docs/05 → Datamodell). All timestamps are
 * ISO 8601 strings in UTC (`Date.prototype.toISOString()`), simulated case dates are
 * plain `YYYY-MM-DD` strings. JSON payloads are typed as `unknown`: the owning feature
 * (engine, case engine) validates them with zod when reading them back.
 */

/** Study modes from docs/02 → Studielägen (stored as these ids in `answers.mode` / `sessions.mode`). */
export type StudyMode =
  | 'quick-quiz' // Snabbquiz
  | 'module-review' // Modulgenomgång
  | 'review' // Repetition
  | 'study' // Instudering
  | 'exam' // Tentaläge
  | 'case'; // Ärenden (questions answered inside a case)

/* ------------------------------------------------------------------ answers (svar) */

export interface Answer {
  id: number;
  questionId: string;
  /** Module id of the question at the time of answering, e.g. "03-lovplikt". */
  moduleId: string;
  answeredAt: string;
  correct: boolean;
  /** Partial credit 0..1 (flersvar, självrättning). Null when only right/wrong applies. */
  score: number | null;
  answer: unknown;
  responseTimeMs: number | null;
  mode: StudyMode;
  sessionId: number | null;
}

export interface NewAnswer {
  questionId: string;
  moduleId: string;
  correct: boolean;
  score?: number | null;
  answer: unknown;
  responseTimeMs?: number | null;
  mode: StudyMode;
  sessionId?: number | null;
  /** Defaults to now. */
  answeredAt?: string;
}

export interface ModuleStats {
  moduleId: string;
  /** Number of answers given. */
  answered: number;
  /** Number of answers marked correct. */
  correct: number;
  /** correct / answered, 0 when nothing is answered. */
  accuracy: number;
  /** Number of distinct questions answered at least once. */
  distinctQuestions: number;
  lastAnsweredAt: string | null;
}

export interface AnswersRepository {
  recordAnswer(input: NewAnswer): Promise<Answer>;
  /** Newest first. */
  listAnswersForQuestion(questionId: string, options?: { limit?: number }): Promise<Answer[]>;
  /** Oldest first, in the order they were answered. */
  listAnswersForSession(sessionId: number): Promise<Answer[]>;
  /** Every answer, oldest first (export, statistics over all history). */
  listAnswers(): Promise<Answer[]>;
  /** One row per module that has answers, sorted by module id. */
  statsPerModule(): Promise<ModuleStats[]>;
}

/* ------------------------------------------------------------ reviews (repetition) */

/**
 * FSRS scheduling state for one question. Field-for-field compatible with the `Card`
 * type in ts-fsrs (dates as ISO strings) so the engine can convert without loss.
 */
export interface ReviewState {
  questionId: string;
  moduleId: string;
  /** Next review date (nasta_datum). */
  due: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  /** Number of reviews (antal). */
  reps: number;
  lapses: number;
  /** ts-fsrs State: 0 New, 1 Learning, 2 Review, 3 Relearning. */
  state: number;
  /** Last review timestamp (senast). */
  lastReview: string | null;
}

export interface DueReviewOptions {
  /** Only these modules. Omitted or empty means all modules. */
  moduleIds?: readonly string[];
  limit?: number;
}

export interface ReviewsRepository {
  /** Review states with `due <= now`, most overdue first. */
  getDue(now: Date, options?: DueReviewOptions): Promise<ReviewState[]>;
  getReviewState(questionId: string): Promise<ReviewState | null>;
  listReviewStates(options?: { moduleIds?: readonly string[] }): Promise<ReviewState[]>;
  upsertReviewState(state: ReviewState): Promise<void>;
}

/* ------------------------------------------------------------------ sessions (pass) */

export interface Session {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  mode: StudyMode;
  moduleIds: string[];
  result: unknown;
}

export interface NewSession {
  mode: StudyMode;
  moduleIds: readonly string[];
  /** Defaults to now. */
  startedAt?: string;
}

export interface SessionsRepository {
  startSession(input: NewSession): Promise<Session>;
  /** Sets finishedAt and the result summary. Throws if the session does not exist. */
  finishSession(id: number, result: unknown, finishedAt?: string): Promise<Session>;
  getSession(id: number): Promise<Session | null>;
  /** Newest first. Default limit 20. */
  listRecent(limit?: number): Promise<Session[]>;
}

/* ------------------------------------------------------------ settings (installning) */

export interface SettingsRepository {
  /** The stored JSON value, or undefined when the key is not set. Validate with zod. */
  get(key: string): Promise<unknown>;
  /** Stores any JSON-serialisable value. `undefined` is rejected; use `delete`. */
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  getAll(): Promise<Record<string, unknown>>;
}

/* ----------------------------------------------------------------- cases (ärenden) */

export type CaseStatusValue =
  | 'in_progress' // pågående
  | 'submitted' // beslut inlämnat
  | 'reviewed'; // granskat av handledaren

/** arende_status: one row per started case. */
export interface CaseStatus {
  caseId: string;
  status: CaseStatusValue;
  currentStepId: string | null;
  /** Current date in the case's simulated calendar, YYYY-MM-DD. */
  simDate: string;
  startedAt: string;
  submittedAt: string | null;
  /**
   * The case engine's whole state (`CaseState` from engine/cases) as JSON, null when none
   * is stored. The case view validates it with `restoreCaseState` when reading it back.
   */
  state: unknown;
  /** The learner's own notes for the case (arbetsytan → Anteckningar). */
  notes: string;
  /** "Egna reflektioner" written in the comparison view after the decision. */
  reflection: string;
}

export interface NewCaseStatus {
  caseId: string;
  currentStepId: string | null;
  simDate: string;
  /** Defaults to now. */
  startedAt?: string;
  /** Defaults to null. */
  state?: unknown;
  /** Defaults to an empty string. */
  notes?: string;
  /** Defaults to an empty string. */
  reflection?: string;
}

export type CaseStatusPatch = Partial<
  Pick<
    CaseStatus,
    'status' | 'currentStepId' | 'simDate' | 'submittedAt' | 'state' | 'notes' | 'reflection'
  >
>;

/** arende_steg: the answer to one step. One row per (case, step); saving again replaces it. */
export interface CaseStep {
  id: number;
  caseId: string;
  stepId: string;
  answer: unknown;
  points: number | null;
  completedAt: string | null;
}

export interface NewCaseStep {
  caseId: string;
  stepId: string;
  answer: unknown;
  points?: number | null;
  /** Null while the step is saved as a draft. */
  completedAt?: string | null;
}

/** arende_handelse: an event that has been triggered. Each event triggers at most once per case. */
export interface CaseEvent {
  id: number;
  caseId: string;
  eventId: string;
  triggeredAt: string;
  simDate: string;
}

export interface NewCaseEvent {
  caseId: string;
  eventId: string;
  simDate: string;
  triggeredAt?: string;
}

/** beslut */
export interface Decision {
  id: number;
  caseId: string;
  decision: unknown;
  submittedAt: string;
  exportedAt: string | null;
}

export interface NewDecision {
  caseId: string;
  decision: unknown;
  submittedAt?: string;
}

/** handledar_svar */
export interface SupervisorFeedback {
  id: number;
  decisionId: number;
  text: string;
  /** Free-form grade from the supervisor, e.g. "G", "VG" or "3". */
  grade: string | null;
  createdAt: string;
}

export interface NewSupervisorFeedback {
  decisionId: number;
  text: string;
  grade?: string | null;
  createdAt?: string;
}

export interface CasesRepository {
  /** Creates the status row (status in_progress). Throws if the case is already started. */
  startCase(input: NewCaseStatus): Promise<CaseStatus>;
  getCaseStatus(caseId: string): Promise<CaseStatus | null>;
  listCaseStatuses(): Promise<CaseStatus[]>;
  /** Throws if the case is not started. */
  updateCaseStatus(caseId: string, patch: CaseStatusPatch): Promise<CaseStatus>;
  /** Removes the case and everything recorded for it (steps, events, decisions, feedback). */
  resetCase(caseId: string): Promise<void>;

  saveStep(input: NewCaseStep): Promise<CaseStep>;
  /** In the order they were first saved. */
  listSteps(caseId: string): Promise<CaseStep[]>;

  /** Idempotent: recording an already triggered event returns the existing row. */
  recordEvent(input: NewCaseEvent): Promise<CaseEvent>;
  /** In the order they were triggered. */
  listEvents(caseId: string): Promise<CaseEvent[]>;

  submitDecision(input: NewDecision): Promise<Decision>;
  getDecision(id: number): Promise<Decision | null>;
  /** Oldest first. */
  listDecisions(caseId: string): Promise<Decision[]>;
  markDecisionExported(id: number, exportedAt?: string): Promise<Decision>;

  addSupervisorFeedback(input: NewSupervisorFeedback): Promise<SupervisorFeedback>;
  /** Oldest first. */
  listSupervisorFeedback(decisionId: number): Promise<SupervisorFeedback[]>;
}

/* ------------------------------------------------------------------------- store */

export interface DataStore {
  /** "sqlite" inside Tauri, "memory" in a plain browser and in tests. */
  readonly kind: 'sqlite' | 'memory';
  readonly answers: AnswersRepository;
  readonly reviews: ReviewsRepository;
  readonly sessions: SessionsRepository;
  readonly settings: SettingsRepository;
  readonly cases: CasesRepository;
  /**
   * Removes all study data (answers, reviews, sessions, cases, settings). The schema and
   * migration history stay. Used by Inställningar → Återställ and before an import.
   */
  clearAll(): Promise<void>;
}

/** Thrown when a row that must exist is missing. */
export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} hittades inte.`);
    this.name = 'NotFoundError';
  }
}

/** Thrown on a uniqueness conflict, e.g. starting a case twice. */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}
