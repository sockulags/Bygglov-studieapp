// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { assembleContent, type StudyContent } from '@/content';
import { createMemoryDataStore } from '@/data';
import { restoreCaseState } from '@/engine';
import { loadCaseYaml } from '@/engine/cases/a002.fixture';
import { listStatusOf } from '@/features/cases/case-model';
import { readStoredResult } from '@/features/study/session-result';
import { casesPerStatus, decisionChecks } from './aggregate';
import { seedResultsDemo } from './seed';

const NOW = new Date(2026, 10, 5, 15, 0, 0);

const base = assembleContent({
  'moduler.json': {
    moduler: [
      {
        id: '03-lovplikt',
        ordning: 3,
        titel: 'Lovplikt',
        beskrivning: 'Om lov.',
        lagrum_sammanfattning: 'PBL.',
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
        taggar: ['plank'],
      },
      {
        id: 'b',
        typ: 'sant_falskt',
        svarighet: 1,
        fraga: 'B?',
        svar: true,
        forklaring: 'B.',
        taggar: ['mur'],
      },
    ],
  },
});

const cases = [
  loadCaseYaml('A001-komplementbyggnad-larken-4'),
  loadCaseYaml('A002-tillbyggnad-bjorken-7'),
  loadCaseYaml('A003-nybyggnad-strandvik-1-9'),
];
const content: StudyContent = { ...base, cases };

describe('seedResultsDemo (dev-only)', () => {
  it('is deterministic and ends with a streak through today', async () => {
    const one = createMemoryDataStore();
    const two = createMemoryDataStore();
    const a = await seedResultsDemo(one, content, { now: NOW, days: 20, cases: false });
    const b = await seedResultsDemo(two, content, { now: NOW, days: 20, cases: false });
    expect(a).toEqual(b);
    const sessions = await one.sessions.listRecent(100);
    expect(sessions.every((s) => readStoredResult(s.result) !== null)).toBe(true);
    const lastSeven = new Set(sessions.map((s) => new Date(s.finishedAt ?? '').toDateString()));
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - i);
      expect(lastSeven.has(day.toDateString())).toBe(true);
    }
    const answers = await one.answers.listAnswers();
    expect(answers.every((x) => x.answeredAt <= NOW.toISOString())).toBe(true);
  });

  it('leaves one case reviewed, one submitted and one in progress', async () => {
    const store = createMemoryDataStore();
    const summary = await seedResultsDemo(store, content, { now: NOW, days: 20 });
    expect(summary.decisions).toBe(2);

    const statuses = await store.cases.listCaseStatuses();
    expect(casesPerStatus(statuses.map((row) => listStatusOf(row))).map((c) => c.count)).toEqual([
      0, 1, 1, 1,
    ]);

    const sources = await Promise.all(
      statuses.map(async (row) => {
        const caseFile = cases.find((c) => c.id === row.caseId);
        if (!caseFile) throw new Error(row.caseId);
        const restored = restoreCaseState(caseFile, row.state);
        if (!restored.ok) throw new Error(restored.reason);
        const decisions = await store.cases.listDecisions(row.caseId);
        return {
          caseId: row.caseId,
          title: caseFile.titel,
          decisions: restored.state.decisions,
          submittedAt: decisions.map((d) => d.submittedAt),
        };
      }),
    );
    const checks = decisionChecks(sources);
    expect(checks).toHaveLength(2);
    expect(checks.every((c) => c.total > 0 && c.submittedAt !== null)).toBe(true);
    // The careful decision passes more checks than the hasty one.
    expect(checks[0]?.passed ?? 0).toBeGreaterThan(checks[1]?.passed ?? 0);
  });
});
