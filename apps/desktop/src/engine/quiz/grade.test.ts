import { describe, expect, it } from 'vitest';
import {
  calculation,
  cloze,
  clozeText,
  clozeTolerance,
  drawingNumeric,
  drawingSelf,
  matching,
  multipleAnswer,
  multipleChoice,
  open,
  ordering,
  trueFalse,
} from '../fixtures';
import {
  AnswerTypeMismatchError,
  gapMatches,
  grade,
  gradeSelfAssessment,
  longestNonDecreasingSubsequence,
  wordsAfterGaps,
} from './grade';
import type { GradedResult, GradeResult } from './types';

function graded(result: GradeResult): GradedResult {
  if (result.kind !== 'graded') throw new Error('expected graded result');
  return result;
}

describe('grade: flerval', () => {
  it('scores the right alternative 1 and forwards explanation and law refs', () => {
    const r = graded(grade(multipleChoice, { type: 'flerval', selected: 1 }));
    expect(r).toMatchObject({ score: 1, outcome: 'correct', questionId: 'mc' });
    expect(r.explanation).toBe('Förklaring.');
    expect(r.lawRefs).toEqual(['PBL 9 kap. 4 §']);
    expect(r.lawRefsUncertain).toBe(false);
    expect(r.items[1]?.explanation).toBe('B är rätt.');
  });

  it('scores a wrong, empty or out-of-range answer 0', () => {
    expect(graded(grade(multipleChoice, { type: 'flerval', selected: 2 })).outcome).toBe(
      'incorrect',
    );
    expect(graded(grade(multipleChoice, { type: 'flerval', selected: null })).score).toBe(0);
    expect(graded(grade(multipleChoice, { type: 'flerval', selected: 7 })).score).toBe(0);
    expect(graded(grade(multipleChoice, { type: 'flerval', selected: 1.5 })).score).toBe(0);
  });

  it('throws when the answer type does not match the question', () => {
    expect(() => grade(multipleChoice, { type: 'sant_falskt', value: true })).toThrow(
      AnswerTypeMismatchError,
    );
  });
});

describe('grade: flersvar (partial credit)', () => {
  const g = (selected: number[]) => graded(grade(multipleAnswer, { type: 'flersvar', selected }));

  it('gives full credit for exactly the right set', () => {
    expect(g([0, 1, 3])).toMatchObject({ score: 1, outcome: 'correct' });
  });

  it('gives partial credit for some right choices', () => {
    expect(g([0, 1]).score).toBeCloseTo(2 / 3);
    expect(g([0, 1]).outcome).toBe('partial');
  });

  it('subtracts wrong choices, so ticking everything does not pay off', () => {
    expect(g([0, 1, 2]).score).toBeCloseTo(1 / 3);
    expect(g([0, 1, 2, 3, 4]).score).toBeCloseTo(1 / 3);
    expect(g([0, 2, 4]).score).toBe(0);
  });

  it('handles empty answers, duplicates and invalid indices', () => {
    expect(g([]).outcome).toBe('incorrect');
    expect(g([0, 0, 0, 1, 1, 3]).score).toBe(1);
    expect(g([0, 1, 3, 99, -1]).score).toBe(1);
  });
});

describe('grade: sant_falskt', () => {
  it('compares the boolean and treats null as wrong', () => {
    expect(graded(grade(trueFalse, { type: 'sant_falskt', value: false })).score).toBe(1);
    expect(graded(grade(trueFalse, { type: 'sant_falskt', value: true })).score).toBe(0);
    expect(graded(grade(trueFalse, { type: 'sant_falskt', value: null })).score).toBe(0);
  });
});

describe('grade: lucktext', () => {
  const g = (gaps: string[]) => graded(grade(cloze, { type: 'lucktext', gaps }));

  it('accepts exact answers', () => {
    expect(g(['10', '10', '3']).outcome).toBe('correct');
  });

  it('accepts "10 veckor" when the gap is followed by "veckor"', () => {
    expect(g(['10 veckor', '10 v', '3 veckor.']).score).toBe(1);
    expect(g(['10 vecka', ' 10 ', '3']).score).toBe(1);
  });

  it('rejects a number with the wrong unit', () => {
    expect(g(['10 dagar', '10', '3']).score).toBeCloseTo(2 / 3);
  });

  it('gives a share of the score per gap and treats missing gaps as wrong', () => {
    expect(g(['10']).score).toBeCloseTo(1 / 3);
    expect(g([]).outcome).toBe('incorrect');
    expect(g(['', '  ', '']).score).toBe(0);
    expect(g(['10', '9', '3']).outcome).toBe('partial');
  });

  it('normalises case, whitespace, Swedish characters and decimal separators', () => {
    const decomposed = 'Anslagstavla'.normalize('NFD');
    expect(graded(grade(clozeText, { type: 'lucktext', gaps: [decomposed, '4.5'] })).score).toBe(1);
    expect(
      graded(grade(clozeText, { type: 'lucktext', gaps: ['  DIGITALA   anslagstavla ', '4,5 m'] }))
        .score,
    ).toBe(1);
    expect(
      graded(grade(clozeText, { type: 'lucktext', gaps: ['anslagstavlan', '4,6'] })).score,
    ).toBe(0);
  });

  it('applies the numeric tolerance', () => {
    const g2 = (v: string) => graded(grade(clozeTolerance, { type: 'lucktext', gaps: [v] })).score;
    expect(g2('137')).toBe(1);
    expect(g2('139 kvm')).toBe(1);
    expect(g2('138,9 m2')).toBe(1);
    expect(g2('136,5')).toBe(0);
  });

  it('extracts the word after each gap', () => {
    expect(wordsAfterGaps(cloze.typ === 'lucktext' ? cloze.fraga : '')).toEqual([
      'veckor',
      'veckor',
      'veckor',
    ]);
  });

  it('gapMatches compares bare numbers and §', () => {
    expect(gapMatches('99 §', '99', { impliedUnit: '§' })).toBe(true);
    expect(gapMatches('1 000', '1000')).toBe(true);
    expect(gapMatches('10', '10 veckor')).toBe(true);
    expect(gapMatches('10 dagar', '10 veckor')).toBe(false);
    expect(gapMatches('10 veckor', '10')).toBe(false);
  });
});

describe('grade: para_ihop', () => {
  it('scores the share of correctly matched pairs', () => {
    const r = (matches: (number | null)[]) =>
      graded(grade(matching, { type: 'para_ihop', matches })).score;
    expect(r([0, 1, 2])).toBe(1);
    expect(r([1, 0, 2])).toBeCloseTo(1 / 3);
    expect(r([null, null, null])).toBe(0);
    expect(r([0, 0, 0])).toBeCloseTo(1 / 3);
    expect(r([])).toBe(0);
  });
});

describe('grade: ordning', () => {
  const g = (order: number[]) => graded(grade(ordering, { type: 'ordning', order }));

  it('gives 1 for the right order and 0 for the reversed order', () => {
    expect(g([0, 1, 2, 3, 4]).outcome).toBe('correct');
    expect(g([4, 3, 2, 1, 0]).score).toBe(0);
  });

  it('costs about one step per misplaced item', () => {
    expect(g([1, 2, 3, 4, 0]).score).toBeCloseTo(3 / 4);
    expect(g([0, 2, 1, 3, 4]).score).toBeCloseTo(3 / 4);
  });

  it('handles incomplete orders and duplicates', () => {
    expect(g([]).score).toBe(0);
    expect(g([0, 1, 2, 3]).score).toBeCloseTo(3 / 4);
    expect(g([0, 0, 1, 2, 3, 4]).score).toBe(1);
  });

  it('computes the longest non-decreasing subsequence', () => {
    expect(longestNonDecreasingSubsequence([3, 1, 2, 2, 5, 4])).toBe(4);
    expect(longestNonDecreasingSubsequence([])).toBe(0);
  });
});

describe('grade: berakning', () => {
  const g = (value: string | number | null) =>
    graded(grade(calculation, { type: 'berakning', value }));

  it('accepts numbers within tolerance with comma or point and the unit', () => {
    expect(g(4.5).score).toBe(1);
    expect(g('4,5').score).toBe(1);
    expect(g('4.54 m').score).toBe(1);
    expect(g('4,5 meter').score).toBe(1);
    expect(g('4,5 kvm').score).toBe(0);
    expect(g('4,6').score).toBe(0);
  });

  it('treats empty and non-numeric answers as wrong and forwards the solution', () => {
    const r = g('');
    expect(r.score).toBe(0);
    expect(r.items[0]?.given).toBeNull();
    expect(r.items[0]?.expected).toBe('4,5 m (±0,05)');
    expect(r.solution).toBe('Så här.');
    expect(g(null).score).toBe(0);
    expect(g('fyra').score).toBe(0);
    expect(g(Number.NaN).score).toBe(0);
  });
});

describe('grade: oppen and ritning', () => {
  it('returns self_graded with the assessment criteria for open questions', () => {
    const r = grade(open, { type: 'oppen', text: 'Mitt svar' });
    expect(r.kind).toBe('self_graded');
    if (r.kind !== 'self_graded') return;
    expect(r.criteria).toHaveLength(4);
    expect(r.modelAnswer).toBe('Modellsvar.');
    expect(r.lawRefsUncertain).toBe(true);
    expect(r.explanation).toBe('Förklaring.');

    const assessed = gradeSelfAssessment(r, [0, 2, 2, 9]);
    expect(assessed).toMatchObject({
      kind: 'graded',
      score: 0.5,
      outcome: 'partial',
      selfAssessed: true,
    });
    expect(gradeSelfAssessment(r, []).outcome).toBe('incorrect');
    expect(gradeSelfAssessment(r, [0, 1, 2, 3]).outcome).toBe('correct');
  });

  it('grades drawings numerically when they have svar, otherwise self-graded', () => {
    expect(graded(grade(drawingNumeric, { type: 'ritning', value: '12 kvm' })).score).toBe(1);
    expect(graded(grade(drawingNumeric, { type: 'ritning' })).score).toBe(0);
    expect(grade(drawingSelf, { type: 'ritning', text: 'x' }).kind).toBe('self_graded');
  });
});
