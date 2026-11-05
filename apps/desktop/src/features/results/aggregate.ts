import type { Question, QuestionType } from '@bygglov/content-schema';
import type { StudyContent } from '@/content';
import type { Answer, ReviewState } from '@/data';
import {
  mapAnswerToRating,
  questionMasteryCredit,
  schedule,
  type ReviewTarget,
  type SubmittedDecision,
} from '@/engine';
import type { CaseListStatus } from '@/features/cases/case-model';
import { localDateKey, weakTags, type TagStat } from '@/features/progress/progress';

/**
 * Pure aggregations behind Mina resultat: the time window, mastery per module over time,
 * answers per day, weak tags in the window, cases per status and the checks passed per
 * submitted decision. Everything is computed from data-layer rows plus the bundled
 * content, so there is no extra table to keep in sync.
 *
 * Mastery over time is rebuilt by replaying every answer through the same FSRS scheduler
 * the study flow uses (features/study/study-store.ts → persistAnswer): one `schedule` per
 * answer, in answer order, with the rating from `mapAnswerToRating`. At the end of each
 * day the credit per question (engine/review/mastery.ts) is summed per module. The last
 * point therefore equals the mastery computed from the stored review states, and earlier
 * points show what mastery was on that day.
 */

/* ------------------------------------------------------------------------- window */

export type RangeKey = '4v' | '8v' | 'allt';

export const RANGE_OPTIONS: readonly { value: RangeKey; label: string }[] = [
  { value: '4v', label: '4 veckor' },
  { value: '8v', label: '8 veckor' },
  { value: 'allt', label: 'Allt' },
];

export interface ResultsFilter {
  range: RangeKey;
  /** Null means every module. */
  moduleId: string | null;
}

export const DEFAULT_FILTER: ResultsFilter = { range: '8v', moduleId: null };

/** Days in the fixed ranges; "allt" starts at the first activity (at least 4 weeks). */
const RANGE_DAYS: Record<Exclude<RangeKey, 'allt'>, number> = { '4v': 28, '8v': 56 };
const MIN_ALL_DAYS = 28;

function addLocalDays(date: Date, days: number): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** Local midnight of a YYYY-MM-DD key. */
export function dayStart(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/**
 * The calendar days (local YYYY-MM-DD, oldest first) that the range covers, ending today.
 * `firstActivity` is the earliest answer or decision; only "allt" uses it.
 */
export function windowDays(range: RangeKey, now: Date, firstActivity: string | null): string[] {
  const today = addLocalDays(now, 0);
  let count: number;
  if (range === 'allt') {
    const first = firstActivity ? addLocalDays(new Date(firstActivity), 0) : today;
    const span = Math.round((today.getTime() - first.getTime()) / 86_400_000) + 1;
    count = Math.max(MIN_ALL_DAYS, span);
  } else {
    count = RANGE_DAYS[range];
  }
  const days: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) days.push(localDateKey(addLocalDays(today, -i)));
  return days;
}

/** Whether an ISO timestamp falls on one of the window's days. */
export function inWindow(iso: string, days: readonly string[]): boolean {
  if (days.length === 0) return false;
  const key = localDateKey(new Date(iso));
  return key >= (days[0] ?? '') && key <= (days[days.length - 1] ?? '');
}

/** Earliest timestamp among the given ISO strings, null when there are none. */
export function earliest(values: Iterable<string>): string | null {
  let min: string | null = null;
  for (const v of values) if (min === null || v < min) min = v;
  return min;
}

/* ------------------------------------------------------------------------ content */

export interface ResultsModule {
  id: string;
  title: string;
  ordning: number;
  questionCount: number;
}

/** What the aggregations need from the bundled content. */
export interface ResultsContent {
  /** Modules with at least one question, in content order. */
  modules: ResultsModule[];
  questions: ReadonlyMap<string, Question>;
}

export function resultsContent(content: StudyContent): ResultsContent {
  const questions = new Map<string, Question>();
  for (const list of content.questionsByModule.values()) {
    for (const q of list) questions.set(q.id, q);
  }
  const modules = content.modules
    .map((m) => ({
      id: m.id,
      title: m.titel,
      ordning: m.ordning,
      questionCount: content.questionsByModule.get(m.id)?.length ?? 0,
    }))
    .filter((m) => m.questionCount > 0);
  return { modules, questions };
}

/* --------------------------------------------------------------------- module slots */

/** At most this many modules get their own line and colour. */
export const MAX_SERIES = 6;

export interface ModuleSeriesInfo {
  moduleId: string;
  title: string;
  ordning: number;
  /** Colour slot 0..5 (fixed order), null for a studied module beyond the six shown. */
  slot: number | null;
  answered: number;
}

/**
 * The modules she has studied (at least one answer on an existing question). The six with
 * the most answers get a colour slot, assigned in module order, so a module keeps its
 * colour whatever the filters are.
 */
export function studiedModules(
  answers: readonly Answer[],
  content: ResultsContent,
): ModuleSeriesInfo[] {
  const counts = new Map<string, number>();
  for (const a of answers) {
    if (!content.questions.has(a.questionId)) continue;
    counts.set(a.moduleId, (counts.get(a.moduleId) ?? 0) + 1);
  }
  const studied = content.modules.filter((m) => (counts.get(m.id) ?? 0) > 0);
  const top = new Set(
    [...studied]
      .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.ordning - b.ordning)
      .slice(0, MAX_SERIES)
      .map((m) => m.id),
  );
  let slot = 0;
  return [...studied]
    .sort((a, b) => a.ordning - b.ordning)
    .map((m) => ({
      moduleId: m.id,
      title: m.title,
      ordning: m.ordning,
      slot: top.has(m.id) ? slot++ : null,
      answered: counts.get(m.id) ?? 0,
    }));
}

/* ------------------------------------------------------------------ mastery replay */

export interface MasteryPoint {
  day: string;
  /** 0..100. */
  mastery: number;
}

export interface MasterySeries {
  moduleId: string;
  title: string;
  slot: number | null;
  points: MasteryPoint[];
}

export interface MasteryTimeline {
  days: string[];
  /** One series per requested module, in module order. */
  series: MasterySeries[];
  /** Overall mastery per day over every module with questions, weighted by question count. */
  overall: MasteryPoint[];
}

/** A graded answer's score: partial credit when stored, otherwise right/wrong. */
export function answerScore(answer: Pick<Answer, 'score' | 'correct'>): number {
  return answer.score ?? (answer.correct ? 1 : 0);
}

function byTime(a: Answer, b: Answer): number {
  return a.answeredAt < b.answeredAt ? -1 : a.answeredAt > b.answeredAt ? 1 : a.id - b.id;
}

function applyAnswer(
  states: Map<string, ReviewState>,
  answer: Answer,
  content: ResultsContent,
): void {
  const question = content.questions.get(answer.questionId);
  const type: QuestionType = question?.typ ?? 'flerval';
  const target: ReviewTarget = { questionId: answer.questionId, moduleId: answer.moduleId };
  const previous = states.get(answer.questionId);
  const rating = mapAnswerToRating(
    { score: answerScore(answer), questionType: type, selfAssessed: type === 'oppen' },
    answer.responseTimeMs,
  );
  const { state } = schedule(
    previous ? { ...previous, ...target } : target,
    rating,
    new Date(answer.answeredAt),
  );
  states.set(answer.questionId, state);
}

/**
 * Mastery per module and overall at the end of each day. Only the answers matter: credit
 * per question uses FSRS stability, which changes only when the question is answered, so
 * the replay is done once and credit sums are updated incrementally.
 */
export function masteryTimeline(
  answers: readonly Answer[],
  content: ResultsContent,
  days: readonly string[],
  modules: readonly Pick<ModuleSeriesInfo, 'moduleId' | 'title' | 'slot'>[],
): MasteryTimeline {
  const sorted = answers.filter((a) => content.questions.has(a.questionId)).sort(byTime);
  const counts = new Map(content.modules.map((m) => [m.id, m.questionCount]));
  const totalQuestions = content.modules.reduce((sum, m) => sum + m.questionCount, 0);
  const states = new Map<string, ReviewState>();
  const credits = new Map<string, number>();
  const creditSum = new Map<string, number>();
  const series: MasterySeries[] = modules.map((m) => ({
    moduleId: m.moduleId,
    title: m.title,
    slot: m.slot,
    points: [],
  }));
  const overall: MasteryPoint[] = [];
  let index = 0;
  for (const day of days) {
    while (index < sorted.length) {
      const answer = sorted[index];
      if (!answer || localDateKey(new Date(answer.answeredAt)) > day) break;
      applyAnswer(states, answer, content);
      const state = states.get(answer.questionId);
      if (state) {
        const before = credits.get(answer.questionId) ?? 0;
        const after = questionMasteryCredit(state);
        credits.set(answer.questionId, after);
        creditSum.set(state.moduleId, (creditSum.get(state.moduleId) ?? 0) + after - before);
      }
      index += 1;
    }
    for (const s of series) {
      const n = counts.get(s.moduleId) ?? 0;
      s.points.push({
        day,
        mastery: n === 0 ? 0 : Math.round((100 * (creditSum.get(s.moduleId) ?? 0)) / n),
      });
    }
    // Overall: per-module mastery (rounded, like overallMastery) weighted by question count.
    let weighted = 0;
    for (const m of content.modules) {
      const moduleMastery = Math.round((100 * (creditSum.get(m.id) ?? 0)) / m.questionCount);
      weighted += moduleMastery * m.questionCount;
    }
    overall.push({
      day,
      mastery: totalQuestions === 0 ? 0 : Math.round(weighted / totalQuestions),
    });
  }
  return { days: [...days], series, overall };
}

/* ---------------------------------------------------------------- answers per day */

export interface AnswerBucket {
  /** First day of the bucket (YYYY-MM-DD). */
  start: string;
  /** Last day of the bucket; equals `start` for daily buckets. */
  end: string;
  correct: number;
  wrong: number;
}

/** Up to this many days the bars are per day; longer windows are grouped per week. */
export const DAILY_BUCKET_LIMIT = 56;

/**
 * Right and wrong answers per day in the window (per week when the window is longer than
 * eight weeks, counted back from today so the last bar ends today). A partly right answer
 * counts as wrong, like `Answer.correct`.
 */
export function answersPerBucket(
  answers: readonly Answer[],
  days: readonly string[],
  moduleId: string | null = null,
): { unit: 'day' | 'week'; buckets: AnswerBucket[] } {
  const unit = days.length > DAILY_BUCKET_LIMIT ? 'week' : 'day';
  const size = unit === 'week' ? 7 : 1;
  const buckets: AnswerBucket[] = [];
  const bucketOfDay = new Map<string, AnswerBucket>();
  for (let end = days.length - 1; end >= 0; end -= size) {
    const startIndex = Math.max(0, end - size + 1);
    const bucket: AnswerBucket = {
      start: days[startIndex] ?? '',
      end: days[end] ?? '',
      correct: 0,
      wrong: 0,
    };
    buckets.unshift(bucket);
    for (let i = startIndex; i <= end; i += 1) bucketOfDay.set(days[i] ?? '', bucket);
  }
  for (const a of answers) {
    if (moduleId !== null && a.moduleId !== moduleId) continue;
    const bucket = bucketOfDay.get(localDateKey(new Date(a.answeredAt)));
    if (!bucket) continue;
    if (a.correct) bucket.correct += 1;
    else bucket.wrong += 1;
  }
  return { unit, buckets };
}

/* --------------------------------------------------------------------- weak tags */

/**
 * Weak tags among the answers given in the window (and module). Like the overview on
 * Hem, only the latest answer per question counts.
 */
export function weakTagsInWindow(
  answers: readonly Answer[],
  content: ResultsContent,
  days: readonly string[],
  moduleId: string | null = null,
  limit = 8,
): TagStat[] {
  const scoped = answers.filter(
    (a) => (moduleId === null || a.moduleId === moduleId) && inWindow(a.answeredAt, days),
  );
  return weakTags(scoped, content.questions, { limit });
}

/* --------------------------------------------------------------------- hero numbers */

export interface HeroStats {
  answeredToday: number;
  answeredTotal: number;
  /** Change in overall mastery over the last four weeks (percentage points), null without data. */
  masteryDelta: number | null;
}

export function heroStats(
  answers: readonly Answer[],
  overallByDay: readonly MasteryPoint[],
  now: Date,
): HeroStats {
  const today = localDateKey(now);
  const answeredToday = answers.filter(
    (a) => localDateKey(new Date(a.answeredAt)) === today,
  ).length;
  let masteryDelta: number | null = null;
  if (answers.length > 0 && overallByDay.length > 0) {
    const last = overallByDay[overallByDay.length - 1];
    const before = overallByDay[Math.max(0, overallByDay.length - 1 - 28)];
    if (last && before) masteryDelta = last.mastery - before.mastery;
  }
  return { answeredToday, answeredTotal: answers.length, masteryDelta };
}

/* ---------------------------------------------------------------------------- cases */

export const CASE_STATUS_ORDER: readonly CaseListStatus[] = ['ny', 'pagar', 'inlamnat', 'bedomt'];

export function casesPerStatus(
  statuses: readonly CaseListStatus[],
): { status: CaseListStatus; count: number }[] {
  return CASE_STATUS_ORDER.map((status) => ({
    status,
    count: statuses.filter((s) => s === status).length,
  }));
}

export interface CaseDecisionSource {
  caseId: string;
  title: string;
  /** From the stored CaseState, oldest first. */
  decisions: readonly Pick<SubmittedDecision, 'date' | 'assessment'>[];
  /** Real submission times of the decision rows (`beslut.inlamnad`), oldest first. */
  submittedAt: readonly string[];
}

export interface DecisionChecks {
  key: string;
  caseId: string;
  title: string;
  /** Real submission time, null when the row is missing. */
  submittedAt: string | null;
  /** Simulated decision date. */
  decisionDate: string;
  passed: number;
  total: number;
}

/**
 * Checks passed per submitted decision, oldest first. The assessment is the one stored in
 * the case state when the decision was made; the n-th decision in the state belongs to the
 * n-th decision row. With a window, only decisions submitted in it are kept.
 */
export function decisionChecks(
  sources: readonly CaseDecisionSource[],
  days: readonly string[] | null = null,
): DecisionChecks[] {
  const rows: DecisionChecks[] = [];
  for (const source of sources) {
    source.decisions.forEach((decision, i) => {
      const submittedAt = source.submittedAt[i] ?? null;
      if (days && submittedAt && !inWindow(submittedAt, days)) return;
      rows.push({
        key: `${source.caseId}:${i}`,
        caseId: source.caseId,
        title: source.title,
        submittedAt,
        decisionDate: decision.date,
        passed: decision.assessment.passedChecks,
        total: decision.assessment.totalChecks,
      });
    });
  }
  return rows.sort((a, b) =>
    (a.submittedAt ?? a.decisionDate) < (b.submittedAt ?? b.decisionDate) ? -1 : 1,
  );
}
