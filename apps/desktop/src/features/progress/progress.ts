import type { Question } from '@bygglov/content-schema';
import type { StudyContent } from '@/content';
import type { Answer, ReviewState, Session } from '@/data';
import { masteryByModule } from '@/engine';

/**
 * Pure helpers for the progress overviews on Hem and Mina resultat: streak, mastery per
 * module, due counts and weak tags. Everything is computed from data-layer rows plus the
 * bundled content, so it can be unit-tested without React.
 */

/** Local calendar date as YYYY-MM-DD. */
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function previousDay(date: Date): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() - 1);
  return copy;
}

export interface Streak {
  /** Consecutive days with at least one finished pass, ending today or yesterday. */
  days: number;
  studiedToday: boolean;
}

/**
 * Soft streak (docs/02 → Progression): counts days with a finished pass. A day without a
 * pass only breaks the streak once it is over, so not having studied yet today keeps
 * yesterday's streak alive.
 */
export function computeStreak(sessions: readonly Session[], now: Date = new Date()): Streak {
  const days = new Set(
    sessions
      .filter((s) => s.finishedAt !== null)
      .map((s) => localDateKey(new Date(s.finishedAt ?? s.startedAt))),
  );
  const studiedToday = days.has(localDateKey(now));
  let cursor = studiedToday ? now : previousDay(now);
  let count = 0;
  while (days.has(localDateKey(cursor))) {
    count += 1;
    cursor = previousDay(cursor);
  }
  return { days: count, studiedToday };
}

export interface ModuleProgress {
  moduleId: string;
  title: string;
  description: string;
  ordning: number;
  questionCount: number;
  openCount: number;
  /** 0..100, see engine/review/mastery.ts. */
  mastery: number;
  /** Questions due for repetition now. */
  due: number;
  /** Questions answered at least once (have a review state). */
  seen: number;
}

/** Mastery, due and seen counts for every module in the content. */
export function moduleProgress(
  content: StudyContent,
  reviewStates: readonly ReviewState[],
  now: Date = new Date(),
): ModuleProgress[] {
  const counts: Record<string, number> = {};
  for (const module of content.modules) {
    counts[module.id] = content.questionsByModule.get(module.id)?.length ?? 0;
  }
  const known = new Set<string>();
  for (const questions of content.questionsByModule.values()) {
    for (const q of questions) known.add(q.id);
  }
  // Ignore states for questions that no longer exist in the content.
  const states = reviewStates.filter((s) => known.has(s.questionId));
  const masteries = masteryByModule(states, counts);
  const cutoff = now.toISOString();
  return content.modules.map((module) => {
    const questions = content.questionsByModule.get(module.id) ?? [];
    const own = states.filter((s) => s.moduleId === module.id);
    return {
      moduleId: module.id,
      title: module.titel,
      description: module.beskrivning,
      ordning: module.ordning,
      questionCount: questions.length,
      openCount: questions.filter((q) => q.typ === 'oppen').length,
      mastery: masteries[module.id] ?? 0,
      due: own.filter((s) => s.due <= cutoff).length,
      seen: own.length,
    };
  });
}

/** Mastery over all modules that have questions, weighted by number of questions. */
export function overallMastery(progress: readonly ModuleProgress[]): number {
  const withQuestions = progress.filter((p) => p.questionCount > 0);
  const total = withQuestions.reduce((sum, p) => sum + p.questionCount, 0);
  if (total === 0) return 0;
  return Math.round(withQuestions.reduce((sum, p) => sum + p.mastery * p.questionCount, 0) / total);
}

/** Number of due questions that still exist in the content. */
export function dueCount(
  content: StudyContent,
  due: readonly ReviewState[],
  moduleIds: readonly string[] = [],
): number {
  const known = new Set<string>();
  for (const [moduleId, questions] of content.questionsByModule) {
    if (moduleIds.length > 0 && !moduleIds.includes(moduleId)) continue;
    for (const q of questions) known.add(q.id);
  }
  return due.filter((d) => known.has(d.questionId)).length;
}

/** Earliest upcoming review, or null when nothing is scheduled. */
export function nextReviewDate(reviewStates: readonly ReviewState[]): Date | null {
  let min: string | null = null;
  for (const s of reviewStates) if (min === null || s.due < min) min = s.due;
  return min === null ? null : new Date(min);
}

export interface TagStat {
  tag: string;
  answered: number;
  correct: number;
  /** 0..1, partial credit counts. */
  accuracy: number;
}

/**
 * Tags whose questions are answered worst. Only the latest answer per question counts, so
 * a question practised until it is right stops pulling its tags down.
 */
export function weakTags(
  answers: readonly Answer[],
  questions: ReadonlyMap<string, Question>,
  options: { minAnswers?: number; limit?: number; below?: number } = {},
): TagStat[] {
  const { minAnswers = 2, limit = 5, below = 0.8 } = options;
  const latest = new Map<string, Answer>();
  for (const a of answers) {
    const existing = latest.get(a.questionId);
    if (!existing || a.answeredAt >= existing.answeredAt) latest.set(a.questionId, a);
  }
  const stats = new Map<string, { answered: number; correct: number; score: number }>();
  for (const a of latest.values()) {
    const question = questions.get(a.questionId);
    if (!question) continue;
    const score = a.score ?? (a.correct ? 1 : 0);
    for (const tag of question.taggar) {
      const entry = stats.get(tag) ?? { answered: 0, correct: 0, score: 0 };
      entry.answered += 1;
      entry.score += score;
      if (a.correct) entry.correct += 1;
      stats.set(tag, entry);
    }
  }
  return [...stats.entries()]
    .map(([tag, s]) => ({
      tag,
      answered: s.answered,
      correct: s.correct,
      accuracy: s.score / s.answered,
    }))
    .filter((s) => s.answered >= minAnswers && s.accuracy < below)
    .sort(
      (a, b) => a.accuracy - b.accuracy || b.answered - a.answered || a.tag.localeCompare(b.tag),
    )
    .slice(0, limit);
}

/** All questions by id. */
export function questionIndex(content: StudyContent): Map<string, Question> {
  const map = new Map<string, Question>();
  for (const questions of content.questionsByModule.values()) {
    for (const q of questions) map.set(q.id, q);
  }
  return map;
}

/** "lovbefriad_tillbyggnad" → "lovbefriad tillbyggnad". */
export function tagLabel(tag: string): string {
  return tag.replace(/_/g, ' ');
}
