import {
  allCaseSteps,
  DECISION_OUTCOMES,
  STEP_TYPES,
  SUSPENSION_REASONS,
  type CaseFile,
} from '@bygglov/content-schema';
import { z } from 'zod';
import {
  CASE_STATE_VERSION,
  type CaseDeadline,
  type CaseState,
  type DecisionAssessment,
  type DecisionDraft,
  type DeadlineStatus,
  type StepAnswer,
} from './types';

/**
 * zod schemas for reading a stored `CaseState` (and decision drafts) back from the
 * database. The data layer stores JSON as `unknown`; the engine owns its validation.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const outcome = z.enum(DECISION_OUTCOMES);
const gradeOutcome = z.enum(['correct', 'incorrect', 'partial']);
const indices = z.array(z.number().int());

export const DecisionDraftSchema: z.ZodType<DecisionDraft> = z.object({
  utfall: outcome,
  lagstod: z.array(z.string()),
  motivering: z.string(),
  villkor_upplysningar: z.string(),
  avgift: z.number().nullable(),
  overklagandehanvisning: z.boolean(),
  expediering: z.array(
    z.object({ mottagare: z.string(), satt: z.enum(['delges', 'meddelande', 'skickas']) }),
  ),
});

const questionAnswer = z.discriminatedUnion('type', [
  z.object({ type: z.literal('flerval'), selected: z.number().int().nullable() }),
  z.object({ type: z.literal('flersvar'), selected: indices }),
  z.object({ type: z.literal('sant_falskt'), value: z.boolean().nullable() }),
  z.object({ type: z.literal('oppen'), text: z.string() }),
]);

export const StepAnswerSchema: z.ZodType<StepAnswer> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('checklista'), marks: z.array(z.boolean().nullable()) }),
  z.object({
    type: z.literal('fraga'),
    answer: questionAnswer,
    checkedCriteria: indices.optional(),
  }),
  z.object({
    type: z.literal('berakning'),
    values: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
  }),
  z.object({ type: z.literal('urval'), selected: indices }),
  z.object({ type: z.literal('skrivelse'), text: z.string(), checkedCriteria: indices.optional() }),
  z.object({ type: z.literal('beslut'), draft: DecisionDraftSchema }),
]);

const deadlineFields = {
  applicationDate: isoDate,
  startDate: isoDate.nullable(),
  basis: z.enum([
    'tillsyn',
    'lov_i_efterhand',
    'ansokningsdagen',
    'andring_pa_sokandens_initiativ',
    'komplettering',
    'vantar_pa_komplettering',
  ]),
  // Missing in assessments stored before 99 § första stycket 2 was modelled.
  amendmentDate: isoDate.nullable().default(null),
  injunctionDate: isoDate.nullable(),
  injunctionInTime: z.boolean().nullable(),
  extensionWeeks: z.number().int(),
  // Missing in assessments stored before vilande (102 §) was modelled.
  suspendedSince: isoDate.nullable().default(null),
  suspendedDays: z.number().int().min(0).default(0),
  deadlineDate: isoDate.nullable(),
  explanation: z.string(),
};

export const CaseDeadlineSchema: z.ZodType<CaseDeadline> = z.object(deadlineFields);

const DeadlineStatusSchema: z.ZodType<DeadlineStatus> = z.object({
  ...deadlineFields,
  onDate: isoDate,
  daysElapsed: z.number().int().nullable(),
  daysLeft: z.number().int().nullable(),
  weeksOverdue: z.number().int(),
});

export const DecisionAssessmentSchema: z.ZodType<DecisionAssessment> = z.object({
  caseId: z.string(),
  stepId: z.string(),
  decisionDate: isoDate,
  expectedOutcome: outcome,
  checks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      passed: z.boolean(),
      severity: z.enum(['error', 'warning', 'tip']),
      message: z.string(),
      lawRefs: z.array(z.string()),
      details: z.array(z.string()),
    }),
  ),
  passedChecks: z.number().int(),
  totalChecks: z.number().int(),
  fee: z.object({
    decisionDate: isoDate,
    deadline: DeadlineStatusSchema,
    reductionPerWeek: z.number(),
    weeksOverdue: z.number().int(),
    reduction: z.number(),
    lines: z.array(
      z.object({ key: z.string(), baseAmount: z.number(), expectedAmount: z.number() }),
    ),
    explanation: z.array(z.string()),
  }),
  criteria: z.array(z.string()),
  modelDecisionPath: z.string().nullable(),
  commonMistakes: z.array(z.string()),
});

export const CaseStateSchema: z.ZodType<CaseState> = z.object({
  version: z.literal(CASE_STATE_VERSION),
  caseId: z.string(),
  seed: z.number().int().nonnegative(),
  startedAt: z.string(),
  simDate: isoDate,
  applicationDate: isoDate,
  completionDate: isoDate.nullable(),
  // Missing in states stored before 99 § första stycket 2 was modelled.
  amendmentDates: z.array(isoDate).default([]),
  // Missing in states stored before supervision cases (nivå 4) existed.
  supervision: z.boolean().default(false),
  // Missing in states stored before notification cases (anmälan, A007) existed.
  notification: z.boolean().default(false),
  extensionWeeks: z.number().int().min(0),
  // Missing in states stored before the extension button and vilande (102 §) existed.
  extensionReason: z.string().nullable().default(null),
  suspensions: z
    .array(
      z.object({
        reason: z.enum(SUSPENSION_REASONS),
        from: isoDate,
        to: isoDate.nullable(),
        stepId: z.string().optional(),
        eventId: z.string().optional(),
      }),
    )
    .default([]),
  deadlineDate: isoDate.nullable(),
  queue: z.array(z.string()),
  currentIndex: z.number().int().min(0),
  stepResults: z.record(
    z.string(),
    z.object({
      stepId: z.string(),
      stepType: z.enum(STEP_TYPES),
      date: isoDate,
      skipped: z.boolean(),
      answer: StepAnswerSchema.nullable(),
      score: z.number().nullable(),
      outcome: gradeOutcome.nullable(),
      checkedCriteria: indices.nullable(),
    }),
  ),
  visibleDocuments: z.array(
    z.object({ documentId: z.string(), receivedDate: isoDate, unseen: z.boolean() }),
  ),
  firedEvents: z.array(z.object({ eventId: z.string(), date: isoDate })),
  injunctions: z.array(z.object({ kind: z.string(), date: isoDate, stepId: z.string() })),
  facts: z.record(z.string(), z.unknown()),
  decisions: z.array(
    z.object({
      stepId: z.string(),
      date: isoDate,
      draft: DecisionDraftSchema,
      assessment: DecisionAssessmentSchema,
      checkedCriteria: indices.nullable(),
    }),
  ),
  diary: z.array(
    z.object({
      date: isoDate,
      kind: z.enum([
        'registrering',
        'handling',
        'steg',
        'hoppat',
        'handelse',
        'tid',
        'frist',
        'beslut',
      ]),
      text: z.string(),
      documentId: z.string().optional(),
      stepId: z.string().optional(),
      eventId: z.string().optional(),
    }),
  ),
  status: z.enum(['pagar', 'inlamnat', 'bedomt']),
});

export type RestoreResult = { ok: true; state: CaseState } | { ok: false; reason: string };

/**
 * Reads a stored state back. Fails (with a Swedish reason) when the JSON does not match
 * the current state shape, belongs to another case, or refers to steps, documents or
 * events that the case file no longer has, e.g. after a content update. The caller can
 * then offer to restart the case.
 */
export function restoreCaseState(caseFile: CaseFile, json: unknown): RestoreResult {
  const parsed = CaseStateSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'Det sparade ärendet har ett format som appen inte längre känner igen.',
    };
  }
  const state = parsed.data;
  if (state.caseId !== caseFile.id) {
    return {
      ok: false,
      reason: `Det sparade tillståndet hör till ärende ${state.caseId}, inte ${caseFile.id}.`,
    };
  }
  const steps = new Set(allCaseSteps(caseFile).map((s) => s.id));
  const documents = new Set(caseFile.handlingar.map((d) => d.id));
  const events = new Set(caseFile.handelser.map((e) => e.id));
  const missing = [
    ...state.queue.filter((id) => !steps.has(id)),
    ...Object.keys(state.stepResults).filter((id) => !steps.has(id)),
    ...state.visibleDocuments.map((d) => d.documentId).filter((id) => !documents.has(id)),
    ...state.firedEvents.map((e) => e.eventId).filter((id) => !events.has(id)),
  ];
  if (missing.length > 0 || state.currentIndex > state.queue.length) {
    return {
      ok: false,
      reason: `Ärendet har ändrats sedan du började (${[...new Set(missing)].join(', ') || 'stegordningen'}). Börja om ärendet för att fortsätta.`,
    };
  }
  return { ok: true, state };
}
