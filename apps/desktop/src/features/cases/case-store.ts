import { create } from 'zustand';
import type { CaseFile } from '@bygglov/content-schema';
import { queryClient } from '@/app/query-client';
import { dataKeys, getDataStore } from '@/data';
import {
  CaseEngineError,
  DecisionDraftSchema,
  randomSeed,
  restoreCaseState,
  selfAssessStep,
  skipStep,
  startCase,
  submitDecision,
  submitStep,
  markDocumentSeen,
  toNewCaseStatus,
  type CaseState,
  type DecisionDraft,
  type DiaryEntry,
  type StepAnswer,
  type StepFeedback,
} from '@/engine';
import { planCaseWrites, type CaseWrite } from './case-writes';

/**
 * The case in progress (ärendet som är öppet). The case itself is the engine's pure
 * `CaseState`; this store adds what the view needs around it (the feedback of the last
 * action, notes, drafts) and does the I/O: after every action the whole state is written
 * to the data store, together with the step, event and decision rows (see case-writes.ts).
 * Everything is read back from the data store when the case is opened again, so the
 * learner can close the app in the middle of a case and continue the next day.
 */

/** What the last action led to, shown as feedback with "Nytt i diariet". */
export interface CaseOutcome {
  stepId: string;
  feedback: StepFeedback;
  firedEvents: string[];
  /** Documents that became visible with this action, in arrival order. */
  newDocumentIds: string[];
  /** Diary entries the action added (messages, time, deadline). */
  newEntries: DiaryEntry[];
}

/** Draft of an unfinished step: free text, or the decision form. */
export type StepDraft = { text: string } | { decision: DecisionDraft };

export interface ActiveCase {
  caseId: string;
  state: CaseState;
  notes: string;
  reflection: string;
  /** Unsaved work per step id, restored when the case is opened again. */
  drafts: Record<string, StepDraft>;
  /** Data-layer ids of the submitted decisions, oldest first (for export). */
  decisionIds: number[];
  lastOutcome: CaseOutcome | null;
}

export type CaseLoad =
  | { status: 'idle' }
  | { status: 'loading'; caseId: string }
  | { status: 'not_started'; caseId: string }
  | { status: 'ready'; caseId: string }
  /** The stored state no longer matches the content; the view offers a restart. */
  | { status: 'invalid'; caseId: string; reason: string }
  | { status: 'error'; caseId: string; message: string };

interface CaseStoreState {
  active: ActiveCase | null;
  load: CaseLoad;
  /** Set when writing to the data store failed; shown discreetly in the case view. */
  saveError: string | null;
  /** Set when the engine refused an action (should not happen through the UI). */
  actionError: string | null;
}

const SAVE_ERROR = 'Det senaste kunde inte sparas. Du kan fortsätta, men ladda inte om appen.';
/** Delay before notes and drafts are written, so typing does not write on every key. */
export const TEXT_SAVE_DELAY_MS = 700;

export const useCaseStore = create<CaseStoreState>()((): CaseStoreState => ({
  active: null,
  load: { status: 'idle' },
  saveError: null,
  actionError: null,
}));

/* ------------------------------------------------------------------- write queue */

let queue: Promise<void> = Promise.resolve();

/** Runs data-store writes one at a time, in order, and refreshes the data queries. */
function enqueue(task: () => Promise<void>): Promise<void> {
  queue = queue
    .then(task)
    .then(() => queryClient.invalidateQueries({ queryKey: dataKeys.all }))
    .catch((error: unknown) => {
      console.error('Kunde inte spara ärendet', error);
      useCaseStore.setState({ saveError: SAVE_ERROR });
    });
  return queue;
}

/** Debounced text writes (notes, reflection, drafts), keyed by what they write. */
const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; run: () => void }>();

function debounce(key: string, run: () => void): void {
  const existing = pending.get(key);
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => {
    pending.delete(key);
    run();
  }, TEXT_SAVE_DELAY_MS);
  pending.set(key, { timer, run });
}

function cancelPending(prefix: string): void {
  for (const [key, entry] of pending) {
    if (key.startsWith(prefix)) {
      clearTimeout(entry.timer);
      pending.delete(key);
    }
  }
}

/**
 * Writes pending text right away and resolves when everything queued so far has been
 * written. Used before leaving the case view, and by tests.
 */
export function flushCaseWrites(): Promise<void> {
  for (const [key, entry] of [...pending]) {
    clearTimeout(entry.timer);
    pending.delete(key);
    entry.run();
  }
  return queue;
}

async function runWrites(caseId: string, writes: readonly CaseWrite[]): Promise<void> {
  const store = await getDataStore();
  for (const write of writes) {
    switch (write.kind) {
      case 'status':
        await store.cases.updateCaseStatus(caseId, write.patch);
        break;
      case 'step':
        await store.cases.saveStep(write.row);
        break;
      case 'event':
        await store.cases.recordEvent(write.row);
        break;
      case 'decision': {
        const decision = await store.cases.submitDecision(write.row);
        useCaseStore.setState((s) =>
          s.active?.caseId === caseId
            ? { active: { ...s.active, decisionIds: [...s.active.decisionIds, decision.id] } }
            : {},
        );
        break;
      }
    }
  }
}

/* ------------------------------------------------------------------------- loading */

function readDraft(answer: unknown): StepDraft | null {
  if (typeof answer !== 'object' || answer === null || !('draft' in answer)) return null;
  const draft = (answer as { draft: unknown }).draft;
  if (typeof draft !== 'object' || draft === null) return null;
  if ('text' in draft && typeof draft.text === 'string') return { text: draft.text };
  if ('decision' in draft) {
    const parsed = DecisionDraftSchema.safeParse(draft.decision);
    if (parsed.success) return { decision: parsed.data };
  }
  return null;
}

/**
 * Opens a case: reads the stored state from the data store, or reports that the case is
 * not started. Keeps the case in memory if it is already the open one.
 */
export async function openCase(caseFile: CaseFile): Promise<void> {
  const current = useCaseStore.getState();
  if (current.active?.caseId === caseFile.id && current.load.status === 'ready') return;
  useCaseStore.setState({
    active: null,
    load: { status: 'loading', caseId: caseFile.id },
    actionError: null,
  });
  try {
    // Let earlier writes (e.g. a start from the case list) land first.
    await queue;
    const store = await getDataStore();
    const row = await store.cases.getCaseStatus(caseFile.id);
    if (useCaseStore.getState().load.status !== 'loading') return; // superseded
    if (!row) {
      useCaseStore.setState({ load: { status: 'not_started', caseId: caseFile.id } });
      return;
    }
    if (row.state === null || row.state === undefined) {
      useCaseStore.setState({
        load: {
          status: 'invalid',
          caseId: caseFile.id,
          reason: 'Ärendet påbörjades i en äldre version av appen och kan inte öppnas igen.',
        },
      });
      return;
    }
    const restored = restoreCaseState(caseFile, row.state);
    if (!restored.ok) {
      useCaseStore.setState({
        load: { status: 'invalid', caseId: caseFile.id, reason: restored.reason },
      });
      return;
    }
    const [steps, decisions] = await Promise.all([
      store.cases.listSteps(caseFile.id),
      store.cases.listDecisions(caseFile.id),
    ]);
    const drafts: Record<string, StepDraft> = {};
    for (const step of steps) {
      if (step.completedAt !== null || restored.state.stepResults[step.stepId]) continue;
      const draft = readDraft(step.answer);
      if (draft) drafts[step.stepId] = draft;
    }
    useCaseStore.setState({
      active: {
        caseId: caseFile.id,
        state: restored.state,
        notes: row.notes,
        reflection: row.reflection,
        drafts,
        decisionIds: decisions.map((d) => d.id),
        lastOutcome: null,
      },
      load: { status: 'ready', caseId: caseFile.id },
    });
  } catch (error: unknown) {
    console.error('Kunde inte läsa ärendet', error);
    useCaseStore.setState({
      load: {
        status: 'error',
        caseId: caseFile.id,
        message: 'Ärendet kunde inte läsas från studiedatan.',
      },
    });
  }
}

/**
 * Starts the case from the beginning. Anything stored for it before (steps, events,
 * decisions, notes) is removed, so this is also "Börja om".
 */
export function startNewCase(
  caseFile: CaseFile,
  options: { seed?: number; startedAt?: string } = {},
): ActiveCase {
  cancelPending(`${caseFile.id}:`);
  const state = startCase(caseFile, {
    seed: options.seed ?? randomSeed(),
    ...(options.startedAt !== undefined ? { startedAt: options.startedAt } : {}),
  });
  const active: ActiveCase = {
    caseId: caseFile.id,
    state,
    notes: '',
    reflection: '',
    drafts: {},
    decisionIds: [],
    lastOutcome: null,
  };
  useCaseStore.setState({
    active,
    load: { status: 'ready', caseId: caseFile.id },
    saveError: null,
    actionError: null,
  });
  void enqueue(async () => {
    const store = await getDataStore();
    await store.cases.resetCase(caseFile.id);
    await store.cases.startCase({ ...toNewCaseStatus(state), state });
  });
  return active;
}

/** Forgets the open case in memory (the stored data stays). */
export function closeCase(): void {
  useCaseStore.setState({ active: null, load: { status: 'idle' }, actionError: null });
}

/* -------------------------------------------------------------------------- actions */

function requireActive(caseFile: CaseFile): ActiveCase | null {
  const active = useCaseStore.getState().active;
  return active && active.caseId === caseFile.id ? active : null;
}

/** Applies an engine action, stores the result and writes the changed rows. */
function apply(
  caseFile: CaseFile,
  action: (state: CaseState) => {
    state: CaseState;
    feedback?: StepFeedback;
    firedEvents?: string[];
    stepId?: string;
  },
): CaseOutcome | null {
  const active = requireActive(caseFile);
  if (!active) return null;
  let result: ReturnType<typeof action>;
  try {
    result = action(active.state);
  } catch (error: unknown) {
    const message =
      error instanceof CaseEngineError ? error.message : 'Något gick fel i ärendemotorn.';
    useCaseStore.setState({ actionError: message });
    return null;
  }
  const previous = active.state;
  const next = result.state;
  let outcome = active.lastOutcome;
  if (result.feedback && result.stepId) {
    const seen = new Set(previous.visibleDocuments.map((d) => d.documentId));
    outcome = {
      stepId: result.stepId,
      feedback: result.feedback,
      firedEvents: result.firedEvents ?? [],
      newDocumentIds: next.visibleDocuments.map((d) => d.documentId).filter((id) => !seen.has(id)),
      newEntries: next.diary.slice(previous.diary.length),
    };
  }
  const drafts = { ...active.drafts };
  if (result.stepId && next.stepResults[result.stepId]) {
    delete drafts[result.stepId];
    cancelPending(`${caseFile.id}:draft:${result.stepId}`);
  }
  useCaseStore.setState({
    active: { ...active, state: next, drafts, lastOutcome: outcome },
    actionError: null,
  });
  const writes = planCaseWrites(previous, next, new Date().toISOString());
  void enqueue(() => runWrites(caseFile.id, writes));
  return outcome;
}

export function submitCaseStep(
  caseFile: CaseFile,
  stepId: string,
  answer: StepAnswer,
): CaseOutcome | null {
  return apply(caseFile, (state) => ({ ...submitStep(caseFile, state, stepId, answer), stepId }));
}

export function skipCaseStep(caseFile: CaseFile, stepId: string): CaseOutcome | null {
  return apply(caseFile, (state) => ({ ...skipStep(caseFile, state, stepId), stepId }));
}

export function submitCaseDecision(caseFile: CaseFile, draft: DecisionDraft): CaseOutcome | null {
  return apply(caseFile, (state) => {
    const stepId = state.queue[state.currentIndex] ?? '';
    return { ...submitDecision(caseFile, state, draft), stepId };
  });
}

/**
 * Self-assessment of a written step, an open question or the decision. Updates the last
 * outcome's feedback when it is about the same step.
 */
export function selfAssessCaseStep(
  caseFile: CaseFile,
  stepId: string,
  checked: readonly number[],
): StepFeedback | null {
  let feedback: StepFeedback | null = null;
  const active = requireActive(caseFile);
  const keepOutcome = active?.lastOutcome;
  apply(caseFile, (state) => {
    const result = selfAssessStep(caseFile, state, stepId, checked);
    feedback = result.feedback;
    return { state: result.state };
  });
  if (feedback && keepOutcome && keepOutcome.stepId === stepId) {
    const updated = useCaseStore.getState().active;
    if (updated) {
      useCaseStore.setState({
        active: { ...updated, lastOutcome: { ...keepOutcome, feedback } },
      });
    }
  }
  return feedback;
}

/** Removes the "NY" marker when a document is opened. */
export function markCaseDocumentSeen(caseFile: CaseFile, documentId: string): void {
  const active = requireActive(caseFile);
  if (!active?.state.visibleDocuments.some((d) => d.documentId === documentId && d.unseen)) {
    return;
  }
  apply(caseFile, (state) => ({ state: markDocumentSeen(state, documentId) }));
}

/** "Nästa steg": hides the feedback of the last action. */
export function dismissCaseOutcome(): void {
  const active = useCaseStore.getState().active;
  if (active?.lastOutcome) useCaseStore.setState({ active: { ...active, lastOutcome: null } });
}

/* ------------------------------------------------------------------- text and drafts */

export function setCaseNotes(caseFile: CaseFile, notes: string): void {
  const active = requireActive(caseFile);
  if (!active) return;
  useCaseStore.setState({ active: { ...active, notes } });
  debounce(`${caseFile.id}:notes`, () => {
    void enqueue(async () => {
      await (await getDataStore()).cases.updateCaseStatus(caseFile.id, { notes });
    });
  });
}

export function setCaseReflection(caseFile: CaseFile, reflection: string): void {
  const active = requireActive(caseFile);
  if (!active) return;
  useCaseStore.setState({ active: { ...active, reflection } });
  debounce(`${caseFile.id}:reflection`, () => {
    void enqueue(async () => {
      await (await getDataStore()).cases.updateCaseStatus(caseFile.id, { reflection });
    });
  });
}

/** Keeps unfinished work on a step (free text or the decision form) across restarts. */
export function saveStepDraft(caseFile: CaseFile, stepId: string, draft: StepDraft): void {
  const active = requireActive(caseFile);
  if (!active || active.state.stepResults[stepId]) return;
  useCaseStore.setState({ active: { ...active, drafts: { ...active.drafts, [stepId]: draft } } });
  debounce(`${caseFile.id}:draft:${stepId}`, () => {
    // The step may have been completed while the timer ran; then the draft is stale.
    if (useCaseStore.getState().active?.state.stepResults[stepId]) return;
    void enqueue(async () => {
      await (
        await getDataStore()
      ).cases.saveStep({
        caseId: caseFile.id,
        stepId,
        answer: { draft },
        points: null,
        completedAt: null,
      });
    });
  });
}
