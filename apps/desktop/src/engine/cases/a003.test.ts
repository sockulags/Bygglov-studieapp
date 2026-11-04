// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { loadCaseYaml } from './a002.fixture';
import { caseDeadline } from './deadline';
import { currentStep, startCase, submitDecision, submitStep } from './engine';
import { emptyDecisionDraft } from './decision';
import { restoreCaseState } from './schema';
import type { CaseState, DecisionDraft, StepAnswer } from './types';

const a003 = loadCaseYaml('A003-nybyggnad-strandvik-1-9');

function play(state: CaseState, steps: [string, StepAnswer][]): CaseState {
  for (const [id, answer] of steps) {
    expect(currentStep(a003, state)?.id).toBe(id);
    state = submitStep(a003, state, id, answer).state;
  }
  return state;
}

/** A003 played the right way through the neighbour notice (S4), which fires E1 and E2. */
function throughNotice(): CaseState {
  return play(startCase(a003, { seed: 1 }), [
    ['S1', { type: 'checklista', marks: [true, true, true, true, true, true, true, false, false] }],
    ['S2', { type: 'fraga', answer: { type: 'flersvar', selected: [0, 1, 2] } }],
    ['S3', { type: 'fraga', answer: { type: 'flerval', selected: 0 } }],
    ['S4', { type: 'urval', selected: [0, 1, 2, 3] }],
  ]);
}

const goodDecision: DecisionDraft = {
  ...emptyDecisionDraft(),
  utfall: 'bevilja',
  lagstod: ['PBL 9 kap. 57 §'],
  motivering: 'Platsen är lämplig för ett enbostadshus.',
  villkor_upplysningar:
    'Kontrollansvarig är Henrik Wallin. Åtgärden får inte påbörjas förrän startbesked getts. ' +
    'Lovet upphör att gälla om åtgärden inte påbörjats inom två år och avslutats inom fem år ' +
    'från laga kraft. En åtgärd som påbörjas innan beslutet fått laga kraft kan behöva återställas.',
  avgift: 31800,
  overklagandehanvisning: true,
  expediering: [
    { mottagare: 'Sara Holm och Daniel Ek', satt: 'delges' },
    { mottagare: 'Monica och Göran Lundh', satt: 'delges' },
    { mottagare: 'Ägarna till Strandvik 1:5, 1:3 och 1:1', satt: 'meddelande' },
  ],
};

describe('A003, ändrad situationsplan på sökandenas initiativ (9 kap. 99 § första stycket 2)', () => {
  it('runs from the application day until E1', () => {
    const state = play(startCase(a003, { seed: 1 }), [
      [
        'S1',
        { type: 'checklista', marks: [true, true, true, true, true, true, true, false, false] },
      ],
    ]);
    expect(state.deadlineDate).toBe('2026-10-26');
    expect(caseDeadline(state).basis).toBe('ansokningsdagen');
  });

  it('moves the deadline to 2026-11-19 when the revised site plan arrives', () => {
    const state = throughNotice();
    expect(state.firedEvents.map((e) => e.eventId)).toEqual(['E1', 'E2']);
    expect(state.amendmentDates).toEqual(['2026-09-10']);
    expect(state.deadlineDate).toBe('2026-11-19');
    expect(caseDeadline(state)).toMatchObject({
      basis: 'andring_pa_sokandens_initiativ',
      startDate: '2026-09-10',
    });
    const entry = state.diary.find((e) => e.kind === 'frist' && e.date === '2026-09-10');
    expect(entry?.text).toContain('Ny tidsfrist');
    expect(entry?.text).toContain('9 kap. 99 § första stycket 2');
    expect(entry?.text).toContain('Sökanden ska informeras skriftligen');
    expect(entry?.text).toContain('100 § 2');
    // The stored state keeps the new start.
    const restored = restoreCaseState(a003, JSON.parse(JSON.stringify(state)));
    expect(restored.ok && restored.state.amendmentDates).toEqual(['2026-09-10']);
  });

  it('accepts the model decision on 2026-10-12, within the new deadline and without reduction', () => {
    const state = play(throughNotice(), [
      ['S4b', { type: 'fraga', answer: { type: 'flerval', selected: 1 } }],
      ['S5', { type: 'fraga', answer: { type: 'oppen', text: 'Platsen är lämplig.' } }],
      ['S6', { type: 'skrivelse', text: 'Kommunicering.' }],
    ]);
    const { assessment } = submitDecision(a003, state, goodDecision);
    expect(assessment.decisionDate).toBe('2026-10-12');
    expect(assessment.fee.deadline.deadlineDate).toBe('2026-11-19');
    expect(assessment.fee.weeksOverdue).toBe(0);
    expect(assessment.fee.lines[0]?.expectedAmount).toBe(31800);
    const byId = Object.fromEntries(assessment.checks.map((c) => [c.id, c]));
    expect(byId['avgift']?.passed).toBe(true);
    expect(byId['delgivning_sokande']?.passed).toBe(true);
    expect(byId['delgivning_fastighetsagare']?.passed).toBe(true);
    expect(byId['delgivning_grannar']?.passed).toBe(true);
    expect(byId['meddelande_grannar']).toMatchObject({ passed: true, details: [] });
    expect(assessment.checks.filter((c) => !c.passed && c.severity !== 'tip')).toEqual([]);
  });
});
