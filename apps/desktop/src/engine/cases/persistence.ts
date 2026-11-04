import type {
  CaseStatusPatch,
  CaseStatusValue,
  NewCaseEvent,
  NewCaseStatus,
  NewCaseStep,
} from '../../data/types';
import type { CaseProgress, CaseState } from './types';

/**
 * Mapping from the engine state to the data layer's rows (data/types.ts). The full
 * `CaseState` is the source of truth and should be stored whole as JSON; these rows are
 * the queryable summary (status lists, statistics, export).
 */

const STATUS: Record<CaseProgress, CaseStatusValue> = {
  pagar: 'in_progress',
  inlamnat: 'submitted',
  bedomt: 'reviewed',
};

export function toCaseStatusValue(progress: CaseProgress): CaseStatusValue {
  return STATUS[progress];
}

export function toNewCaseStatus(state: CaseState): NewCaseStatus {
  return {
    caseId: state.caseId,
    currentStepId: state.queue[state.currentIndex] ?? null,
    simDate: state.simDate,
    startedAt: state.startedAt,
  };
}

/** `submittedAt` is a real timestamp and is set by the caller when a decision is stored. */
export function toCaseStatusPatch(state: CaseState): CaseStatusPatch {
  return {
    status: toCaseStatusValue(state.status),
    currentStepId: state.queue[state.currentIndex] ?? null,
    simDate: state.simDate,
  };
}

/** The `arende_steg` row for one completed or skipped step. */
export function toNewCaseStep(
  state: CaseState,
  stepId: string,
  completedAt: string,
): NewCaseStep | null {
  const result = state.stepResults[stepId];
  if (!result) return null;
  return {
    caseId: state.caseId,
    stepId,
    answer: result.skipped ? { skipped: true } : result.answer,
    points: result.score,
    completedAt,
  };
}

/** `arende_handelse` rows for the given fired event ids (e.g. `firedEvents` of a result). */
export function toNewCaseEvents(state: CaseState, eventIds: readonly string[]): NewCaseEvent[] {
  return state.firedEvents
    .filter((e) => eventIds.includes(e.eventId))
    .map((e) => ({ caseId: state.caseId, eventId: e.eventId, simDate: e.date }));
}
