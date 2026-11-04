// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { CaseFile } from '@bygglov/content-schema';
import { loadA002 } from './a002.fixture';
import {
  advanceDays,
  currentStep,
  diary,
  markDocumentSeen,
  skipStep,
  startCase,
  stepFeedback,
  submitDecision,
  submitStep,
  visibleDocuments,
} from './engine';
import { emptyDecisionDraft } from './decision';
import { CaseEngineError } from './errors';
import { restoreCaseState } from './schema';
import { evaluateTriggers, randomDraw } from './triggers';
import type { CaseState, DecisionDraft, StepAnswer } from './types';

const a002: CaseFile = loadA002();
const STARTED = '2026-11-04T10:00:00.000Z';
/** randomDraw for E4 is 0.319 with seed 1 (no E4) and 0.118 with seed 8 (E4 fires). */
const NO_E4 = 1;
const WITH_E4 = 8;

const answers: Record<string, StepAnswer> = {
  S1: { type: 'checklista', marks: [true, true, true, false, false, false, false] },
  S2: {
    type: 'skrivelse',
    text: 'Föreläggande: komplettera med planritning, sektionsritning och anmälan om kontrollansvarig inom tre veckor.',
    checkedCriteria: [0, 1, 2, 3, 4],
  },
  S3: {
    type: 'berakning',
    values: {
      byggnadsarea_efter: '138 kvm',
      byggnadsarea_procent: '18',
      byggnadshojd: '4,9 m',
      prickmark_kvm: 3.5,
    },
  },
  S4: { type: 'fraga', answer: { type: 'flerval', selected: 0 } },
  S5: { type: 'urval', selected: [0, 1, 2, 3] },
  S5b: {
    type: 'fraga',
    answer: { type: 'oppen', text: 'Skuggningen är inte en betydande olägenhet.' },
  },
};

const goodDecision: DecisionDraft = {
  utfall: 'bevilja',
  lagstod: ['PBL 9 kap. 56 §', 'PBL 9 kap. 60 §'],
  motivering:
    'Avvikelserna är små och förenliga med planens syfte. Grannens invändning om skuggning utgör inte en betydande olägenhet.',
  villkor_upplysningar:
    'Lovet gäller omedelbart men åtgärden får inte påbörjas förrän startbesked getts. Påbörjas åtgärden innan beslutet fått laga kraft kan den behöva återställas. Lovet upphör att gälla om åtgärden inte påbörjats inom två år och avslutats inom fem år (giltighetstid). Kontrollansvarig: enligt anmälan.',
  avgift: 9800,
  overklagandehanvisning: true,
  expediering: [
    { mottagare: 'Sökanden', satt: 'delges' },
    { mottagare: 'Fastighetsägaren', satt: 'delges' },
    { mottagare: 'Ägaren till Björken 8', satt: 'delges' },
    { mottagare: 'Björken 6', satt: 'meddelande' },
    { mottagare: 'Björken 12', satt: 'meddelande' },
    { mottagare: 'Åkerslunda 1:1', satt: 'meddelande' },
  ],
};

/** Answers the current step with the prepared answer and checks it was the expected one. */
function answer(state: CaseState, stepId: string) {
  expect(currentStep(a002, state)?.id).toBe(stepId);
  const prepared = answers[stepId];
  if (!prepared) throw new Error(`no prepared answer for ${stepId}`);
  return submitStep(a002, state, stepId, prepared);
}

function roundTrip(state: CaseState): CaseState {
  return JSON.parse(JSON.stringify(state)) as CaseState;
}

describe('A002: rätt väg (förelägg → komplettering → grannehörande → yttrande → bevilja)', () => {
  it('runs the whole case and assesses the decision as correct', () => {
    let state = startCase(a002, { seed: NO_E4, startedAt: STARTED });
    expect(state).toMatchObject({
      caseId: 'A002',
      simDate: '2026-03-02',
      applicationDate: '2026-03-02',
      deadlineDate: '2026-05-11',
      status: 'pagar',
      queue: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'],
    });
    expect(visibleDocuments(a002, state).map((d) => d.document.id)).toEqual([
      'H1',
      'H2',
      'H3',
      'H4',
      'H9',
    ]);

    let r = answer(state, 'S1');
    expect(r.feedback).toMatchObject({ score: 1, outcome: 'correct', missed: false });
    expect(r.firedEvents).toEqual([]);
    state = r.state;

    // The injunction goes out on the application day, so the deadline waits for the completion.
    r = answer(state, 'S2');
    expect(r.firedEvents).toEqual(['E1']);
    expect(r.feedback.selfAssessment?.modelTextPath).toBe('handlingar/modell-forelaggande.md');
    expect(r.feedback.score).toBe(1);
    state = r.state;
    expect(state.injunctions).toEqual([
      { kind: 'komplettering', date: '2026-03-02', stepId: 'S2' },
    ]);
    expect(state.simDate).toBe('2026-03-16');
    expect(state.completionDate).toBe('2026-03-16');
    expect(state.deadlineDate).toBe('2026-05-25');
    const h5 = visibleDocuments(a002, state).find((d) => d.document.id === 'H5');
    expect(h5).toMatchObject({ receivedDate: '2026-03-16', unseen: true });

    state = answer(state, 'S3').state;
    expect(stepFeedback(a002, state, 'S3')?.score).toBe(1);
    state = answer(state, 'S4').state;

    r = answer(state, 'S5');
    expect(r.feedback.selection).toMatchObject({ precision: 1, recall: 1 });
    expect(r.firedEvents).toEqual(['E2']);
    state = r.state;
    expect(state.simDate).toBe('2026-03-30');
    expect(state.queue).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S5b', 'S6']);
    expect(currentStep(a002, state)?.id).toBe('S5b');
    expect(visibleDocuments(a002, state).at(-1)).toMatchObject({
      receivedDate: '2026-03-30',
      document: { id: 'H7' },
    });

    r = answer(state, 'S5b');
    expect(r.feedback.score).toBeNull();
    expect(r.feedback.selfAssessment?.criteria).toHaveLength(3);
    state = r.state;

    expect(currentStep(a002, state)?.id).toBe('S6');
    const decided = submitDecision(a002, roundTrip(state), goodDecision);
    expect(decided.firedEvents).toEqual([]);
    expect(decided.state.status).toBe('inlamnat');
    expect(currentStep(a002, decided.state)).toBeNull();

    const { assessment } = decided;
    const failed = assessment.checks.filter((c) => !c.passed);
    expect(failed).toEqual([]);
    expect(assessment.passedChecks).toBe(assessment.totalChecks);
    expect(assessment.decisionDate).toBe('2026-03-30');
    expect(assessment.fee.lines).toEqual([
      { key: 'bygglov_tillbyggnad_16_49kvm', baseAmount: 9800, expectedAmount: 9800 },
    ]);
    expect(assessment.modelDecisionPath).toBe('handlingar/modell-beslut.md');
    expect(assessment.criteria).toHaveLength(8);
    expect(decided.feedback.decision).toEqual(assessment);
  });
});

describe('A002: fel väg (bevilja utan grannehörande)', () => {
  function toDecisionWithoutHearing(seed: number): CaseState {
    let state = startCase(a002, { seed, startedAt: STARTED });
    for (const id of ['S1', 'S2', 'S3', 'S4']) state = answer(state, id).state;
    const skipped = skipStep(a002, state, 'S5');
    expect(skipped.firedEvents).toEqual([]);
    expect(skipped.feedback).toMatchObject({ skipped: true, missed: true });
    expect(skipped.state.queue).not.toContain('S5b');
    return skipped.state;
  }

  it('fires E3 and inserts the follow-up step S7', () => {
    const state = toDecisionWithoutHearing(NO_E4);
    expect(evaluateTriggers(a002, state).map((e) => e.id)).toEqual([]);
    expect(evaluateTriggers(a002, state, { decision: 'bevilja' }).map((e) => e.id)).toEqual(['E3']);

    const draft: DecisionDraft = {
      ...goodDecision,
      expediering: goodDecision.expediering.filter((r) => !r.mottagare.includes('Björken 8')),
    };
    const decided = submitDecision(a002, state, draft);
    expect(decided.firedEvents).toEqual(['E3']);
    expect(decided.state.queue.at(-1)).toBe('S7');
    expect(currentStep(a002, decided.state)?.id).toBe('S7');
    expect(diary(decided.state).at(-1)).toMatchObject({ kind: 'handelse', eventId: 'E3' });

    const notice = decided.assessment.checks.find((c) => c.id === 'underrattelse');
    expect(notice).toMatchObject({ passed: false, severity: 'warning' });
    expect(notice?.message).toContain('Beslut utan underrättelse enligt 9 kap. 94 §');
    // No neighbour statement arrived, so there is nobody with objections to serve.
    expect(decided.assessment.checks.some((c) => c.id === 'delgivning_grannar')).toBe(false);
  });

  it('treats a hearing that leaves out a neighbour as missed', () => {
    let state = startCase(a002, { seed: NO_E4, startedAt: STARTED });
    for (const id of ['S1', 'S2', 'S3', 'S4']) state = answer(state, id).state;
    const partial = submitStep(a002, state, 'S5', { type: 'urval', selected: [0, 2, 3] });
    expect(partial.feedback.missed).toBe(true);
    expect(partial.firedEvents).toEqual(['E2']);
    state = submitStep(a002, partial.state, 'S5b', answers.S5b as StepAnswer).state;
    const decided = submitDecision(a002, state, goodDecision);
    expect(decided.firedEvents).toEqual(['E3']);
    expect(decided.assessment.checks.find((c) => c.id === 'underrattelse')?.details).toEqual([
      'Underrättades inte: Björken 8 (öster)',
    ]);
  });

  it('does not fire E3 when the decision is to refuse', () => {
    const state = toDecisionWithoutHearing(NO_E4);
    const decided = submitDecision(a002, state, { ...goodDecision, utfall: 'avsla' });
    expect(decided.firedEvents).toEqual([]);
    expect(decided.assessment.checks.find((c) => c.id === 'utfall')).toMatchObject({
      passed: false,
    });
  });
});

describe('A002: slumpvägen (byggstart före startbesked)', () => {
  it('uses fixed draws per seed', () => {
    expect(randomDraw(NO_E4, 'E4')).toBeGreaterThanOrEqual(0.3);
    expect(randomDraw(WITH_E4, 'E4')).toBeLessThan(0.3);
    expect(randomDraw(WITH_E4, 'E4')).toBe(randomDraw(WITH_E4, 'E4'));
  });

  it('fires E4 after a granted permit with the right seed', () => {
    let state = startCase(a002, { seed: WITH_E4, startedAt: STARTED });
    for (const id of ['S1', 'S2', 'S3', 'S4', 'S5', 'S5b']) state = answer(state, id).state;
    const decided = submitDecision(a002, state, goodDecision);
    expect(decided.firedEvents).toEqual(['E4']);
    expect(decided.state.simDate).toBe('2026-04-20');
    expect(currentStep(a002, decided.state)?.id).toBe('S8');

    const tillsyn = submitStep(a002, decided.state, 'S8', {
      type: 'fraga',
      answer: { type: 'flerval', selected: 1 },
    });
    expect(tillsyn.feedback).toMatchObject({
      score: 1,
      lawRefs: expect.arrayContaining(['PBL 11 kap. 51 §']),
    });
    expect(currentStep(a002, tillsyn.state)).toBeNull();
    // Fired at most once: nothing fires again.
    expect(evaluateTriggers(a002, tillsyn.state)).toEqual([]);

    // Time after the decision does not make the (met) 99 § deadline run out in the diary.
    const later = advanceDays(tillsyn.state, 60);
    expect(later.diary.filter((e) => e.kind === 'frist' && e.text.includes('löpte ut'))).toEqual(
      [],
    );
  });

  it('inserts follow-up steps in file order when E3 and E4 fire together', () => {
    let state = startCase(a002, { seed: WITH_E4, startedAt: STARTED });
    for (const id of ['S1', 'S2', 'S3', 'S4']) state = answer(state, id).state;
    state = skipStep(a002, state, 'S5').state;
    const decided = submitDecision(a002, state, goodDecision);
    expect(decided.firedEvents).toEqual(['E3', 'E4']);
    expect(decided.state.queue.slice(-2)).toEqual(['S7', 'S8']);
  });
});

describe('state handling', () => {
  it('survives JSON serialisation at every step and can be restored', () => {
    let state = startCase(a002, { seed: 'frö', startedAt: new Date(STARTED) });
    for (const id of ['S1', 'S2', 'S3', 'S4', 'S5', 'S5b']) {
      const copy = roundTrip(state);
      expect(copy).toEqual(state);
      const restored = restoreCaseState(a002, copy);
      expect(restored).toEqual({ ok: true, state });
      state = answer(copy, id).state;
    }
    const decided = submitDecision(a002, roundTrip(state), goodDecision).state;
    expect(roundTrip(decided)).toEqual(decided);
    expect(restoreCaseState(a002, roundTrip(decided))).toMatchObject({ ok: true });
  });

  it('rejects broken or foreign states', () => {
    const state = startCase(a002, { seed: 1 });
    expect(restoreCaseState(a002, { nope: true })).toMatchObject({ ok: false });
    expect(restoreCaseState(a002, { ...state, caseId: 'A999' })).toMatchObject({ ok: false });
    expect(restoreCaseState(a002, { ...state, queue: ['S1', 'S99'] })).toMatchObject({
      ok: false,
      reason: expect.stringContaining('S99'),
    });
  });

  it('never mutates its input', () => {
    const state = startCase(a002, { seed: 1, startedAt: STARTED });
    const before = roundTrip(state);
    answer(state, 'S1');
    skipStep(a002, state, 'S1');
    markDocumentSeen(state, 'H1');
    expect(state).toEqual(before);
  });

  it('refuses actions on the wrong step or with the wrong answer type', () => {
    const state = startCase(a002, { seed: 1, startedAt: STARTED });
    const code = (fn: () => unknown) => {
      try {
        fn();
      } catch (error) {
        return error instanceof CaseEngineError ? error.code : 'other';
      }
      return 'none';
    };
    expect(code(() => submitStep(a002, state, 'S2', answers.S2 as StepAnswer))).toBe(
      'not_current_step',
    );
    expect(code(() => submitStep(a002, state, 'S42', answers.S2 as StepAnswer))).toBe(
      'unknown_step',
    );
    expect(code(() => submitStep(a002, state, 'S1', answers.S2 as StepAnswer))).toBe(
      'answer_type_mismatch',
    );
    expect(code(() => submitDecision(a002, state, emptyDecisionDraft()))).toBe(
      'not_a_decision_step',
    );
    const foreign = startCase({ ...a002, id: 'A003' }, { seed: 1 });
    expect(code(() => submitStep(a002, foreign, 'S1', answers.S1 as StepAnswer))).toBe(
      'wrong_case',
    );
  });

  it('keeps the diary chronological and marks documents as seen', () => {
    let state = startCase(a002, { seed: 1, startedAt: STARTED });
    for (const id of ['S1', 'S2', 'S3', 'S4', 'S5']) state = answer(state, id).state;
    const entries = diary(state);
    const dates = entries.map((e) => e.date);
    expect([...dates].sort()).toEqual(dates);
    expect(entries[0]?.kind).toBe('registrering');
    expect(entries.filter((e) => e.kind === 'handling').map((e) => e.documentId)).toEqual([
      'H1',
      'H2',
      'H3',
      'H4',
      'H9',
      'H5',
      'H6',
      'H7',
    ]);
    expect(entries.some((e) => e.text.includes('9 kap. 91 §'))).toBe(true);
    const seen = markDocumentSeen(state, 'H7');
    expect(visibleDocuments(a002, seen).find((d) => d.document.id === 'H7')?.unseen).toBe(false);
  });
});
