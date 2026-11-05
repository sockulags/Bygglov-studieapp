/**
 * Dev-only: fills a data store with a realistic study history for Mina resultat, so the
 * charts can be looked at in the browser (Playwright screenshots) and tested. Nothing in
 * the app imports this file; tests import it directly and Playwright loads it from the
 * Vite dev server (`import('/src/features/results/seed.ts')`).
 */
import type { CaseFile } from '@bygglov/content-schema';
import type { StudyContent } from '@/content';
import type { DataStore, ReviewState } from '@/data';
import {
  currentStep,
  markReviewed,
  mapAnswerToRating,
  schedule,
  skipStep,
  startCase,
  submitDecision,
  type CaseState,
  type DecisionDraft,
} from '@/engine';
import { planCaseWrites } from '@/features/cases/case-writes';
import type { StoredSessionResult } from '@/features/study/session-result';

export interface SeedOptions {
  /** "Today" for the generated history. Defaults to now. */
  now?: Date;
  /** Days of history before today. Default 70 (ten weeks). */
  days?: number;
  /** PRNG seed, so the same options give the same data. */
  seed?: number;
  /** Also start and decide the bundled cases. Default true. */
  cases?: boolean;
}

export interface SeedSummary {
  answers: number;
  sessions: number;
  decisions: number;
}

/** Mulberry32: small deterministic PRNG. */
function prng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function atLocal(day: Date, hour: number, minute: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, 0);
}

/**
 * Writes answers, review states and finished passes for `days` days before `now` plus today,
 * with accuracy that improves over time and a study streak at the end; optionally one
 * reviewed, one submitted and one ongoing case. Expects an empty store.
 */
export async function seedResultsDemo(
  store: DataStore,
  content: StudyContent,
  options: SeedOptions = {},
): Promise<SeedSummary> {
  const now = options.now ?? new Date();
  const totalDays = options.days ?? 70;
  const random = prng(options.seed ?? 20261105);
  const modules = content.modules.filter(
    (m) => (content.questionsByModule.get(m.id)?.length ?? 0) > 0,
  );
  const reviews = new Map<string, ReviewState>();
  const lastCorrect = new Map<string, boolean>();
  let answers = 0;
  let sessions = 0;

  for (let offset = totalDays; offset >= 0; offset -= 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    // A study streak for the last week, gaps earlier on.
    const studies = offset <= 6 || random() < 0.62;
    if (!studies || modules.length === 0) continue;
    const progress = 1 - offset / totalDays; // 0 → 1 over the history
    // The second module is started three weeks in, so the lines differ.
    const available = modules.filter((_, i) => i === 0 || progress > 0.3 * i);
    // Alternate between the started modules, with the odd extra day on the newest one.
    const pick = random() < 0.25 ? available.length - 1 : (totalDays - offset) % available.length;
    const module = available[pick] ?? modules[0];
    if (!module) continue;
    const questions = content.questionsByModule.get(module.id) ?? [];
    const count = 6 + Math.floor(random() * 14);
    const start =
      offset === 0 ? atLocal(day, 8, 10) : atLocal(day, 17 + Math.floor(random() * 4), 5);
    if (start.getTime() > now.getTime()) start.setTime(now.getTime() - 60 * 60_000);
    const session = await store.sessions.startSession({
      mode: random() < 0.3 ? 'review' : 'module-review',
      moduleIds: [module.id],
      startedAt: start.toISOString(),
    });
    sessions += 1;
    const perQuestion: StoredSessionResult['questions'] = [];
    let correctCount = 0;
    let at = start.getTime();
    for (let i = 0; i < count; i += 1) {
      const question = questions[Math.floor(random() * questions.length)];
      if (!question) continue;
      at += 25_000 + Math.floor(random() * 60_000);
      const seenRight = lastCorrect.get(question.id) === true;
      const chance = 0.4 + 0.35 * progress + (seenRight ? 0.1 : 0);
      const correct = random() < Math.min(0.95, chance);
      const score = correct ? 1 : question.typ === 'flersvar' && random() < 0.5 ? 0.5 : 0;
      const responseTimeMs = 6_000 + Math.floor(random() * 40_000);
      const answeredAt = new Date(at).toISOString();
      await store.answers.recordAnswer({
        questionId: question.id,
        moduleId: module.id,
        correct,
        score,
        answer: null,
        responseTimeMs,
        mode: 'module-review',
        sessionId: session.id,
        answeredAt,
      });
      const target = { questionId: question.id, moduleId: module.id };
      const previous = reviews.get(question.id);
      const rating = mapAnswerToRating(
        { score, questionType: question.typ, selfAssessed: question.typ === 'oppen' },
        responseTimeMs,
      );
      const { state } = schedule(
        previous ? { ...previous, ...target } : target,
        rating,
        new Date(answeredAt),
      );
      reviews.set(question.id, state);
      lastCorrect.set(question.id, correct);
      if (correct) correctCount += 1;
      perQuestion.push({
        questionId: question.id,
        moduleId: module.id,
        outcome: correct ? 'correct' : score > 0 ? 'partial' : 'incorrect',
        score,
      });
      answers += 1;
    }
    const partial = perQuestion.filter((q) => q.outcome === 'partial').length;
    const result: StoredSessionResult = {
      version: 1,
      title: module.titel,
      total: perQuestion.length,
      answered: perQuestion.length,
      correct: correctCount,
      partial,
      incorrect: perQuestion.length - correctCount - partial,
      skipped: 0,
      percent: perQuestion.length === 0 ? 0 : Math.round((100 * correctCount) / perQuestion.length),
      durationMs: at - start.getTime(),
      timeExpired: false,
      questions: perQuestion,
    };
    await store.sessions.finishSession(session.id, result, new Date(at + 30_000).toISOString());
  }
  for (const state of reviews.values()) await store.reviews.upsertReviewState(state);

  const decisions = options.cases === false ? 0 : await seedCases(store, content.cases, now);
  return { answers, sessions, decisions };
}

/* ---------------------------------------------------------------------------- cases */

function goodDraft(): DecisionDraft {
  return {
    utfall: 'bevilja',
    lagstod: ['PBL 9 kap. 30 §'],
    motivering:
      'Åtgärden är förenlig med detaljplanen och uppfyller kraven i 9 kap. 30 § PBL. Grannarnas synpunkter har beaktats.',
    villkor_upplysningar:
      'Åtgärden får inte påbörjas förrän startbesked getts. Lovet upphör att gälla om åtgärden inte påbörjats inom två år och avslutats inom fem år. Beslutet kan överklagas; påbörjas arbetet innan beslutet fått laga kraft sker det på egen risk. Kontrollansvarig behövs inte.',
    avgift: null,
    overklagandehanvisning: true,
    expediering: [
      { mottagare: 'Sökanden', satt: 'delges' },
      { mottagare: 'Grannar', satt: 'meddelande' },
    ],
  };
}

function weakDraft(): DecisionDraft {
  return {
    utfall: 'bevilja',
    lagstod: [],
    motivering: 'Ansökan bifalls.',
    villkor_upplysningar: '',
    avgift: null,
    overklagandehanvisning: false,
    expediering: [{ mottagare: 'Sökanden', satt: 'delges' }],
  };
}

/** Skips steps until the decision step (or the end). */
function toDecision(caseFile: CaseFile, state: CaseState): CaseState {
  let current = state;
  for (let guard = 0; guard < 100; guard += 1) {
    const step = currentStep(caseFile, current);
    if (!step || step.typ === 'beslut') return current;
    current = skipStep(caseFile, current, step.id).state;
  }
  return current;
}

async function persist(
  store: DataStore,
  previous: CaseState,
  next: CaseState,
  at: string,
): Promise<number[]> {
  const ids: number[] = [];
  for (const write of planCaseWrites(previous, next, at)) {
    switch (write.kind) {
      case 'status':
        await store.cases.updateCaseStatus(next.caseId, write.patch);
        break;
      case 'step':
        await store.cases.saveStep(write.row);
        break;
      case 'event':
        await store.cases.recordEvent(write.row);
        break;
      case 'decision':
        ids.push((await store.cases.submitDecision(write.row)).id);
        break;
    }
  }
  return ids;
}

async function seedCases(store: DataStore, cases: readonly CaseFile[], now: Date): Promise<number> {
  const ordered = [...cases].sort((a, b) => a.niva - b.niva || a.id.localeCompare(b.id));
  const plan: { draft: DecisionDraft | null; daysAgo: number; reviewed: boolean }[] = [
    { draft: goodDraft(), daysAgo: 30, reviewed: true },
    { draft: weakDraft(), daysAgo: 9, reviewed: false },
    { draft: null, daysAgo: 2, reviewed: false },
  ];
  let decisions = 0;
  for (const [i, caseFile] of ordered.entries()) {
    const item = plan[i];
    if (!item) break;
    const startedAt = new Date(now.getTime() - (item.daysAgo + 3) * 86_400_000).toISOString();
    const initial = startCase(caseFile, { seed: 7 + i, startedAt });
    await store.cases.startCase({
      caseId: caseFile.id,
      currentStepId: initial.queue[initial.currentIndex] ?? null,
      simDate: initial.simDate,
      startedAt,
      state: initial,
    });
    const atDecision = toDecision(caseFile, initial);
    const workedAt = new Date(now.getTime() - (item.daysAgo + 1) * 86_400_000).toISOString();
    if (!item.draft || !currentStep(caseFile, atDecision)) {
      await persist(store, initial, atDecision, workedAt);
      continue;
    }
    const decidedAt = new Date(now.getTime() - item.daysAgo * 86_400_000).toISOString();
    const decided = submitDecision(caseFile, atDecision, item.draft).state;
    const ids = await persist(store, initial, decided, decidedAt);
    decisions += ids.length;
    const decisionId = ids[0];
    if (item.reviewed && decisionId !== undefined) {
      await store.cases.addSupervisorFeedback({
        decisionId,
        text: 'Bra motivering. Tänk på att ange avgiften och vilka grannar som ska få beslutet.',
        grade: 'G',
        createdAt: new Date(now.getTime() - (item.daysAgo - 4) * 86_400_000).toISOString(),
      });
      const reviewed = markReviewed(decided);
      await persist(store, decided, reviewed, decidedAt);
    }
  }
  return decisions;
}
