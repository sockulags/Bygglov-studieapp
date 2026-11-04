import type { SqlDriver, SqlValue } from './sql-driver';
import {
  applyPatch,
  assertLimit,
  DEFAULT_RECENT_SESSIONS,
  fromJson,
  optionalIso,
  systemClock,
  toIso,
  toJson,
  type Clock,
} from './shared';
import {
  ConflictError,
  NotFoundError,
  type Answer,
  type AnswersRepository,
  type CaseEvent,
  type CaseStatus,
  type CaseStatusValue,
  type CasesRepository,
  type CaseStep,
  type DataStore,
  type Decision,
  type ModuleStats,
  type ReviewState,
  type ReviewsRepository,
  type Session,
  type SessionsRepository,
  type SettingsRepository,
  type StudyMode,
  type SupervisorFeedback,
} from './types';

/* Row shapes as returned by SELECT (snake_case columns, see migrations.ts). */

interface AnswerRow {
  id: number;
  question_id: string;
  module_id: string;
  answered_at: string;
  correct: number;
  score: number | null;
  answer_json: string;
  response_time_ms: number | null;
  mode: string;
  session_id: number | null;
}

interface ReviewRow {
  question_id: string;
  module_id: string;
  due_at: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review_at: string | null;
}

interface SessionRow {
  id: number;
  started_at: string;
  finished_at: string | null;
  mode: string;
  module_ids_json: string;
  result_json: string | null;
}

interface CaseStatusRow {
  case_id: string;
  status: string;
  current_step_id: string | null;
  sim_date: string;
  started_at: string;
  submitted_at: string | null;
  /** From the LEFT JOIN with case_state (migration 2); null when that row is missing. */
  state_json: string | null;
  notes: string | null;
  reflection: string | null;
}

interface CaseStepRow {
  id: number;
  case_id: string;
  step_id: string;
  answer_json: string;
  points: number | null;
  completed_at: string | null;
}

interface CaseEventRow {
  id: number;
  case_id: string;
  event_id: string;
  triggered_at: string;
  sim_date: string;
}

interface DecisionRow {
  id: number;
  case_id: string;
  decision_json: string;
  submitted_at: string;
  exported_at: string | null;
}

interface FeedbackRow {
  id: number;
  decision_id: number;
  text: string;
  grade: string | null;
  created_at: string;
}

const mapAnswer = (r: AnswerRow): Answer => ({
  id: Number(r.id),
  questionId: r.question_id,
  moduleId: r.module_id,
  answeredAt: r.answered_at,
  correct: Number(r.correct) === 1,
  score: r.score,
  answer: fromJson(r.answer_json),
  responseTimeMs: r.response_time_ms,
  // Values are written only through this module, so the cast is safe.
  mode: r.mode as StudyMode,
  sessionId: r.session_id === null ? null : Number(r.session_id),
});

const mapReview = (r: ReviewRow): ReviewState => ({
  questionId: r.question_id,
  moduleId: r.module_id,
  due: r.due_at,
  stability: r.stability,
  difficulty: r.difficulty,
  elapsedDays: r.elapsed_days,
  scheduledDays: r.scheduled_days,
  learningSteps: Number(r.learning_steps),
  reps: Number(r.reps),
  lapses: Number(r.lapses),
  state: Number(r.state),
  lastReview: r.last_review_at,
});

const mapSession = (r: SessionRow): Session => ({
  id: Number(r.id),
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  mode: r.mode as StudyMode,
  moduleIds: fromJson(r.module_ids_json) as string[],
  result: fromJson(r.result_json),
});

const mapCaseStatus = (r: CaseStatusRow): CaseStatus => ({
  caseId: r.case_id,
  status: r.status as CaseStatusValue,
  currentStepId: r.current_step_id,
  simDate: r.sim_date,
  startedAt: r.started_at,
  submittedAt: r.submitted_at,
  state: fromJson(r.state_json),
  notes: r.notes ?? '',
  reflection: r.reflection ?? '',
});

/** case_status joined with its case_state row (migration 2). */
const CASE_STATUS_SELECT = `SELECT s.case_id, s.status, s.current_step_id, s.sim_date, s.started_at,
  s.submitted_at, c.state_json, c.notes, c.reflection
  FROM case_status s LEFT JOIN case_state c ON c.case_id = s.case_id`;

const mapCaseStep = (r: CaseStepRow): CaseStep => ({
  id: Number(r.id),
  caseId: r.case_id,
  stepId: r.step_id,
  answer: fromJson(r.answer_json),
  points: r.points,
  completedAt: r.completed_at,
});

const mapCaseEvent = (r: CaseEventRow): CaseEvent => ({
  id: Number(r.id),
  caseId: r.case_id,
  eventId: r.event_id,
  triggeredAt: r.triggered_at,
  simDate: r.sim_date,
});

const mapDecision = (r: DecisionRow): Decision => ({
  id: Number(r.id),
  caseId: r.case_id,
  decision: fromJson(r.decision_json),
  submittedAt: r.submitted_at,
  exportedAt: r.exported_at,
});

const mapFeedback = (r: FeedbackRow): SupervisorFeedback => ({
  id: Number(r.id),
  decisionId: Number(r.decision_id),
  text: r.text,
  grade: r.grade,
  createdAt: r.created_at,
});

/** `$start, $start+1, ...` placeholders for an IN (...) list. */
function placeholders(count: number, start: number): string {
  return Array.from({ length: count }, (_, i) => `$${start + i}`).join(', ');
}

/**
 * Repositories on top of a migrated SQLite database (Tauri plugin or node:sqlite).
 * Call `runMigrations(driver)` (db.ts `open()` does) before creating the store.
 */
export function createSqlDataStore(driver: SqlDriver, clock: Clock = systemClock): DataStore {
  const nowIso = () => clock().toISOString();

  async function one<Row>(sql: string, params: readonly SqlValue[]): Promise<Row | null> {
    const rows = await driver.select<Row>(sql, params);
    return rows[0] ?? null;
  }

  async function insertId(sql: string, params: readonly SqlValue[]): Promise<number> {
    const result = await driver.execute(sql, params);
    if (result.lastInsertId === null) throw new Error('INSERT returned no row id.');
    return result.lastInsertId;
  }

  /* ---------------------------------------------------------------- answers */

  const answers: AnswersRepository = {
    async recordAnswer(input) {
      const id = await insertId(
        `INSERT INTO answers (question_id, module_id, answered_at, correct, score, answer_json, response_time_ms, mode, session_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          input.questionId,
          input.moduleId,
          input.answeredAt === undefined ? nowIso() : toIso(input.answeredAt),
          input.correct ? 1 : 0,
          input.score ?? null,
          toJson(input.answer, 'answer'),
          input.responseTimeMs ?? null,
          input.mode,
          input.sessionId ?? null,
        ],
      );
      const row = await one<AnswerRow>('SELECT * FROM answers WHERE id = $1', [id]);
      if (!row) throw new NotFoundError(`Svar ${id}`);
      return mapAnswer(row);
    },

    async listAnswersForQuestion(questionId, options) {
      const limit = assertLimit(options?.limit);
      const rows =
        limit === undefined
          ? await driver.select<AnswerRow>(
              'SELECT * FROM answers WHERE question_id = $1 ORDER BY answered_at DESC, id DESC',
              [questionId],
            )
          : await driver.select<AnswerRow>(
              'SELECT * FROM answers WHERE question_id = $1 ORDER BY answered_at DESC, id DESC LIMIT $2',
              [questionId, limit],
            );
      return rows.map(mapAnswer);
    },

    async listAnswersForSession(sessionId) {
      const rows = await driver.select<AnswerRow>(
        'SELECT * FROM answers WHERE session_id = $1 ORDER BY answered_at ASC, id ASC',
        [sessionId],
      );
      return rows.map(mapAnswer);
    },

    async listAnswers() {
      const rows = await driver.select<AnswerRow>(
        'SELECT * FROM answers ORDER BY answered_at ASC, id ASC',
        [],
      );
      return rows.map(mapAnswer);
    },

    async statsPerModule() {
      const rows = await driver.select<{
        module_id: string;
        answered: number;
        correct: number | null;
        distinct_questions: number;
        last_answered_at: string | null;
      }>(
        `SELECT module_id,
                COUNT(*) AS answered,
                SUM(correct) AS correct,
                COUNT(DISTINCT question_id) AS distinct_questions,
                MAX(answered_at) AS last_answered_at
           FROM answers
          GROUP BY module_id
          ORDER BY module_id`,
      );
      return rows.map((r): ModuleStats => {
        const answered = Number(r.answered);
        const correct = Number(r.correct ?? 0);
        return {
          moduleId: r.module_id,
          answered,
          correct,
          accuracy: answered === 0 ? 0 : correct / answered,
          distinctQuestions: Number(r.distinct_questions),
          lastAnsweredAt: r.last_answered_at,
        };
      });
    },
  };

  /* ---------------------------------------------------------------- reviews */

  const reviews: ReviewsRepository = {
    async getDue(now, options) {
      const params: SqlValue[] = [now.toISOString()];
      let sql = 'SELECT * FROM reviews WHERE due_at <= $1';
      const moduleIds = options?.moduleIds ?? [];
      if (moduleIds.length > 0) {
        sql += ` AND module_id IN (${placeholders(moduleIds.length, 2)})`;
        params.push(...moduleIds);
      }
      sql += ' ORDER BY due_at ASC, question_id ASC';
      const limit = assertLimit(options?.limit);
      if (limit !== undefined) {
        sql += ` LIMIT $${params.length + 1}`;
        params.push(limit);
      }
      return (await driver.select<ReviewRow>(sql, params)).map(mapReview);
    },

    async getReviewState(questionId) {
      const row = await one<ReviewRow>('SELECT * FROM reviews WHERE question_id = $1', [
        questionId,
      ]);
      return row ? mapReview(row) : null;
    },

    async listReviewStates(options) {
      const moduleIds = options?.moduleIds ?? [];
      const rows =
        moduleIds.length > 0
          ? await driver.select<ReviewRow>(
              `SELECT * FROM reviews WHERE module_id IN (${placeholders(moduleIds.length, 1)}) ORDER BY question_id`,
              [...moduleIds],
            )
          : await driver.select<ReviewRow>('SELECT * FROM reviews ORDER BY question_id');
      return rows.map(mapReview);
    },

    async upsertReviewState(s) {
      await driver.execute(
        `INSERT INTO reviews (question_id, module_id, due_at, stability, difficulty, elapsed_days, scheduled_days,
                              learning_steps, reps, lapses, state, last_review_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (question_id) DO UPDATE SET
           module_id = excluded.module_id,
           due_at = excluded.due_at,
           stability = excluded.stability,
           difficulty = excluded.difficulty,
           elapsed_days = excluded.elapsed_days,
           scheduled_days = excluded.scheduled_days,
           learning_steps = excluded.learning_steps,
           reps = excluded.reps,
           lapses = excluded.lapses,
           state = excluded.state,
           last_review_at = excluded.last_review_at`,
        [
          s.questionId,
          s.moduleId,
          toIso(s.due),
          s.stability,
          s.difficulty,
          s.elapsedDays,
          s.scheduledDays,
          s.learningSteps,
          s.reps,
          s.lapses,
          s.state,
          optionalIso(s.lastReview),
        ],
      );
    },
  };

  /* --------------------------------------------------------------- sessions */

  const sessions: SessionsRepository = {
    async startSession(input) {
      const id = await insertId(
        'INSERT INTO sessions (started_at, mode, module_ids_json) VALUES ($1, $2, $3)',
        [
          input.startedAt === undefined ? nowIso() : toIso(input.startedAt),
          input.mode,
          toJson([...input.moduleIds], 'moduleIds'),
        ],
      );
      const session = await sessions.getSession(id);
      if (!session) throw new NotFoundError(`Pass ${id}`);
      return session;
    },

    async finishSession(id, result, finishedAt) {
      const { rowsAffected } = await driver.execute(
        'UPDATE sessions SET finished_at = $1, result_json = $2 WHERE id = $3',
        [
          finishedAt === undefined ? nowIso() : toIso(finishedAt),
          toJson(result ?? null, 'result'),
          id,
        ],
      );
      if (rowsAffected === 0) throw new NotFoundError(`Pass ${id}`);
      const session = await sessions.getSession(id);
      if (!session) throw new NotFoundError(`Pass ${id}`);
      return session;
    },

    async getSession(id) {
      const row = await one<SessionRow>('SELECT * FROM sessions WHERE id = $1', [id]);
      return row ? mapSession(row) : null;
    },

    async listRecent(limit = DEFAULT_RECENT_SESSIONS) {
      const rows = await driver.select<SessionRow>(
        'SELECT * FROM sessions ORDER BY started_at DESC, id DESC LIMIT $1',
        [assertLimit(limit) ?? DEFAULT_RECENT_SESSIONS],
      );
      return rows.map(mapSession);
    },
  };

  /* --------------------------------------------------------------- settings */

  const settings: SettingsRepository = {
    async get(key) {
      const row = await one<{ value_json: string }>(
        'SELECT value_json FROM settings WHERE key = $1',
        [key],
      );
      return row ? fromJson(row.value_json) : undefined;
    },

    async set(key, value) {
      await driver.execute(
        `INSERT INTO settings (key, value_json) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json`,
        [key, toJson(value, `setting "${key}"`)],
      );
    },

    async delete(key) {
      await driver.execute('DELETE FROM settings WHERE key = $1', [key]);
    },

    async getAll() {
      const rows = await driver.select<{ key: string; value_json: string }>(
        'SELECT key, value_json FROM settings ORDER BY key',
      );
      return Object.fromEntries(rows.map((r) => [r.key, fromJson(r.value_json)]));
    },
  };

  /* ------------------------------------------------------------------ cases */

  async function requireCase(caseId: string): Promise<CaseStatus> {
    const status = await cases.getCaseStatus(caseId);
    if (!status) throw new NotFoundError(`Ärendet ${caseId}`);
    return status;
  }

  /** Upserts the case_state row (engine state, notes, reflection) of a started case. */
  async function saveCaseState(
    caseId: string,
    values: Pick<CaseStatus, 'state' | 'notes' | 'reflection'>,
  ): Promise<void> {
    await driver.execute(
      `INSERT INTO case_state (case_id, state_json, notes, reflection) VALUES ($1, $2, $3, $4)
       ON CONFLICT (case_id) DO UPDATE SET state_json = excluded.state_json,
         notes = excluded.notes, reflection = excluded.reflection`,
      [caseId, toJson(values.state ?? null, 'case state'), values.notes, values.reflection],
    );
  }

  async function requireDecision(id: number): Promise<Decision> {
    const decision = await cases.getDecision(id);
    if (!decision) throw new NotFoundError(`Beslut ${id}`);
    return decision;
  }

  const cases: CasesRepository = {
    async startCase(input) {
      if (await cases.getCaseStatus(input.caseId)) {
        throw new ConflictError(`Ärendet ${input.caseId} är redan påbörjat.`);
      }
      await driver.execute(
        `INSERT INTO case_status (case_id, status, current_step_id, sim_date, started_at, submitted_at)
         VALUES ($1, $2, $3, $4, $5, NULL)`,
        [
          input.caseId,
          'in_progress',
          input.currentStepId,
          input.simDate,
          input.startedAt === undefined ? nowIso() : toIso(input.startedAt),
        ],
      );
      await saveCaseState(input.caseId, {
        state: input.state ?? null,
        notes: input.notes ?? '',
        reflection: input.reflection ?? '',
      });
      return requireCase(input.caseId);
    },

    async getCaseStatus(caseId) {
      const row = await one<CaseStatusRow>(`${CASE_STATUS_SELECT} WHERE s.case_id = $1`, [caseId]);
      return row ? mapCaseStatus(row) : null;
    },

    async listCaseStatuses() {
      const rows = await driver.select<CaseStatusRow>(
        `${CASE_STATUS_SELECT} ORDER BY s.started_at, s.case_id`,
      );
      return rows.map(mapCaseStatus);
    },

    async updateCaseStatus(caseId, patch) {
      const current = await requireCase(caseId);
      const next = applyPatch(current, patch);
      next.submittedAt = optionalIso(next.submittedAt);
      await driver.execute(
        `UPDATE case_status SET status = $1, current_step_id = $2, sim_date = $3, submitted_at = $4
          WHERE case_id = $5`,
        [next.status, next.currentStepId, next.simDate, next.submittedAt, caseId],
      );
      if (
        patch.state !== undefined ||
        patch.notes !== undefined ||
        patch.reflection !== undefined
      ) {
        await saveCaseState(caseId, next);
      }
      return requireCase(caseId);
    },

    async resetCase(caseId) {
      await driver.execute(
        'DELETE FROM supervisor_feedback WHERE decision_id IN (SELECT id FROM decisions WHERE case_id = $1)',
        [caseId],
      );
      await driver.execute('DELETE FROM decisions WHERE case_id = $1', [caseId]);
      await driver.execute('DELETE FROM case_events WHERE case_id = $1', [caseId]);
      await driver.execute('DELETE FROM case_steps WHERE case_id = $1', [caseId]);
      await driver.execute('DELETE FROM case_state WHERE case_id = $1', [caseId]);
      await driver.execute('DELETE FROM case_status WHERE case_id = $1', [caseId]);
    },

    async saveStep(input) {
      await requireCase(input.caseId);
      await driver.execute(
        `INSERT INTO case_steps (case_id, step_id, answer_json, points, completed_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (case_id, step_id) DO UPDATE SET
           answer_json = excluded.answer_json,
           points = excluded.points,
           completed_at = excluded.completed_at`,
        [
          input.caseId,
          input.stepId,
          toJson(input.answer, 'step answer'),
          input.points ?? null,
          optionalIso(input.completedAt),
        ],
      );
      const row = await one<CaseStepRow>(
        'SELECT * FROM case_steps WHERE case_id = $1 AND step_id = $2',
        [input.caseId, input.stepId],
      );
      if (!row) throw new NotFoundError(`Steg ${input.stepId}`);
      return mapCaseStep(row);
    },

    async listSteps(caseId) {
      const rows = await driver.select<CaseStepRow>(
        'SELECT * FROM case_steps WHERE case_id = $1 ORDER BY id',
        [caseId],
      );
      return rows.map(mapCaseStep);
    },

    async recordEvent(input) {
      await requireCase(input.caseId);
      await driver.execute(
        `INSERT OR IGNORE INTO case_events (case_id, event_id, triggered_at, sim_date) VALUES ($1, $2, $3, $4)`,
        [
          input.caseId,
          input.eventId,
          input.triggeredAt === undefined ? nowIso() : toIso(input.triggeredAt),
          input.simDate,
        ],
      );
      const row = await one<CaseEventRow>(
        'SELECT * FROM case_events WHERE case_id = $1 AND event_id = $2',
        [input.caseId, input.eventId],
      );
      if (!row) throw new NotFoundError(`Händelse ${input.eventId}`);
      return mapCaseEvent(row);
    },

    async listEvents(caseId) {
      const rows = await driver.select<CaseEventRow>(
        'SELECT * FROM case_events WHERE case_id = $1 ORDER BY triggered_at, id',
        [caseId],
      );
      return rows.map(mapCaseEvent);
    },

    async submitDecision(input) {
      await requireCase(input.caseId);
      const id = await insertId(
        'INSERT INTO decisions (case_id, decision_json, submitted_at) VALUES ($1, $2, $3)',
        [
          input.caseId,
          toJson(input.decision, 'decision'),
          input.submittedAt === undefined ? nowIso() : toIso(input.submittedAt),
        ],
      );
      return requireDecision(id);
    },

    async getDecision(id) {
      const row = await one<DecisionRow>('SELECT * FROM decisions WHERE id = $1', [id]);
      return row ? mapDecision(row) : null;
    },

    async listDecisions(caseId) {
      const rows = await driver.select<DecisionRow>(
        'SELECT * FROM decisions WHERE case_id = $1 ORDER BY submitted_at, id',
        [caseId],
      );
      return rows.map(mapDecision);
    },

    async markDecisionExported(id, exportedAt) {
      const { rowsAffected } = await driver.execute(
        'UPDATE decisions SET exported_at = $1 WHERE id = $2',
        [exportedAt === undefined ? nowIso() : toIso(exportedAt), id],
      );
      if (rowsAffected === 0) throw new NotFoundError(`Beslut ${id}`);
      return requireDecision(id);
    },

    async addSupervisorFeedback(input) {
      await requireDecision(input.decisionId);
      const id = await insertId(
        'INSERT INTO supervisor_feedback (decision_id, text, grade, created_at) VALUES ($1, $2, $3, $4)',
        [
          input.decisionId,
          input.text,
          input.grade ?? null,
          input.createdAt === undefined ? nowIso() : toIso(input.createdAt),
        ],
      );
      const row = await one<FeedbackRow>('SELECT * FROM supervisor_feedback WHERE id = $1', [id]);
      if (!row) throw new NotFoundError(`Handledarsvar ${id}`);
      return mapFeedback(row);
    },

    async listSupervisorFeedback(decisionId) {
      const rows = await driver.select<FeedbackRow>(
        'SELECT * FROM supervisor_feedback WHERE decision_id = $1 ORDER BY created_at, id',
        [decisionId],
      );
      return rows.map(mapFeedback);
    },
  };

  /** Tables cleared by `clearAll`, dependants first (foreign keys are not enforced, see db.ts). */
  const DATA_TABLES = [
    'supervisor_feedback',
    'decisions',
    'case_events',
    'case_steps',
    'case_state',
    'case_status',
    'answers',
    'reviews',
    'sessions',
    'settings',
  ] as const;

  async function clearAll(): Promise<void> {
    for (const table of DATA_TABLES) await driver.execute(`DELETE FROM ${table}`, []);
  }

  return { kind: 'sqlite', answers, reviews, sessions, settings, cases, clearAll };
}
