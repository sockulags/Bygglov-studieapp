// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { loadA002 } from './a002.fixture';
import { addDays, daysBetween } from './dates';
import { calculateFee, caseDeadline, computeDeadline, deadlineStatus } from './deadline';
import { advanceDays, extendDeadline, startCase, submitStep } from './engine';
import { CaseEngineError } from './errors';
import type { CaseState } from './types';

const a002 = loadA002();

describe('dates', () => {
  it('adds days across months and leap years in UTC', () => {
    expect(addDays('2026-03-02', 70)).toBe('2026-05-11');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30'); // DST change in Sweden
    expect(daysBetween('2026-03-02', '2026-03-23')).toBe(21);
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
  });
});

describe('computeDeadline (9 kap. 99 §)', () => {
  it('runs ten weeks from the application day without an injunction', () => {
    const d = computeDeadline({ applicationDate: '2026-03-02' });
    expect(d).toMatchObject({
      basis: 'ansokningsdagen',
      startDate: '2026-03-02',
      deadlineDate: '2026-05-11',
      injunctionInTime: null,
    });
    expect(d.explanation).toContain('99 § första stycket 1');
  });

  it('waits for the completion when the injunction came within three weeks', () => {
    const d = computeDeadline({ applicationDate: '2026-03-02', injunctionDates: ['2026-03-23'] });
    expect(d).toMatchObject({
      basis: 'vantar_pa_komplettering',
      startDate: null,
      deadlineDate: null,
      injunctionInTime: true,
    });
  });

  it('runs from the completion day when the injunction came within three weeks', () => {
    const d = computeDeadline({
      applicationDate: '2026-03-02',
      injunctionDates: ['2026-03-23'], // day 21: still in time
      completionDate: '2026-04-10',
    });
    expect(d).toMatchObject({
      basis: 'komplettering',
      startDate: '2026-04-10',
      deadlineDate: '2026-06-19',
    });
    expect(d.explanation).toContain('99 § första stycket 4');
  });

  it('keeps the application day when the injunction came after three weeks', () => {
    const d = computeDeadline({
      applicationDate: '2026-03-02',
      injunctionDates: ['2026-03-24'], // day 22
      completionDate: '2026-04-10',
    });
    expect(d).toMatchObject({
      basis: 'ansokningsdagen',
      startDate: '2026-03-02',
      deadlineDate: '2026-05-11',
      injunctionInTime: false,
    });
  });

  it('uses the first injunction and adds the extension', () => {
    const d = computeDeadline({
      applicationDate: '2026-03-02',
      injunctionDates: ['2026-04-01', '2026-03-10'],
      completionDate: '2026-03-20',
      extensionWeeks: 10,
    });
    expect(d.injunctionDate).toBe('2026-03-10');
    expect(d.deadlineDate).toBe(addDays('2026-03-20', 140));
    expect(d.explanation).toContain('förlängts med 10 veckor');
  });
});

describe('deadline through the engine', () => {
  function throughInjunction(daysBeforeInjunction: number): CaseState {
    let state = startCase(a002, { seed: 1 });
    state = submitStep(a002, state, 'S1', {
      type: 'checklista',
      marks: [true, true, true, false, false, false, false],
    }).state;
    state = advanceDays(state, daysBeforeInjunction);
    return submitStep(a002, state, 'S2', { type: 'skrivelse', text: 'Föreläggande.' }).state;
  }

  it('counts from the completion when S2 is sent on day 21', () => {
    const state = throughInjunction(21);
    expect(state.injunctions[0]?.date).toBe('2026-03-23');
    expect(state.completionDate).toBe('2026-04-06'); // E1: 14 days later
    expect(state.deadlineDate).toBe('2026-06-15');
    expect(caseDeadline(state).basis).toBe('komplettering');
  });

  it('counts from the application day when S2 is sent on day 22', () => {
    const state = throughInjunction(22);
    expect(state.completionDate).toBe('2026-04-07');
    expect(state.deadlineDate).toBe('2026-05-11');
    expect(caseDeadline(state).basis).toBe('ansokningsdagen');
  });

  it('reports elapsed days, days left and started weeks overdue', () => {
    const state = throughInjunction(0); // completion 2026-03-16, deadline 2026-05-25
    expect(deadlineStatus(state)).toMatchObject({ daysElapsed: 0, daysLeft: 70, weeksOverdue: 0 });
    expect(deadlineStatus(state, '2026-05-25')).toMatchObject({ daysLeft: 0, weeksOverdue: 0 });
    expect(deadlineStatus(state, '2026-05-26').weeksOverdue).toBe(1);
    expect(deadlineStatus(state, '2026-06-01').weeksOverdue).toBe(1);
    expect(deadlineStatus(state, '2026-06-02').weeksOverdue).toBe(2);
  });

  it('logs in the diary when the deadline runs out', () => {
    const state = advanceDays(throughInjunction(0), 80);
    expect(state.diary.some((e) => e.kind === 'frist' && e.date === '2026-05-26')).toBe(true);
  });

  it('extends once, by at most ten weeks, before the deadline', () => {
    const state = throughInjunction(0);
    const extended = extendDeadline(state, 4);
    expect(extended.deadlineDate).toBe('2026-06-22');
    const code = (fn: () => unknown) => {
      try {
        fn();
        return 'none';
      } catch (error) {
        return error instanceof CaseEngineError ? error.code : 'other';
      }
    };
    expect(code(() => extendDeadline(extended, 2))).toBe('invalid_extension');
    expect(code(() => extendDeadline(state, 11))).toBe('invalid_extension');
    expect(code(() => extendDeadline(state, 0))).toBe('invalid_extension');
    expect(code(() => extendDeadline(advanceDays(state, 71), 2))).toBe('invalid_extension');
    expect(code(() => advanceDays(state, -1))).toBe('invalid_days');
  });
});

describe('calculateFee (12 kap. 8 a §)', () => {
  const deadline = computeDeadline({ applicationDate: '2026-03-02' }); // 2026-05-11

  it('charges the full fee within the deadline', () => {
    const fee = calculateFee(a002.taxa, deadline, '2026-05-11');
    expect(fee).toMatchObject({ weeksOverdue: 0, reduction: 0 });
    expect(fee.lines[0]?.expectedAmount).toBe(9800);
  });

  it('reduces one fifth per started week', () => {
    const fee = calculateFee(a002.taxa, deadline, '2026-05-20'); // 9 days late
    expect(fee.weeksOverdue).toBe(2);
    expect(fee.reduction).toBeCloseTo(0.4);
    expect(fee.lines[0]?.expectedAmount).toBe(5880);
    expect(fee.explanation.join(' ')).toContain('2 påbörjade veckor');
  });

  it('never goes below zero and defaults to one fifth without a taxa factor', () => {
    const fee = calculateFee({ bygglov: 10000 }, deadline, '2026-08-01');
    expect(fee.reductionPerWeek).toBe(0.2);
    expect(fee.reduction).toBe(1);
    expect(fee.lines).toEqual([{ key: 'bygglov', baseAmount: 10000, expectedAmount: 0 }]);
  });

  it('does not reduce while the deadline is not running', () => {
    const waiting = computeDeadline({
      applicationDate: '2026-03-02',
      injunctionDates: ['2026-03-05'],
    });
    expect(calculateFee(a002.taxa, waiting, '2026-12-01').reduction).toBe(0);
  });
});
