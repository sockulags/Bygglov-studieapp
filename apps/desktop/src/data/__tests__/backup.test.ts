// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  BackupFormatError,
  exportStudyData,
  importStudyData,
  parseStudyDataBackup,
} from '../backup';
import { createMemoryDataStore } from '../memory-store';
import type { DataStore } from '../types';

async function seed(store: DataStore) {
  const s1 = await store.sessions.startSession({
    mode: 'quick-quiz',
    moduleIds: ['03-lovplikt'],
    startedAt: '2026-03-01T08:00:00Z',
  });
  await store.sessions.finishSession(s1.id, { percent: 50 }, '2026-03-01T08:10:00Z');
  await store.sessions.startSession({
    mode: 'review',
    moduleIds: [],
    startedAt: '2026-03-02T08:00:00Z',
  });
  await store.answers.recordAnswer({
    questionId: 'lov-001',
    moduleId: '03-lovplikt',
    correct: true,
    score: 1,
    answer: { type: 'flerval', selected: 2 },
    responseTimeMs: 4000,
    mode: 'quick-quiz',
    sessionId: s1.id,
    answeredAt: '2026-03-01T08:01:00Z',
  });
  await store.reviews.upsertReviewState({
    questionId: 'lov-001',
    moduleId: '03-lovplikt',
    due: '2026-03-05T08:01:00.000Z',
    stability: 3.2,
    difficulty: 4.1,
    elapsedDays: 0,
    scheduledDays: 4,
    learningSteps: 0,
    reps: 1,
    lapses: 0,
    state: 2,
    lastReview: '2026-03-01T08:01:00.000Z',
  });
  await store.settings.set('exempel', { a: 1 });
  await store.cases.startCase({
    caseId: 'A002',
    currentStepId: 'S2',
    simDate: '2026-03-04',
    startedAt: '2026-03-01T09:00:00Z',
    state: { caseId: 'A002', simDate: '2026-03-04' },
    notes: 'Kolla prickmarken.',
  });
  await store.cases.updateCaseStatus('A002', { reflection: 'Glömde 110 §.' });
  await store.cases.saveStep({ caseId: 'A002', stepId: 'S1', answer: [1, 2], points: 2 });
  await store.cases.recordEvent({ caseId: 'A002', eventId: 'E1', simDate: '2026-03-03' });
  const decision = await store.cases.submitDecision({ caseId: 'A002', decision: { b: 1 } });
  await store.cases.addSupervisorFeedback({ decisionId: decision.id, text: 'Bra', grade: 'G' });
}

describe('study data backup', () => {
  it('round-trips everything through export, JSON and import', async () => {
    const source = createMemoryDataStore();
    await seed(source);
    const backup = await exportStudyData(source, {
      appVersion: '0.1.0',
      now: new Date('2026-03-10T00:00:00Z'),
    });
    expect(backup.data.sessions.map((s) => s.mode)).toEqual(['quick-quiz', 'review']);

    const target = createMemoryDataStore();
    await target.answers.recordAnswer({
      questionId: 'gammal',
      moduleId: '01-forvaltningsratt',
      correct: false,
      answer: null,
      mode: 'review',
    });
    const parsed = parseStudyDataBackup(JSON.stringify(backup));
    const result = await importStudyData(target, parsed);
    expect(result).toEqual({ answers: 1, reviews: 1, sessions: 2, cases: 1 });

    const again = await exportStudyData(target, {
      appVersion: '0.1.0',
      now: new Date('2026-03-10T00:00:00Z'),
    });
    expect(again.data.answers.map((a) => a.questionId)).toEqual(['lov-001']);
    const [answer] = again.data.answers;
    const [first] = again.data.sessions;
    expect(answer?.sessionId).toBe(first?.id);
    expect(first?.result).toEqual({ percent: 50 });
    expect(again.data.reviews).toEqual(backup.data.reviews);
    expect(again.data.settings).toEqual({ exempel: { a: 1 } });
    expect(again.data.cases.statuses).toEqual(backup.data.cases.statuses);
    expect(again.data.cases.statuses[0]).toMatchObject({
      state: { caseId: 'A002', simDate: '2026-03-04' },
      notes: 'Kolla prickmarken.',
      reflection: 'Glömde 110 §.',
    });
    expect(again.data.cases.steps.map((s) => s.answer)).toEqual([[1, 2]]);
    expect(again.data.cases.feedback.map((f) => f.grade)).toEqual(['G']);
  });

  it('reads backups written before case_state existed', () => {
    const backup = {
      format: 'bygglov-studiedata',
      version: 1,
      exportedAt: '2026-03-10T00:00:00.000Z',
      appVersion: '0.1.0',
      data: {
        answers: [],
        reviews: [],
        sessions: [],
        settings: {},
        cases: {
          statuses: [
            {
              caseId: 'A002',
              status: 'in_progress',
              currentStepId: 'S2',
              simDate: '2026-03-04',
              startedAt: '2026-03-01T09:00:00.000Z',
              submittedAt: null,
            },
          ],
          steps: [],
          events: [],
          decisions: [],
          feedback: [],
        },
      },
    };
    const parsed = parseStudyDataBackup(JSON.stringify(backup));
    expect(parsed.data.cases.statuses[0]).toMatchObject({ state: null, notes: '', reflection: '' });
  });

  it('rejects files that are not a backup without touching the store', () => {
    expect(() => parseStudyDataBackup('inte json')).toThrow(BackupFormatError);
    expect(() => parseStudyDataBackup('{"format":"något annat"}')).toThrow(
      /ingen export av studiedata/,
    );
    expect(() => parseStudyDataBackup('{"format":"bygglov-studiedata","version":99}')).toThrow(
      /nyare version/,
    );
  });
});
