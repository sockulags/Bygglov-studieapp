import type { Question } from '@bygglov/content-schema';
import type { StudyMode } from '../../data/types';
import { grade, gradeSelfAssessment, isSelfGraded } from '../quiz/grade';
import type { GradedResult, GradeOutcome, GradeResult, QuizAnswer } from '../quiz/types';
import { createRandom, hashSeed, shuffle, type Seed } from './random';

/**
 * Quiz sessions (pass) as a pure state machine. Every function returns a new session object
 * and never mutates its input, so the state can live in a Zustand store and be serialised.
 * Nothing here does I/O: the caller stores `AnswerRecord`s and the summary via the data layer.
 */

/** The study modes this engine runs. Ids match `StudyMode` in the data layer. */
export type SessionMode = Extract<StudyMode, 'quick-quiz' | 'module-review' | 'review' | 'exam'>;

/** Questions of one module, in file order. Structurally a `QuestionFile`. */
export interface QuestionPoolModule {
  modul: string;
  fragor: readonly Question[];
}

export type QuestionPool = readonly QuestionPoolModule[];

export const DEFAULT_QUICK_QUIZ_COUNT = 10;
export const DEFAULT_EXAM_COUNT = 20;

export type SessionConfig =
  | {
      /** Snabbquiz: `count` random questions from the chosen modules (all when empty). */
      mode: 'quick-quiz';
      moduleIds: readonly string[];
      count?: number;
      seed: Seed;
      /** Include open/self-graded questions. Default false. */
      includeSelfGraded?: boolean;
    }
  | {
      /** Modulgenomgång: every question of one module in file order. */
      mode: 'module-review';
      moduleId: string;
      /** Default true. */
      includeSelfGraded?: boolean;
      /** Only used to shuffle `ordning`/`para_ihop` items for display. */
      seed?: Seed;
    }
  | {
      /**
       * Repetition: the given question ids in the given order (pass the due list, most
       * overdue first, or `summary.practiceIds` to practise the mistakes). Unknown ids are
       * reported in `missingIds`.
       */
      mode: 'review';
      questionIds: readonly string[];
      limit?: number;
      seed?: Seed;
    }
  | {
      /** Tentaläge: mixed questions across modules, time limit, feedback only at the end. */
      mode: 'exam';
      /** All modules when omitted or empty. */
      moduleIds?: readonly string[];
      count?: number;
      timeLimitMinutes: number;
      seed: Seed;
      /** Default false. */
      includeSelfGraded?: boolean;
    };

/** Display order for item lists the content stores in the correct order. */
export interface ItemPresentation {
  /** `ordning`: initial (shuffled) order of `poster` indices. */
  initialOrder?: number[];
  /** `para_ihop`: order in which to show the right-hand sides (indices into `par`). */
  rightOrder?: number[];
}

export interface ItemResponse {
  answer: QuizAnswer;
  /** Self-graded until `selfAssess` has been called, then graded. */
  result: GradeResult;
  responseMs: number | null;
  answeredAt: string;
}

export interface SessionItem {
  question: Question;
  moduleId: string;
  presentation: ItemPresentation;
  response: ItemResponse | null;
}

export type SessionStatus = 'active' | 'finished';

export interface QuizSession {
  mode: SessionMode;
  /** Numeric seed actually used. */
  seed: number;
  items: SessionItem[];
  /** Index of the current item; equals `items.length` once past the last one. */
  index: number;
  status: SessionStatus;
  startedAt: string;
  finishedAt: string | null;
  /** Exam only. */
  timeLimitMs: number | null;
  endsAt: string | null;
  /** True when the session was finished because the time ran out. */
  timeExpired: boolean;
  /** 'end' in exam mode: the UI should hide results and explanations until the summary. */
  feedback: 'immediate' | 'end';
  /** Requested question ids (review mode) that were not found in the pool. */
  missingIds: string[];
}

/** What the caller stores per answer. Compatible with the data layer's `NewAnswer`. */
export interface AnswerRecord {
  questionId: string;
  moduleId: string;
  correct: boolean;
  score: number;
  answer: QuizAnswer;
  responseTimeMs: number | null;
  mode: SessionMode;
  answeredAt: string;
}

export type AnswerFailure =
  'finished' | 'expired' | 'already_answered' | 'not_pending_self_grade' | 'type_mismatch';

export type AnswerOutcome =
  | {
      ok: true;
      session: QuizSession;
      result: GradeResult;
      /** Null while a self-graded answer waits for `selfAssess`. */
      record: AnswerRecord | null;
    }
  | { ok: false; reason: AnswerFailure; session: QuizSession };

export interface AnswerOptions {
  /** Time from showing the question to submitting, in milliseconds. */
  responseMs?: number | null;
  now?: Date;
}

/* ---------------------------------------------------------------------------- create */

export class EmptySessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmptySessionError';
  }
}

/**
 * Creates a session. Throws `EmptySessionError` when no question matches, so the UI can
 * say so instead of showing an empty quiz.
 */
export function createSession(
  config: SessionConfig,
  pool: QuestionPool,
  now: Date = new Date(),
): QuizSession {
  const seed = hashSeed(config.seed ?? now.getTime());
  const random = createRandom(seed);
  let picked: { question: Question; moduleId: string }[];
  const missingIds: string[] = [];

  switch (config.mode) {
    case 'quick-quiz': {
      const candidates = filterSelfGraded(
        questionsOf(pool, config.moduleIds),
        config.includeSelfGraded ?? false,
      );
      picked = shuffle(candidates, random).slice(
        0,
        positiveCount(config.count, DEFAULT_QUICK_QUIZ_COUNT),
      );
      break;
    }
    case 'module-review': {
      picked = filterSelfGraded(
        questionsOf(pool, [config.moduleId]),
        config.includeSelfGraded ?? true,
      );
      break;
    }
    case 'review': {
      const byId = new Map(questionsOf(pool, []).map((entry) => [entry.question.id, entry]));
      const unique = [...new Set(config.questionIds)];
      picked = [];
      for (const id of unique) {
        const entry = byId.get(id);
        if (entry) picked.push(entry);
        else missingIds.push(id);
      }
      if (config.limit !== undefined) picked = picked.slice(0, Math.max(0, config.limit));
      break;
    }
    case 'exam': {
      const candidates = filterSelfGraded(
        questionsOf(pool, config.moduleIds ?? []),
        config.includeSelfGraded ?? false,
      );
      picked = pickMixed(candidates, positiveCount(config.count, DEFAULT_EXAM_COUNT), random);
      break;
    }
  }

  if (picked.length === 0) {
    throw new EmptySessionError(
      config.mode === 'review'
        ? 'Det finns inga frågor att repetera.'
        : 'Det finns inga frågor att visa i det här urvalet.',
    );
  }

  const timeLimitMs =
    config.mode === 'exam' ? Math.max(1, Math.round(config.timeLimitMinutes * 60_000)) : null;
  return {
    mode: config.mode,
    seed,
    items: picked.map(({ question, moduleId }) => ({
      question,
      moduleId,
      presentation: presentationFor(question, random),
      response: null,
    })),
    index: 0,
    status: 'active',
    startedAt: now.toISOString(),
    finishedAt: null,
    timeLimitMs,
    endsAt: timeLimitMs === null ? null : new Date(now.getTime() + timeLimitMs).toISOString(),
    timeExpired: false,
    feedback: config.mode === 'exam' ? 'end' : 'immediate',
    missingIds,
  };
}

function positiveCount(count: number | undefined, fallback: number): number {
  if (count === undefined || !Number.isFinite(count)) return fallback;
  return Math.max(1, Math.floor(count));
}

function questionsOf(
  pool: QuestionPool,
  moduleIds: readonly string[],
): { question: Question; moduleId: string }[] {
  const wanted = new Set(moduleIds);
  const seen = new Set<string>();
  const result: { question: Question; moduleId: string }[] = [];
  for (const module of pool) {
    if (wanted.size > 0 && !wanted.has(module.modul)) continue;
    for (const question of module.fragor) {
      if (seen.has(question.id)) continue;
      seen.add(question.id);
      result.push({ question, moduleId: module.modul });
    }
  }
  return result;
}

function filterSelfGraded<T extends { question: Question }>(entries: T[], include: boolean): T[] {
  return include ? entries : entries.filter((entry) => !isSelfGraded(entry.question));
}

/**
 * Exam selection: shuffle each module, take questions round-robin across modules so every
 * module is represented, then shuffle the result so modules and types are interleaved.
 */
function pickMixed<T extends { moduleId: string }>(
  entries: readonly T[],
  count: number,
  random: () => number,
): T[] {
  const byModule = new Map<string, T[]>();
  for (const entry of entries) {
    const list = byModule.get(entry.moduleId) ?? [];
    list.push(entry);
    byModule.set(entry.moduleId, list);
  }
  const queues = [...byModule.values()].map((list) => shuffle(list, random));
  const picked: T[] = [];
  while (picked.length < count && queues.some((q) => q.length > 0)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next !== undefined && picked.length < count) picked.push(next);
    }
  }
  return shuffle(picked, random);
}

function presentationFor(question: Question, random: () => number): ItemPresentation {
  if (question.typ === 'ordning') {
    const indices = question.poster.map((_, i) => i);
    let order = shuffle(indices, random);
    // Never present the list already solved.
    if (order.every((value, i) => value === i)) order = [...indices.slice(1), indices[0] ?? 0];
    return { initialOrder: order };
  }
  if (question.typ === 'para_ihop') {
    return {
      rightOrder: shuffle(
        question.par.map((_, i) => i),
        random,
      ),
    };
  }
  return {};
}

/* ------------------------------------------------------------------------- navigation */

export function currentItem(session: QuizSession): SessionItem | null {
  return session.status === 'active' ? (session.items[session.index] ?? null) : null;
}

/** Moves to the next question; unanswered questions count as skipped. Finishes after the last. */
export function next(session: QuizSession, now: Date = new Date()): QuizSession {
  if (session.status === 'finished') return session;
  if (isExpired(session, now)) return finish(session, now);
  const index = session.index + 1;
  if (index >= session.items.length)
    return finish({ ...session, index: session.items.length }, now);
  return { ...session, index };
}

/** Ends the session (also early, e.g. when the learner gives up or the exam time is out). */
export function finish(session: QuizSession, now: Date = new Date()): QuizSession {
  if (session.status === 'finished') return session;
  return {
    ...session,
    status: 'finished',
    finishedAt: now.toISOString(),
    timeExpired: session.timeExpired || isExpired(session, now),
  };
}

export function isExpired(session: QuizSession, now: Date = new Date()): boolean {
  return session.endsAt !== null && now.getTime() >= Date.parse(session.endsAt);
}

/** Milliseconds left in an exam, or null for sessions without a time limit. */
export function remainingMs(session: QuizSession, now: Date = new Date()): number | null {
  if (session.endsAt === null) return null;
  return Math.max(0, Date.parse(session.endsAt) - now.getTime());
}

/* ---------------------------------------------------------------------------- answer */

/**
 * Grades the current question. Does not advance; call `next` when the learner continues.
 * Open questions return a self-graded result and no record until `selfAssess` is called.
 */
export function answer(
  session: QuizSession,
  given: QuizAnswer,
  options: AnswerOptions = {},
): AnswerOutcome {
  const now = options.now ?? new Date();
  const guard = guardActive(session, now);
  if (guard) return guard;
  const item = session.items[session.index];
  if (!item) return { ok: false, reason: 'finished', session };
  if (item.response !== null) return { ok: false, reason: 'already_answered', session };
  if (given.type !== item.question.typ) return { ok: false, reason: 'type_mismatch', session };

  const result = grade(item.question, given);
  const responseMs = sanitizeMs(options.responseMs);
  const response: ItemResponse = {
    answer: given,
    result,
    responseMs,
    answeredAt: now.toISOString(),
  };
  const updated = replaceItem(session, session.index, { ...item, response });
  return {
    ok: true,
    session: updated,
    result,
    record: result.kind === 'graded' ? toRecord(updated, item, response, result) : null,
  };
}

/**
 * Finishes a self-graded answer with the indices of the assessment criteria the learner
 * ticked. Defaults to the current item; pass `itemIndex` to self-assess from the summary
 * (allowed also after the session has finished, e.g. when the exam time ran out).
 */
export function selfAssess(
  session: QuizSession,
  checkedCriteria: readonly number[],
  itemIndex: number = session.index,
): AnswerOutcome {
  const item = session.items[itemIndex];
  if (!item?.response || item.response.result.kind !== 'self_graded') {
    return { ok: false, reason: 'not_pending_self_grade', session };
  }
  const result = gradeSelfAssessment(item.response.result, checkedCriteria);
  const response: ItemResponse = { ...item.response, result };
  const updated = replaceItem(session, itemIndex, { ...item, response });
  return { ok: true, session: updated, result, record: toRecord(updated, item, response, result) };
}

function guardActive(session: QuizSession, now: Date): AnswerOutcome | null {
  if (session.status === 'finished') {
    return { ok: false, reason: session.timeExpired ? 'expired' : 'finished', session };
  }
  if (isExpired(session, now)) {
    return { ok: false, reason: 'expired', session: finish(session, now) };
  }
  return null;
}

function sanitizeMs(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
}

function replaceItem(session: QuizSession, index: number, item: SessionItem): QuizSession {
  const items = session.items.slice();
  items[index] = item;
  return { ...session, items };
}

function toRecord(
  session: QuizSession,
  item: SessionItem,
  response: ItemResponse,
  result: GradedResult,
): AnswerRecord {
  return {
    questionId: item.question.id,
    moduleId: item.moduleId,
    correct: result.outcome === 'correct',
    score: result.score,
    answer: response.answer,
    responseTimeMs: response.responseMs,
    mode: session.mode,
    answeredAt: response.answeredAt,
  };
}

/* --------------------------------------------------------------------------- summary */

export type QuestionSummaryOutcome = GradeOutcome | 'skipped' | 'pending_self_grade';

export interface QuestionSummary {
  questionId: string;
  moduleId: string;
  questionType: Question['typ'];
  outcome: QuestionSummaryOutcome;
  score: number;
  responseMs: number | null;
  /** Kept so the summary can show explanations without the session. */
  result: GradeResult | null;
}

export interface ModuleSummary {
  moduleId: string;
  total: number;
  correct: number;
  /** Sum of scores. */
  score: number;
}

export interface SessionSummary {
  mode: SessionMode;
  total: number;
  answered: number;
  correct: number;
  partial: number;
  incorrect: number;
  skipped: number;
  pendingSelfGrade: number;
  /** Sum of scores (partial credit counts). */
  score: number;
  /** score / total as a whole percentage. */
  percent: number;
  perQuestion: QuestionSummary[];
  perModule: ModuleSummary[];
  /** "Öva på felen": wrong, partly right and skipped questions, in session order. */
  practiceIds: string[];
  durationMs: number | null;
  timeExpired: boolean;
}

/** Result of the session so far (or in full once finished). */
export function summary(session: QuizSession): SessionSummary {
  const perQuestion = session.items.map((item): QuestionSummary => {
    const result = item.response?.result ?? null;
    let outcome: QuestionSummaryOutcome;
    let score = 0;
    if (!result) outcome = 'skipped';
    else if (result.kind === 'self_graded') outcome = 'pending_self_grade';
    else {
      outcome = result.outcome;
      score = result.score;
    }
    return {
      questionId: item.question.id,
      moduleId: item.moduleId,
      questionType: item.question.typ,
      outcome,
      score,
      responseMs: item.response?.responseMs ?? null,
      result,
    };
  });

  const count = (outcome: QuestionSummaryOutcome) =>
    perQuestion.filter((q) => q.outcome === outcome).length;
  const score = perQuestion.reduce((sum, q) => sum + q.score, 0);
  const modules = new Map<string, ModuleSummary>();
  for (const q of perQuestion) {
    const entry = modules.get(q.moduleId) ?? {
      moduleId: q.moduleId,
      total: 0,
      correct: 0,
      score: 0,
    };
    entry.total += 1;
    entry.score += q.score;
    if (q.outcome === 'correct') entry.correct += 1;
    modules.set(q.moduleId, entry);
  }
  const total = perQuestion.length;
  return {
    mode: session.mode,
    total,
    answered: perQuestion.filter((q) => q.outcome !== 'skipped').length,
    correct: count('correct'),
    partial: count('partial'),
    incorrect: count('incorrect'),
    skipped: count('skipped'),
    pendingSelfGrade: count('pending_self_grade'),
    score,
    percent: total === 0 ? 0 : Math.round((score / total) * 100),
    perQuestion,
    perModule: [...modules.values()].sort((a, b) => a.moduleId.localeCompare(b.moduleId)),
    practiceIds: perQuestion
      .filter(
        (q) => q.outcome === 'incorrect' || q.outcome === 'partial' || q.outcome === 'skipped',
      )
      .map((q) => q.questionId),
    durationMs:
      session.finishedAt === null
        ? null
        : Date.parse(session.finishedAt) - Date.parse(session.startedAt),
    timeExpired: session.timeExpired,
  };
}
