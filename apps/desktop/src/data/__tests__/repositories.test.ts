// @vitest-environment node
/**
 * Contract tests: the same suite runs against the in-memory store and, when node:sqlite
 * is available (Node 22.5+), against the real SQL store on an in-memory SQLite database.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryDataStore } from '../memory-store';
import { runMigrations } from '../sql-driver';
import { createSqlDataStore } from '../sql-store';
import {
  createNodeSqliteDriver,
  isNodeSqliteAvailable,
  type NodeSqliteDriver,
} from '../testing/node-sqlite-driver';
import { ConflictError, NotFoundError, type DataStore, type ReviewState } from '../types';

const sqliteAvailable = await isNodeSqliteAvailable();

/** A clock that advances one second per call, so default timestamps are ordered. */
function steppingClock(start = '2026-03-01T08:00:00.000Z') {
  let t = new Date(start).getTime();
  return () => {
    const d = new Date(t);
    t += 1000;
    return d;
  };
}

interface Harness {
  store: DataStore;
  dispose: () => void;
}

const factories: [string, boolean, () => Promise<Harness>][] = [
  [
    'memory',
    true,
    async () => ({ store: createMemoryDataStore(steppingClock()), dispose: () => {} }),
  ],
  [
    'sqlite (node:sqlite)',
    sqliteAvailable,
    async () => {
      const driver = (await createNodeSqliteDriver()) as NodeSqliteDriver;
      await runMigrations(driver);
      return { store: createSqlDataStore(driver, steppingClock()), dispose: () => driver.close() };
    },
  ],
];

function review(overrides: Partial<ReviewState> & Pick<ReviewState, 'questionId'>): ReviewState {
  return {
    moduleId: '03-lovplikt',
    due: '2026-03-01T00:00:00.000Z',
    stability: 2.5,
    difficulty: 5,
    elapsedDays: 0,
    scheduledDays: 1,
    learningSteps: 0,
    reps: 1,
    lapses: 0,
    state: 1,
    lastReview: '2026-02-28T10:00:00.000Z',
    ...overrides,
  };
}

describe.each(factories)('DataStore contract: %s', (_name, available, factory) => {
  let h: Harness;
  let store: DataStore;

  beforeEach(async () => {
    if (!available) return;
    h = await factory();
    store = h.store;
  });
  afterEach(() => {
    if (available) h.dispose();
  });

  describe.skipIf(!available)('answers', () => {
    it('records an answer and returns it with defaults', async () => {
      const a = await store.answers.recordAnswer({
        questionId: 'lov-001',
        moduleId: '03-lovplikt',
        correct: true,
        answer: { choice: 2 },
        mode: 'quick-quiz',
      });
      expect(a).toEqual({
        id: expect.any(Number),
        questionId: 'lov-001',
        moduleId: '03-lovplikt',
        answeredAt: '2026-03-01T08:00:00.000Z',
        correct: true,
        score: null,
        answer: { choice: 2 },
        responseTimeMs: null,
        mode: 'quick-quiz',
        sessionId: null,
      });
    });

    it('lists answers for a question newest first, with limit', async () => {
      for (const [at, correct] of [
        ['2026-03-01T10:00:00Z', false],
        ['2026-03-03T10:00:00Z', true],
        ['2026-03-02T10:00:00Z', true],
      ] as const) {
        await store.answers.recordAnswer({
          questionId: 'lov-001',
          moduleId: '03-lovplikt',
          correct,
          answer: null,
          mode: 'review',
          answeredAt: at,
        });
      }
      await store.answers.recordAnswer({
        questionId: 'lov-002',
        moduleId: '03-lovplikt',
        correct: true,
        answer: [],
        mode: 'review',
      });

      const all = await store.answers.listAnswersForQuestion('lov-001');
      expect(all.map((a) => a.answeredAt)).toEqual([
        '2026-03-03T10:00:00.000Z',
        '2026-03-02T10:00:00.000Z',
        '2026-03-01T10:00:00.000Z',
      ]);
      expect(await store.answers.listAnswersForQuestion('lov-001', { limit: 1 })).toHaveLength(1);
      expect(await store.answers.listAnswersForQuestion('saknas')).toEqual([]);
    });

    it('computes stats per module', async () => {
      const add = (questionId: string, moduleId: string, correct: boolean, answeredAt: string) =>
        store.answers.recordAnswer({
          questionId,
          moduleId,
          correct,
          answer: null,
          mode: 'quick-quiz',
          answeredAt,
        });
      await add('fl-1', '01-forvaltningsratt', true, '2026-03-01T09:00:00Z');
      await add('lov-1', '03-lovplikt', true, '2026-03-01T09:00:00Z');
      await add('lov-1', '03-lovplikt', false, '2026-03-02T09:00:00Z');
      await add('lov-2', '03-lovplikt', true, '2026-03-01T12:00:00Z');
      await add('lov-3', '03-lovplikt', false, '2026-03-01T13:00:00Z');

      expect(await store.answers.statsPerModule()).toEqual([
        {
          moduleId: '01-forvaltningsratt',
          answered: 1,
          correct: 1,
          accuracy: 1,
          distinctQuestions: 1,
          lastAnsweredAt: '2026-03-01T09:00:00.000Z',
        },
        {
          moduleId: '03-lovplikt',
          answered: 4,
          correct: 2,
          accuracy: 0.5,
          distinctQuestions: 3,
          lastAnsweredAt: '2026-03-02T09:00:00.000Z',
        },
      ]);
    });

    it('returns empty stats without answers', async () => {
      expect(await store.answers.statsPerModule()).toEqual([]);
    });

    it('links answers to a session', async () => {
      const s = await store.sessions.startSession({ mode: 'exam', moduleIds: ['03-lovplikt'] });
      await store.answers.recordAnswer({
        questionId: 'q1',
        moduleId: 'm',
        correct: true,
        answer: 1,
        mode: 'exam',
        sessionId: s.id,
        score: 0.5,
        responseTimeMs: 4200,
      });
      await store.answers.recordAnswer({
        questionId: 'q2',
        moduleId: 'm',
        correct: false,
        answer: 2,
        mode: 'exam',
        sessionId: s.id,
      });
      await store.answers.recordAnswer({
        questionId: 'q3',
        moduleId: 'm',
        correct: false,
        answer: 3,
        mode: 'exam',
      });
      const list = await store.answers.listAnswersForSession(s.id);
      expect(list.map((a) => a.questionId)).toEqual(['q1', 'q2']);
      expect(list[0]).toMatchObject({ score: 0.5, responseTimeMs: 4200, sessionId: s.id });
    });

    it('does not let callers mutate stored answers', async () => {
      const payload = { choice: [1, 2] };
      const a = await store.answers.recordAnswer({
        questionId: 'q',
        moduleId: 'm',
        correct: true,
        answer: payload,
        mode: 'study',
      });
      payload.choice.push(3);
      (a.answer as { choice: number[] }).choice.push(4);
      const [stored] = await store.answers.listAnswersForQuestion('q');
      expect(stored?.answer).toEqual({ choice: [1, 2] });
    });

    it('rejects undefined payloads', async () => {
      await expect(
        store.answers.recordAnswer({
          questionId: 'q',
          moduleId: 'm',
          correct: true,
          answer: undefined,
          mode: 'study',
        }),
      ).rejects.toThrow(TypeError);
    });
  });

  describe.skipIf(!available)('reviews', () => {
    it('upserts and reads back a review state', async () => {
      await store.reviews.upsertReviewState(review({ questionId: 'lov-001' }));
      await store.reviews.upsertReviewState(
        review({ questionId: 'lov-001', reps: 2, stability: 7.25, state: 2 }),
      );
      expect(await store.reviews.getReviewState('lov-001')).toEqual(
        review({ questionId: 'lov-001', reps: 2, stability: 7.25, state: 2 }),
      );
      expect(await store.reviews.getReviewState('saknas')).toBeNull();
    });

    it('normalises timestamps to ISO UTC', async () => {
      await store.reviews.upsertReviewState(
        review({ questionId: 'q', due: '2026-03-05T10:00:00+01:00', lastReview: null }),
      );
      expect(await store.reviews.getReviewState('q')).toMatchObject({
        due: '2026-03-05T09:00:00.000Z',
        lastReview: null,
      });
    });

    it('returns due reviews ordered, filtered by module and limited', async () => {
      await store.reviews.upsertReviewState(
        review({ questionId: 'a', due: '2026-03-03T00:00:00Z' }),
      );
      await store.reviews.upsertReviewState(
        review({ questionId: 'b', due: '2026-03-01T00:00:00Z' }),
      );
      await store.reviews.upsertReviewState(
        review({ questionId: 'c', due: '2026-03-02T00:00:00Z', moduleId: '04-detaljplan' }),
      );
      await store.reviews.upsertReviewState(
        review({ questionId: 'future', due: '2026-04-01T00:00:00Z' }),
      );

      const now = new Date('2026-03-10T00:00:00Z');
      expect((await store.reviews.getDue(now)).map((r) => r.questionId)).toEqual(['b', 'c', 'a']);
      expect(
        (await store.reviews.getDue(now, { moduleIds: ['03-lovplikt'] })).map((r) => r.questionId),
      ).toEqual(['b', 'a']);
      expect((await store.reviews.getDue(now, { limit: 2 })).map((r) => r.questionId)).toEqual([
        'b',
        'c',
      ]);
      expect((await store.reviews.getDue(now, { moduleIds: [] })).length).toBe(3);
      expect(await store.reviews.getDue(new Date('2026-02-01T00:00:00Z'))).toEqual([]);
      // Due exactly now counts as due.
      expect(
        (await store.reviews.getDue(new Date('2026-03-01T00:00:00Z'))).map((r) => r.questionId),
      ).toEqual(['b']);
    });

    it('lists review states per module', async () => {
      await store.reviews.upsertReviewState(review({ questionId: 'b' }));
      await store.reviews.upsertReviewState(review({ questionId: 'a', moduleId: '04-detaljplan' }));
      expect((await store.reviews.listReviewStates()).map((r) => r.questionId)).toEqual(['a', 'b']);
      expect(
        (await store.reviews.listReviewStates({ moduleIds: ['04-detaljplan'] })).map(
          (r) => r.questionId,
        ),
      ).toEqual(['a']);
    });
  });

  describe.skipIf(!available)('sessions', () => {
    it('starts and finishes a session', async () => {
      const s = await store.sessions.startSession({
        mode: 'quick-quiz',
        moduleIds: ['01-forvaltningsratt', '03-lovplikt'],
      });
      expect(s).toEqual({
        id: expect.any(Number),
        startedAt: '2026-03-01T08:00:00.000Z',
        finishedAt: null,
        mode: 'quick-quiz',
        moduleIds: ['01-forvaltningsratt', '03-lovplikt'],
        result: null,
      });
      const done = await store.sessions.finishSession(s.id, { correct: 8, total: 10 });
      expect(done).toMatchObject({
        finishedAt: '2026-03-01T08:00:01.000Z',
        result: { correct: 8, total: 10 },
      });
      expect(await store.sessions.getSession(s.id)).toEqual(done);
    });

    it('throws when finishing an unknown session', async () => {
      await expect(store.sessions.finishSession(999, {})).rejects.toBeInstanceOf(NotFoundError);
      expect(await store.sessions.getSession(999)).toBeNull();
    });

    it('lists recent sessions newest first', async () => {
      await store.sessions.startSession({
        mode: 'review',
        moduleIds: [],
        startedAt: '2026-03-01T10:00:00Z',
      });
      await store.sessions.startSession({
        mode: 'exam',
        moduleIds: [],
        startedAt: '2026-03-03T10:00:00Z',
      });
      await store.sessions.startSession({
        mode: 'study',
        moduleIds: [],
        startedAt: '2026-03-02T10:00:00Z',
      });
      expect((await store.sessions.listRecent()).map((s) => s.mode)).toEqual([
        'exam',
        'study',
        'review',
      ]);
      expect((await store.sessions.listRecent(2)).map((s) => s.mode)).toEqual(['exam', 'study']);
    });
  });

  describe.skipIf(!available)('settings', () => {
    it('gets, sets, overwrites and deletes JSON values', async () => {
      expect(await store.settings.get('tema')).toBeUndefined();
      await store.settings.set('tema', 'dark');
      await store.settings.set('moduler', { valda: ['03-lovplikt'], antal: 10 });
      await store.settings.set('tema', 'light');
      await store.settings.set('av', false);
      await store.settings.set('ingenting', null);
      expect(await store.settings.get('tema')).toBe('light');
      expect(await store.settings.get('av')).toBe(false);
      expect(await store.settings.get('ingenting')).toBeNull();
      expect(await store.settings.getAll()).toEqual({
        av: false,
        ingenting: null,
        moduler: { valda: ['03-lovplikt'], antal: 10 },
        tema: 'light',
      });
      await store.settings.delete('tema');
      expect(await store.settings.get('tema')).toBeUndefined();
    });

    it('rejects undefined', async () => {
      await expect(store.settings.set('x', undefined)).rejects.toThrow(TypeError);
    });
  });

  describe.skipIf(!available)('cases', () => {
    const caseId = 'A002';

    it('starts a case, refuses to start it twice and updates status', async () => {
      const started = await store.cases.startCase({
        caseId,
        currentStepId: 'S1',
        simDate: '2026-03-02',
      });
      expect(started).toEqual({
        caseId,
        status: 'in_progress',
        currentStepId: 'S1',
        simDate: '2026-03-02',
        startedAt: '2026-03-01T08:00:00.000Z',
        submittedAt: null,
      });
      await expect(
        store.cases.startCase({ caseId, currentStepId: 'S1', simDate: '2026-03-02' }),
      ).rejects.toBeInstanceOf(ConflictError);

      const updated = await store.cases.updateCaseStatus(caseId, {
        currentStepId: 'S2',
        simDate: '2026-03-16',
        status: undefined,
      });
      expect(updated).toMatchObject({
        status: 'in_progress',
        currentStepId: 'S2',
        simDate: '2026-03-16',
      });

      const submitted = await store.cases.updateCaseStatus(caseId, {
        status: 'submitted',
        currentStepId: null,
        submittedAt: '2026-03-20T12:00:00Z',
      });
      expect(submitted).toMatchObject({
        status: 'submitted',
        currentStepId: null,
        submittedAt: '2026-03-20T12:00:00.000Z',
      });
      expect(await store.cases.listCaseStatuses()).toEqual([submitted]);
      await expect(
        store.cases.updateCaseStatus('saknas', { status: 'submitted' }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('saves steps as upserts in first-saved order', async () => {
      await store.cases.startCase({ caseId, currentStepId: 'S1', simDate: '2026-03-02' });
      const draft = await store.cases.saveStep({
        caseId,
        stepId: 'S1',
        answer: { bockat: ['H1'] },
      });
      expect(draft).toMatchObject({ stepId: 'S1', points: null, completedAt: null });
      await store.cases.saveStep({
        caseId,
        stepId: 'S2',
        answer: 'ja',
        points: 1,
        completedAt: '2026-03-01T09:00:00Z',
      });
      const final = await store.cases.saveStep({
        caseId,
        stepId: 'S1',
        answer: { bockat: ['H1', 'H2'] },
        points: 2,
        completedAt: '2026-03-01T10:00:00Z',
      });
      expect(final.id).toBe(draft.id);
      const steps = await store.cases.listSteps(caseId);
      expect(steps.map((s) => [s.stepId, s.points])).toEqual([
        ['S1', 2],
        ['S2', 1],
      ]);
      expect(steps[0]?.answer).toEqual({ bockat: ['H1', 'H2'] });
      await expect(
        store.cases.saveStep({ caseId: 'saknas', stepId: 'S1', answer: null }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('records each event once', async () => {
      await store.cases.startCase({ caseId, currentStepId: 'S1', simDate: '2026-03-02' });
      const e1 = await store.cases.recordEvent({ caseId, eventId: 'E1', simDate: '2026-03-09' });
      const again = await store.cases.recordEvent({ caseId, eventId: 'E1', simDate: '2026-03-30' });
      expect(again).toEqual(e1);
      await store.cases.recordEvent({ caseId, eventId: 'E2', simDate: '2026-03-16' });
      expect((await store.cases.listEvents(caseId)).map((e) => [e.eventId, e.simDate])).toEqual([
        ['E1', '2026-03-09'],
        ['E2', '2026-03-16'],
      ]);
    });

    it('handles decisions, export and supervisor feedback', async () => {
      await store.cases.startCase({ caseId, currentStepId: 'S6', simDate: '2026-04-01' });
      const d = await store.cases.submitDecision({
        caseId,
        decision: { utfall: 'bevilja', motivering: 'Planenlig.' },
      });
      expect(d).toMatchObject({ caseId, exportedAt: null, decision: { utfall: 'bevilja' } });
      expect(await store.cases.getDecision(d.id)).toEqual(d);

      const exported = await store.cases.markDecisionExported(d.id, '2026-04-02T08:00:00Z');
      expect(exported.exportedAt).toBe('2026-04-02T08:00:00.000Z');
      await expect(store.cases.markDecisionExported(9999)).rejects.toBeInstanceOf(NotFoundError);

      const f1 = await store.cases.addSupervisorFeedback({
        decisionId: d.id,
        text: 'Bra motivering.',
        grade: 'G',
      });
      const f2 = await store.cases.addSupervisorFeedback({
        decisionId: d.id,
        text: 'Nämn grannmedgivandet.',
      });
      expect(f2.grade).toBeNull();
      expect(await store.cases.listSupervisorFeedback(d.id)).toEqual([f1, f2]);
      await expect(
        store.cases.addSupervisorFeedback({ decisionId: 9999, text: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundError);

      const d2 = await store.cases.submitDecision({ caseId, decision: { utfall: 'avsla' } });
      expect((await store.cases.listDecisions(caseId)).map((x) => x.id)).toEqual([d.id, d2.id]);
    });

    it('resets a case and everything recorded for it, leaving other cases alone', async () => {
      await store.cases.startCase({ caseId, currentStepId: 'S1', simDate: '2026-03-02' });
      await store.cases.startCase({ caseId: 'A001', currentStepId: 'S1', simDate: '2026-03-02' });
      await store.cases.saveStep({ caseId, stepId: 'S1', answer: 1 });
      await store.cases.recordEvent({ caseId, eventId: 'E1', simDate: '2026-03-03' });
      const d = await store.cases.submitDecision({ caseId, decision: {} });
      await store.cases.addSupervisorFeedback({ decisionId: d.id, text: 'ok' });
      await store.cases.saveStep({ caseId: 'A001', stepId: 'S1', answer: 2 });

      await store.cases.resetCase(caseId);

      expect(await store.cases.getCaseStatus(caseId)).toBeNull();
      expect(await store.cases.listSteps(caseId)).toEqual([]);
      expect(await store.cases.listEvents(caseId)).toEqual([]);
      expect(await store.cases.listDecisions(caseId)).toEqual([]);
      expect(await store.cases.listSupervisorFeedback(d.id)).toEqual([]);
      expect(await store.cases.listSteps('A001')).toHaveLength(1);

      // The case can be started again from scratch.
      await expect(
        store.cases.startCase({ caseId, currentStepId: 'S1', simDate: '2026-05-01' }),
      ).resolves.toMatchObject({
        simDate: '2026-05-01',
      });
    });
  });

  describe.skipIf(!available)('whole store', () => {
    it('lists every answer oldest first', async () => {
      for (const [questionId, at] of [
        ['lov-002', '2026-03-02T10:00:00Z'],
        ['lov-001', '2026-03-01T10:00:00Z'],
        ['hand-001', '2026-03-03T10:00:00Z'],
      ] as const) {
        await store.answers.recordAnswer({
          questionId,
          moduleId: questionId.startsWith('lov') ? '03-lovplikt' : '06-handlaggning',
          correct: true,
          answer: null,
          mode: 'quick-quiz',
          answeredAt: at,
        });
      }
      expect((await store.answers.listAnswers()).map((a) => a.questionId)).toEqual([
        'lov-001',
        'lov-002',
        'hand-001',
      ]);
    });

    it('clears all study data and keeps working afterwards', async () => {
      const session = await store.sessions.startSession({ mode: 'quick-quiz', moduleIds: [] });
      await store.answers.recordAnswer({
        questionId: 'lov-001',
        moduleId: '03-lovplikt',
        correct: true,
        answer: null,
        mode: 'quick-quiz',
        sessionId: session.id,
      });
      await store.reviews.upsertReviewState(review({ questionId: 'lov-001' }));
      await store.settings.set('tema', 'mörkt');
      await store.cases.startCase({ caseId: 'A002', currentStepId: 'S1', simDate: '2026-03-02' });
      const d = await store.cases.submitDecision({ caseId: 'A002', decision: {} });
      await store.cases.addSupervisorFeedback({ decisionId: d.id, text: 'ok' });

      await store.clearAll();

      expect(await store.answers.listAnswers()).toEqual([]);
      expect(await store.reviews.listReviewStates()).toEqual([]);
      expect(await store.sessions.listRecent()).toEqual([]);
      expect(await store.settings.getAll()).toEqual({});
      expect(await store.cases.listCaseStatuses()).toEqual([]);
      expect(await store.cases.listDecisions('A002')).toEqual([]);

      await store.sessions.startSession({ mode: 'review', moduleIds: [] });
      expect(await store.sessions.listRecent()).toHaveLength(1);
    });
  });
});
