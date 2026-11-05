/**
 * Test helpers for the tutor: A002 driven to the decision step and to a submitted decision.
 * Only imported by tests (loading the case uses node:fs).
 */
import type { CaseFile } from '@bygglov/content-schema';
import {
  currentStep,
  startCase,
  submitDecision,
  submitStep,
  type CaseState,
  type DecisionDraft,
  type StepAnswer,
} from '@/engine';
import { loadA002 } from '@/engine/cases/a002.fixture';

export const a002: CaseFile = loadA002();

const answers: Record<string, StepAnswer> = {
  S1: { type: 'checklista', marks: [true, true, true, false, false, false, false] },
  S2: {
    type: 'skrivelse',
    text: 'Föreläggande: komplettera med planritning inom tre veckor.',
    checkedCriteria: [0, 1],
  },
  S3: {
    type: 'berakning',
    values: {
      byggnadsarea_efter: '138',
      byggnadsarea_procent: '18',
      byggnadshojd: '4,9',
      prickmark_kvm: 3.5,
    },
  },
  S4: { type: 'fraga', answer: { type: 'flerval', selected: 1 } },
  S5: { type: 'urval', selected: [0, 1, 2, 3] },
  S5b: { type: 'fraga', answer: { type: 'oppen', text: 'Ingen betydande olägenhet.' } },
};

export const draftDecision: DecisionDraft = {
  utfall: 'avsla',
  lagstod: ['PBL 9 kap. 56 §'],
  motivering: 'Min egen motivering om höjden.',
  villkor_upplysningar: '',
  avgift: 9800,
  overklagandehanvisning: true,
  expediering: [{ mottagare: 'Sökanden', satt: 'delges' }],
};

/** A002 with every step before the decision answered. */
export function a002AtDecision(): CaseState {
  let state = startCase(a002, { seed: 1, startedAt: '2026-11-04T10:00:00.000Z' });
  for (let guard = 0; guard < 20; guard++) {
    const step = currentStep(a002, state);
    if (!step || step.typ === 'beslut') return state;
    const answer = answers[step.id];
    if (!answer) throw new Error(`no answer for ${step.id}`);
    state = submitStep(a002, state, step.id, answer).state;
  }
  throw new Error('A002 did not reach the decision');
}

/** A002 with the decision submitted. */
export function a002Decided(): CaseState {
  return submitDecision(a002, a002AtDecision(), draftDecision).state;
}

export { multipleChoice } from './test-question';
