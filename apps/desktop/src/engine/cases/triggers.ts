import type { CaseEvent, CaseFile, CaseStep, EventTrigger } from '@bygglov/content-schema';
import { allCaseSteps } from '@bygglov/content-schema';
import { createRandom } from '../session/random';
import { isMissedResult } from './grading';
import type { CaseState, TriggerContext } from './types';

/**
 * Event triggers (utlösare). All conditions given in a trigger must hold at the same time
 * (conjunction), and an event fires at most once per case. Triggers are evaluated after
 * every action that changes the case (step completed or skipped, decision made), never on
 * their own as time passes.
 *
 * - efter_steg: the step has been completed (any answer; skipping does not count).
 * - vid_beslut: the decision has this outcome. `bevilja` also matches
 *   `bevilja_med_villkor`, since a permit with conditions is still a permit.
 * - om_missat: the step was skipped or answered wrongly (see `isMissedResult`), or a
 *   decision has been made without the step ever being completed.
 * - om_forelagt: the learner issued an injunction of this kind (see `injunctionKind`).
 * - slump: a draw from the case seed and the event id is below the probability. The draw
 *   is fixed per seed and event, so re-evaluating never changes the outcome.
 */

export function randomDraw(seed: number, eventId: string): number {
  return createRandom(`${seed}:${eventId}`)();
}

function decisionOf(state: CaseState, context: TriggerContext) {
  return context.decision ?? state.decisions[state.decisions.length - 1]?.draft.utfall;
}

export function findStep(caseFile: CaseFile, stepId: string): CaseStep | undefined {
  return allCaseSteps(caseFile).find((s) => s.id === stepId);
}

/** Whether a step counts as missed for `om_missat`. */
export function isStepMissed(
  caseFile: CaseFile,
  state: CaseState,
  stepId: string,
  context: TriggerContext = {},
): boolean {
  const result = state.stepResults[stepId];
  const step = findStep(caseFile, stepId);
  if (!step) return false;
  if (result) return isMissedResult(step, result);
  return decisionOf(state, context) !== undefined;
}

function normaliseKind(kind: string): string {
  return kind.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function injunctionMatches(issued: string, wanted: string): boolean {
  const a = normaliseKind(issued);
  const b = normaliseKind(wanted);
  return a === b || a.startsWith(b) || b.startsWith(a);
}

/**
 * The kind of injunction a step issues, or null. A writing step marked
 * `ar_forelaggande: true` issues one; the kind is the word after "om" in its heading or
 * instruction ("Skriv föreläggande om komplettering" → "komplettering"), otherwise
 * "föreläggande". The text is not searched for the word "förelägg" any more.
 */
export function injunctionKind(step: CaseStep): string | null {
  if (step.typ !== 'skrivelse' || step.ar_forelaggande !== true) return null;
  const text = `${step.rubrik} ${step.instruktion ?? ''}`;
  const match = /förel[äa]gg\p{L}*\s+om\s+(\p{L}+)/iu.exec(text);
  return normaliseKind(match?.[1] ?? 'föreläggande');
}

export function triggerHolds(
  caseFile: CaseFile,
  state: CaseState,
  eventId: string,
  trigger: EventTrigger,
  context: TriggerContext = {},
): boolean {
  if (trigger.efter_steg !== undefined) {
    const result = state.stepResults[trigger.efter_steg];
    if (!result || result.skipped) return false;
  }
  if (trigger.vid_beslut !== undefined) {
    const outcome = decisionOf(state, context);
    const matches =
      outcome === trigger.vid_beslut ||
      (trigger.vid_beslut === 'bevilja' && outcome === 'bevilja_med_villkor');
    if (!matches) return false;
  }
  if (trigger.om_missat !== undefined) {
    if (!isStepMissed(caseFile, state, trigger.om_missat, context)) return false;
  }
  if (trigger.om_forelagt !== undefined) {
    const wanted = trigger.om_forelagt;
    if (!state.injunctions.some((i) => injunctionMatches(i.kind, wanted))) return false;
  }
  if (trigger.slump !== undefined) {
    if (randomDraw(state.seed, eventId) >= trigger.slump) return false;
  }
  return true;
}

/**
 * Events that have not fired yet and whose triggers hold now, in file order. `context`
 * lets the caller ask "what would happen if the decision were X" without submitting it.
 * The result reveals the case's surprises, so it is meant for tests and the supervisor.
 */
export function evaluateTriggers(
  caseFile: CaseFile,
  state: CaseState,
  context: TriggerContext = {},
): CaseEvent[] {
  const fired = new Set(state.firedEvents.map((e) => e.eventId));
  return caseFile.handelser.filter(
    (event) =>
      !fired.has(event.id) && triggerHolds(caseFile, state, event.id, event.utlosare, context),
  );
}
