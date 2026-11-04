import { describe, expect, it } from 'vitest';
import { cloze, open, ordering, pool, q } from '../fixtures';
import {
  answer,
  createSession,
  currentItem,
  EmptySessionError,
  finish,
  isExpired,
  next,
  remainingMs,
  selfAssess,
  summary,
  type QuizSession,
} from './session';
import { createRandom, shuffle } from './random';

const T0 = new Date('2026-11-04T10:00:00Z');
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

function ids(session: QuizSession): string[] {
  return session.items.map((item) => item.question.id);
}

function must<T extends { ok: boolean }>(outcome: T): Extract<T, { ok: true }> {
  if (!outcome.ok) throw new Error(`expected ok, got ${JSON.stringify(outcome)}`);
  return outcome as Extract<T, { ok: true }>;
}

describe('random', () => {
  it('is deterministic per seed', () => {
    const a = shuffle([1, 2, 3, 4, 5, 6, 7, 8], createRandom(42));
    const b = shuffle([1, 2, 3, 4, 5, 6, 7, 8], createRandom(42));
    const c = shuffle([1, 2, 3, 4, 5, 6, 7, 8], createRandom('annan'));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('createSession', () => {
  it('quick-quiz picks N distinct questions from the chosen modules, reproducibly', () => {
    const config = { mode: 'quick-quiz', moduleIds: ['03-lovplikt'], count: 5, seed: 7 } as const;
    const a = createSession(config, pool, T0);
    const b = createSession(config, pool, T0);
    expect(ids(a)).toEqual(ids(b));
    expect(ids(a)).toHaveLength(5);
    expect(new Set(ids(a)).size).toBe(5);
    expect(a.items.every((item) => item.moduleId === '03-lovplikt')).toBe(true);
    // Open questions are left out of quick quizzes by default.
    expect(ids(a)).not.toContain('op');
    expect(ids(createSession({ ...config, seed: 8 }, pool, T0))).not.toEqual(ids(a));
  });

  it('quick-quiz defaults to 10 questions from all modules and caps at the pool size', () => {
    const all = createSession({ mode: 'quick-quiz', moduleIds: [], seed: 1 }, pool, T0);
    expect(all.items).toHaveLength(10);
    const small = createSession(
      { mode: 'quick-quiz', moduleIds: ['01-forvaltning'], count: 50, seed: 1 },
      pool,
      T0,
    );
    expect(small.items).toHaveLength(3);
  });

  it('module-review keeps file order and includes open questions', () => {
    const s = createSession({ mode: 'module-review', moduleId: '06-handlaggning' }, pool, T0);
    expect(ids(s)).toEqual([...Array.from({ length: 8 }, (_, i) => `han-${i + 1}`), 'cl']);
    expect(s.feedback).toBe('immediate');
    const lov = createSession({ mode: 'module-review', moduleId: '03-lovplikt' }, pool, T0);
    expect(ids(lov)).toContain('op');
  });

  it('review takes the given ids in order, de-duplicated, and reports unknown ids', () => {
    const s = createSession(
      { mode: 'review', questionIds: ['cl', 'lov-3', 'okand', 'cl', 'fl-1'], limit: 10 },
      pool,
      T0,
    );
    expect(ids(s)).toEqual(['cl', 'lov-3', 'fl-1']);
    expect(s.missingIds).toEqual(['okand']);
    expect(s.mode).toBe('review');
  });

  it('exam mixes modules, has a time limit and hides feedback', () => {
    const s = createSession(
      { mode: 'exam', count: 9, timeLimitMinutes: 30, seed: 'tenta-1' },
      pool,
      T0,
    );
    expect(s.items).toHaveLength(9);
    const perModule = new Set(s.items.map((i) => i.moduleId));
    expect(perModule.size).toBe(3);
    expect(s.timeLimitMs).toBe(30 * 60_000);
    expect(s.endsAt).toBe('2026-11-04T10:30:00.000Z');
    expect(s.feedback).toBe('end');
  });

  it('throws EmptySessionError when nothing matches', () => {
    expect(() => createSession({ mode: 'review', questionIds: [] }, pool, T0)).toThrow(
      EmptySessionError,
    );
    expect(() =>
      createSession({ mode: 'quick-quiz', moduleIds: ['99-finns-inte'], seed: 1 }, pool, T0),
    ).toThrow(EmptySessionError);
  });

  it('shuffles ordering items for display but never shows them solved', () => {
    const orderingPool = [{ modul: '06-handlaggning', fragor: [ordering] }];
    for (let seed = 0; seed < 30; seed += 1) {
      const s = createSession(
        { mode: 'module-review', moduleId: '06-handlaggning', seed },
        orderingPool,
        T0,
      );
      const order = s.items[0]?.presentation.initialOrder ?? [];
      expect([...order].sort()).toEqual([0, 1, 2, 3, 4]);
      expect(order).not.toEqual([0, 1, 2, 3, 4]);
    }
  });
});

describe('session state machine', () => {
  const smallPool = [
    {
      modul: '06-handlaggning',
      fragor: [
        q({ id: 's1', typ: 'sant_falskt', fraga: 'S1', svar: true }),
        cloze,
        q({ id: 's3', typ: 'sant_falskt', fraga: 'S3', svar: false }),
        open,
      ],
    },
  ];
  const start = () =>
    createSession({ mode: 'module-review', moduleId: '06-handlaggning' }, smallPool, T0);

  it('answers, advances and summarises with a practice list', () => {
    let s = start();
    expect(currentItem(s)?.question.id).toBe('s1');

    const first = must(
      answer(s, { type: 'sant_falskt', value: true }, { responseMs: 3000, now: at(3) }),
    );
    expect(first.record).toMatchObject({
      questionId: 's1',
      moduleId: '06-handlaggning',
      correct: true,
      score: 1,
      responseTimeMs: 3000,
      mode: 'module-review',
      answeredAt: at(3).toISOString(),
    });
    s = next(first.session, at(4));

    const second = must(
      answer(s, { type: 'lucktext', gaps: ['10 veckor', '10', '2'] }, { now: at(20) }),
    );
    expect(second.result.kind === 'graded' && second.result.outcome).toBe('partial');
    expect(second.record?.correct).toBe(false);
    s = next(second.session, at(21));

    // Skip s3.
    s = next(s, at(22));
    expect(currentItem(s)?.question.id).toBe('op');

    const pending = must(answer(s, { type: 'oppen', text: 'Mitt svar' }, { now: at(60) }));
    expect(pending.result.kind).toBe('self_graded');
    expect(pending.record).toBeNull();
    expect(summary(pending.session).pendingSelfGrade).toBe(1);

    const assessed = must(selfAssess(pending.session, [0, 1, 2, 3]));
    expect(assessed.record?.correct).toBe(true);
    s = next(assessed.session, at(70));

    expect(s.status).toBe('finished');
    expect(currentItem(s)).toBeNull();
    const sum = summary(s);
    expect(sum).toMatchObject({
      total: 4,
      answered: 3,
      correct: 2,
      partial: 1,
      incorrect: 0,
      skipped: 1,
      pendingSelfGrade: 0,
      durationMs: 70_000,
      timeExpired: false,
    });
    expect(sum.score).toBeCloseTo(2 + 2 / 3);
    expect(sum.percent).toBe(67);
    expect(sum.practiceIds).toEqual(['cl', 's3']);
    expect(sum.perQuestion.map((p) => p.outcome)).toEqual([
      'correct',
      'partial',
      'skipped',
      'correct',
    ]);
    expect(sum.perModule).toEqual([
      { moduleId: '06-handlaggning', total: 4, correct: 2, score: sum.score },
    ]);

    // "Öva på felen" builds a review session from the practice list.
    const retry = createSession(
      { mode: 'review', questionIds: sum.practiceIds },
      smallPool,
      at(80),
    );
    expect(ids(retry)).toEqual(['cl', 's3']);
  });

  it('rejects double answers, wrong types and answers after the end without mutating', () => {
    const s = start();
    const answered = must(answer(s, { type: 'sant_falskt', value: false }, { now: at(1) }));
    expect(answered.result.kind === 'graded' && answered.result.score).toBe(0);
    expect(s.items[0]?.response).toBeNull();

    const again = answer(answered.session, { type: 'sant_falskt', value: true }, { now: at(2) });
    expect(again).toMatchObject({ ok: false, reason: 'already_answered' });

    const wrongType = answer(next(answered.session, at(3)), { type: 'sant_falskt', value: true });
    expect(wrongType).toMatchObject({ ok: false, reason: 'type_mismatch' });

    const finished = finish(s, at(5));
    expect(answer(finished, { type: 'sant_falskt', value: true })).toMatchObject({
      ok: false,
      reason: 'finished',
    });
    expect(summary(finished).skipped).toBe(4);
    expect(summary(finished).practiceIds).toHaveLength(4);
    expect(selfAssess(s, [0])).toMatchObject({ ok: false, reason: 'not_pending_self_grade' });
  });

  it('ignores invalid response times', () => {
    const outcome = must(answer(start(), { type: 'sant_falskt', value: true }, { responseMs: -5 }));
    expect(outcome.record?.responseTimeMs).toBeNull();
  });
});

describe('exam time limit', () => {
  it('stops accepting answers when the time is out and marks the summary', () => {
    const s = createSession(
      { mode: 'exam', moduleIds: ['01-forvaltning'], count: 3, timeLimitMinutes: 1, seed: 3 },
      pool,
      T0,
    );
    expect(remainingMs(s, at(20))).toBe(40_000);
    expect(isExpired(s, at(59))).toBe(false);

    const first = must(answer(s, { type: 'sant_falskt', value: true }, { now: at(10) }));
    const late = answer(
      next(first.session, at(11)),
      { type: 'sant_falskt', value: true },
      { now: at(61) },
    );
    expect(late).toMatchObject({ ok: false, reason: 'expired' });
    expect(late.session.status).toBe('finished');
    expect(remainingMs(late.session, at(61))).toBe(0);

    const sum = summary(late.session);
    expect(sum).toMatchObject({ timeExpired: true, correct: 1, skipped: 2, mode: 'exam' });
    expect(answer(late.session, { type: 'sant_falskt', value: true })).toMatchObject({
      reason: 'expired',
    });
  });

  it('next() after the deadline finishes the exam', () => {
    const s = createSession(
      { mode: 'exam', moduleIds: ['01-forvaltning'], count: 3, timeLimitMinutes: 1, seed: 3 },
      pool,
      T0,
    );
    const after = next(s, at(120));
    expect(after.status).toBe('finished');
    expect(after.timeExpired).toBe(true);
    expect(
      remainingMs(createSession({ mode: 'review', questionIds: ['cl'] }, pool, T0)),
    ).toBeNull();
  });

  it('allows self-assessment from the summary after the session has finished', () => {
    const examPool = [{ modul: '03-lovplikt', fragor: [open] }];
    const s = createSession(
      { mode: 'exam', count: 1, timeLimitMinutes: 5, seed: 1, includeSelfGraded: true },
      examPool,
      T0,
    );
    const pending = must(answer(s, { type: 'oppen', text: 'svar' }, { now: at(30) }));
    const done = next(pending.session, at(31));
    expect(done.status).toBe('finished');
    const assessed = must(selfAssess(done, [0, 1], 0));
    expect(summary(assessed.session).perQuestion[0]).toMatchObject({
      outcome: 'partial',
      score: 0.5,
    });
  });
});
