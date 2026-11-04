import { z } from 'zod';
import type { CaseFile } from '@bygglov/content-schema';
import { caseDocumentUrl, getCase, type StudyContent } from '@/content';
import type { DataStore, Decision } from '@/data';
import {
  DecisionDraftSchema,
  restoreCaseState,
  type CaseState,
  type DecisionAssessment,
  type DecisionDraft,
} from '@/engine';
import { DecisionAssessmentSchema } from '@/engine/cases/schema';
import { buildDecisionReport, type DecisionReport, type ReportDecisionInput } from './report';

/**
 * Collects everything the decision report needs from the data layer and the bundled
 * content, given only a case id and a decision id.
 */

/** Settings key for her reflection to the supervisor on one decision. */
export function reportNotesKey(decisionId: number): string {
  return `beslutsrapport.anteckningar.${decisionId}`;
}

export const ReportNotesSchema = z.string();

export class ReportLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportLoadError';
  }
}

export interface ReportSources {
  caseFile: CaseFile;
  decisionRow: Decision;
  state: CaseState | null;
  decision: ReportDecisionInput;
  assessment: DecisionAssessment | null;
  notes: string | null;
  /** Path of the model decision inside the case folder, if any. */
  modelDecisionPath: string | null;
  /** Why a saved state could not be restored; null when it was restored or never saved. */
  stateProblem: string | null;
}

const LooseDraftSchema = z
  .object({
    utfall: z.string().optional(),
    lagstod: z.array(z.string()).optional(),
    motivering: z.string().optional(),
    villkor_upplysningar: z.string().optional(),
    avgift: z.number().nullable().optional(),
    overklagandehanvisning: z.boolean().optional(),
    expediering: z
      .array(z.object({ mottagare: z.string(), satt: z.string() }).partial())
      .optional(),
  })
  .partial();

const NOTE_KEYS = ['anteckningar', 'reflektion', 'notes'] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseJsonMaybe(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

interface ParsedDecisionValue {
  draft: Partial<DecisionDraft>;
  complete: boolean;
  assessment: DecisionAssessment | null;
  stepId: string | null;
  date: string | null;
  checkedCriteria: number[] | null;
  notes: string | null;
}

/**
 * The `beslut` row stores the draft (G1: `submitDecision({ caseId, decision: draft })`), but
 * a wrapper `{ draft, assessment, stepId, date, checkedCriteria }` is accepted too, and an
 * incomplete draft is read as far as it goes.
 */
export function parseDecisionValue(raw: unknown): ParsedDecisionValue {
  const value = parseJsonMaybe(raw);
  const record = asRecord(value);
  const inner = record && 'draft' in record ? record.draft : value;
  const strict = DecisionDraftSchema.safeParse(inner);
  const loose = LooseDraftSchema.safeParse(inner);
  const draft = (
    strict.success ? strict.data : loose.success ? loose.data : {}
  ) as Partial<DecisionDraft>;
  const assessment =
    record && 'assessment' in record
      ? (DecisionAssessmentSchema.safeParse(record.assessment).data ?? null)
      : null;
  const checked = record ? z.array(z.number().int()).safeParse(record.checkedCriteria) : null;
  const note = record
    ? NOTE_KEYS.map((k) => record[k]).find((v): v is string => typeof v === 'string')
    : undefined;
  return {
    draft,
    complete: strict.success,
    assessment,
    stepId: record && typeof record.stepId === 'string' ? record.stepId : null,
    date: record && typeof record.date === 'string' ? record.date : null,
    checkedCriteria: checked?.success ? checked.data : null,
    notes: note ?? null,
  };
}

/**
 * The saved engine state of a case. The data agent stores it as `state` on the case status
 * row (a JSON value or a JSON string); it is read defensively so the report still works,
 * with less content, before or without that field.
 */
function savedStateValue(status: unknown): unknown {
  const record = asRecord(status);
  if (!record) return undefined;
  return parseJsonMaybe(record.state ?? record.stateJson);
}

/** Pairs the decision row with the matching decision in the engine state. */
function matchDecision(
  state: CaseState,
  draft: Partial<DecisionDraft>,
  index: number,
): CaseState['decisions'][number] | null {
  const key = JSON.stringify(draft);
  return (
    state.decisions.find((d) => JSON.stringify(d.draft) === key) ?? state.decisions[index] ?? null
  );
}

export async function loadReportSources(
  store: DataStore,
  content: StudyContent,
  caseId: string,
  decisionId: number,
): Promise<ReportSources> {
  const caseFile = getCase(content, caseId);
  if (!caseFile) throw new ReportLoadError(`Ärendet ${caseId} finns inte i appens innehåll.`);
  const decisionRow = await store.cases.getDecision(decisionId);
  if (!decisionRow || decisionRow.caseId !== caseId) {
    throw new ReportLoadError('Beslutet hittades inte.');
  }
  const [status, rows, storedNotes] = await Promise.all([
    store.cases.getCaseStatus(caseId),
    store.cases.listDecisions(caseId),
    store.settings.get(reportNotesKey(decisionId)),
  ]);
  const parsed = parseDecisionValue(decisionRow.decision);

  let state: CaseState | null = null;
  let stateProblem: string | null = null;
  const savedState = savedStateValue(status);
  if (savedState !== undefined && savedState !== null) {
    const restored = restoreCaseState(caseFile, savedState);
    if (restored.ok) state = restored.state;
    else stateProblem = restored.reason;
  }

  const index = Math.max(
    0,
    rows.findIndex((r) => r.id === decisionId),
  );
  const submitted = state ? matchDecision(state, parsed.draft, index) : null;
  const draft = parsed.complete || !submitted ? parsed.draft : submitted.draft;
  const assessment = submitted?.assessment ?? parsed.assessment;
  const stepId = submitted?.stepId ?? parsed.stepId ?? assessment?.stepId ?? null;
  const step = caseFile.steg
    .concat(caseFile.handelser.flatMap((e) => (e.effekt.nytt_steg ? [e.effekt.nytt_steg] : [])))
    .find((s) => s.id === stepId && s.typ === 'beslut');

  const notesValue = ReportNotesSchema.safeParse(storedNotes);
  return {
    caseFile,
    decisionRow,
    state,
    decision: {
      draft,
      date: submitted?.date ?? parsed.date ?? assessment?.decisionDate ?? null,
      stepId,
      checkedCriteria: submitted?.checkedCriteria ?? parsed.checkedCriteria,
    },
    assessment,
    // Her reflection is kept on the case (Egna reflektioner in the comparison view); older
    // exports kept it per decision in settings.
    notes:
      status && status.reflection.trim().length > 0
        ? status.reflection
        : notesValue.success
          ? notesValue.data
          : parsed.notes,
    modelDecisionPath:
      assessment?.modelDecisionPath ??
      (step?.typ === 'beslut' ? step.modellbeslut : undefined) ??
      caseFile.facit?.modellbeslut ??
      null,
    stateProblem,
  };
}

/** Fetches a Markdown file from the case folder; null when it cannot be read. */
export async function fetchCaseMarkdown(
  caseId: string,
  path: string,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const response = await fetcher(caseDocumentUrl(caseId, path));
    if (!response.ok) return null;
    const text = await response.text();
    // A dev server answers unknown paths with index.html; that is not a model decision.
    return /^\s*<!doctype html/i.test(text) ? null : text;
  } catch {
    return null;
  }
}

export interface LoadDecisionReportOptions {
  /** Overrides the stored notes (e.g. while she is editing them). */
  notes?: string | null;
  generatedAt?: Date | string;
  fetcher?: typeof fetch;
}

export interface LoadedDecisionReport {
  report: DecisionReport;
  sources: ReportSources;
}

export async function loadDecisionReport(
  store: DataStore,
  content: StudyContent,
  caseId: string,
  decisionId: number,
  options: LoadDecisionReportOptions = {},
): Promise<LoadedDecisionReport> {
  const sources = await loadReportSources(store, content, caseId, decisionId);
  const modelDecisionMarkdown = sources.modelDecisionPath
    ? await fetchCaseMarkdown(caseId, sources.modelDecisionPath, options.fetcher)
    : null;
  const report = buildDecisionReport(
    sources.caseFile,
    sources.state,
    sources.decision,
    sources.assessment,
    {
      notes: options.notes !== undefined ? options.notes : sources.notes,
      modelDecisionMarkdown,
      generatedAt: options.generatedAt,
    },
  );
  if (sources.stateProblem) report.warnings.unshift(sources.stateProblem);
  return { report, sources };
}
