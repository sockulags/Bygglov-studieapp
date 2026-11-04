// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { CaseStep } from '@bygglov/content-schema';
import { loadA002 } from './a002.fixture';
import { gradeStepAnswer, isMissedResult } from './grading';
import { chapterNineRefs } from './law';
import { injunctionKind, injunctionMatches } from './triggers';
import { findStep } from './triggers';
import type { StepResult } from './types';

const a002 = loadA002();
const step = (id: string): CaseStep => {
  const s = findStep(a002, id);
  if (!s) throw new Error(id);
  return s;
};

describe('gradeStepAnswer', () => {
  it('checklista: share of posts marked right, with comments', () => {
    const r = gradeStepAnswer(
      a002,
      step('S1'),
      { type: 'checklista', marks: [true, true, true, false, false, null, true] },
      null,
    );
    expect(r.score).toBeCloseTo(5 / 7);
    expect(r.outcome).toBe('partial');
    expect(r.items[6]).toMatchObject({ correct: false, given: 'finns', expected: 'saknas' });
    expect(r.items[6]?.explanation).toContain('tekniskt samråd');
  });

  it('fraga flerval goes through the quiz engine', () => {
    const right = gradeStepAnswer(
      a002,
      step('S4'),
      { type: 'fraga', answer: { type: 'flerval', selected: 0 } },
      null,
    );
    const wrong = gradeStepAnswer(
      a002,
      step('S4'),
      { type: 'fraga', answer: { type: 'flerval', selected: 2 } },
      null,
    );
    expect(right).toMatchObject({ score: 1, outcome: 'correct' });
    expect(right.lawRefs).toContain('PBL 9 kap. 60 §');
    expect(wrong).toMatchObject({ score: 0, outcome: 'incorrect' });
    expect(() =>
      gradeStepAnswer(
        a002,
        step('S4'),
        { type: 'fraga', answer: { type: 'oppen', text: 'x' } },
        null,
      ),
    ).toThrow(/flerval/);
  });

  it('fraga oppen is self-assessed against the criteria', () => {
    const answer = { type: 'fraga', answer: { type: 'oppen', text: 'Text' } } as const;
    const pending = gradeStepAnswer(a002, step('S5b'), answer, null);
    expect(pending).toMatchObject({ score: null, outcome: null });
    expect(pending.selfAssessment?.criteria).toHaveLength(3);
    const done = gradeStepAnswer(a002, step('S5b'), answer, [0, 2, 9]);
    expect(done.score).toBeCloseTo(2 / 3);
    expect(done.selfAssessment?.checked).toEqual([0, 2]);
  });

  it('berakning: tolerance, decimal comma and units taken from the text', () => {
    const r = gradeStepAnswer(
      a002,
      step('S3'),
      {
        type: 'berakning',
        values: {
          byggnadsarea_efter: '140,5 kvm',
          byggnadsarea_procent: 20,
          byggnadshojd: '4.9 m',
          prickmark_kvm: '3,5',
        },
      },
      null,
    );
    expect(r.items.map((i) => i.correct)).toEqual([true, false, true, true]);
    expect(r.score).toBe(0.75);
    expect(r.items[0]?.expected).toBe('138 kvm (±3)');
  });

  it('urval: precision, recall and F1', () => {
    const r = gradeStepAnswer(a002, step('S5'), { type: 'urval', selected: [0, 1, 2, 4] }, null);
    expect(r.selection).toMatchObject({
      precision: 0.75,
      recall: 0.75,
      falsePositives: 1,
      falseNegatives: 1,
    });
    expect(r.score).toBeCloseTo(0.75);
    const none = gradeStepAnswer(a002, step('S5'), { type: 'urval', selected: [] }, null);
    expect(none.score).toBe(0);
    expect(none.selection?.recall).toBe(0);
  });

  it('skrivelse: self-assessment plus model text', () => {
    const r = gradeStepAnswer(a002, step('S2'), { type: 'skrivelse', text: 'x' }, [0, 1]);
    expect(r.score).toBeCloseTo(2 / 5);
    expect(r.selfAssessment?.modelTextPath).toBe('handlingar/modell-forelaggande.md');
  });
});

describe('isMissedResult', () => {
  const base = (stepId: string, patch: Partial<StepResult>): StepResult => ({
    stepId,
    stepType: step(stepId).typ,
    date: '2026-03-02',
    skipped: false,
    answer: null,
    score: null,
    outcome: null,
    checkedCriteria: null,
    ...patch,
  });

  it('counts skipped steps and wrong answers, but not extra neighbours', () => {
    expect(isMissedResult(step('S5'), base('S5', { skipped: true }))).toBe(true);
    expect(
      isMissedResult(
        step('S5'),
        base('S5', { answer: { type: 'urval', selected: [0, 1, 2, 3, 4] } }),
      ),
    ).toBe(false);
    expect(
      isMissedResult(step('S5'), base('S5', { answer: { type: 'urval', selected: [0, 1] } })),
    ).toBe(true);
    expect(
      isMissedResult(
        step('S4'),
        base('S4', {
          answer: { type: 'fraga', answer: { type: 'flerval', selected: 1 } },
          outcome: 'incorrect',
          score: 0,
        }),
      ),
    ).toBe(true);
    expect(
      isMissedResult(step('S2'), base('S2', { answer: { type: 'skrivelse', text: '' } })),
    ).toBe(false);
  });
});

describe('injunctions', () => {
  it('recognises the injunction step and its kind', () => {
    expect(injunctionKind(step('S2'))).toBe('komplettering');
    expect(injunctionKind(step('S1'))).toBeNull();
    expect(injunctionMatches('komplettering', 'Komplettering')).toBe(true);
    expect(injunctionMatches('komplettering', 'rättelse')).toBe(false);
  });
});

describe('chapterNineRefs', () => {
  it('reads common ways of writing references', () => {
    expect(chapterNineRefs('PBL 9 kap. 56 §').map((r) => r.section)).toEqual(['56']);
    expect(chapterNineRefs('9 kap. 56 och 60 §§').map((r) => r.section)).toEqual(['56', '60']);
    expect(chapterNineRefs('9 kap 99 a §')[0]).toMatchObject({ section: '99 a', exists: true });
    expect(chapterNineRefs('9:60')[0]).toMatchObject({ section: '60', exists: true });
  });

  it('flags the old numbering and ignores other laws', () => {
    expect(chapterNineRefs('PBL 9 kap. 31 b §')[0]).toMatchObject({
      exists: false,
      replacedBy: '9 kap. 60 §',
    });
    expect(chapterNineRefs('9 kap. 116 §')[0]?.exists).toBe(false);
    expect(chapterNineRefs('PBF 9 kap. 7 §')).toEqual([]);
    expect(chapterNineRefs('PBL 12 kap. 8 a §')).toEqual([]);
  });
});
