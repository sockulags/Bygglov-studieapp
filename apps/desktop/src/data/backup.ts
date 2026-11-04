import { z } from 'zod';
import type {
  Answer,
  CaseEvent,
  CaseStatus,
  CaseStep,
  DataStore,
  Decision,
  ReviewState,
  Session,
  StudyMode,
  SupervisorFeedback,
} from './types';

/**
 * Export and import of all study data as one JSON document (Inställningar → Data).
 * The format is versioned; ids inside the file are only used to link rows to each other
 * (answers to sessions, feedback to decisions) and are remapped on import.
 */

export const BACKUP_FORMAT = 'bygglov-studiedata';
export const BACKUP_VERSION = 1;

const studyModes = [
  'quick-quiz',
  'module-review',
  'review',
  'study',
  'exam',
  'case',
] as const satisfies readonly StudyMode[];

const iso = z.string().min(1);
const json = z.json();

const answerSchema = z.object({
  id: z.number().int(),
  questionId: z.string().min(1),
  moduleId: z.string().min(1),
  answeredAt: iso,
  correct: z.boolean(),
  score: z.number().nullable(),
  answer: json,
  responseTimeMs: z.number().nullable(),
  mode: z.enum(studyModes),
  sessionId: z.number().int().nullable(),
}) satisfies z.ZodType<Answer>;

const reviewSchema = z.object({
  questionId: z.string().min(1),
  moduleId: z.string().min(1),
  due: iso,
  stability: z.number(),
  difficulty: z.number(),
  elapsedDays: z.number(),
  scheduledDays: z.number(),
  learningSteps: z.number(),
  reps: z.number(),
  lapses: z.number(),
  state: z.number(),
  lastReview: iso.nullable(),
}) satisfies z.ZodType<ReviewState>;

const sessionSchema = z.object({
  id: z.number().int(),
  startedAt: iso,
  finishedAt: iso.nullable(),
  mode: z.enum(studyModes),
  moduleIds: z.array(z.string()),
  result: json,
}) satisfies z.ZodType<Session>;

const caseStatusSchema = z.object({
  caseId: z.string().min(1),
  status: z.enum(['in_progress', 'submitted', 'reviewed']),
  currentStepId: z.string().nullable(),
  simDate: z.string().min(1),
  startedAt: iso,
  submittedAt: iso.nullable(),
}) satisfies z.ZodType<CaseStatus>;

const caseStepSchema = z.object({
  id: z.number().int(),
  caseId: z.string().min(1),
  stepId: z.string().min(1),
  answer: json,
  points: z.number().nullable(),
  completedAt: iso.nullable(),
}) satisfies z.ZodType<CaseStep>;

const caseEventSchema = z.object({
  id: z.number().int(),
  caseId: z.string().min(1),
  eventId: z.string().min(1),
  triggeredAt: iso,
  simDate: z.string().min(1),
}) satisfies z.ZodType<CaseEvent>;

const decisionSchema = z.object({
  id: z.number().int(),
  caseId: z.string().min(1),
  decision: json,
  submittedAt: iso,
  exportedAt: iso.nullable(),
}) satisfies z.ZodType<Decision>;

const feedbackSchema = z.object({
  id: z.number().int(),
  decisionId: z.number().int(),
  text: z.string(),
  grade: z.string().nullable(),
  createdAt: iso,
}) satisfies z.ZodType<SupervisorFeedback>;

export const StudyDataBackupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: iso,
  appVersion: z.string(),
  data: z.object({
    answers: z.array(answerSchema),
    reviews: z.array(reviewSchema),
    sessions: z.array(sessionSchema),
    settings: z.record(z.string(), json),
    cases: z.object({
      statuses: z.array(caseStatusSchema),
      steps: z.array(caseStepSchema),
      events: z.array(caseEventSchema),
      decisions: z.array(decisionSchema),
      feedback: z.array(feedbackSchema),
    }),
  }),
});

export type StudyDataBackup = z.output<typeof StudyDataBackupSchema>;

/** Large enough for every session a learner will ever have (SQLite has no practical cap). */
const ALL_SESSIONS = 1_000_000;

/** Reads everything from the store into a backup document. */
export async function exportStudyData(
  store: DataStore,
  options: { appVersion: string; now?: Date },
): Promise<StudyDataBackup> {
  const [answers, reviews, sessionsNewestFirst, settings, statuses] = await Promise.all([
    store.answers.listAnswers(),
    store.reviews.listReviewStates(),
    store.sessions.listRecent(ALL_SESSIONS),
    store.settings.getAll(),
    store.cases.listCaseStatuses(),
  ]);

  const steps: CaseStep[] = [];
  const events: CaseEvent[] = [];
  const decisions: Decision[] = [];
  const feedback: SupervisorFeedback[] = [];
  for (const status of statuses) {
    steps.push(...(await store.cases.listSteps(status.caseId)));
    events.push(...(await store.cases.listEvents(status.caseId)));
    const caseDecisions = await store.cases.listDecisions(status.caseId);
    decisions.push(...caseDecisions);
    for (const decision of caseDecisions) {
      feedback.push(...(await store.cases.listSupervisorFeedback(decision.id)));
    }
  }

  return StudyDataBackupSchema.parse({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: (options.now ?? new Date()).toISOString(),
    appVersion: options.appVersion,
    data: {
      answers,
      reviews,
      sessions: [...sessionsNewestFirst].reverse(),
      settings,
      cases: { statuses, steps, events, decisions, feedback },
    },
  });
}

export class BackupFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupFormatError';
  }
}

/** Parses the text of a backup file. Throws `BackupFormatError` with a Swedish message. */
export function parseStudyDataBackup(text: string): StudyDataBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupFormatError('Filen är inte en giltig JSON-fil.');
  }
  if (
    typeof raw === 'object' &&
    raw !== null &&
    'format' in raw &&
    raw.format === BACKUP_FORMAT &&
    'version' in raw &&
    typeof raw.version === 'number' &&
    raw.version > BACKUP_VERSION
  ) {
    throw new BackupFormatError(
      'Filen är exporterad från en nyare version av appen. Uppdatera appen och försök igen.',
    );
  }
  const result = StudyDataBackupSchema.safeParse(raw);
  if (!result.success) {
    throw new BackupFormatError(
      'Filen är ingen export av studiedata från den här appen, eller så är den skadad.',
    );
  }
  return result.data;
}

export interface ImportSummary {
  answers: number;
  reviews: number;
  sessions: number;
  cases: number;
}

/**
 * Replaces all study data in the store with the backup. The backup must already be parsed
 * (`parseStudyDataBackup`), so nothing is removed if the file is invalid.
 */
export async function importStudyData(
  store: DataStore,
  backup: StudyDataBackup,
): Promise<ImportSummary> {
  const { data } = backup;
  await store.clearAll();

  const sessionIds = new Map<number, number>();
  for (const session of data.sessions) {
    const created = await store.sessions.startSession({
      mode: session.mode,
      moduleIds: session.moduleIds,
      startedAt: session.startedAt,
    });
    sessionIds.set(session.id, created.id);
    if (session.finishedAt !== null) {
      await store.sessions.finishSession(created.id, session.result, session.finishedAt);
    }
  }

  for (const answer of data.answers) {
    await store.answers.recordAnswer({
      questionId: answer.questionId,
      moduleId: answer.moduleId,
      correct: answer.correct,
      score: answer.score,
      answer: answer.answer,
      responseTimeMs: answer.responseTimeMs,
      mode: answer.mode,
      sessionId: answer.sessionId === null ? null : (sessionIds.get(answer.sessionId) ?? null),
      answeredAt: answer.answeredAt,
    });
  }

  for (const review of data.reviews) await store.reviews.upsertReviewState(review);
  for (const [key, value] of Object.entries(data.settings)) await store.settings.set(key, value);

  const { statuses, steps, events, decisions, feedback } = data.cases;
  for (const status of statuses) {
    await store.cases.startCase({
      caseId: status.caseId,
      currentStepId: status.currentStepId,
      simDate: status.simDate,
      startedAt: status.startedAt,
    });
    if (status.status !== 'in_progress' || status.submittedAt !== null) {
      await store.cases.updateCaseStatus(status.caseId, {
        status: status.status,
        submittedAt: status.submittedAt,
      });
    }
  }
  const started = new Set(statuses.map((s) => s.caseId));
  for (const step of steps.filter((s) => started.has(s.caseId))) {
    await store.cases.saveStep({
      caseId: step.caseId,
      stepId: step.stepId,
      answer: step.answer,
      points: step.points,
      completedAt: step.completedAt,
    });
  }
  for (const event of events.filter((e) => started.has(e.caseId))) {
    await store.cases.recordEvent({
      caseId: event.caseId,
      eventId: event.eventId,
      simDate: event.simDate,
      triggeredAt: event.triggeredAt,
    });
  }
  const decisionIds = new Map<number, number>();
  for (const decision of decisions.filter((d) => started.has(d.caseId))) {
    const created = await store.cases.submitDecision({
      caseId: decision.caseId,
      decision: decision.decision,
      submittedAt: decision.submittedAt,
    });
    decisionIds.set(decision.id, created.id);
    if (decision.exportedAt !== null) {
      await store.cases.markDecisionExported(created.id, decision.exportedAt);
    }
  }
  for (const item of feedback) {
    const decisionId = decisionIds.get(item.decisionId);
    if (decisionId === undefined) continue;
    await store.cases.addSupervisorFeedback({
      decisionId,
      text: item.text,
      grade: item.grade,
      createdAt: item.createdAt,
    });
  }

  return {
    answers: data.answers.length,
    reviews: data.reviews.length,
    sessions: data.sessions.length,
    cases: statuses.length,
  };
}
