import { describe, expect, it } from 'vitest';
import { assembleContent } from '@/content';
import type { Answer, ReviewState, Session } from '@/data';
import { formatClock, formatDuration, pluralQuestions } from '@/lib/format';
import {
  computeStreak,
  dueCount,
  moduleProgress,
  nextReviewDate,
  overallMastery,
  questionIndex,
  tagLabel,
  weakTags,
} from './progress';

function session(id: number, finishedAt: string | null): Session {
  return {
    id,
    startedAt: finishedAt ?? '2026-03-01T08:00:00',
    finishedAt,
    mode: 'quick-quiz',
    moduleIds: [],
    result: null,
  };
}

describe('computeStreak', () => {
  const now = new Date('2026-03-10T12:00:00');

  it('counts consecutive days ending today', () => {
    const sessions = [
      session(1, '2026-03-10T09:00:00'),
      session(2, '2026-03-09T20:00:00'),
      session(3, '2026-03-09T21:00:00'),
      session(4, '2026-03-08T07:00:00'),
      session(5, '2026-03-06T07:00:00'),
    ];
    expect(computeStreak(sessions, now)).toEqual({ days: 3, studiedToday: true });
  });

  it('keeps yesterday’s streak alive until today is over', () => {
    const sessions = [session(1, '2026-03-09T09:00:00'), session(2, '2026-03-08T09:00:00')];
    expect(computeStreak(sessions, now)).toEqual({ days: 2, studiedToday: false });
  });

  it('ignores unfinished passes and is zero after a missed day', () => {
    expect(computeStreak([session(1, null)], now).days).toBe(0);
    expect(computeStreak([session(1, '2026-03-07T09:00:00')], now).days).toBe(0);
  });
});

const content = assembleContent({
  'moduler.json': {
    moduler: [
      {
        id: '03-lovplikt',
        ordning: 3,
        titel: 'Lovplikt',
        beskrivning: 'Om lov.',
        lagrum_sammanfattning: 'PBL 9 kap.',
      },
      {
        id: '06-handlaggning',
        ordning: 6,
        titel: 'Handläggning',
        beskrivning: 'Om handläggning.',
        lagrum_sammanfattning: 'PBL 9 kap.',
      },
    ],
  },
  'fragor/03-lovplikt.json': {
    modul: '03-lovplikt',
    fragor: [
      {
        id: 'a',
        typ: 'sant_falskt',
        svarighet: 1,
        fraga: 'A?',
        svar: true,
        forklaring: 'A.',
        taggar: ['plank', 'mur'],
      },
      {
        id: 'b',
        typ: 'sant_falskt',
        svarighet: 1,
        fraga: 'B?',
        svar: true,
        forklaring: 'B.',
        taggar: ['plank'],
      },
      {
        id: 'c',
        typ: 'oppen',
        svarighet: 2,
        fraga: 'C?',
        bedomningspunkter: ['x'],
        taggar: ['mur'],
      },
    ],
  },
});

function state(questionId: string, overrides: Partial<ReviewState> = {}): ReviewState {
  return {
    questionId,
    moduleId: '03-lovplikt',
    due: '2026-03-05T00:00:00.000Z',
    stability: 21,
    difficulty: 5,
    elapsedDays: 0,
    scheduledDays: 1,
    learningSteps: 0,
    reps: 1,
    lapses: 0,
    state: 2,
    lastReview: '2026-03-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('moduleProgress', () => {
  it('computes mastery, due and counts per module and ignores unknown questions', () => {
    const states = [
      state('a'),
      state('b', { due: '2026-04-01T00:00:00.000Z', stability: 10.5 }),
      state('borttagen'),
    ];
    const progress = moduleProgress(content, states, new Date('2026-03-10T00:00:00Z'));
    expect(progress.map((p) => [p.moduleId, p.questionCount, p.openCount, p.due, p.seen])).toEqual([
      ['03-lovplikt', 3, 1, 1, 2],
      ['06-handlaggning', 0, 0, 0, 0],
    ]);
    // (1 + 0.5) / 3 questions = 50 %
    expect(progress[0]?.mastery).toBe(50);
    expect(overallMastery(progress)).toBe(50);
    expect(dueCount(content, states)).toBe(2);
    expect(dueCount(content, states, ['06-handlaggning'])).toBe(0);
    expect(nextReviewDate(states)?.toISOString()).toBe('2026-03-05T00:00:00.000Z');
    expect(nextReviewDate([])).toBeNull();
  });
});

function answer(questionId: string, correct: boolean, answeredAt: string): Answer {
  return {
    id: 0,
    questionId,
    moduleId: '03-lovplikt',
    answeredAt,
    correct,
    score: correct ? 1 : 0,
    answer: null,
    responseTimeMs: null,
    mode: 'quick-quiz',
    sessionId: null,
  };
}

describe('weakTags', () => {
  it('ranks tags by accuracy of the latest answer per question', () => {
    const answers = [
      answer('a', false, '2026-03-01T10:00:00Z'),
      answer('b', false, '2026-03-01T10:01:00Z'),
      answer('c', true, '2026-03-01T10:02:00Z'),
    ];
    expect(weakTags(answers, questionIndex(content))).toEqual([
      { tag: 'plank', answered: 2, correct: 0, accuracy: 0 },
      { tag: 'mur', answered: 2, correct: 1, accuracy: 0.5 },
    ]);
    // Practising b until it is right lifts "plank".
    const later = [...answers, answer('b', true, '2026-03-02T10:00:00Z')];
    expect(weakTags(later, questionIndex(content)).map((t) => [t.tag, t.accuracy])).toEqual([
      ['mur', 0.5],
      ['plank', 0.5],
    ]);
  });
});

describe('format helpers', () => {
  it('formats durations, clocks and counts in Swedish', () => {
    expect(formatDuration(35_000)).toBe('35 s');
    expect(formatDuration(80_000)).toBe('1 min 20 s');
    expect(formatDuration(12 * 60_000)).toBe('12 min');
    expect(formatClock(65_000)).toBe('1:05');
    expect(pluralQuestions(1)).toBe('1 fråga');
    expect(pluralQuestions(3)).toBe('3 frågor');
    expect(tagLabel('liten_avvikelse')).toBe('liten avvikelse');
  });
});
