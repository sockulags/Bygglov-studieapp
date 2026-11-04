// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CaseFile } from '@bygglov/content-schema';
import { createMemoryDataStore, setDataStore, type DataStore } from '@/data';
import { emptyDecisionDraft, startCase, submitStep, type DecisionDraft } from '@/engine';
import { loadA002 } from '@/engine/cases/a002.fixture';
import {
  closeCase,
  dismissCaseOutcome,
  flushCaseWrites,
  markCaseDocumentSeen,
  openCase,
  saveStepDraft,
  selfAssessCaseStep,
  setCaseNotes,
  skipCaseStep,
  startNewCase,
  submitCaseDecision,
  submitCaseStep,
  useCaseStore,
} from './case-store';
import { planCaseWrites } from './case-writes';

const a002: CaseFile = loadA002();
/** randomDraw for E4 is 0.319 with seed 1, so no "byggstart" event after the decision. */
const SEED = 1;
const STARTED = '2026-11-04T10:00:00.000Z';

const decision: DecisionDraft = {
  ...emptyDecisionDraft(),
  lagstod: ['PBL 9 kap. 56 §', 'PBL 9 kap. 60 §'],
  motivering: 'Avvikelserna är små och förenliga med planens syfte.',
  villkor_upplysningar: 'Startbesked krävs. Lovet upphör att gälla efter två år (giltighetstid).',
  avgift: 9800,
  overklagandehanvisning: true,
  expediering: [
    { mottagare: 'Sökanden', satt: 'delges' },
    { mottagare: 'Fastighetsägaren', satt: 'delges' },
    { mottagare: 'Ägaren till Björken 8', satt: 'delges' },
  ],
};

let store: DataStore;

beforeEach(() => {
  store = createMemoryDataStore();
  setDataStore(store);
  closeCase();
});

afterEach(async () => {
  await flushCaseWrites();
  setDataStore(null);
  closeCase();
});

function active() {
  const value = useCaseStore.getState().active;
  if (!value) throw new Error('no active case');
  return value;
}

/** Plays S1–S5b along the expected path. */
function playUntilDecision() {
  submitCaseStep(a002, 'S1', {
    type: 'checklista',
    marks: [true, true, true, false, false, false, false],
  });
  submitCaseStep(a002, 'S2', { type: 'skrivelse', text: 'Föreläggande om komplettering.' });
  submitCaseStep(a002, 'S3', {
    type: 'berakning',
    values: {
      byggnadsarea_efter: '138',
      byggnadsarea_procent: '18',
      byggnadshojd: '4,9',
      prickmark_kvm: '3,5',
    },
  });
  submitCaseStep(a002, 'S4', { type: 'fraga', answer: { type: 'flerval', selected: 0 } });
  submitCaseStep(a002, 'S5', { type: 'urval', selected: [0, 1, 2, 3] });
  submitCaseStep(a002, 'S5b', {
    type: 'fraga',
    answer: { type: 'oppen', text: 'Skuggningen är inte en betydande olägenhet.' },
  });
}

describe('case store', () => {
  it('starts a case and stores the whole engine state on the status row', async () => {
    startNewCase(a002, { seed: SEED, startedAt: STARTED });
    await flushCaseWrites();
    const row = await store.cases.getCaseStatus('A002');
    expect(row).toMatchObject({
      caseId: 'A002',
      status: 'in_progress',
      currentStepId: 'S1',
      simDate: '2026-03-02',
      startedAt: STARTED,
      notes: '',
    });
    expect(row?.state).toEqual(active().state);
  });

  it('writes steps, events and the new state after every action', async () => {
    startNewCase(a002, { seed: SEED, startedAt: STARTED });
    const s1 = submitCaseStep(a002, 'S1', {
      type: 'checklista',
      marks: [true, true, true, false, false, false, false],
    });
    expect(s1?.feedback.outcome).toBe('correct');
    dismissCaseOutcome();
    const s2 = submitCaseStep(a002, 'S2', { type: 'skrivelse', text: 'Föreläggande.' });
    // E1: the completion arrives with H5 and H6, 14 days later.
    expect(s2?.firedEvents).toEqual(['E1']);
    expect(s2?.newDocumentIds).toEqual(['H5', 'H6']);
    expect(s2?.newEntries.some((e) => e.kind === 'handelse')).toBe(true);
    await flushCaseWrites();

    const steps = await store.cases.listSteps('A002');
    expect(steps.map((s) => [s.stepId, s.points])).toEqual([
      ['S1', 1],
      ['S2', null],
    ]);
    expect(steps.every((s) => s.completedAt !== null)).toBe(true);
    expect((await store.cases.listEvents('A002')).map((e) => [e.eventId, e.simDate])).toEqual([
      ['E1', '2026-03-02'],
    ]);
    expect(await store.cases.getCaseStatus('A002')).toMatchObject({
      currentStepId: 'S3',
      simDate: '2026-03-16',
    });

    // Self-assessment of the writing step updates the stored points.
    selfAssessCaseStep(a002, 'S2', [0, 1, 2, 3]);
    await flushCaseWrites();
    expect((await store.cases.listSteps('A002')).find((s) => s.stepId === 'S2')?.points).toBe(0.8);
  });

  it('continues the next day: state, notes and drafts are read back', async () => {
    startNewCase(a002, { seed: SEED, startedAt: STARTED });
    submitCaseStep(a002, 'S1', {
      type: 'checklista',
      marks: [true, true, true, false, false, false, false],
    });
    markCaseDocumentSeen(a002, 'H2');
    setCaseNotes(a002, 'Fråga pappa om prickmarken.');
    saveStepDraft(a002, 'S2', { text: 'Halvfärdigt föreläggande' });
    await flushCaseWrites();
    const before = active().state;

    closeCase();
    await openCase(a002);
    expect(useCaseStore.getState().load).toEqual({ status: 'ready', caseId: 'A002' });
    const restored = active();
    expect(restored.state).toEqual(before);
    expect(restored.state.visibleDocuments.find((d) => d.documentId === 'H2')?.unseen).toBe(false);
    expect(restored.notes).toBe('Fråga pappa om prickmarken.');
    expect(restored.drafts).toEqual({ S2: { text: 'Halvfärdigt föreläggande' } });
    expect(restored.lastOutcome).toBeNull();
  });

  it('reports a case that is not started, and a stored state that no longer fits', async () => {
    await openCase(a002);
    expect(useCaseStore.getState().load).toEqual({ status: 'not_started', caseId: 'A002' });

    await store.cases.startCase({
      caseId: 'A002',
      currentStepId: 'S1',
      simDate: '2026-03-02',
      state: { ...startCase(a002, { seed: SEED }), queue: ['S1', 'S99'] },
    });
    closeCase();
    await openCase(a002);
    const load = useCaseStore.getState().load;
    expect(load.status).toBe('invalid');
  });

  it('submits the decision: decision row, submittedAt, status and comparison data', async () => {
    startNewCase(a002, { seed: SEED, startedAt: STARTED });
    playUntilDecision();
    saveStepDraft(a002, 'S6', { decision: { ...decision, motivering: 'Utkast' } });
    const outcome = submitCaseDecision(a002, decision);
    expect(outcome?.stepId).toBe('S6');
    expect(outcome?.feedback.decision?.expectedOutcome).toBe('bevilja');
    await flushCaseWrites();

    const decisions = await store.cases.listDecisions('A002');
    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.decision).toEqual(decision);
    expect(active().decisionIds).toEqual([decisions[0]?.id]);
    expect(active().drafts).toEqual({});
    const row = await store.cases.getCaseStatus('A002');
    expect(row?.status).toBe('submitted');
    expect(row?.submittedAt).not.toBeNull();
    // The stored draft row of S6 was replaced by the completed step.
    const s6 = (await store.cases.listSteps('A002')).find((s) => s.stepId === 'S6');
    expect(s6?.completedAt).not.toBeNull();
    expect(s6?.answer).toEqual({ type: 'beslut', draft: decision });
  });

  it('skips a step and plays "bevilja utan grannehörande" into the appeal', async () => {
    startNewCase(a002, { seed: SEED, startedAt: STARTED });
    submitCaseStep(a002, 'S1', {
      type: 'checklista',
      marks: [true, true, true, false, false, false, false],
    });
    submitCaseStep(a002, 'S2', { type: 'skrivelse', text: 'x' });
    submitCaseStep(a002, 'S3', { type: 'berakning', values: {} });
    submitCaseStep(a002, 'S4', { type: 'fraga', answer: { type: 'flerval', selected: 0 } });
    const skipped = skipCaseStep(a002, 'S5');
    expect(skipped?.feedback.skipped).toBe(true);
    const outcome = submitCaseDecision(a002, decision);
    expect(outcome?.firedEvents).toContain('E3');
    expect(active().state.queue.at(-1)).toBe('S7');
    await flushCaseWrites();
    expect((await store.cases.listEvents('A002')).map((e) => e.eventId)).toEqual(['E1', 'E3']);
  });

  it('starts over: everything stored for the case is removed', async () => {
    startNewCase(a002, { seed: SEED, startedAt: STARTED });
    playUntilDecision();
    submitCaseDecision(a002, decision);
    setCaseNotes(a002, 'gammalt');
    await flushCaseWrites();

    startNewCase(a002, { seed: 2, startedAt: '2026-11-05T10:00:00.000Z' });
    await flushCaseWrites();
    expect(await store.cases.listSteps('A002')).toEqual([]);
    expect(await store.cases.listEvents('A002')).toEqual([]);
    expect(await store.cases.listDecisions('A002')).toEqual([]);
    expect(await store.cases.getCaseStatus('A002')).toMatchObject({
      status: 'in_progress',
      currentStepId: 'S1',
      notes: '',
      startedAt: '2026-11-05T10:00:00.000Z',
    });
  });

  it('refuses an answer for another step without changing anything', () => {
    startNewCase(a002, { seed: SEED, startedAt: STARTED });
    const before = active().state;
    expect(submitCaseStep(a002, 'S3', { type: 'berakning', values: {} })).toBeNull();
    expect(useCaseStore.getState().actionError).toMatch(/inte det aktuella steget/);
    expect(active().state).toBe(before);
  });
});

describe('planCaseWrites', () => {
  it('maps an engine transition to status, step, event and decision rows', () => {
    const start = startCase(a002, { seed: SEED, startedAt: STARTED });
    const s1 = submitStep(a002, start, 'S1', {
      type: 'checklista',
      marks: [true, true, true, false, false, false, false],
    }).state;
    const s2 = submitStep(a002, s1, 'S2', { type: 'skrivelse', text: 'x' }).state;
    const writes = planCaseWrites(s1, s2, '2026-11-04T12:00:00.000Z');
    expect(writes.map((w) => w.kind)).toEqual(['status', 'step', 'event']);
    expect(writes[0]).toEqual({
      kind: 'status',
      patch: { status: 'in_progress', currentStepId: 'S3', simDate: '2026-03-16', state: s2 },
    });
    expect(writes[1]).toMatchObject({
      kind: 'step',
      row: { caseId: 'A002', stepId: 'S2', completedAt: '2026-11-04T12:00:00.000Z' },
    });
    expect(writes[2]).toEqual({
      kind: 'event',
      row: { caseId: 'A002', eventId: 'E1', simDate: '2026-03-02' },
    });
    // Nothing but the status changes when only a document is marked as read.
    const seen = {
      ...s2,
      visibleDocuments: s2.visibleDocuments.map((d) => ({ ...d, unseen: false })),
    };
    expect(planCaseWrites(s2, seen, 'x').map((w) => w.kind)).toEqual(['status']);
  });
});
