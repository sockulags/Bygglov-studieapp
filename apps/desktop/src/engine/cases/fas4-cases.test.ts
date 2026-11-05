// @vitest-environment node
// A004–A006 played along the main path with the answers in each case's own facit: every step
// is graded right, the events fire, the dates fall on weekdays and the model decisions pass.
import type { CaseFile, CaseStep } from '@bygglov/content-schema';
import { describe, expect, it } from 'vitest';
import { loadCaseYaml } from './a002.fixture';
import { caseDeadline } from './deadline';
import { emptyDecisionDraft } from './decision';
import { currentStep, extendDeadline, startCase, submitDecision, submitStep } from './engine';
import { renderCaseTexts } from './templates';
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

describe('A004, tillsyn: garage byggt större än lovet', () => {
  const a004 = loadCaseYaml('A004-tillsyn-garage-tallen-9');
  const draft = base({
    utfall: 'avsla',
    lagstod: ['PBL 9 kap. 56 §', 'PBL 9 kap. 60 §', 'PBL 11 kap. 51 §'],
    avgift: 5200,
    expediering: [
      { mottagare: 'Henrik Ström och Lena Ström', satt: 'delges' },
      { mottagare: 'Margareta Lind, anmälare', satt: 'meddelande' },
    ],
  });

  it('has no 99 § deadline until the application for a retroactive permit comes in', () => {
    const start = startCase(a004, { seed: 1 });
    expect(start.supervision).toBe(true);
    expect(caseDeadline(start)).toMatchObject({ basis: 'tillsyn', deadlineDate: null });
    expect(start.diary.some((e) => e.text.includes('Ett tillsynsärende har ingen tidsfrist'))).toBe(
      true,
    );
    expect(() => extendDeadline(start, 2, 'Skäl')).toThrow();
  });

  it('plays to the decision on 15 October 2026 with all checks passed', () => {
    const played = playCase(a004, draft);
    expect(played.decisionDate).toBe('2026-10-15');
    expect(played.passed).toBe(played.total);
    // The owners change the application on their own initiative on 9 October (E3), which
    // restarts the ten weeks (9 kap. 99 § första stycket 2).
    expect(caseDeadline(played.state)).toMatchObject({
      basis: 'andring_pa_sokandens_initiativ',
      startDate: '2026-10-09',
      deadlineDate: '2026-12-18',
    });
    expect(played.state.firedEvents.map((e) => e.eventId)).toEqual(['E1', 'E2', 'E3']);
    expect(arrivals(played.state)).toMatchObject({
      E1: '2026-09-04',
      E2: '2026-09-25',
      E3: '2026-10-09',
    });
    for (const [id, date] of Object.entries(arrivals(played.state))) {
      expect(isWeekday(date), id).toBe(true);
    }
  });
});

describe('A005, restaurang i en kulturhistoriskt värdefull byggnad', () => {
  const a005 = loadCaseYaml('A005-restaurang-kopparslagaren-3');
  it('restarts the clock on the revision and decides within it', () => {
    const played = playCase(
      a005,
      base({
        utfall: 'bevilja_med_villkor',
        lagstod: ['PBL 9 kap. 56 §', 'PBL 9 kap. 105 §'],
        avgift: 15800,
        expediering: [
          { mottagare: 'Bistro Kopparn AB', satt: 'delges' },
          { mottagare: 'Fastighets AB Kopparslagaren', satt: 'delges' },
          { mottagare: 'Ägarna till grannfastigheterna och Ingrid Ståhl', satt: 'meddelande' },
        ],
      }),
    );
    expect(played.decisionDate).toBe('2026-06-08');
    expect(caseDeadline(played.state)).toMatchObject({
      basis: 'andring_pa_sokandens_initiativ',
      deadlineDate: '2026-07-30',
    });
    expect(played.passed).toBe(played.total);
    for (const [id, date] of Object.entries(arrivals(played.state))) {
      expect(isWeekday(date), id).toBe(true);
    }
  });
});

describe('A006, flerbostadshus med överklagande', () => {
  const a006 = loadCaseYaml('A006-flerbostadshus-humlan-3');
  it('lets the appeal and the county board decision come in on weekdays', () => {
    const played = playCase(
      a006,
      base({
        utfall: 'bevilja_med_villkor',
        lagstod: ['PBL 9 kap. 56 §', 'PBL 9 kap. 60 §', 'PBL 9 kap. 82 §'],
        avgift: 68400,
        expediering: [
          { mottagare: 'Humlegården Bygg AB', satt: 'delges' },
          { mottagare: 'Bostadsrättsföreningen Getingen', satt: 'delges' },
          { mottagare: 'Ahmed och Sara Karimi', satt: 'meddelande' },
          { mottagare: 'Åkerslunda Bostäder AB', satt: 'meddelande' },
          { mottagare: 'Gunnar Holmberg', satt: 'meddelande' },
          { mottagare: 'Åkerslunda kommun', satt: 'meddelande' },
        ],
      }),
    );
    expect(played.decisionDate).toBe('2026-03-23');
    expect(played.passed).toBe(played.total);
    const fired = arrivals(played.state);
    expect(fired).toMatchObject({ E1: '2026-03-12', E2: '2026-04-14', E3: '2026-06-25' });
    for (const date of Object.values(fired)) expect(isWeekday(date)).toBe(true);
    const view = renderCaseTexts(a006, played.state);
    // Steps (also inserted ones) are rendered for display; messages when the event happens.
    const shown = [view.steg, view.handelser.map((e) => e.effekt.nytt_steg), played.state.diary];
    expect(JSON.stringify(shown)).not.toContain('{{');
  });
});
