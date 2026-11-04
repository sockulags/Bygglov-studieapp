import type { CaseStatusPatch, NewCaseEvent, NewCaseStep, NewDecision } from '@/data';
import { toCaseStatusPatch, toNewCaseEvents, toNewCaseStep, type CaseState } from '@/engine';

/**
 * Which data-layer rows change between two case states. The whole `CaseState` is stored
 * on the status row (the source of truth, see data/migrations.ts → case_state); steps,
 * events and decisions are also written as their own rows so they can be listed,
 * exported and counted without loading the engine.
 *
 * Pure, so the mapping can be tested without a store.
 */
export type CaseWrite =
  | { kind: 'status'; patch: CaseStatusPatch }
  | { kind: 'step'; row: NewCaseStep }
  | { kind: 'event'; row: NewCaseEvent }
  | { kind: 'decision'; row: NewDecision; stepId: string };

/**
 * The writes that bring the stored rows from `previous` to `next`. `now` is the real
 * timestamp used for completed steps, decisions and `submittedAt`.
 */
export function planCaseWrites(previous: CaseState, next: CaseState, now: string): CaseWrite[] {
  const writes: CaseWrite[] = [];
  const newDecisions = next.decisions.slice(previous.decisions.length);

  const patch: CaseStatusPatch = { ...toCaseStatusPatch(next), state: next };
  if (newDecisions.length > 0) patch.submittedAt = now;
  writes.push({ kind: 'status', patch });

  for (const [stepId, result] of Object.entries(next.stepResults)) {
    const before = previous.stepResults[stepId];
    if (before && JSON.stringify(before) === JSON.stringify(result)) continue;
    const row = toNewCaseStep(next, stepId, now);
    if (row) writes.push({ kind: 'step', row });
  }

  const knownEvents = new Set(previous.firedEvents.map((e) => e.eventId));
  const fired = next.firedEvents.map((e) => e.eventId).filter((id) => !knownEvents.has(id));
  for (const row of toNewCaseEvents(next, fired)) writes.push({ kind: 'event', row });

  for (const decision of newDecisions) {
    writes.push({
      kind: 'decision',
      stepId: decision.stepId,
      // The row holds the draft itself (DecisionDraftSchema reads it back); the
      // assessment and the self-assessment live in the stored CaseState.
      row: { caseId: next.caseId, decision: decision.draft, submittedAt: now },
    });
  }
  return writes;
}
