import { z } from 'zod';
import type { SessionSummary } from '@/engine';

/**
 * The result summary stored with a finished pass (`sessions.result`). Kept small and
 * versioned so Hem and Mina resultat can read it back with zod after app updates.
 */
export const StoredSessionResultSchema = z.object({
  version: z.literal(1),
  title: z.string(),
  total: z.number().int().nonnegative(),
  answered: z.number().int().nonnegative(),
  correct: z.number().int().nonnegative(),
  partial: z.number().int().nonnegative(),
  incorrect: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  percent: z.number(),
  durationMs: z.number().nullable(),
  timeExpired: z.boolean(),
  questions: z.array(
    z.object({
      questionId: z.string(),
      moduleId: z.string(),
      outcome: z.enum(['correct', 'incorrect', 'partial', 'skipped', 'pending_self_grade']),
      score: z.number(),
    }),
  ),
});

export type StoredSessionResult = z.output<typeof StoredSessionResultSchema>;

export function toStoredResult(summary: SessionSummary, title: string): StoredSessionResult {
  return {
    version: 1,
    title,
    total: summary.total,
    answered: summary.answered,
    correct: summary.correct,
    partial: summary.partial,
    incorrect: summary.incorrect,
    skipped: summary.skipped,
    percent: summary.percent,
    durationMs: summary.durationMs,
    timeExpired: summary.timeExpired,
    questions: summary.perQuestion.map((q) => ({
      questionId: q.questionId,
      moduleId: q.moduleId,
      outcome: q.outcome,
      score: q.score,
    })),
  };
}

/** Reads a stored result; null for unfinished passes or an unknown format. */
export function readStoredResult(value: unknown): StoredSessionResult | null {
  const parsed = StoredSessionResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
