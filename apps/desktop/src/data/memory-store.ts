import {
  applyPatch,
  assertLimit,
  cloneJson,
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
  type SupervisorFeedback,
} from './types';

/** Copies a JSON payload through serialisation, exactly like a database round trip. */
function roundTrip(value: unknown, what: string): unknown {
  return fromJson(toJson(value, what));
}

/** Compare by a text key, then by numeric id, ascending. */
function byKeyThenId<T extends { id: number }>(key: (row: T) => string) {
  return (a: T, b: T) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : a.id - b.id);
}

function take<T>(rows: T[], limit: number | undefined): T[] {
  return limit === undefined ? rows : rows.slice(0, limit);
}

/**
 * In-memory implementation of the same repositories as `createSqlDataStore`.
 * Used in vitest and when the app runs in a plain browser (no Tauri). Data lives only
 * as long as the page. Ordering, defaults and errors mirror the SQLite store; the
 * shared contract tests in __tests__/repositories.test.ts run against both.
 */
export function createMemoryDataStore(clock: Clock = systemClock): DataStore {
  const nowIso = () => clock().toISOString();
  const ids = { answer: 0, session: 0, step: 0, event: 0, decision: 0, feedback: 0 };

  const answerRows: Answer[] = [];
  const reviewRows = new Map<string, ReviewState>();
  const sessionRows = new Map<number, Session>();
  const settingRows = new Map<string, string>();
  const caseRows = new Map<string, CaseStatus>();
  const stepRows: CaseStep[] = [];
  const eventRows: CaseEvent[] = [];
  const decisionRows = new Map<number, Decision>();
  const feedbackRows: SupervisorFeedback[] = [];

  /* ---------------------------------------------------------------- answers */

  const answers: AnswersRepository = {
    async recordAnswer(input) {
      const row: Answer = {
        id: ++ids.answer,
        questionId: input.questionId,
        moduleId: input.moduleId,
        answeredAt: input.answeredAt === undefined ? nowIso() : toIso(input.answeredAt),
        correct: input.correct,
        score: input.score ?? null,
        answer: roundTrip(input.answer, 'answer'),
        responseTimeMs: input.responseTimeMs ?? null,
        mode: input.mode,
        sessionId: input.sessionId ?? null,
      };
      answerRows.push(row);
      return cloneJson(row);
    },

    async listAnswersForQuestion(questionId, options) {
      const limit = assertLimit(options?.limit);
      const rows = answerRows
        .filter((a) => a.questionId === questionId)
        .sort(byKeyThenId<Answer>((a) => a.answeredAt))
        .reverse();
      return cloneJson(take(rows, limit));
    },

    async listAnswersForSession(sessionId) {
      const rows = answerRows
        .filter((a) => a.sessionId === sessionId)
        .sort(byKeyThenId<Answer>((a) => a.answeredAt));
      return cloneJson(rows);
    },

    async listAnswers() {
      return cloneJson([...answerRows].sort(byKeyThenId<Answer>((a) => a.answeredAt)));
    },

    async statsPerModule() {
      const byModule = new Map<
        string,
        { answered: number; correct: number; questions: Set<string>; last: string }
      >();
      for (const a of answerRows) {
        const entry = byModule.get(a.moduleId) ?? {
          answered: 0,
          correct: 0,
          questions: new Set(),
          last: '',
        };
        entry.answered += 1;
        if (a.correct) entry.correct += 1;
        entry.questions.add(a.questionId);
        if (a.answeredAt > entry.last) entry.last = a.answeredAt;
        byModule.set(a.moduleId, entry);
      }
      return [...byModule.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([moduleId, e]): ModuleStats => ({
          moduleId,
          answered: e.answered,
          correct: e.correct,
          accuracy: e.answered === 0 ? 0 : e.correct / e.answered,
          distinctQuestions: e.questions.size,
          lastAnsweredAt: e.last === '' ? null : e.last,
        }));
    },
  };

  /* ---------------------------------------------------------------- reviews */

  const sortReviews = (a: ReviewState, b: ReviewState) =>
    a.due < b.due
      ? -1
      : a.due > b.due
        ? 1
        : a.questionId < b.questionId
          ? -1
          : a.questionId > b.questionId
            ? 1
            : 0;

  const reviews: ReviewsRepository = {
    async getDue(now, options) {
      const cutoff = now.toISOString();
      const modules = options?.moduleIds ?? [];
      const rows = [...reviewRows.values()]
        .filter((r) => r.due <= cutoff && (modules.length === 0 || modules.includes(r.moduleId)))
        .sort(sortReviews);
      return cloneJson(take(rows, assertLimit(options?.limit)));
    },

    async getReviewState(questionId) {
      const row = reviewRows.get(questionId);
      return row ? cloneJson(row) : null;
    },

    async listReviewStates(options) {
      const modules = options?.moduleIds ?? [];
      const rows = [...reviewRows.values()]
        .filter((r) => modules.length === 0 || modules.includes(r.moduleId))
        .sort((a, b) => (a.questionId < b.questionId ? -1 : a.questionId > b.questionId ? 1 : 0));
      return cloneJson(rows);
    },

    async upsertReviewState(state) {
      reviewRows.set(state.questionId, {
        ...cloneJson(state),
        due: toIso(state.due),
        lastReview: optionalIso(state.lastReview),
      });
    },
  };

  /* --------------------------------------------------------------- sessions */

  const sessions: SessionsRepository = {
    async startSession(input) {
      const row: Session = {
        id: ++ids.session,
        startedAt: input.startedAt === undefined ? nowIso() : toIso(input.startedAt),
        finishedAt: null,
        mode: input.mode,
        moduleIds: [...input.moduleIds],
        result: null,
      };
      sessionRows.set(row.id, row);
      return cloneJson(row);
    },

    async finishSession(id, result, finishedAt) {
      const row = sessionRows.get(id);
      if (!row) throw new NotFoundError(`Pass ${id}`);
      row.finishedAt = finishedAt === undefined ? nowIso() : toIso(finishedAt);
      row.result = roundTrip(result ?? null, 'result');
      return cloneJson(row);
    },

    async getSession(id) {
      const row = sessionRows.get(id);
      return row ? cloneJson(row) : null;
    },

    async listRecent(limit = DEFAULT_RECENT_SESSIONS) {
      const rows = [...sessionRows.values()]
        .sort(byKeyThenId<Session>((s) => s.startedAt))
        .reverse();
      return cloneJson(take(rows, assertLimit(limit)));
    },
  };

  /* --------------------------------------------------------------- settings */

  const settings: SettingsRepository = {
    async get(key) {
      const json = settingRows.get(key);
      return json === undefined ? undefined : fromJson(json);
    },
    async set(key, value) {
      settingRows.set(key, toJson(value, `setting "${key}"`));
    },
    async delete(key) {
      settingRows.delete(key);
    },
    async getAll() {
      const keys = [...settingRows.keys()].sort();
      return Object.fromEntries(keys.map((k) => [k, fromJson(settingRows.get(k) ?? 'null')]));
    },
  };

  /* ------------------------------------------------------------------ cases */

  function requireCase(caseId: string): CaseStatus {
    const row = caseRows.get(caseId);
    if (!row) throw new NotFoundError(`Ärendet ${caseId}`);
    return row;
  }

  function requireDecision(id: number): Decision {
    const row = decisionRows.get(id);
    if (!row) throw new NotFoundError(`Beslut ${id}`);
    return row;
  }

  const cases: CasesRepository = {
    async startCase(input) {
      if (caseRows.has(input.caseId))
        throw new ConflictError(`Ärendet ${input.caseId} är redan påbörjat.`);
      const row: CaseStatus = {
        caseId: input.caseId,
        status: 'in_progress',
        currentStepId: input.currentStepId,
        simDate: input.simDate,
        startedAt: input.startedAt === undefined ? nowIso() : toIso(input.startedAt),
        submittedAt: null,
        state: roundTrip(input.state ?? null, 'case state'),
        notes: input.notes ?? '',
        reflection: input.reflection ?? '',
      };
      caseRows.set(row.caseId, row);
      return cloneJson(row);
    },

    async getCaseStatus(caseId) {
      const row = caseRows.get(caseId);
      return row ? cloneJson(row) : null;
    },

    async listCaseStatuses() {
      const rows = [...caseRows.values()].sort((a, b) =>
        a.startedAt !== b.startedAt
          ? a.startedAt < b.startedAt
            ? -1
            : 1
          : a.caseId < b.caseId
            ? -1
            : 1,
      );
      return cloneJson(rows);
    },

    async updateCaseStatus(caseId, patch) {
      const next = applyPatch(requireCase(caseId), patch);
      next.submittedAt = optionalIso(next.submittedAt);
      next.state = roundTrip(next.state ?? null, 'case state');
      caseRows.set(caseId, next);
      return cloneJson(next);
    },

    async resetCase(caseId) {
      const decisionIds = new Set(
        [...decisionRows.values()].filter((d) => d.caseId === caseId).map((d) => d.id),
      );
      removeWhere(feedbackRows, (f) => decisionIds.has(f.decisionId));
      for (const id of decisionIds) decisionRows.delete(id);
      removeWhere(eventRows, (e) => e.caseId === caseId);
      removeWhere(stepRows, (s) => s.caseId === caseId);
      caseRows.delete(caseId);
    },

    async saveStep(input) {
      requireCase(input.caseId);
      const values = {
        answer: roundTrip(input.answer, 'step answer'),
        points: input.points ?? null,
        completedAt: optionalIso(input.completedAt),
      };
      const existing = stepRows.find((s) => s.caseId === input.caseId && s.stepId === input.stepId);
      if (existing) {
        Object.assign(existing, values);
        return cloneJson(existing);
      }
      const row: CaseStep = {
        id: ++ids.step,
        caseId: input.caseId,
        stepId: input.stepId,
        ...values,
      };
      stepRows.push(row);
      return cloneJson(row);
    },

    async listSteps(caseId) {
      return cloneJson(stepRows.filter((s) => s.caseId === caseId).sort((a, b) => a.id - b.id));
    },

    async recordEvent(input) {
      requireCase(input.caseId);
      const existing = eventRows.find(
        (e) => e.caseId === input.caseId && e.eventId === input.eventId,
      );
      if (existing) return cloneJson(existing);
      const row: CaseEvent = {
        id: ++ids.event,
        caseId: input.caseId,
        eventId: input.eventId,
        triggeredAt: input.triggeredAt === undefined ? nowIso() : toIso(input.triggeredAt),
        simDate: input.simDate,
      };
      eventRows.push(row);
      return cloneJson(row);
    },

    async listEvents(caseId) {
      return cloneJson(
        eventRows
          .filter((e) => e.caseId === caseId)
          .sort(byKeyThenId<CaseEvent>((e) => e.triggeredAt)),
      );
    },

    async submitDecision(input) {
      requireCase(input.caseId);
      const row: Decision = {
        id: ++ids.decision,
        caseId: input.caseId,
        decision: roundTrip(input.decision, 'decision'),
        submittedAt: input.submittedAt === undefined ? nowIso() : toIso(input.submittedAt),
        exportedAt: null,
      };
      decisionRows.set(row.id, row);
      return cloneJson(row);
    },

    async getDecision(id) {
      const row = decisionRows.get(id);
      return row ? cloneJson(row) : null;
    },

    async listDecisions(caseId) {
      const rows = [...decisionRows.values()]
        .filter((d) => d.caseId === caseId)
        .sort(byKeyThenId<Decision>((d) => d.submittedAt));
      return cloneJson(rows);
    },

    async markDecisionExported(id, exportedAt) {
      const row = requireDecision(id);
      row.exportedAt = exportedAt === undefined ? nowIso() : toIso(exportedAt);
      return cloneJson(row);
    },

    async addSupervisorFeedback(input) {
      requireDecision(input.decisionId);
      const row: SupervisorFeedback = {
        id: ++ids.feedback,
        decisionId: input.decisionId,
        text: input.text,
        grade: input.grade ?? null,
        createdAt: input.createdAt === undefined ? nowIso() : toIso(input.createdAt),
      };
      feedbackRows.push(row);
      return cloneJson(row);
    },

    async listSupervisorFeedback(decisionId) {
      return cloneJson(
        feedbackRows
          .filter((f) => f.decisionId === decisionId)
          .sort(byKeyThenId<SupervisorFeedback>((f) => f.createdAt)),
      );
    },
  };

  async function clearAll(): Promise<void> {
    answerRows.length = 0;
    reviewRows.clear();
    sessionRows.clear();
    settingRows.clear();
    caseRows.clear();
    stepRows.length = 0;
    eventRows.length = 0;
    decisionRows.clear();
    feedbackRows.length = 0;
  }

  return { kind: 'memory', answers, reviews, sessions, settings, cases, clearAll };
}

function removeWhere<T>(rows: T[], predicate: (row: T) => boolean): void {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row !== undefined && predicate(row)) rows.splice(i, 1);
  }
}
