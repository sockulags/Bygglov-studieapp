// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { DecisionStep } from '@bygglov/content-schema';
import { loadA002 } from './a002.fixture';
import { assessDecision, emptyDecisionDraft } from './decision';
import { advanceDays, startCase, submitStep } from './engine';
import { findStep } from './triggers';
import type { CaseState, DecisionDraft } from './types';

const a002 = loadA002();
const s6 = findStep(a002, 'S6') as DecisionStep;

/** A002 played the right way up to the decision (2026-03-30, deadline 2026-05-25). */
function readyForDecision(): CaseState {
  let state = startCase(a002, { seed: 1 });
  const steps: [string, Parameters<typeof submitStep>[3]][] = [
    ['S1', { type: 'checklista', marks: [true, true, true, false, false, false, false] }],
    ['S2', { type: 'skrivelse', text: 'Föreläggande.' }],
    ['S3', { type: 'berakning', values: {} }],
    ['S4', { type: 'fraga', answer: { type: 'flerval', selected: 0 } }],
    ['S5', { type: 'urval', selected: [0, 1, 2, 3] }],
    ['S5b', { type: 'fraga', answer: { type: 'oppen', text: 'Bedömning.' } }],
  ];
  for (const [id, answer] of steps) state = submitStep(a002, state, id, answer).state;
  return state;
}

const check = (draft: DecisionDraft, state: CaseState, id: string) =>
  assessDecision(a002, s6, draft, state).checks.find((c) => c.id === id);

describe('assessDecision', () => {
  const state = readyForDecision();

  it('fails the structured checks of an empty form', () => {
    const a = assessDecision(a002, s6, { ...emptyDecisionDraft(), utfall: 'avsla' }, state);
    const failed = a.checks.filter((c) => !c.passed && c.severity !== 'tip').map((c) => c.id);
    expect(failed).toEqual([
      'utfall',
      'lagstod',
      'motivering',
      'overklagandehanvisning',
      'avgift',
      'delgivning_sokande',
      'delgivning_fastighetsagare',
    ]);
    expect(a.passedChecks).toBe(1); // underrättelse
  });

  it('serves the neighbour who objected, and says why', () => {
    const draft: DecisionDraft = {
      ...emptyDecisionDraft(),
      expediering: [{ mottagare: 'Björken 8', satt: 'meddelande' }],
    };
    const c = check(draft, state, 'delgivning_grannar');
    expect(c).toMatchObject({ passed: false, lawRefs: ['PBL 9 kap. 108 § första stycket 2'] });
    expect(c?.details).toEqual(['Björken 8 finns med som "meddelande" men ska delges.']);
    const ok = check(
      { ...draft, expediering: [{ mottagare: 'Ägaren till Björken 8', satt: 'delges' }] },
      state,
      'delgivning_grannar',
    );
    expect(ok?.passed).toBe(true);
    // "Björken 82" is another property.
    expect(
      check(
        { ...draft, expediering: [{ mottagare: 'Björken 82', satt: 'delges' }] },
        state,
        'delgivning_grannar',
      )?.passed,
    ).toBe(false);
  });

  it('accepts one recipient who is both applicant and owner', () => {
    const draft: DecisionDraft = {
      ...emptyDecisionDraft(),
      expediering: [{ mottagare: 'Sökanden tillika fastighetsägare', satt: 'delges' }],
    };
    expect(check(draft, state, 'delgivning_sokande')?.passed).toBe(true);
    expect(check(draft, state, 'delgivning_fastighetsagare')?.passed).toBe(true);
    const byName = {
      ...draft,
      expediering: [{ mottagare: 'Ägaren till Björken 7', satt: 'delges' as const }],
    };
    expect(check(byName, state, 'delgivning_fastighetsagare')?.passed).toBe(true);
  });

  it('recognises the applicants and the neighbours by name (parter)', () => {
    const draft: DecisionDraft = {
      ...emptyDecisionDraft(),
      expediering: [
        { mottagare: 'Maria och Jonas Lindqvist', satt: 'delges' },
        { mottagare: 'Gunilla och Bertil Ahlgren', satt: 'delges' },
        { mottagare: 'Ägarna till Björken 6 och 12', satt: 'meddelande' },
        { mottagare: 'Akerslunda kommun', satt: 'meddelande' },
      ],
    };
    expect(check(draft, state, 'delgivning_sokande')?.passed).toBe(true);
    expect(check(draft, state, 'delgivning_fastighetsagare')?.passed).toBe(true);
    expect(check(draft, state, 'delgivning_grannar')?.passed).toBe(true);
    expect(check(draft, state, 'meddelande_grannar')).toMatchObject({ passed: true, details: [] });
    // Served by name but only sent a notice: still not served.
    const notice = check(
      { ...draft, expediering: [{ mottagare: 'Bertil Ahlgren', satt: 'meddelande' }] },
      state,
      'delgivning_grannar',
    );
    expect(notice?.details).toEqual(['Björken 8 finns med som "meddelande" men ska delges.']);
  });

  it('requires the reduced fee once the deadline has passed', () => {
    const late = advanceDays(state, 64); // 2026-06-02: 8 days late = 2 started weeks
    const full = check({ ...emptyDecisionDraft(), avgift: 9800 }, late, 'avgift');
    expect(full).toMatchObject({ passed: false });
    expect(full?.message).toContain('inte reducerad');
    expect(full?.details.join(' ')).toContain('5 880 kr');
    expect(check({ ...emptyDecisionDraft(), avgift: 5880 }, late, 'avgift')?.passed).toBe(true);
    expect(check({ ...emptyDecisionDraft(), avgift: 9800 }, state, 'avgift')?.passed).toBe(true);
  });

  it('warns about the old numbering of 9 kap.', () => {
    const c = check(
      { ...emptyDecisionDraft(), lagstod: ['PBL 9 kap. 31 b §'] },
      state,
      'lagstod_numrering',
    );
    expect(c?.details).toEqual(['9 kap. 31 b §: motsvaras nu av 9 kap. 60 §.']);
    expect(
      check({ ...emptyDecisionDraft(), lagstod: ['PBL 9 kap. 31 b §'] }, state, 'lagstod')?.passed,
    ).toBe(false);
  });

  it('suggests the notice to other neighbours and the permit information', () => {
    const draft = { ...emptyDecisionDraft(), villkor_upplysningar: 'Startbesked krävs.' };
    const notice = check(draft, state, 'meddelande_grannar');
    expect(notice).toMatchObject({ passed: false, severity: 'tip' });
    expect(notice?.details).toEqual([
      'Saknas: Björken 6',
      'Saknas: Björken 12',
      'Saknas: Åkerslunda 1:1',
    ]);
    expect(check(draft, state, 'upplysning_startbesked')?.passed).toBe(true);
    expect(check(draft, state, 'upplysning_giltighetstid')?.passed).toBe(false);
  });
});
