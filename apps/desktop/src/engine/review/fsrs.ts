import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card,
  type FSRS,
  type FSRSParameters,
  type Grade,
  type ReviewLog,
} from 'ts-fsrs';
import type { QuestionType } from '@bygglov/content-schema';
import type { ReviewState } from '../../data/types';
import type { GradedResult } from '../quiz/types';

/**
 * Spaced repetition with FSRS (ts-fsrs 5.x). Converts between the data layer's
 * `ReviewState` (ISO date strings, camelCase) and ts-fsrs `Card`, maps quiz results to
 * ratings and schedules the next review. Pure: the caller persists the returned state.
 */

export { Rating, State };
export type { Grade };

/** Identifies the question a new review state belongs to. */
export interface ReviewTarget {
  questionId: string;
  moduleId: string;
}

/**
 * Scheduler settings. Fuzz is off so the same answers always give the same dates (the app
 * shows "nästa repetition" and tests rely on it). The maximum interval is one year: content
 * is tied to a legal state that changes, so nothing should disappear for longer than that.
 */
export const SCHEDULER_PARAMETERS: FSRSParameters = generatorParameters({
  request_retention: 0.9,
  maximum_interval: 365,
  enable_fuzz: false,
  enable_short_term: true,
});

let defaultScheduler: FSRS | null = null;

function scheduler(): FSRS {
  defaultScheduler ??= fsrs(SCHEDULER_PARAMETERS);
  return defaultScheduler;
}

/* -------------------------------------------------------------------------- ratings */

/**
 * Typical time in milliseconds to answer a question of each type correctly. A correct answer
 * in under 40 % of this is rated Easy, one taking more than 2.5 times this is rated Hard.
 */
export const EXPECTED_RESPONSE_MS: Readonly<Record<QuestionType, number>> = {
  sant_falskt: 8_000,
  flerval: 20_000,
  flersvar: 30_000,
  lucktext: 30_000,
  para_ihop: 45_000,
  ordning: 45_000,
  berakning: 90_000,
  ritning: 60_000,
  oppen: 180_000,
};

export const EASY_FACTOR = 0.4;
export const HARD_FACTOR = 2.5;
/** Scores below this are rated Again, scores from it up to (not including) 1 are Hard. */
export const PASS_SCORE = 0.5;

/**
 * Maps a graded answer to an FSRS rating:
 * - score < 0.5 → Again
 * - 0.5 ≤ score < 1 (partly right) → Hard
 * - fully right → Easy if fast, Hard if very slow, otherwise Good. Speed is judged against
 *   `EXPECTED_RESPONSE_MS` for the question type. Without a usable response time the rating
 *   is Good. Self-assessed answers are never rated Easy (the timer includes the writing).
 */
export function mapAnswerToRating(
  result: Pick<GradedResult, 'score' | 'questionType' | 'selfAssessed'>,
  responseMs: number | null | undefined,
): Grade {
  if (result.score < PASS_SCORE) return Rating.Again;
  if (result.score < 1 - 1e-9) return Rating.Hard;
  if (typeof responseMs !== 'number' || !Number.isFinite(responseMs) || responseMs <= 0) {
    return Rating.Good;
  }
  const expected = EXPECTED_RESPONSE_MS[result.questionType];
  if (responseMs > expected * HARD_FACTOR) return Rating.Hard;
  if (!result.selfAssessed && responseMs < expected * EASY_FACTOR) return Rating.Easy;
  return Rating.Good;
}

/** Swedish label for a rating, for the UI. */
export function ratingLabel(rating: Grade): string {
  switch (rating) {
    case Rating.Again:
      return 'Igen';
    case Rating.Hard:
      return 'Svår';
    case Rating.Good:
      return 'Bra';
    case Rating.Easy:
      return 'Lätt';
  }
}

/* ---------------------------------------------------------------------- conversion */

/** A fresh review state for a question that has never been reviewed; due immediately. */
export function createReviewState(target: ReviewTarget, now: Date = new Date()): ReviewState {
  return fromCard(target, createEmptyCard(now));
}

export function toCard(state: ReviewState): Card {
  const card: Card = {
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsedDays,
    scheduled_days: state.scheduledDays,
    learning_steps: state.learningSteps,
    reps: state.reps,
    lapses: state.lapses,
    state: toFsrsState(state.state),
  };
  if (state.lastReview !== null) card.last_review = new Date(state.lastReview);
  return card;
}

export function fromCard(target: ReviewTarget, card: Card): ReviewState {
  return {
    questionId: target.questionId,
    moduleId: target.moduleId,
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review ? card.last_review.toISOString() : null,
  };
}

function toFsrsState(value: number): State {
  switch (value) {
    case State.Learning:
      return State.Learning;
    case State.Review:
      return State.Review;
    case State.Relearning:
      return State.Relearning;
    default:
      return State.New;
  }
}

/* ------------------------------------------------------------------------ schedule */

export interface ScheduleResult {
  state: ReviewState;
  /** Same instant as `state.due`, as a Date. */
  nextDue: Date;
  /** Whole days until the next review (0 while in a learning step). */
  intervalDays: number;
  log: ReviewLog;
}

function isReviewState(value: ReviewState | ReviewTarget): value is ReviewState {
  return 'stability' in value && 'due' in value;
}

/**
 * Applies one review. `prev` is the stored state, or just the question/module ids for a
 * question that has never been reviewed.
 */
export function schedule(
  prev: ReviewState | ReviewTarget,
  rating: Grade,
  now: Date = new Date(),
): ScheduleResult {
  const target: ReviewTarget = { questionId: prev.questionId, moduleId: prev.moduleId };
  const card = isReviewState(prev) ? toCard(prev) : createEmptyCard(now);
  const { card: scheduled, log } = scheduler().next(card, now, rating);
  const nextCard = capInterval(scheduled, now);
  return {
    state: fromCard(target, nextCard),
    nextDue: nextCard.due,
    intervalDays: nextCard.scheduled_days,
    log,
  };
}

/**
 * ts-fsrs keeps Hard < Good < Easy by adding a day or two, which can push Good/Easy past
 * `maximum_interval`. Clamp so the documented one-year cap really holds.
 */
function capInterval(card: Card, now: Date): Card {
  const max = SCHEDULER_PARAMETERS.maximum_interval;
  if (card.scheduled_days <= max) return card;
  return { ...card, scheduled_days: max, due: new Date(now.getTime() + max * 86_400_000) };
}

/** Current probability (0..1) of recalling the question, per the FSRS forgetting curve. */
export function retrievability(state: ReviewState, now: Date = new Date()): number {
  if (state.state === State.New || state.reps === 0) return 0;
  return scheduler().get_retrievability(toCard(state), now, false);
}
