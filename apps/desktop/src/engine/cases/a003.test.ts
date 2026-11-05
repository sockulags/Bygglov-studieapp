// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { loadCaseYaml } from './a002.fixture';
import { caseDeadline } from './deadline';
import { currentStep, extendDeadline, startCase, submitDecision, submitStep } from './engine';
import { renderCaseTexts, renderDocumentText } from './templates';
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

/**
 * A003 played through the neighbour notice (S4), which fires E1 and E2. `resting` false
 * answers S3 wrongly, so the case is never declared resting.
 */
function throughNotice(resting = true): CaseState {
  return play(startCase(a003, { seed: 1 }), [
    ['S1', { type: 'checklista', marks: [true, true, true, true, true, true, true, false, false] }],
    ['S2', { type: 'fraga', answer: { type: 'flersvar', selected: [0, 1, 2] } }],
    ['S3', { type: 'fraga', answer: { type: 'flerval', selected: resting ? 0 : 4 } }],
    ['S4', { type: 'urval', selected: [0, 1, 2, 3] }],
  ]);
}

/** Through the communication (S6), ready for the decision. */
function beforeDecision(state: CaseState = throughNotice()): CaseState {
  return play(state, [
    ['S4b', { type: 'fraga', answer: { type: 'flerval', selected: 1 } }],
    ['S5', { type: 'fraga', answer: { type: 'oppen', text: 'Platsen är lämplig.' } }],
    ['S6', { type: 'skrivelse', text: 'Kommunicering.' }],
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
    const state = throughNotice(false);
    expect(state.firedEvents.map((e) => e.eventId)).toEqual(['E1', 'E2']);
    expect(state.suspensions).toEqual([]);
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
    const state = beforeDecision();
    const { assessment } = submitDecision(a003, state, goodDecision);
    expect(assessment.decisionDate).toBe('2026-10-12');
    expect(assessment.fee.deadline.deadlineDate).toBe('2026-12-03');
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

describe('A003, vilande i väntan på strandskyddsdispens (9 kap. 102 §)', () => {
  it('declares the case resting when S3 is answered right, and pauses the deadline', () => {
    const state = play(startCase(a003, { seed: 1 }), [
      [
        'S1',
        { type: 'checklista', marks: [true, true, true, true, true, true, true, false, false] },
      ],
      ['S2', { type: 'fraga', answer: { type: 'flersvar', selected: [0, 1, 2] } }],
      ['S3', { type: 'fraga', answer: { type: 'flerval', selected: 0 } }],
    ]);
    expect(state.suspensions).toEqual([
      { reason: 'strandskydd', from: '2026-08-20', to: null, stepId: 'S3' },
    ]);
    expect(state.deadlineDate).toBeNull();
    expect(caseDeadline(state)).toMatchObject({ suspendedSince: '2026-08-20', deadlineDate: null });
    const entry = state.diary.at(-1);
    expect(entry).toMatchObject({ kind: 'frist', date: '2026-08-20', stepId: 'S3' });
    expect(entry?.text).toMatch(/^Ärendet förklaras vilande/);
    expect(entry?.text).toContain('9 kap. 102 § första stycket 1');
    expect(entry?.text).toContain('12 kap. 8 a §');
  });

  it('ends the resting when the exemption decision comes in and does not count the days', () => {
    const state = throughNotice();
    expect(state.suspensions).toEqual([
      { reason: 'strandskydd', from: '2026-08-20', to: '2026-09-24', stepId: 'S3' },
    ]);
    // The ten weeks run from 2026-09-10 (99 § första stycket 2); 14 resting days after that.
    expect(caseDeadline(state)).toMatchObject({
      basis: 'andring_pa_sokandens_initiativ',
      startDate: '2026-09-10',
      suspendedSince: null,
      suspendedDays: 14,
      deadlineDate: '2026-12-03',
    });
    expect(state.deadlineDate).toBe('2026-12-03');
    const texts = state.diary.map((e) => e.text);
    // The new start is noted while the case still rests (100 § 2) …
    const amendment = state.diary.find((e) => e.kind === 'frist' && e.date === '2026-09-10');
    expect(amendment?.text).toContain('Ny tidsfrist');
    expect(amendment?.text).toContain('vilande sedan 2026-08-20');
    // … and the end of the resting with the new deadline.
    const ended = state.diary.find((e) => e.text.startsWith('Vilandeförklaringen upphör'));
    expect(ended).toMatchObject({ date: '2026-09-24', eventId: 'E2' });
    expect(ended?.text).toContain('35 dagar');
    expect(texts.some((t) => t.includes('löper ut 2026-12-03'))).toBe(true);
    // Stored and restored with the case.
    const restored = restoreCaseState(a003, JSON.parse(JSON.stringify(state)));
    expect(restored.ok && restored.state.suspensions).toEqual(state.suspensions);
  });

  it('gives no reduction for a decision that is late only because of the resting', () => {
    // 2026-11-30 is after 2026-11-19 (99 §) but before 2026-12-03 (with the resting days).
    const state = { ...beforeDecision(), simDate: '2026-11-30' };
    const { assessment } = submitDecision(a003, state, goodDecision);
    expect(assessment.fee.weeksOverdue).toBe(0);
    expect(assessment.fee.explanation.join(' ')).toContain('vilande');
    // Without the resting the same day is two started weeks late.
    const notResting = { ...beforeDecision(throughNotice(false)), simDate: '2026-11-30' };
    expect(submitDecision(a003, notResting, goodDecision).assessment.fee.weeksOverdue).toBe(2);
  });

  it('extends the deadline once with a reason in the diary (99 § andra stycket, 100 § 3)', () => {
    const extended = extendDeadline(
      throughNotice(),
      4,
      'Remissvaret om avloppet behöver kompletteras',
    );
    expect(extended.deadlineDate).toBe('2026-12-31');
    expect(extended.extensionReason).toBe('Remissvaret om avloppet behöver kompletteras');
    const entry = extended.diary.find((e) => e.text.startsWith('Tidsfristen förlängs'));
    expect(entry?.text).toContain('Skäl: Remissvaret om avloppet behöver kompletteras.');
    expect(entry?.text).toContain('99 § andra stycket');
    expect(entry?.text).toContain('100 § 3');
    expect(() => extendDeadline(extended, 1)).toThrow(/redan förlängts/);
  });
});

describe('A003, datum efter beslutet följer beslutsdagen (mallvariabler)', () => {
  /** Decides on `decisionDate`, then lets the appeal (E3) come in. */
  function appealed(decisionDate: string) {
    const state = { ...beforeDecision(), simDate: decisionDate };
    return submitDecision(a003, state, goodDecision).state;
  }

  it.each([
    // decision, announcement, appeal (19 days later), start of time, last day
    ['2026-10-12', '14 oktober 2026', '2 november 2026', '21 oktober 2026', '11 november 2026'],
    // Announced 2026-10-24: the last day 2026-11-21 is a Saturday, so the next weekday counts.
    ['2026-10-22', '24 oktober 2026', '12 november 2026', '31 oktober 2026', '23 november 2026'],
  ])('decision %s', (decisionDate, announced, appealIn, from, lastDay) => {
    const state = appealed(decisionDate);
    expect(state.firedEvents.map((e) => e.eventId)).toContain('E3');
    const message = state.diary.find((e) => e.eventId === 'E3' && e.kind === 'handelse');
    expect(message?.text).toContain(`kungjordes på kommunens anslagstavla den ${announced}`);
    expect(message?.text).not.toContain('{{');
    const view = renderCaseTexts(a003, state);
    const s8 = view.handelser.find((e) => e.id === 'E3')?.effekt.nytt_steg;
    expect(s8?.typ).toBe('fraga');
    if (s8?.typ !== 'fraga') return;
    expect(s8.fraga).toContain(`kungjordes den ${announced}`);
    expect(s8.fraga).toContain(`kom in till nämnden den ${appealIn}`);
    const right = s8.alternativ?.find((a) => a.ratt)?.text ?? '';
    expect(right).toContain(`räknas från den ${from}`);
    expect(right).toContain(`går ut den ${lastDay}`);
    // The appeal document is dated by its arrival and refers to the decision day.
    const h12 = state.visibleDocuments.find((d) => d.documentId === 'H12');
    const text = renderDocumentText(
      'Beslutet den {{beslutsdatum}}. Inkom {{inkomdatum|iso}}.',
      state,
      h12?.receivedDate ?? null,
    );
    expect(text).toBe(`Beslutet den ${formatDate(decisionDate)}. Inkom ${h12?.receivedDate}.`);
    expect(h12?.receivedDate).toBe(state.simDate);
  });
});

function formatDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const months = [
    'januari',
    'februari',
    'mars',
    'april',
    'maj',
    'juni',
    'juli',
    'augusti',
    'september',
    'oktober',
    'november',
    'december',
  ];
  return `${d} ${months[(m ?? 1) - 1]} ${y}`;
}
