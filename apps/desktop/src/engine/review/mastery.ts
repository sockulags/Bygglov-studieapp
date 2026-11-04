import { State } from 'ts-fsrs';
import type { ReviewState } from '../../data/types';

/**
 * Mastery per module, 0–100.
 *
 * FSRS stability S is the number of days after which the chance of remembering a question
 * has dropped to 90 %. A question counts as mastered when S ≥ T (default 21 days, i.e. it is
 * remembered for three weeks without repetition). Below the threshold it gives partial credit
 * in proportion to its stability:
 *
 *   credit(q) = 0                    if q has never been reviewed (no state, or state New)
 *   credit(q) = min(1, S(q) / T)     otherwise
 *
 *   mastery   = round(100 × Σ credit(q) / N)
 *
 * N is the number of questions in the module (`totalQuestions`), so unseen questions pull
 * mastery down; when it is not given, N is the number of distinct questions in the states.
 * A lapse lowers S in FSRS, so forgotten questions lose credit automatically.
 */
export const MASTERY_STABILITY_THRESHOLD_DAYS = 21;

export interface MasteryOptions {
  /** Number of questions in the module. Defaults to the number of distinct states. */
  totalQuestions?: number;
  /** Stability threshold T in days. */
  thresholdDays?: number;
}

/** Credit 0..1 for one question, see the formula above. */
export function questionMasteryCredit(
  state: Pick<ReviewState, 'stability' | 'state' | 'reps'>,
  thresholdDays: number = MASTERY_STABILITY_THRESHOLD_DAYS,
): number {
  if (state.state === State.New || state.reps === 0) return 0;
  if (!Number.isFinite(state.stability) || state.stability <= 0) return 0;
  return Math.min(1, state.stability / Math.max(thresholdDays, Number.EPSILON));
}

export function mastery(
  moduleReviewStates: readonly ReviewState[],
  options: MasteryOptions = {},
): number {
  const threshold = options.thresholdDays ?? MASTERY_STABILITY_THRESHOLD_DAYS;
  // One state per question; if a question appears twice keep the most recently reviewed.
  const latest = new Map<string, ReviewState>();
  for (const state of moduleReviewStates) {
    const existing = latest.get(state.questionId);
    if (!existing || (state.lastReview ?? '') > (existing.lastReview ?? '')) {
      latest.set(state.questionId, state);
    }
  }
  const total = Math.max(options.totalQuestions ?? 0, latest.size);
  if (total === 0) return 0;
  let credit = 0;
  for (const state of latest.values()) credit += questionMasteryCredit(state, threshold);
  return Math.round((100 * credit) / total);
}

/**
 * Mastery for several modules at once. `questionCounts` maps module id to its number of
 * questions; modules without review states get 0.
 */
export function masteryByModule(
  states: readonly ReviewState[],
  questionCounts: Readonly<Record<string, number>>,
  thresholdDays?: number,
): Record<string, number> {
  const grouped = new Map<string, ReviewState[]>();
  for (const state of states) {
    const list = grouped.get(state.moduleId) ?? [];
    list.push(state);
    grouped.set(state.moduleId, list);
  }
  const result: Record<string, number> = {};
  const moduleIds = new Set([...Object.keys(questionCounts), ...grouped.keys()]);
  for (const moduleId of moduleIds) {
    result[moduleId] = mastery(grouped.get(moduleId) ?? [], {
      ...(questionCounts[moduleId] !== undefined
        ? { totalQuestions: questionCounts[moduleId] }
        : {}),
      ...(thresholdDays !== undefined ? { thresholdDays } : {}),
    });
  }
  return result;
}
