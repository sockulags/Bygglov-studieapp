import {
  type CaseDocument,
  type CaseEvent,
  type CaseFile,
  type CaseStep,
  type DecisionStep,
  type SuspensionReason,
} from '@bygglov/content-schema';
import { outcomeFor } from '../quiz/grade';
import { hashSeed, type Seed } from '../session/random';
import { addDays, daysBetween } from './dates';
import {
  caseDeadline,
  formatKronor,
  maxExtensionWeeks,
  suspensionLawRef,
  SUSPENSION_REASON_TEXT,
} from './deadline';
import {
  assessDecision,
  assessmentScore,
  decisionOutcomeLabel,
  isNotificationCase,
} from './decision';
import { CaseEngineError } from './errors';
import {
  criteriaOf,
  gradeStepAnswer,
  isMissedResult,
  isSelfAssessedStep,
  validIndices,
} from './grading';
import { renderTemplate, caseTemplateValues } from './templates';
import { evaluateTriggers, findStep, injunctionKind } from './triggers';
import {
  CASE_STATE_VERSION,
  type CaseState,
  type DecisionDraft,
  type DecisionOutcomeResult,
  type DiaryEntry,
  type StepAnswer,
  type StepFeedback,
  type StepOutcome,
  type StepResult,
  type TriggerContext,
} from './types';

/**
 * The case engine (ärendemotorn) as a pure state machine. Every action takes the case file
 * and a `CaseState` and returns a new state; inputs are never mutated and nothing here
 * does I/O. The state is plain JSON, so the caller can store it whole and restore it with
 * `restoreCaseState`.
 *
 * Flow: `startCase` → for each `currentStep`: `submitStep` (or `skipStep`, or
 * `submitDecision` for the decision step) → events fire, documents appear, time moves and
 * new steps may be inserted right after the step just completed → `diary` shows it all.
 */

export interface StartCaseOptions {
  seed: Seed;
  /** Real-world start time, ISO 8601. Defaults to now. */
  startedAt?: string | Date;
}

export function startCase(caseFile: CaseFile, options: StartCaseOptions): CaseState {
  const startedAt =
    options.startedAt instanceof Date
      ? options.startedAt.toISOString()
      : (options.startedAt ?? new Date().toISOString());
  const date = caseFile.startdatum;
  const state: CaseState = {
    version: CASE_STATE_VERSION,
    caseId: caseFile.id,
    seed: hashSeed(options.seed),
    startedAt,
    simDate: date,
    applicationDate: date,
    completionDate: null,
    amendmentDates: [],
    supervision: caseFile.niva === 4,
    notification: isNotificationCase(caseFile),
    extensionWeeks: 0,
    extensionReason: null,
    suspensions: [],
    deadlineDate: null,
    queue: caseFile.steg.map((s) => s.id),
    currentIndex: 0,
    stepResults: {},
    visibleDocuments: [],
    firedEvents: [],
    injunctions: [],
    facts: {},
    decisions: [],
    diary: [
      {
        date,
        kind: 'registrering',
        text: `Ärendet registrerat: ${caseFile.titel}, ${caseFile.fastighet}.`,
      },
    ],
    status: 'pagar',
  };
  const initial = caseFile.handlingar
    .filter((doc) => doc.dold_tills === undefined)
    .map((doc) => ({ doc, receivedDate: doc.inkom ?? date }))
    .sort((a, b) => a.receivedDate.localeCompare(b.receivedDate));
  for (const { doc, receivedDate } of initial) addDocument(state, doc, receivedDate);
  updateDeadline(state, true);
  return state;
}

/* ------------------------------------------------------------------------ queries */

/** The step the learner is on, or null when every step is done. */
export function currentStep(caseFile: CaseFile, state: CaseState): CaseStep | null {
  const id = state.queue[state.currentIndex];
  return id === undefined ? null : (findStep(caseFile, id) ?? null);
}

export function stepById(caseFile: CaseFile, stepId: string): CaseStep | null {
  return findStep(caseFile, stepId) ?? null;
}

/** Steps in queue order with their result, for a progress list. */
export function stepOverview(
  caseFile: CaseFile,
  state: CaseState,
): { step: CaseStep; result: StepResult | null; current: boolean }[] {
  return state.queue.flatMap((id, index) => {
    const step = findStep(caseFile, id);
    return step
      ? [{ step, result: state.stepResults[id] ?? null, current: index === state.currentIndex }]
      : [];
  });
}

export function isCaseComplete(state: CaseState): boolean {
  return state.currentIndex >= state.queue.length;
}

/** The diary in chronological order (stable for entries on the same day). */
export function diary(state: CaseState): DiaryEntry[] {
  return state.diary
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => a.entry.date.localeCompare(b.entry.date) || a.index - b.index)
    .map(({ entry }) => entry);
}

export interface VisibleCaseDocument {
  document: CaseDocument;
  receivedDate: string;
  unseen: boolean;
}

/** Documents the learner can see, in arrival order. */
export function visibleDocuments(caseFile: CaseFile, state: CaseState): VisibleCaseDocument[] {
  return state.visibleDocuments.flatMap((v) => {
    const document = caseFile.handlingar.find((d) => d.id === v.documentId);
    return document ? [{ document, receivedDate: v.receivedDate, unseen: v.unseen }] : [];
  });
}

/** Facts of the visible documents (`fakta`), overridden by `andrade_fakta` from events. */
export function caseFacts(caseFile: CaseFile, state: CaseState): Record<string, unknown> {
  const facts: Record<string, unknown> = {};
  for (const { document } of visibleDocuments(caseFile, state))
    Object.assign(facts, document.fakta);
  return { ...facts, ...state.facts };
}

/** Feedback for a completed or skipped step, rebuilt from the stored answer. */
export function stepFeedback(
  caseFile: CaseFile,
  state: CaseState,
  stepId: string,
): StepFeedback | null {
  const result = state.stepResults[stepId];
  const step = findStep(caseFile, stepId);
  if (!result || !step) return null;
  return buildFeedback(caseFile, state, step, result);
}

/* ------------------------------------------------------------------------ actions */

/**
 * Completes the current step with an answer. Time moves by the step's `tid_framat_dagar`,
 * then the events whose triggers now hold fire. A `beslut` answer is handled like
 * `submitDecision`.
 */
export function submitStep(
  caseFile: CaseFile,
  state: CaseState,
  stepId: string,
  answer: StepAnswer,
): StepOutcome | DecisionOutcomeResult {
  const step = requireCurrentStep(caseFile, state, stepId);
  if (step.typ === 'beslut') {
    if (answer.type !== 'beslut') {
      throw new CaseEngineError(
        'answer_type_mismatch',
        `Steget ${step.id} är ett beslut, men svaret är av typen ${answer.type}.`,
      );
    }
    return submitDecision(caseFile, state, answer.draft);
  }
  const s = clone(state);
  const checked =
    answer.type === 'fraga' || answer.type === 'skrivelse'
      ? (answer.checkedCriteria ?? null)
      : null;
  const graded = gradeStepAnswer(caseFile, step, answer, checked);
  const result: StepResult = {
    stepId: step.id,
    stepType: step.typ,
    date: s.simDate,
    skipped: false,
    answer: cloneJson(answer),
    score: graded.score,
    outcome: graded.outcome,
    checkedCriteria: graded.selfAssessment?.checked ?? null,
  };
  s.stepResults[step.id] = result;

  const kind = injunctionKind(step);
  if (kind !== null) {
    s.injunctions.push({ kind, date: s.simDate, stepId: step.id });
    log(s, {
      kind: 'steg',
      stepId: step.id,
      text: /komplett/.test(kind)
        ? 'Föreläggande om komplettering skickat till sökanden (9 kap. 91 §).'
        : sentence(`Föreläggande om ${kind} skickat: ${step.rubrik}`),
    });
  } else {
    log(s, { kind: 'steg', stepId: step.id, text: sentence(`Klart: ${step.rubrik}`) });
  }
  // A step that asks whether to let the case rest declares it resting when answered right.
  if (step.vilande && !isMissedResult(step, result)) {
    suspend(s, step.vilande, { stepId: step.id });
  }
  updateDeadline(s);
  if (step.tid_framat_dagar) moveTime(s, step.tid_framat_dagar);

  s.currentIndex += 1;
  const firedEvents = fireEvents(caseFile, s);
  return { state: s, feedback: buildFeedback(caseFile, s, step, result), firedEvents };
}

/**
 * Skips the current step without answering it. The step then counts as missed for
 * `om_missat`, which is how "bevilja utan grannehörande" is played. A decision step
 * cannot be skipped.
 */
export function skipStep(caseFile: CaseFile, state: CaseState, stepId: string): StepOutcome {
  const step = requireCurrentStep(caseFile, state, stepId);
  if (step.typ === 'beslut') {
    throw new CaseEngineError('not_a_decision_step', 'Beslutssteget kan inte hoppas över.');
  }
  const s = clone(state);
  const result: StepResult = {
    stepId: step.id,
    stepType: step.typ,
    date: s.simDate,
    skipped: true,
    answer: null,
    score: null,
    outcome: null,
    checkedCriteria: null,
  };
  s.stepResults[step.id] = result;
  log(s, { kind: 'hoppat', stepId: step.id, text: sentence(`Hoppade över: ${step.rubrik}`) });
  s.currentIndex += 1;
  const firedEvents = fireEvents(caseFile, s);
  return { state: s, feedback: buildFeedback(caseFile, s, step, result), firedEvents };
}

/**
 * Self-assessment of a completed step: the learner ticks the assessment criteria she
 * covered (indices into `feedback.selfAssessment.criteria`). Works for `skrivelse`, open
 * `fraga` steps and decisions (the decision's `bedomningspunkter`). Can be repeated.
 */
export function selfAssessStep(
  caseFile: CaseFile,
  state: CaseState,
  stepId: string,
  checkedCriteria: readonly number[],
): { state: CaseState; feedback: StepFeedback } {
  assertCase(caseFile, state);
  const step = findStep(caseFile, stepId);
  if (!step) throw unknownStep(stepId);
  const existing = state.stepResults[stepId];
  if (!existing || existing.skipped || existing.answer === null) {
    throw new CaseEngineError('not_completed', `Steget ${stepId} är inte besvarat ännu.`);
  }
  if (!isSelfAssessedStep(step) && step.typ !== 'beslut') {
    throw new CaseEngineError(
      'not_self_assessed',
      `Steget ${stepId} rättas automatiskt och har inga bedömningspunkter att bocka av.`,
    );
  }
  const s = clone(state);
  const result = s.stepResults[stepId] as StepResult;
  const checked = validIndices(checkedCriteria, criteriaOf(step).length);
  if (step.typ === 'beslut') {
    const decision = s.decisions.find((d) => d.stepId === stepId);
    if (decision) decision.checkedCriteria = checked;
  } else if (result.answer) {
    const graded = gradeStepAnswer(caseFile, step, result.answer, checked);
    result.score = graded.score;
    result.outcome = graded.outcome;
    result.checkedCriteria = checked;
  }
  return { state: s, feedback: buildFeedback(caseFile, s, step, result) };
}

/**
 * Submits the decision on the current (beslut) step. The assessment is made on today's
 * simulated date; then the step is completed, the case status becomes `inlamnat` and the
 * events triggered by the decision fire (they may insert follow-up steps).
 */
export function submitDecision(
  caseFile: CaseFile,
  state: CaseState,
  decision: DecisionDraft,
): DecisionOutcomeResult {
  assertCase(caseFile, state);
  const step = currentStep(caseFile, state);
  if (!step) throw finished();
  if (step.typ !== 'beslut') {
    throw new CaseEngineError(
      'not_a_decision_step',
      `Det aktuella steget (${step.rubrik}) är inte ett beslut.`,
    );
  }
  const s = clone(state);
  const draft = cloneJson(decision);
  const assessment = assessDecision(caseFile, step as DecisionStep, draft, s);
  const score = assessmentScore(assessment);
  const result: StepResult = {
    stepId: step.id,
    stepType: step.typ,
    date: s.simDate,
    skipped: false,
    answer: { type: 'beslut', draft },
    score,
    outcome: outcomeFor(score),
    checkedCriteria: null,
  };
  s.stepResults[step.id] = result;
  s.decisions.push({ stepId: step.id, date: s.simDate, draft, assessment, checkedCriteria: null });
  s.status = s.status === 'bedomt' ? 'bedomt' : 'inlamnat';
  log(s, {
    kind: 'beslut',
    stepId: step.id,
    text: `Beslut: ${decisionOutcomeLabel(draft.utfall, caseFile)}.${draft.avgift !== null ? ` Avgift ${formatKronor(draft.avgift)}.` : ''}`,
  });
  s.currentIndex += 1;
  const firedEvents = fireEvents(caseFile, s, { decision: draft.utfall });
  return {
    state: s,
    feedback: buildFeedback(caseFile, s, step, result),
    firedEvents,
    assessment,
  };
}

/** Lets `days` simulated days pass (e.g. waiting for an answer). */
export function advanceDays(state: CaseState, days: number): CaseState {
  if (!Number.isInteger(days) || days < 0) {
    throw new CaseEngineError(
      'invalid_days',
      `Antal dagar ska vara ett heltal som är 0 eller större, inte ${days}.`,
    );
  }
  const s = clone(state);
  if (days > 0) moveTime(s, days);
  return s;
}

/**
 * Extends the 99 § deadline once, by at most ten weeks, before it has run out. The
 * extension must be necessary because of the handling or investigation (99 § andra
 * stycket), and the applicant is to be told about it and the reasons before the original
 * deadline expires (9 kap. 100 § 3). `reason` is logged in the diary.
 */
export function extendDeadline(state: CaseState, weeks: number, reason?: string): CaseState {
  if (state.supervision && state.deadlineDate === null) {
    throw new CaseEngineError(
      'invalid_extension',
      'Ett tillsynsärende har ingen tidsfrist att förlänga. Fristen i 9 kap. 99 § gäller först om en ansökan om lov i efterhand kommer in.',
    );
  }
  if (state.extensionWeeks > 0) {
    throw new CaseEngineError(
      'invalid_extension',
      'Tidsfristen har redan förlängts. Den får förlängas en gång (9 kap. 99 § andra stycket).',
    );
  }
  const maxWeeks = maxExtensionWeeks(state);
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > maxWeeks) {
    throw new CaseEngineError(
      'invalid_extension',
      `Förlängningen ska vara 1–${maxWeeks} hela veckor (9 kap. 99 § andra stycket${state.notification ? ' och 6 kap. 5 § PBF' : ''}).`,
    );
  }
  if (state.deadlineDate !== null && state.simDate > state.deadlineDate) {
    throw new CaseEngineError(
      'invalid_extension',
      `Tidsfristen löpte ut ${state.deadlineDate}. Förlängningen ska beslutas och meddelas sökanden innan den ursprungliga fristen gått ut (9 kap. 100 § 3).`,
    );
  }
  if (state.decisions.length > 0) {
    throw new CaseEngineError(
      'invalid_extension',
      'Beslutet är redan fattat, så tidsfristen kan inte förlängas.',
    );
  }
  const why = reason?.trim() ?? '';
  const s = clone(state);
  s.extensionWeeks = weeks;
  s.extensionReason = why === '' ? null : why;
  log(s, {
    kind: 'frist',
    text:
      `Tidsfristen förlängs med ${weeks} ${weeks === 1 ? 'vecka' : 'veckor'} (9 kap. 99 § andra stycket).` +
      (why === '' ? '' : ` Skäl: ${sentence(why)}`) +
      ' Sökanden informeras skriftligen om förlängningen och skälen för den innan den ursprungliga fristen gått ut (9 kap. 100 § 3).',
  });
  updateDeadline(s);
  return s;
}

/** Removes the "NY" marker from a document. */
export function markDocumentSeen(state: CaseState, documentId: string): CaseState {
  if (!state.visibleDocuments.some((d) => d.documentId === documentId && d.unseen)) return state;
  const s = clone(state);
  for (const doc of s.visibleDocuments) if (doc.documentId === documentId) doc.unseen = false;
  return s;
}

/** Marks the case as reviewed by the supervisor (bedömt). */
export function markReviewed(state: CaseState): CaseState {
  return { ...clone(state), status: 'bedomt' };
}

/* ----------------------------------------------------------------------- internals */

function clone(state: CaseState): CaseState {
  return cloneJson(state);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertCase(caseFile: CaseFile, state: CaseState): void {
  if (caseFile.id !== state.caseId) {
    throw new CaseEngineError(
      'wrong_case',
      `Tillståndet hör till ärende ${state.caseId}, inte ${caseFile.id}.`,
    );
  }
}

function unknownStep(stepId: string): CaseEngineError {
  return new CaseEngineError('unknown_step', `Ärendet har inget steg med id ${stepId}.`);
}

function finished(): CaseEngineError {
  return new CaseEngineError('case_finished', 'Alla steg i ärendet är redan klara.');
}

function requireCurrentStep(caseFile: CaseFile, state: CaseState, stepId: string): CaseStep {
  assertCase(caseFile, state);
  if (!findStep(caseFile, stepId)) throw unknownStep(stepId);
  const step = currentStep(caseFile, state);
  if (!step) throw finished();
  if (step.id !== stepId) {
    throw new CaseEngineError(
      'not_current_step',
      `Steg ${stepId} är inte det aktuella steget (just nu: ${step.id}, ${step.rubrik}).`,
    );
  }
  return step;
}

/** Ends a diary text with a full stop unless it already ends with punctuation. */
function sentence(text: string): string {
  return /[.!?…]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
}

function log(state: CaseState, entry: Omit<DiaryEntry, 'date'> & { date?: string }): void {
  state.diary.push({ date: state.simDate, ...entry });
}

function addDocument(state: CaseState, doc: CaseDocument, receivedDate: string): void {
  if (state.visibleDocuments.some((d) => d.documentId === doc.id)) return;
  state.visibleDocuments.push({ documentId: doc.id, receivedDate, unseen: true });
  log(state, {
    date: receivedDate,
    kind: 'handling',
    documentId: doc.id,
    text: sentence(`Inkommen handling: ${doc.titel}`),
  });
}

/** Moves the calendar and notes in the diary if the 99 § deadline ran out on the way. */
function moveTime(state: CaseState, days: number): void {
  const from = state.simDate;
  const to = addDays(from, days);
  const deadline = state.deadlineDate;
  // After the decision the deadline no longer matters (it was met or not when deciding).
  if (deadline !== null && state.decisions.length === 0 && from <= deadline && to > deadline) {
    log(state, {
      date: addDays(deadline, 1),
      kind: 'frist',
      text: `Tidsfristen enligt 9 kap. 99 § löpte ut ${deadline}. Avgiften reduceras med en femtedel för varje påbörjad vecka fristen överskrids (12 kap. 8 a §).`,
    });
  }
  state.simDate = to;
  log(state, {
    kind: 'tid',
    text: `${days} ${days === 1 ? 'dag' : 'dagar'} har gått.`,
  });
}

/**
 * Recomputes `deadlineDate`; notes a changed date in the diary (`always`: log anyway,
 * `quiet`: never, when the caller has already explained the change).
 */
function updateDeadline(state: CaseState, always = false, quiet = false): void {
  const before = state.deadlineDate;
  const deadline = caseDeadline(state);
  state.deadlineDate = deadline.deadlineDate;
  if (!quiet && (always || before !== deadline.deadlineDate)) {
    log(state, { kind: 'frist', text: deadline.explanation });
  }
}

/** Declares the case resting under 9 kap. 102 § from today, unless it already rests. */
function suspend(
  state: CaseState,
  reason: SuspensionReason,
  source: { stepId?: string; eventId?: string },
): void {
  if (state.suspensions.some((r) => r.to === null)) return;
  state.suspensions.push({ reason, from: state.simDate, to: null, ...source });
  log(state, {
    kind: 'frist',
    ...source,
    text:
      `Ärendet förklaras vilande: det ska inte avgöras förrän ${SUSPENSION_REASON_TEXT[reason]} (${suspensionLawRef(reason)}). ` +
      'Tidsfristen löper inte medan ärendet vilar, och avgiften reduceras inte när fristen överskrids på grund av vilandebeslutet (12 kap. 8 a §). Handläggningen i övrigt fortsätter.',
  });
  updateDeadline(state, false, true);
}

/** Ends the resting that is going on (the question it waited for has been decided). */
function resume(state: CaseState, eventId: string): void {
  const open = state.suspensions.find((r) => r.to === null);
  if (!open) return;
  open.to = state.simDate;
  const days = daysBetween(open.from, open.to);
  log(state, {
    kind: 'frist',
    eventId,
    text:
      `Vilandeförklaringen upphör ${state.simDate}: ${SUSPENSION_REASON_TEXT[open.reason]}. ` +
      `Ärendet var vilande i ${days} ${days === 1 ? 'dag' : 'dagar'} sedan ${open.from} (${suspensionLawRef(open.reason)}), och tidsfristen löper igen.`,
  });
  updateDeadline(state, true);
}

/** Fires every event whose trigger holds, in file order, applying their effects. */
function fireEvents(caseFile: CaseFile, state: CaseState, context: TriggerContext = {}): string[] {
  const fired: string[] = [];
  let insertAt = state.currentIndex;
  for (const event of evaluateTriggers(caseFile, state, context)) {
    insertAt = applyEvent(caseFile, state, event, insertAt);
    fired.push(event.id);
  }
  return fired;
}

/**
 * Applies one event's effects in this order: time passes, documents arrive, the message
 * is logged (template variables rendered), a resting ends or starts (102 §), the completion
 * date is set, a new start of the deadline is noted, facts change, a new step is inserted. Returns the queue position for the next inserted step, so
 * steps from several events keep file order.
 */
function applyEvent(
  caseFile: CaseFile,
  state: CaseState,
  event: CaseEvent,
  insertAt: number,
): number {
  const { effekt } = event;
  state.firedEvents.push({ eventId: event.id, date: state.simDate });
  if (effekt.tid_framat_dagar) moveTime(state, effekt.tid_framat_dagar);
  for (const docId of effekt.visa_handlingar ?? []) {
    const doc = caseFile.handlingar.find((d) => d.id === docId);
    if (doc) addDocument(state, doc, state.simDate);
  }
  // Documents hidden until this event that the effect does not list appear too.
  for (const doc of caseFile.handlingar.filter((d) => d.dold_tills === event.id)) {
    addDocument(state, doc, state.simDate);
  }
  if (effekt.meddelande) {
    // {{frist}} in the message is the deadline after this event: a completion or a new start
    // of the deadline that the same event brings is counted in.
    const after: CaseState = {
      ...state,
      completionDate: effekt.satt_komplett_datum ? state.simDate : state.completionDate,
      amendmentDates:
        effekt.ny_fristdag !== undefined
          ? [...state.amendmentDates, state.simDate]
          : state.amendmentDates,
    };
    const values = {
      ...caseTemplateValues(state),
      frist: caseDeadline(after).deadlineDate,
      inkomdatum: state.simDate,
    };
    log(state, {
      kind: 'handelse',
      eventId: event.id,
      text: renderTemplate(effekt.meddelande, values),
    });
  }
  if (effekt.vilande_upphor) resume(state, event.id);
  if (effekt.vilande) suspend(state, effekt.vilande, { eventId: event.id });
  if (effekt.satt_komplett_datum) {
    state.completionDate = state.simDate;
    updateDeadline(state);
  }
  if (effekt.ny_fristdag !== undefined) {
    if (!state.amendmentDates.includes(state.simDate)) state.amendmentDates.push(state.simDate);
    // Logged even when the date stays the same (e.g. while the case rests): the applicant
    // is to be told about the new start (100 § 2).
    updateDeadline(state, true);
  }
  if (effekt.andrade_fakta) Object.assign(state.facts, effekt.andrade_fakta);
  if (effekt.nytt_steg && !state.queue.includes(effekt.nytt_steg.id)) {
    state.queue.splice(insertAt, 0, effekt.nytt_steg.id);
    return insertAt + 1;
  }
  return insertAt;
}

function buildFeedback(
  caseFile: CaseFile,
  state: CaseState,
  step: CaseStep,
  result: StepResult,
): StepFeedback {
  const missed = isMissedResult(step, result);
  if (result.skipped || result.answer === null) {
    return {
      stepId: step.id,
      stepType: step.typ,
      skipped: true,
      score: null,
      outcome: null,
      missed,
      explanation: step.forklaring ?? null,
      lawRefs: step.lagrum ?? [],
      items: [],
      selfAssessment: null,
      selection: null,
      decision: null,
    };
  }
  if (step.typ === 'beslut') {
    const decision = [...state.decisions].reverse().find((d) => d.stepId === step.id) ?? null;
    return {
      stepId: step.id,
      stepType: step.typ,
      skipped: false,
      score: result.score,
      outcome: result.outcome,
      missed,
      explanation: step.forklaring ?? null,
      lawRefs: step.lagrum ?? [],
      items: [],
      selfAssessment: decision
        ? {
            criteria: decision.assessment.criteria,
            checked: decision.checkedCriteria,
            modelAnswer: null,
            modelTextPath: decision.assessment.modelDecisionPath,
          }
        : null,
      selection: null,
      decision: decision?.assessment ?? null,
    };
  }
  const graded = gradeStepAnswer(caseFile, step, result.answer, result.checkedCriteria);
  return {
    stepId: step.id,
    stepType: step.typ,
    skipped: false,
    score: graded.score,
    outcome: graded.outcome,
    missed,
    explanation: graded.explanation,
    lawRefs: graded.lawRefs,
    items: graded.items,
    selfAssessment: graded.selfAssessment,
    selection: graded.selection,
    decision: null,
  };
}
