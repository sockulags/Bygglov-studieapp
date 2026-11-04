import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { queryClient } from '@/app/query-client';
import { loadContent, type StudyContent } from '@/content';
import { dataKeys, getDataStore } from '@/data';
import {
  answer as answerQuestion,
  createSession,
  EmptySessionError,
  finish,
  isExpired,
  mapAnswerToRating,
  next,
  randomSeed,
  schedule,
  selfAssess,
  summary,
  type AnswerRecord,
  type GradedResult,
  type QuestionPool,
  type QuizAnswer,
  type QuizSession,
  type SessionConfig,
} from '@/engine';
import { EXAM_MINUTES, EXAM_QUESTION_COUNT, modeInfo, type PracticeMode } from './modes';
import { toStoredResult } from './session-result';

/**
 * The pass (study session) in progress. The quiz state itself is the engine's pure
 * `QuizSession`; this store adds what the UI needs around it (title, data-layer session id)
 * and does the I/O: every graded answer is written to the data store and updates the FSRS
 * state, and the summary is stored when the pass ends. The run is kept in localStorage so
 * an interrupted pass can be resumed ("Fortsätt där du var").
 */

export interface StudyRun {
  /** Random key, changes for every new pass. */
  key: string;
  mode: PracticeMode;
  title: string;
  moduleIds: string[];
  /** Id in the data store's `sessions`, null if it could not be created. */
  dataSessionId: number | null;
  session: QuizSession;
  /** True once the summary has been stored. */
  saved: boolean;
  /** What started the pass, so "Nytt pass" can start the same kind again. */
  request: StartRequest;
}

interface StudyState {
  run: StudyRun | null;
  /** Set when writing to the data store failed; shown discreetly in the quiz view. */
  saveError: string | null;
}

export type StartRequest =
  /** Empty `moduleIds` means all modules. */
  | { mode: 'quick-quiz'; moduleIds: readonly string[] }
  | { mode: 'module-review'; moduleId: string }
  /** Due questions, optionally limited to some modules. */
  | { mode: 'review'; moduleIds: readonly string[] }
  | { mode: 'study'; moduleId: string }
  | { mode: 'exam'; moduleIds: readonly string[] }
  /** "Öva på felen": the given questions as a repetition pass. */
  | { mode: 'practice'; questionIds: readonly string[]; moduleIds: readonly string[] };

const STORAGE_KEY = 'bygglov-pass';
const SAVE_ERROR = 'Det senaste svaret kunde inte sparas. Passet fortsätter ändå.';

export const useStudyStore = create<StudyState>()(
  persist((): StudyState => ({ run: null, saveError: null }), {
    name: STORAGE_KEY,
    version: 1,
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => ({ run: state.run }),
    merge: (persisted, current) => {
      const run = (persisted as { run?: StudyRun | null } | undefined)?.run ?? null;
      return { ...current, run: run && isRunStillValid(run) ? run : null };
    },
  }),
);

/** A stored run survives only if all its questions still exist in the bundled content. */
function isRunStillValid(run: StudyRun): boolean {
  try {
    if (!Array.isArray(run.session?.items)) return false;
    const content = loadContent();
    const ids = new Set<string>();
    for (const questions of content.questionsByModule.values()) {
      for (const q of questions) ids.add(q.id);
    }
    return run.session.items.every((item) => ids.has(item.question.id));
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------- persistence queue */

let queue: Promise<void> = Promise.resolve();

/** Runs data-store writes one at a time, in order, and refreshes the data queries. */
function enqueue(task: () => Promise<void>): Promise<void> {
  queue = queue
    .then(task)
    .then(() => queryClient.invalidateQueries({ queryKey: dataKeys.all }))
    .catch((error: unknown) => {
      console.error('Kunde inte spara studiedata', error);
      useStudyStore.setState({ saveError: SAVE_ERROR });
    });
  return queue;
}

/** Resolves when everything queued so far has been written (used by tests). */
export function flushStudyWrites(): Promise<void> {
  return queue;
}

function persistAnswer(run: StudyRun, record: AnswerRecord, result: GradedResult): void {
  const { dataSessionId, mode } = run;
  void enqueue(async () => {
    const store = await getDataStore();
    await store.answers.recordAnswer({
      questionId: record.questionId,
      moduleId: record.moduleId,
      correct: record.correct,
      score: record.score,
      answer: record.answer,
      responseTimeMs: record.responseTimeMs,
      mode,
      sessionId: dataSessionId,
      answeredAt: record.answeredAt,
    });
    const previous = await store.reviews.getReviewState(record.questionId);
    const target = { questionId: record.questionId, moduleId: record.moduleId };
    const rating = mapAnswerToRating(result, record.responseTimeMs);
    const { state } = schedule(
      previous ? { ...previous, ...target } : target,
      rating,
      new Date(record.answeredAt),
    );
    await store.reviews.upsertReviewState(state);
  });
}

function persistSummary(run: StudyRun): void {
  const { dataSessionId } = run;
  if (dataSessionId === null) return;
  const result = toStoredResult(summary(run.session), run.title);
  const finishedAt = run.session.finishedAt ?? new Date().toISOString();
  void enqueue(async () => {
    const store = await getDataStore();
    await store.sessions.finishSession(dataSessionId, result, finishedAt);
  });
}

/* ---------------------------------------------------------------------------- start */

export function questionPool(content: StudyContent): QuestionPool {
  return [...content.questionsByModule.entries()].map(([modul, fragor]) => ({ modul, fragor }));
}

function moduleTitle(content: StudyContent, moduleIds: readonly string[]): string {
  if (moduleIds.length === 0) return 'alla moduler';
  if (moduleIds.length > 1) return `${moduleIds.length} moduler`;
  const [id] = moduleIds;
  return content.modules.find((m) => m.id === id)?.titel ?? String(id);
}

interface Plan {
  mode: PracticeMode;
  title: string;
  moduleIds: string[];
  config: SessionConfig;
}

async function planRun(request: StartRequest, content: StudyContent): Promise<Plan> {
  switch (request.mode) {
    case 'quick-quiz':
      return {
        mode: 'quick-quiz',
        title: `${modeInfo('quick-quiz').short} · ${moduleTitle(content, request.moduleIds)}`,
        moduleIds: [...request.moduleIds],
        config: { mode: 'quick-quiz', moduleIds: request.moduleIds, seed: randomSeed() },
      };
    case 'module-review':
      return {
        mode: 'module-review',
        title: `${modeInfo('module-review').short} · ${moduleTitle(content, [request.moduleId])}`,
        moduleIds: [request.moduleId],
        config: { mode: 'module-review', moduleId: request.moduleId, seed: randomSeed() },
      };
    case 'review': {
      const store = await getDataStore();
      const due = await store.reviews.getDue(new Date(), { moduleIds: request.moduleIds });
      if (due.length === 0) {
        throw new EmptySessionError('Inga frågor väntar på repetition just nu. Bra jobbat!');
      }
      return {
        mode: 'review',
        title: `${modeInfo('review').short} · ${moduleTitle(content, request.moduleIds)}`,
        moduleIds: [...request.moduleIds],
        config: { mode: 'review', questionIds: due.map((d) => d.questionId), seed: randomSeed() },
      };
    }
    case 'study': {
      const open = (content.questionsByModule.get(request.moduleId) ?? []).filter(
        (q) => q.typ === 'oppen',
      );
      if (open.length === 0) {
        throw new EmptySessionError('Modulen har inga öppna instuderingsfrågor ännu.');
      }
      return {
        mode: 'study',
        title: `${modeInfo('study').short} · ${moduleTitle(content, [request.moduleId])}`,
        moduleIds: [request.moduleId],
        config: { mode: 'review', questionIds: open.map((q) => q.id), seed: randomSeed() },
      };
    }
    case 'exam':
      return {
        mode: 'exam',
        title: `${modeInfo('exam').short} · ${moduleTitle(content, request.moduleIds)}`,
        moduleIds: [...request.moduleIds],
        config: {
          mode: 'exam',
          moduleIds: request.moduleIds,
          count: EXAM_QUESTION_COUNT,
          timeLimitMinutes: EXAM_MINUTES,
          seed: randomSeed(),
        },
      };
    case 'practice':
      if (request.questionIds.length === 0) {
        throw new EmptySessionError('Det finns inga fel att öva på. Alla svar var rätt!');
      }
      return {
        mode: 'review',
        title: 'Öva på felen',
        moduleIds: [...request.moduleIds],
        config: { mode: 'review', questionIds: request.questionIds, seed: randomSeed() },
      };
  }
}

function randomKey(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Starts a new pass and replaces any pass in progress. Throws `EmptySessionError` (with a
 * Swedish message for the UI) when there is nothing to practise.
 */
export async function startStudyRun(
  request: StartRequest,
  content: StudyContent = loadContent(),
): Promise<StudyRun> {
  const plan = await planRun(request, content);
  const session = createSession(plan.config, questionPool(content));

  let dataSessionId: number | null = null;
  try {
    const store = await getDataStore();
    dataSessionId = (
      await store.sessions.startSession({
        mode: plan.mode,
        moduleIds: plan.moduleIds,
        startedAt: session.startedAt,
      })
    ).id;
  } catch (error: unknown) {
    console.error('Kunde inte spara passet', error);
  }

  const run: StudyRun = {
    key: randomKey(),
    mode: plan.mode,
    title: plan.title,
    moduleIds: plan.moduleIds,
    dataSessionId,
    session,
    saved: false,
    request,
  };
  useStudyStore.setState({ run, saveError: null });
  void queryClient.invalidateQueries({ queryKey: dataKeys.all });
  return run;
}

/* -------------------------------------------------------------------------- actions */

function update(run: StudyRun, session: QuizSession): StudyRun {
  const updated: StudyRun = { ...run, session };
  if (session.status === 'finished' && !run.saved) {
    persistSummary(updated);
    updated.saved = true;
  }
  useStudyStore.setState({ run: updated });
  return updated;
}

/** Grades the current question, stores the answer and updates the repetition schedule. */
export function submitAnswer(given: QuizAnswer, responseMs: number | null): void {
  const run = useStudyStore.getState().run;
  if (!run) return;
  const outcome = answerQuestion(run.session, given, { responseMs });
  const updated = update(run, outcome.session);
  if (outcome.ok && outcome.record && outcome.result.kind === 'graded') {
    persistAnswer(updated, outcome.record, outcome.result);
  }
}

/** Finishes a self-graded (open) answer with the ticked assessment criteria. */
export function submitSelfAssessment(checked: readonly number[], itemIndex?: number): void {
  const run = useStudyStore.getState().run;
  if (!run) return;
  const outcome = selfAssess(run.session, checked, itemIndex ?? run.session.index);
  if (!outcome.ok) return;
  useStudyStore.setState({ run: { ...run, session: outcome.session } });
  if (outcome.record && outcome.result.kind === 'graded') {
    persistAnswer(run, outcome.record, outcome.result);
  }
  // A self-assessment from the summary changes the stored result.
  if (run.session.status === 'finished') {
    persistSummary({ ...run, session: outcome.session });
  }
}

/** Moves on to the next question; stores the summary after the last one. */
export function goToNextQuestion(): void {
  const run = useStudyStore.getState().run;
  if (!run) return;
  update(run, next(run.session));
}

/** Ends the pass now; unanswered questions count as skipped. */
export function endStudyRun(): void {
  const run = useStudyStore.getState().run;
  if (!run) return;
  update(run, finish(run.session));
}

/** Ends an exam whose time has run out. Returns true if it did. */
export function expireStudyRunIfNeeded(now: Date = new Date()): boolean {
  const run = useStudyStore.getState().run;
  if (!run || run.session.status === 'finished' || !isExpired(run.session, now)) return false;
  update(run, finish(run.session, now));
  return true;
}

/** Forgets the pass (after the summary, or to abandon it). Stored answers stay. */
export function clearStudyRun(): void {
  useStudyStore.setState({ run: null, saveError: null });
}
