// @vitest-environment node
// A007–A009 (fas 4b) played along the main path with the answers in each case's own facit:
// every step is graded right, the events fire on weekdays and the model decisions pass. A007
// is decided with the outcome "startbesked", which is checked against 10 kap. 24 § PBL.
import type { CaseFile, CaseStep, DecisionStep } from '@bygglov/content-schema';
import { describe, expect, it } from 'vitest';
import { loadCaseYaml } from './a002.fixture';
import { assessDecision, emptyDecisionDraft, isGrant, isStartNotice } from './decision';
import { currentStep, extendDeadline, startCase, submitDecision, submitStep } from './engine';
import { caseDeadline } from './deadline';
import { findStep } from './triggers';
import type { CaseState, DecisionDraft, StepAnswer } from './types';

/** The right answer to a step, from its facit. */
function rightAnswer(step: CaseStep): StepAnswer {
  const right = (alts: readonly { ratt?: boolean }[] | undefined) =>
    (alts ?? []).flatMap((a, i) => (a.ratt ? [i] : []));
  switch (step.typ) {
    case 'checklista':
      return { type: 'checklista', marks: step.poster.map((p) => p.finns) };
    case 'fraga':
      if (step.fragetyp === 'flerval') {
        return {
          type: 'fraga',
          answer: { type: 'flerval', selected: right(step.alternativ)[0] ?? null },
        };
      }
      if (step.fragetyp === 'flersvar') {
        return { type: 'fraga', answer: { type: 'flersvar', selected: right(step.alternativ) } };
      }
      if (step.fragetyp === 'sant_falskt') {
        return { type: 'fraga', answer: { type: 'sant_falskt', value: step.svar ?? null } };
      }
      return { type: 'fraga', answer: { type: 'oppen', text: step.modellsvar ?? 'Svar.' } };
    case 'berakning':
      return {
        type: 'berakning',
        values: Object.fromEntries(step.fragor.map((f) => [f.id, f.svar])),
      };
    case 'urval':
      return { type: 'urval', selected: right(step.alternativ) };
    case 'skrivelse':
      return { type: 'skrivelse', text: (step.bedomningspunkter ?? []).join('\n') };
    case 'beslut':
      throw new Error('Beslut spelas med submitDecision.');
  }
}

interface Played {
  state: CaseState;
  decisionDate: string;
  passed: number;
  total: number;
}

function playCase(caseFile: CaseFile, draft: DecisionDraft): Played {
  let state = startCase(caseFile, { seed: 1 });
  let decision: Played | null = null;
  for (let guard = 0; guard < 40; guard += 1) {
    const step = currentStep(caseFile, state);
    if (!step) break;
    if (step.typ === 'beslut') {
      const result = submitDecision(caseFile, state, draft);
      decision = {
        state: result.state,
        decisionDate: result.state.decisions[0]?.date ?? '',
        passed: result.assessment.passedChecks,
        total: result.assessment.totalChecks,
      };
      state = result.state;
      continue;
    }
    const outcome = submitStep(caseFile, state, step.id, rightAnswer(step));
    if (step.typ !== 'skrivelse' && !(step.typ === 'fraga' && step.fragetyp === 'oppen')) {
      expect(outcome.state.stepResults[step.id]?.outcome, `${caseFile.id} ${step.id}`).toBe(
        'correct',
      );
    }
    state = outcome.state;
  }
  expect(decision).not.toBeNull();
  // Every template variable in the diary has been filled in.
  expect(state.diary.filter((e) => e.text.includes('{{')).map((e) => e.text)).toEqual([]);
  return { ...(decision as Played), state };
}

/** The day each event's message reached the diary, after its `tid_framat_dagar`. */
function arrivals(state: CaseState): Record<string, string> {
  return Object.fromEntries(
    state.diary.flatMap((e) => (e.kind === 'handelse' && e.eventId ? [[e.eventId, e.date]] : [])),
  );
}

const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const isWeekday = (date: string) => weekday(date) !== 0 && weekday(date) !== 6;

const base = (overrides: Partial<DecisionDraft>): DecisionDraft => ({
  ...emptyDecisionDraft(),
  motivering: 'Motivering enligt bedömningspunkterna.',
  villkor_upplysningar:
    'Startbesked krävs innan åtgärden påbörjas. Kontrollansvarig krävs. Lovet upphör att gälla om ' +
    'åtgärden inte påbörjats inom två år och avslutats inom fem år från laga kraft.',
  overklagandehanvisning: true,
  ...overrides,
});

describe('A007, anmälan: eldstad och VA-servis, beslut med startbesked', () => {
  const a007 = loadCaseYaml('A007-anmalan-eldstad-ronnen-11');
  const draft = base({
    utfall: 'startbesked',
    lagstod: ['PBL 10 kap. 23 c §', 'PBL 10 kap. 24 §'],
    motivering:
      'Åtgärderna kräver anmälan. Kontrollplanen fastställs. Åtgärderna kan antas uppfylla kraven.',
    villkor_upplysningar:
      'Handlingar inför slutbesked: signerad kontrollplan och besiktningsprotokoll. Kaminen får inte ' +
      'tas i bruk förrän slutbesked getts. Startbeskedet gäller omedelbart och upphör att gälla två ' +
      'år efter att det gavs.',
    avgift: 4300,
    expediering: [{ mottagare: 'Hanna och Mikael Forsberg', satt: 'delges' }],
  });

  it('plays to a start notice within four weeks with all checks passed', () => {
    const played = playCase(a007, draft);
    expect(played.passed).toBe(played.total);
    expect(played.decisionDate <= '2026-10-21').toBe(true);
    // Four weeks from the completion on 23 September (6 kap. 5 § PBF, 9 kap. 99 § första
    // stycket 4 PBL), not ten.
    expect(played.state.notification).toBe(true);
    expect(caseDeadline(played.state)).toMatchObject({
      basis: 'komplettering',
      startDate: '2026-09-23',
      deadlineDate: '2026-10-21',
      notification: true,
    });
    expect(caseDeadline(played.state).explanation).toMatch(
      /^En anmälan ska avgöras inom fyra veckor/,
    );
    expect(caseDeadline(played.state).explanation).toContain('Fyraveckorsfristen');
    for (const date of Object.values(arrivals(played.state))) expect(isWeekday(date)).toBe(true);
  });

  it('checks a start notice by its own rules, not by those for a permit', () => {
    const state = startCase(a007, { seed: 1 });
    const step = findStep(a007, 'S5') as DecisionStep;
    const a = assessDecision(a007, step, draft, state);
    const ids = a.checks.map((c) => c.id);
    expect(ids).toContain('startbesked_kontrollplan');
    expect(ids).toContain('startbesked_slutbesked');
    expect(ids).not.toContain('upplysning_kontrollansvarig');
    expect(ids).not.toContain('delgivning_fastighetsagare');
    expect(a.checks.find((c) => c.id === 'utfall')).toMatchObject({ passed: true });
    expect(a.checks.find((c) => c.id === 'lagstod')?.message).toContain('10 kap. 23 c §');
    expect(a.checks.find((c) => c.id === 'overklagandehanvisning')?.lawRefs).toContain(
      'PBL 13 kap. 2 § 5',
    );
    // A permit is the wrong outcome, and a 9 kap. basis is not enough for a start notice.
    const permit = assessDecision(a007, step, { ...draft, utfall: 'bevilja' }, state);
    expect(permit.checks.find((c) => c.id === 'utfall')).toMatchObject({ passed: false });
    const wrongBasis = assessDecision(
      a007,
      step,
      { ...draft, lagstod: ['PBL 9 kap. 55 §'] },
      state,
    );
    expect(wrongBasis.checks.find((c) => c.id === 'lagstod')).toMatchObject({ passed: false });
    // Sending it is enough; the developer must be among the recipients.
    const sent = assessDecision(
      a007,
      step,
      { ...draft, expediering: [{ mottagare: 'Mikael Forsberg', satt: 'skickas' }] },
      state,
    );
    expect(sent.checks.find((c) => c.id === 'delgivning_sokande')).toMatchObject({ passed: true });
    const nobody = assessDecision(a007, step, { ...draft, expediering: [] }, state);
    expect(nobody.checks.find((c) => c.id === 'delgivning_sokande')).toMatchObject({
      passed: false,
    });
    // The extension is at most four weeks for a notification.
    expect(() => extendDeadline(state, 5, 'Skäl')).toThrow(/1–4 hela veckor/);
    expect(isStartNotice('startbesked')).toBe(true);
    expect(isGrant('startbesked')).toBe(false);
  });
});

describe('A008, marklov och trädfällning', () => {
  const a008 = loadCaseYaml('A008-marklov-eken-2');
  it('plays to a permit with conditions with all checks passed', () => {
    const played = playCase(
      a008,
      base({
        utfall: 'bevilja_med_villkor',
        lagstod: ['PBL 9 kap. 47 §', 'PBL 9 kap. 77 §', 'PBL 9 kap. 78 §', 'PBL 9 kap. 105 §'],
        avgift: 9200,
        expediering: [
          { mottagare: 'Tove och Ali Rahimi', satt: 'delges' },
          { mottagare: 'Gun och Sven-Erik Holmqvist, Eken 3', satt: 'delges' },
          { mottagare: 'Eken 1', satt: 'meddelande' },
          { mottagare: 'Eken 7', satt: 'meddelande' },
          { mottagare: 'Hasseln 4', satt: 'meddelande' },
          { mottagare: 'Åkerslunda 4:1', satt: 'meddelande' },
        ],
      }),
    );
    expect(played.passed).toBe(played.total);
    expect(played.state.firedEvents.map((e) => e.eventId)).toEqual(['E1', 'E2']);
    // {{frist}} in E1's message is the deadline after the completion the same event brings.
    const e1 = played.state.diary.find((e) => e.eventId === 'E1');
    expect(e1?.text).toContain('löper ut den 5 juni 2026');
    for (const date of Object.values(arrivals(played.state))) expect(isWeekday(date)).toBe(true);
  });
});

describe('A009, förhandsbesked för två tomter', () => {
  const a009 = loadCaseYaml('A009-forhandsbesked-kvarnbacken-1-7');
  it('plays through the decision and the appeal with all checks passed', () => {
    const played = playCase(
      a009,
      base({
        utfall: 'bevilja_med_villkor',
        lagstod: ['PBL 9 kap. 74 §', 'PBL 9 kap. 41 §', 'PBL 9 kap. 104 §'],
        avgift: 16000,
        expediering: [
          { mottagare: 'Erik och Annika Mattsson', satt: 'delges' },
          { mottagare: 'Gunnel och Rolf Åström, Kvarnbacken 1:12', satt: 'delges' },
          { mottagare: 'Kvarnbacken 1:9', satt: 'meddelande' },
          { mottagare: 'Kvarnbacken 1:4', satt: 'meddelande' },
          { mottagare: 'Kvarnbacken s:1', satt: 'meddelande' },
        ],
      }),
    );
    expect(played.decisionDate).toBe('2026-10-20');
    // A förhandsbesked is checked against 104 §, not against 105 § for a permit.
    const ids = played.state.decisions[0]?.assessment.checks.map((c) => c.id) ?? [];
    expect(ids).toContain('upplysning_forhandsbesked_giltighet');
    expect(ids).not.toContain('upplysning_kontrollansvarig');
    expect(
      played.state.diary.some((e) => e.text.includes('Ge positivt förhandsbesked med villkor')),
    ).toBe(true);
    expect(played.passed).toBe(played.total);
    expect(played.state.firedEvents.map((e) => e.eventId)).toEqual(['E1', 'E2', 'E3']);
    for (const date of Object.values(arrivals(played.state))) expect(isWeekday(date)).toBe(true);
  });
});
