import { describe, expect, it } from 'vitest';
import type { ReviewState } from '../../data/types';
import {
  createReviewState,
  fromCard,
  mapAnswerToRating,
  Rating,
  ratingLabel,
  retrievability,
  schedule,
  State,
  toCard,
} from './fsrs';
import { mastery, masteryByModule, questionMasteryCredit } from './mastery';

const NOW = new Date('2026-11-04T10:00:00Z');
const target = { questionId: 'lov-001', moduleId: '03-lovplikt' };
const DAY = 86_400_000;

function result(
  score: number,
  questionType: 'flerval' | 'oppen' = 'flerval',
  selfAssessed = false,
) {
  return { score, questionType, selfAssessed } as const;
}

function stateWith(overrides: Partial<ReviewState>): ReviewState {
  return { ...createReviewState(target, NOW), ...overrides };
}

describe('mapAnswerToRating', () => {
  it('maps wrong and mostly wrong answers to Again', () => {
    expect(mapAnswerToRating(result(0), 5000)).toBe(Rating.Again);
    expect(mapAnswerToRating(result(0.49), 5000)).toBe(Rating.Again);
  });

  it('maps partly right answers to Hard', () => {
    expect(mapAnswerToRating(result(0.5), 1000)).toBe(Rating.Hard);
    expect(mapAnswerToRating(result(0.9), 1000)).toBe(Rating.Hard);
  });

  it('uses the response time for correct answers', () => {
    expect(mapAnswerToRating(result(1), 5_000)).toBe(Rating.Easy);
    expect(mapAnswerToRating(result(1), 15_000)).toBe(Rating.Good);
    expect(mapAnswerToRating(result(1), 60_000)).toBe(Rating.Hard);
  });

  it('falls back to Good without a usable time and never gives Easy for self-assessment', () => {
    expect(mapAnswerToRating(result(1), null)).toBe(Rating.Good);
    expect(mapAnswerToRating(result(1), undefined)).toBe(Rating.Good);
    expect(mapAnswerToRating(result(1), Number.NaN)).toBe(Rating.Good);
    expect(mapAnswerToRating(result(1), 0)).toBe(Rating.Good);
    expect(mapAnswerToRating(result(1, 'oppen', true), 1_000)).toBe(Rating.Good);
  });

  it('has Swedish labels', () => {
    expect(ratingLabel(Rating.Again)).toBe('Igen');
    expect(ratingLabel(Rating.Easy)).toBe('Lätt');
  });
});

describe('schedule', () => {
  it('starts a new question from just its ids', () => {
    const { state, nextDue, log } = schedule(target, Rating.Good, NOW);
    expect(state.questionId).toBe('lov-001');
    expect(state.moduleId).toBe('03-lovplikt');
    expect(state.reps).toBe(1);
    expect(state.lastReview).toBe(NOW.toISOString());
    expect(state.due).toBe(nextDue.toISOString());
    expect(nextDue.getTime()).toBeGreaterThan(NOW.getTime());
    expect(log.rating).toBe(Rating.Good);
  });

  it('is deterministic (no fuzz)', () => {
    expect(schedule(target, Rating.Good, NOW).state).toEqual(
      schedule(target, Rating.Good, NOW).state,
    );
  });

  it('gives longer intervals for better ratings', () => {
    const due = (rating: Parameters<typeof schedule>[1]) =>
      schedule(target, rating, NOW).nextDue.getTime();
    expect(due(Rating.Again)).toBeLessThanOrEqual(due(Rating.Hard));
    expect(due(Rating.Hard)).toBeLessThanOrEqual(due(Rating.Good));
    expect(due(Rating.Good)).toBeLessThan(due(Rating.Easy));
  });

  it('grows the interval over successful reviews and shrinks it after a lapse', () => {
    let now = NOW;
    let state = schedule(target, Rating.Good, now).state;
    const intervals: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      now = new Date(state.due);
      const r = schedule(state, Rating.Good, now);
      intervals.push(r.intervalDays);
      state = r.state;
    }
    expect(state.state).toBe(State.Review);
    for (let i = 1; i < intervals.length; i += 1) {
      expect(intervals[i]).toBeGreaterThanOrEqual(intervals[i - 1] ?? 0);
    }
    const stabilityBefore = state.stability;
    const lapse = schedule(state, Rating.Again, new Date(state.due));
    expect(lapse.state.lapses).toBe(1);
    expect(lapse.state.stability).toBeLessThan(stabilityBefore);
    expect(lapse.state.state).toBe(State.Relearning);
  });

  it('caps intervals at one year', () => {
    let state = schedule(target, Rating.Easy, NOW).state;
    for (let i = 0; i < 12; i += 1) state = schedule(state, Rating.Easy, new Date(state.due)).state;
    expect(state.scheduledDays).toBeLessThanOrEqual(365);
  });

  it('round-trips ReviewState <-> Card', () => {
    const { state } = schedule(target, Rating.Hard, NOW);
    expect(fromCard(target, toCard(state))).toEqual(state);
    const fresh = createReviewState(target, NOW);
    expect(fresh).toMatchObject({
      reps: 0,
      state: State.New,
      lastReview: null,
      due: NOW.toISOString(),
    });
    expect(toCard(fresh).last_review).toBeUndefined();
  });

  it('retrievability is 0 for new questions and falls over time', () => {
    expect(retrievability(createReviewState(target, NOW), NOW)).toBe(0);
    const { state } = schedule(target, Rating.Good, NOW);
    const soon = retrievability(state, new Date(NOW.getTime() + DAY));
    const later = retrievability(state, new Date(NOW.getTime() + 60 * DAY));
    expect(soon).toBeGreaterThan(later);
  });
});

describe('mastery', () => {
  const reviewed = (questionId: string, stability: number, lastReview = NOW.toISOString()) =>
    stateWith({ questionId, stability, reps: 3, state: State.Review, lastReview });

  it('is 0 without data and for unreviewed questions', () => {
    expect(mastery([])).toBe(0);
    expect(mastery([createReviewState(target, NOW)])).toBe(0);
    expect(mastery([], { totalQuestions: 10 })).toBe(0);
  });

  it('counts questions at or above the stability threshold as mastered', () => {
    expect(mastery([reviewed('a', 21), reviewed('b', 100)])).toBe(100);
    expect(mastery([reviewed('a', 30), reviewed('b', 30)], { totalQuestions: 4 })).toBe(50);
  });

  it('gives partial credit below the threshold', () => {
    expect(mastery([reviewed('a', 10.5)])).toBe(50);
    expect(mastery([reviewed('a', 7)], { thresholdDays: 14 })).toBe(50);
    expect(questionMasteryCredit({ stability: 0, state: State.Review, reps: 1 })).toBe(0);
  });

  it('keeps the latest state for duplicate question ids', () => {
    const old = reviewed('a', 100, '2026-01-01T00:00:00.000Z');
    const latest = reviewed('a', 0.5, '2026-11-01T00:00:00.000Z');
    expect(mastery([latest, old])).toBe(Math.round((100 * 0.5) / 21));
  });

  it('computes mastery per module', () => {
    const states = [
      { ...reviewed('a', 21), moduleId: '03-lovplikt' },
      { ...reviewed('b', 21), moduleId: '06-handlaggning' },
    ];
    expect(
      masteryByModule(states, { '03-lovplikt': 2, '06-handlaggning': 1, '01-forvaltning': 5 }),
    ).toEqual({
      '03-lovplikt': 50,
      '06-handlaggning': 100,
      '01-forvaltning': 0,
    });
  });
});
