import { describe, expect, it } from 'vitest';
import { assembleContent, type StudyContent } from '@/content';
import { createMemoryDataStore, type Answer } from '@/data';
import type { DecisionAssessment } from '@/engine';
import { localDateKey, moduleProgress } from '@/features/progress/progress';
import {
  answersPerBucket,
  casesPerStatus,
  dayStart,
  decisionChecks,
  earliest,
  heroStats,
  inWindow,
  masteryTimeline,
  MAX_SERIES,
  resultsContent,
  studiedModules,
  weakTagsInWindow,
  windowDays,
} from './aggregate';
import { seedResultsDemo } from './seed';

/* -------------------------------------------------------------------------- fixtures */

function moduleFile(id: string, ordning: number, titel: string) {
  return { id, ordning, titel, beskrivning: `Om ${titel}.`, lagrum_sammanfattning: 'PBL.' };
}

function trueFalse(id: string, taggar: string[]) {
  return {
    id,
    typ: 'sant_falskt',
    svarighet: 1,
    fraga: `${id}?`,
    svar: true,
    forklaring: 'X.',
    taggar,
  };
}

/** Two modules with questions and one without. */
const content: StudyContent = assembleContent({
  'moduler.json': {
    moduler: [
      moduleFile('03-lovplikt', 3, 'Lovplikt'),
      moduleFile('06-handlaggning', 6, 'Handläggning'),
      moduleFile('09-tom', 9, 'Tom'),
    ],
  },
  'fragor/03-lovplikt.json': {
    modul: '03-lovplikt',
    fragor: [
      trueFalse('a', ['plank', 'mur']),
      trueFalse('b', ['plank']),
      trueFalse('c', ['mur']),
      trueFalse('d', ['attefall']),
    ],
  },
  'fragor/06-handlaggning.json': {
    modul: '06-handlaggning',
    fragor: [trueFalse('h1', ['tidsfrist']), trueFalse('h2', ['tidsfrist'])],
  },
});
const results = resultsContent(content);

/** Eight modules with one question each, for the colour-slot cap. */
const wide = resultsContent(
  assembleContent({
    'moduler.json': {
      moduler: Array.from({ length: 8 }, (_, i) =>
        moduleFile(`0${i + 1}-modul`, i + 1, `Modul ${i + 1}`),
      ),
    },
    ...Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [
        `fragor/0${i + 1}-modul.json`,
        { modul: `0${i + 1}-modul`, fragor: [trueFalse(`q${i + 1}`, ['x'])] },
      ]),
    ),
  }),
);

const NOW = new Date(2026, 10, 5, 15, 0, 0); // 5 nov 2026, local time

let nextId = 1;
function answer(
  questionId: string,
  moduleId: string,
  correct: boolean,
  when: Date,
  extra: Partial<Answer> = {},
): Answer {
  return {
    id: nextId++,
    questionId,
    moduleId,
    answeredAt: when.toISOString(),
    correct,
    score: correct ? 1 : 0,
    answer: null,
    responseTimeMs: 5_000,
    mode: 'quick-quiz',
    sessionId: null,
    ...extra,
  };
}

function daysAgo(n: number, hour = 10): Date {
  return new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - n, hour, 0, 0);
}

/* ---------------------------------------------------------------------------- window */

describe('windowDays', () => {
  it('covers 4 or 8 weeks ending today, oldest first', () => {
    const four = windowDays('4v', NOW, null);
    expect(four).toHaveLength(28);
    expect(four[27]).toBe('2026-11-05');
    expect(four[0]).toBe('2026-10-09');
    expect(windowDays('8v', NOW, null)).toHaveLength(56);
  });

  it('"allt" starts at the first activity but shows at least four weeks', () => {
    expect(windowDays('allt', NOW, null)).toHaveLength(28);
    expect(windowDays('allt', NOW, daysAgo(10).toISOString())).toHaveLength(28);
    const long = windowDays('allt', NOW, daysAgo(100).toISOString());
    expect(long).toHaveLength(101);
    expect(long[0]).toBe(localDateKey(daysAgo(100)));
  });

  it('crosses the change to winter time without skipping or repeating a day', () => {
    const days = windowDays('8v', NOW, null);
    expect(new Set(days).size).toBe(days.length);
    expect(days).toContain('2026-10-25');
    expect(days).toContain('2026-10-26');
  });

  it('tests membership by local day and finds the earliest timestamp', () => {
    const days = windowDays('4v', NOW, null);
    expect(inWindow(daysAgo(0, 23).toISOString(), days)).toBe(true);
    expect(inWindow(daysAgo(28).toISOString(), days)).toBe(false);
    expect(inWindow(daysAgo(1).toISOString(), [])).toBe(false);
    expect(earliest([])).toBeNull();
    expect(earliest(['2026-02-01T00:00:00Z', '2026-01-01T00:00:00Z'])).toBe('2026-01-01T00:00:00Z');
    expect(dayStart('2026-03-04').getDate()).toBe(4);
  });
});

/* --------------------------------------------------------------------------- modules */

describe('resultsContent and studiedModules', () => {
  it('keeps only modules with questions and indexes the questions', () => {
    expect(results.modules.map((m) => [m.id, m.questionCount])).toEqual([
      ['03-lovplikt', 4],
      ['06-handlaggning', 2],
    ]);
    expect(results.questions.get('h1')?.typ).toBe('sant_falskt');
  });

  it('lists studied modules in module order and ignores removed questions', () => {
    const answers = [
      answer('h1', '06-handlaggning', true, daysAgo(1)),
      answer('a', '03-lovplikt', true, daysAgo(1)),
      answer('borttagen', '09-tom', true, daysAgo(1)),
    ];
    expect(studiedModules(answers, results).map((m) => [m.moduleId, m.slot, m.answered])).toEqual([
      ['03-lovplikt', 0, 1],
      ['06-handlaggning', 1, 1],
    ]);
    expect(studiedModules([], results)).toEqual([]);
  });

  it('gives colour slots to the six most practised modules, in module order', () => {
    const answers: Answer[] = [];
    // Module 1 has one answer, 2..8 have two each: 1 and 8 (the tie broken by order) drop out.
    answers.push(answer('q1', '01-modul', true, daysAgo(1)));
    for (let i = 2; i <= 8; i += 1) {
      answers.push(answer(`q${i}`, `0${i}-modul`, true, daysAgo(1)));
      answers.push(answer(`q${i}`, `0${i}-modul`, true, daysAgo(2)));
    }
    const modules = studiedModules(answers, wide);
    expect(modules).toHaveLength(8);
    expect(modules.filter((m) => m.slot !== null)).toHaveLength(MAX_SERIES);
    expect(modules.map((m) => m.slot)).toEqual([null, 0, 1, 2, 3, 4, 5, null]);
  });
});

/* --------------------------------------------------------------------------- mastery */

describe('masteryTimeline', () => {
  const days = windowDays('4v', NOW, null);

  it('is zero everywhere without answers', () => {
    const modules = [{ moduleId: '03-lovplikt', title: 'Lovplikt', slot: 0 }];
    const timeline = masteryTimeline([], results, days, modules);
    expect(timeline.series[0]?.points).toHaveLength(28);
    expect(timeline.series[0]?.points.every((p) => p.mastery === 0)).toBe(true);
    expect(timeline.overall.every((p) => p.mastery === 0)).toBe(true);
    expect(masteryTimeline([], results, [], []).overall).toEqual([]);
  });

  it('rises on the days questions are answered and never before', () => {
    const answers = [
      answer('a', '03-lovplikt', true, daysAgo(20)),
      answer('a', '03-lovplikt', true, daysAgo(17)),
      answer('b', '03-lovplikt', true, daysAgo(10)),
      answer('h1', '06-handlaggning', true, daysAgo(3)),
    ];
    const modules = studiedModules(answers, results);
    const timeline = masteryTimeline(answers, results, days, modules);
    const lovplikt = timeline.series[0]?.points ?? [];
    const at = (n: number) => lovplikt[days.length - 1 - n]?.mastery ?? -1;
    expect(at(21)).toBe(0);
    expect(at(20)).toBeGreaterThan(0);
    expect(at(17)).toBeGreaterThan(at(18));
    expect(at(10)).toBeGreaterThan(at(11));
    expect(at(0)).toBe(at(10)); // stability only changes with answers
    const handlaggning = timeline.series[1]?.points ?? [];
    expect(handlaggning[days.length - 5]?.mastery).toBe(0);
    expect(handlaggning[days.length - 1]?.mastery).toBeGreaterThan(0);
  });

  it('counts answers given before the window as the starting point', () => {
    const answers = [answer('a', '03-lovplikt', true, daysAgo(60))];
    const timeline = masteryTimeline(answers, results, days, studiedModules(answers, results));
    expect(timeline.series[0]?.points[0]?.mastery).toBeGreaterThan(0);
  });

  it('ends at the mastery of the stored review states written by the study flow', async () => {
    const store = createMemoryDataStore();
    await seedResultsDemo(store, content, { now: NOW, days: 40, cases: false });
    const answers = await store.answers.listAnswers();
    const states = await store.reviews.listReviewStates();
    expect(answers.length).toBeGreaterThan(50);
    const window = windowDays('8v', NOW, earliest(answers.map((a) => a.answeredAt)));
    const modules = studiedModules(answers, results);
    const timeline = masteryTimeline(answers, results, window, modules);
    const expected = moduleProgress(content, states, NOW);
    for (const series of timeline.series) {
      const last = series.points[series.points.length - 1];
      expect(last?.mastery).toBe(expected.find((m) => m.moduleId === series.moduleId)?.mastery);
    }
  });
});

/* ------------------------------------------------------------------ answers per day */

describe('answersPerBucket', () => {
  it('counts right and wrong per day, partly right as wrong, by module', () => {
    const days = windowDays('4v', NOW, null);
    const answers = [
      answer('a', '03-lovplikt', true, daysAgo(0)),
      answer('b', '03-lovplikt', false, daysAgo(0), { score: 0.5 }),
      answer('h1', '06-handlaggning', true, daysAgo(0)),
      answer('a', '03-lovplikt', false, daysAgo(2)),
      answer('a', '03-lovplikt', true, daysAgo(40)), // outside the window
    ];
    const all = answersPerBucket(answers, days);
    expect(all.unit).toBe('day');
    expect(all.buckets).toHaveLength(28);
    expect(all.buckets[27]).toMatchObject({ start: '2026-11-05', correct: 2, wrong: 1 });
    expect(all.buckets[25]).toMatchObject({ correct: 0, wrong: 1 });
    const total = all.buckets.reduce((s, b) => s + b.correct + b.wrong, 0);
    expect(total).toBe(4);
    const lovplikt = answersPerBucket(answers, days, '03-lovplikt');
    expect(lovplikt.buckets[27]).toMatchObject({ correct: 1, wrong: 1 });
  });

  it('groups per week, counted back from today, when the window is longer than 8 weeks', () => {
    const days = windowDays('allt', NOW, daysAgo(69).toISOString()); // 70 days
    const answers = [
      answer('a', '03-lovplikt', true, daysAgo(6)),
      answer('a', '03-lovplikt', false, daysAgo(7)),
    ];
    const { unit, buckets } = answersPerBucket(answers, days);
    expect(unit).toBe('week');
    expect(buckets).toHaveLength(10);
    expect(buckets[9]).toMatchObject({
      end: '2026-11-05',
      start: localDateKey(daysAgo(6)),
      correct: 1,
      wrong: 0,
    });
    expect(buckets[8]).toMatchObject({ end: localDateKey(daysAgo(7)), correct: 0, wrong: 1 });
  });

  it('gives empty buckets without answers and nothing without days', () => {
    const { buckets } = answersPerBucket([], windowDays('4v', NOW, null));
    expect(buckets.every((b) => b.correct === 0 && b.wrong === 0)).toBe(true);
    expect(answersPerBucket([], []).buckets).toEqual([]);
  });
});

/* ------------------------------------------------------------------------- weak tags */

describe('weakTagsInWindow', () => {
  it('only uses answers in the window and the chosen module', () => {
    const days = windowDays('4v', NOW, null);
    const answers = [
      answer('a', '03-lovplikt', false, daysAgo(1)),
      answer('b', '03-lovplikt', false, daysAgo(1)),
      answer('c', '03-lovplikt', true, daysAgo(40)), // outside: "mur" has only one answer
      answer('h1', '06-handlaggning', false, daysAgo(1)),
      answer('h2', '06-handlaggning', true, daysAgo(1)),
    ];
    expect(weakTagsInWindow(answers, results, days).map((t) => [t.tag, t.answered])).toEqual([
      ['plank', 2],
      ['tidsfrist', 2],
    ]);
    expect(weakTagsInWindow(answers, results, days, '06-handlaggning').map((t) => t.tag)).toEqual([
      'tidsfrist',
    ]);
    expect(weakTagsInWindow([], results, days)).toEqual([]);
  });
});

/* ------------------------------------------------------------------------------ hero */

describe('heroStats', () => {
  it('counts today and total and compares mastery with four weeks ago', () => {
    const answers = [
      answer('a', '03-lovplikt', true, daysAgo(0, 8)),
      answer('b', '03-lovplikt', true, daysAgo(0, 9)),
      answer('c', '03-lovplikt', true, daysAgo(3)),
    ];
    const overall = Array.from({ length: 40 }, (_, i) => ({ day: `d${i}`, mastery: i }));
    expect(heroStats(answers, overall, NOW)).toEqual({
      answeredToday: 2,
      answeredTotal: 3,
      masteryDelta: 28,
    });
  });

  it('has no delta without answers', () => {
    expect(heroStats([], [{ day: 'x', mastery: 0 }], NOW)).toEqual({
      answeredToday: 0,
      answeredTotal: 0,
      masteryDelta: null,
    });
  });
});

/* ----------------------------------------------------------------------------- cases */

function assessment(
  passed: number,
  total: number,
): Pick<DecisionAssessment, 'passedChecks' | 'totalChecks'> & DecisionAssessment {
  return { passedChecks: passed, totalChecks: total } as DecisionAssessment;
}

describe('cases', () => {
  it('counts cases per status in list order', () => {
    expect(casesPerStatus(['ny', 'bedomt', 'ny', 'pagar'])).toEqual([
      { status: 'ny', count: 2 },
      { status: 'pagar', count: 1 },
      { status: 'inlamnat', count: 0 },
      { status: 'bedomt', count: 1 },
    ]);
    expect(casesPerStatus([]).every((c) => c.count === 0)).toBe(true);
  });

  it('pairs decisions with their rows, sorts oldest first and filters by window', () => {
    const sources = [
      {
        caseId: 'A002',
        title: 'A002 Tillbyggnad',
        decisions: [{ date: '2026-03-01', assessment: assessment(3, 9) }],
        submittedAt: [daysAgo(2).toISOString()],
      },
      {
        caseId: 'A001',
        title: 'A001 Komplementbyggnad',
        decisions: [
          { date: '2026-02-01', assessment: assessment(5, 8) },
          { date: '2026-02-20', assessment: assessment(8, 8) },
        ],
        submittedAt: [daysAgo(50).toISOString(), daysAgo(10).toISOString()],
      },
    ];
    const all = decisionChecks(sources);
    expect(all.map((r) => [r.key, r.passed, r.total])).toEqual([
      ['A001:0', 5, 8],
      ['A001:1', 8, 8],
      ['A002:0', 3, 9],
    ]);
    const recent = decisionChecks(sources, windowDays('4v', NOW, null));
    expect(recent.map((r) => r.key)).toEqual(['A001:1', 'A002:0']);
    expect(decisionChecks([])).toEqual([]);
  });

  it('keeps a decision whose row is missing, with its simulated date', () => {
    const rows = decisionChecks(
      [
        {
          caseId: 'A003',
          title: 'A003',
          decisions: [{ date: '2026-05-05', assessment: assessment(1, 2) }],
          submittedAt: [],
        },
      ],
      windowDays('4v', NOW, null),
    );
    expect(rows).toEqual([
      expect.objectContaining({ submittedAt: null, decisionDate: '2026-05-05', passed: 1 }),
    ]);
  });
});
