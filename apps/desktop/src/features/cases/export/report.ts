import {
  allCaseSteps,
  type CaseFile,
  type CaseStep,
  type DecisionStep,
  type StepType,
} from '@bygglov/content-schema';
import {
  addDays,
  DECISION_OUTCOME_LABELS,
  decisionOutcomeLabel,
  DELIVERY_METHOD_LABELS,
  formatKronor,
  injunctionKind,
  type CaseState,
  type CheckSeverity,
  type DecisionAssessment,
  type DecisionDraft,
  type DecisionOutcome,
  type DeliveryMethod,
} from '@/engine';

/**
 * The decision report (beslutsrapporten) sent to the supervisor: a plain data structure
 * built from the case file, the engine state and the submitted decision. It is rendered as
 * printable HTML (report-html.ts) and as Markdown for a text message or an e-mail
 * (report-markdown.ts). Everything here is pure; loading lives in load.ts.
 */

/** The three verdicts on the supervisor's form, in display order. */
export const SUPERVISOR_GRADES = ['Godkänt', 'Komplettera', 'Gör om'] as const;
export type SupervisorGrade = (typeof SUPERVISOR_GRADES)[number];

/**
 * The decision to report on. `SubmittedDecision` from the engine state fits as is; a draft
 * read back from the data layer may be incomplete, so every field is optional.
 */
export interface ReportDecisionInput {
  draft: Partial<DecisionDraft>;
  /** Simulated decision date. */
  date?: string | null;
  stepId?: string | null;
  /** Ticked assessment criteria (indices into the step's bedomningspunkter). */
  checkedCriteria?: readonly number[] | null;
}

export interface BuildReportOptions {
  /** Her own notes and reflections for the supervisor. */
  notes?: string | null;
  /** The model decision (Markdown, front matter allowed) shown as an appendix. */
  modelDecisionMarkdown?: string | null;
  /** Real-world time the report is made; defaults to now. */
  generatedAt?: Date | string;
}

export type TimelineKind =
  | 'ansokan'
  | 'handling'
  | 'forelaggande'
  | 'komplett'
  | 'underrattelse'
  | 'skrivelse'
  | 'hoppat'
  | 'handelse'
  | 'beslut'
  | 'frist';

export interface TimelineEntry {
  /** Simulated date, YYYY-MM-DD. */
  date: string;
  kind: TimelineKind;
  label: string;
  detail: string | null;
}

export interface ReportRecipient {
  recipient: string;
  method: string;
}

export interface ReportDecision {
  outcome: DecisionOutcome | null;
  outcomeLabel: string;
  lawRefs: string[];
  reasoning: string;
  conditions: string;
  /** Her fee in SEK, null when not filled in. */
  fee: number | null;
  feeLabel: string;
  /**
   * The fee the engine expected. The taxa lines are alternatives (e.g. lov or avskrivning),
   * so this is the line her fee matches, the only line, or null when it is ambiguous; the
   * fee check then names the alternatives.
   */
  expectedFee: number | null;
  appealNotice: boolean | null;
  recipients: ReportRecipient[];
}

export type ReportCheckStatus = 'passed' | 'failed' | 'tip';

export interface ReportCheck {
  id: string;
  title: string;
  status: ReportCheckStatus;
  severity: CheckSeverity;
  statusLabel: string;
  message: string;
  lawRefs: string[];
  details: string[];
}

export interface ReportCriterion {
  text: string;
  /** Null while she has not assessed herself. */
  checked: boolean | null;
}

export interface ReportStep {
  id: string;
  title: string;
  typeLabel: string;
  date: string | null;
  result: string;
}

export interface ReportWriting {
  stepId: string;
  title: string;
  text: string;
}

export interface ReportDeadline {
  applicationDate: string | null;
  completionDate: string | null;
  deadlineDate: string | null;
  extensionWeeks: number;
  /** True when the decision date is on or before the deadline; null when unknown. */
  inTime: boolean | null;
  summary: string;
}

export interface DecisionReport {
  caseId: string;
  caseTitle: string;
  property: string;
  level: number;
  caseSummary: string;
  contentStatus: string;
  legalState: string;
  /** Real-world ISO timestamp. */
  generatedAt: string;
  /** Simulated decision date. */
  decisionDate: string | null;
  timeline: TimelineEntry[];
  deadline: ReportDeadline;
  decision: ReportDecision;
  /** Null when there is no automatic assessment for the decision. */
  checks: { passed: number; total: number; items: ReportCheck[] } | null;
  criteria: ReportCriterion[];
  selfAssessed: boolean;
  steps: ReportStep[];
  notes: string | null;
  writings: ReportWriting[];
  appendix: { title: string; markdown: string | null; commonMistakes: string[] };
  /** Swedish notes on data that was missing when the report was built. */
  warnings: string[];
}

const STEP_TYPE_LABELS: Record<StepType, string> = {
  checklista: 'Checklista',
  fraga: 'Fråga',
  berakning: 'Beräkning',
  urval: 'Urval',
  skrivelse: 'Skrivelse',
  beslut: 'Beslut',
};

const CHECK_STATUS_LABELS: Record<ReportCheckStatus, string> = {
  passed: 'Uppfyllt',
  failed: 'Inte uppfyllt',
  tip: 'Tips',
};

function isDeliveryMethod(value: unknown): value is DeliveryMethod {
  return typeof value === 'string' && value in DELIVERY_METHOD_LABELS;
}

function isOutcome(value: unknown): value is DecisionOutcome {
  return typeof value === 'string' && value in DECISION_OUTCOME_LABELS;
}

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function percent(score: number): string {
  return `${Math.round(score * 100)} %`;
}

function findDecisionStep(caseFile: CaseFile, stepId: string | null | undefined) {
  const steps = allCaseSteps(caseFile);
  const isDecision = (s: CaseStep): s is DecisionStep => s.typ === 'beslut';
  return (
    steps.filter(isDecision).find((s) => s.id === stepId) ?? steps.filter(isDecision)[0] ?? null
  );
}

function buildDecision(
  caseFile: CaseFile,
  draft: Partial<DecisionDraft>,
  assessment: DecisionAssessment | null,
): ReportDecision {
  const outcome = isOutcome(draft.utfall) ? draft.utfall : null;
  const fee =
    typeof draft.avgift === 'number' && Number.isFinite(draft.avgift) ? draft.avgift : null;
  const lines = assessment?.fee.lines ?? [];
  const expectedFee =
    lines.find((line) => fee !== null && Math.abs(line.expectedAmount - fee) <= 1)
      ?.expectedAmount ?? (lines.length === 1 ? (lines[0]?.expectedAmount ?? null) : null);
  return {
    outcome,
    outcomeLabel: outcome ? decisionOutcomeLabel(outcome, caseFile) : 'Inget utfall valt',
    lawRefs: (Array.isArray(draft.lagstod) ? draft.lagstod : [])
      .map((ref) => trimmed(ref))
      .filter((ref) => ref.length > 0),
    reasoning: trimmed(draft.motivering),
    conditions: trimmed(draft.villkor_upplysningar),
    fee,
    feeLabel: fee === null ? 'Ingen avgift angiven' : formatKronor(fee),
    expectedFee,
    appealNotice:
      typeof draft.overklagandehanvisning === 'boolean' ? draft.overklagandehanvisning : null,
    recipients: (Array.isArray(draft.expediering) ? draft.expediering : [])
      .filter((r) => trimmed(r?.mottagare).length > 0)
      .map((r) => ({
        recipient: trimmed(r.mottagare),
        method: isDeliveryMethod(r.satt) ? DELIVERY_METHOD_LABELS[r.satt] : 'sätt saknas',
      })),
  };
}

function buildChecks(assessment: DecisionAssessment | null): DecisionReport['checks'] {
  if (!assessment) return null;
  return {
    passed: assessment.passedChecks,
    total: assessment.totalChecks,
    items: assessment.checks.map((check) => {
      const status: ReportCheckStatus =
        check.severity === 'tip' ? 'tip' : check.passed ? 'passed' : 'failed';
      return {
        id: check.id,
        title: check.title,
        status,
        severity: check.severity,
        statusLabel: CHECK_STATUS_LABELS[status],
        message: check.message,
        lawRefs: [...check.lawRefs],
        details: [...check.details],
      };
    }),
  };
}

function stepResultText(state: CaseState, step: CaseStep): string {
  const result = state.stepResults[step.id];
  if (!result) return 'Inte gjort';
  if (result.skipped) return 'Hoppades över';
  if (result.score === null) return 'Väntar på självbedömning';
  const label =
    result.outcome === 'correct' ? 'Rätt' : result.outcome === 'partial' ? 'Delvis rätt' : 'Fel';
  return `${label} (${percent(result.score)})`;
}

function buildSteps(caseFile: CaseFile, state: CaseState | null): ReportStep[] {
  if (!state) return [];
  const byId = new Map(allCaseSteps(caseFile).map((s) => [s.id, s]));
  return state.queue
    .map((id) => byId.get(id))
    .filter((s): s is CaseStep => s !== undefined)
    .map((step) => ({
      id: step.id,
      title: step.rubrik,
      typeLabel: STEP_TYPE_LABELS[step.typ],
      date: state.stepResults[step.id]?.date ?? null,
      result: stepResultText(state, step),
    }));
}

function buildWritings(caseFile: CaseFile, state: CaseState | null): ReportWriting[] {
  if (!state) return [];
  const byId = new Map(allCaseSteps(caseFile).map((s) => [s.id, s]));
  const writings: ReportWriting[] = [];
  for (const id of state.queue) {
    const step = byId.get(id);
    const answer = state.stepResults[id]?.answer;
    if (!step || !answer) continue;
    let text = '';
    if (answer.type === 'skrivelse') text = answer.text;
    else if (answer.type === 'fraga' && answer.answer.type === 'oppen') text = answer.answer.text;
    if (text.trim().length > 0)
      writings.push({ stepId: id, title: step.rubrik, text: text.trim() });
  }
  return writings;
}

/** Like the engine's assessment, a selection step is where the neighbours are notified. */
function isNeighbourNotice(step: CaseStep): boolean {
  return step.typ === 'urval';
}

function buildTimeline(
  caseFile: CaseFile,
  state: CaseState | null,
  decision: ReportDecision,
  decisionDate: string | null,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const afterDecision: TimelineEntry[] = [];
  const documents = new Map(caseFile.handlingar.map((d) => [d.id, d]));
  const applicationDate = state?.applicationDate ?? caseFile.startdatum;

  const initialDocs = state
    ? state.visibleDocuments.filter((d) => d.receivedDate <= applicationDate)
    : caseFile.handlingar
        .filter(
          (d) => d.dold_tills === undefined && (d.inkom ?? applicationDate) <= applicationDate,
        )
        .map((d) => ({ documentId: d.id }));
  entries.push({
    date: applicationDate,
    kind: 'ansokan',
    label: 'Ansökan inkom',
    detail:
      initialDocs.length > 0
        ? `Med handlingarna: ${initialDocs.map((d) => documents.get(d.documentId)?.titel ?? d.documentId).join(', ')}.`
        : null,
  });

  if (state) {
    for (const doc of state.visibleDocuments) {
      if (doc.receivedDate <= applicationDate) continue;
      entries.push({
        date: doc.receivedDate,
        kind: 'handling',
        label: `Inkommen handling: ${documents.get(doc.documentId)?.titel ?? doc.documentId}`,
        detail: null,
      });
    }
    for (const injunction of state.injunctions) {
      const komplettering = /komplett/.test(injunction.kind);
      entries.push({
        date: injunction.date,
        kind: 'forelaggande',
        label: komplettering
          ? 'Föreläggande om komplettering (9 kap. 91 § PBL)'
          : `Föreläggande om ${injunction.kind}`,
        detail: null,
      });
    }
    if (state.completionDate) {
      entries.push({
        date: state.completionDate,
        kind: 'komplett',
        label: 'Ansökan komplett',
        detail: 'Tidsfristen enligt 9 kap. 99 § PBL räknas från denna dag.',
      });
    }
    const steps = new Map(allCaseSteps(caseFile).map((s) => [s.id, s]));
    for (const id of state.queue) {
      const step = steps.get(id);
      const result = state.stepResults[id];
      if (!step || !result || step.typ === 'beslut') continue;
      if (isNeighbourNotice(step)) {
        entries.push({
          date: result.date,
          kind: result.skipped ? 'hoppat' : 'underrattelse',
          label: result.skipped
            ? `Hoppade över: ${step.rubrik}`
            : 'Underrättelse till grannar och berörda (9 kap. 94 § PBL)',
          detail: result.skipped ? 'Ingen underrättelse skickades.' : step.rubrik,
        });
      } else if (step.typ === 'skrivelse' && injunctionKind(step) === null) {
        entries.push({
          date: result.date,
          kind: result.skipped ? 'hoppat' : 'skrivelse',
          label: result.skipped ? `Hoppade över: ${step.rubrik}` : `Skrivelse: ${step.rubrik}`,
          detail: null,
        });
      } else if (result.skipped) {
        entries.push({
          date: result.date,
          kind: 'hoppat',
          label: `Hoppade över: ${step.rubrik}`,
          detail: null,
        });
      }
    }
    const events = new Map(caseFile.handelser.map((e) => [e.id, e]));
    for (const fired of state.firedEvents) {
      const event = events.get(fired.eventId);
      if (!event?.effekt.meddelande) continue;
      // Consequences of the decision itself are listed after it.
      if (event.utlosare.vid_beslut !== undefined) {
        afterDecision.push({
          date: fired.date,
          kind: 'handelse',
          label: `Efter beslutet: ${event.namn}`,
          detail: event.effekt.meddelande,
        });
        continue;
      }
      // The engine stores the firing date; the event's message belongs to after its time shift.
      const days = event.effekt.tid_framat_dagar ?? 0;
      entries.push({
        date: days > 0 ? addDays(fired.date, days) : fired.date,
        kind: 'handelse',
        label: event.namn,
        detail: event.effekt.meddelande,
      });
    }
    if (state.extensionWeeks > 0) {
      const entry = state.diary.find((d) => d.kind === 'frist' && /förläng/i.test(d.text));
      entries.push({
        date: entry?.date ?? state.simDate,
        kind: 'frist',
        label: `Tidsfristen förlängd med ${state.extensionWeeks} veckor (9 kap. 100 § PBL)`,
        detail: null,
      });
    }
    if (state.deadlineDate) {
      entries.push({
        date: state.deadlineDate,
        kind: 'frist',
        label: 'Sista dag för beslut enligt 9 kap. 99 § PBL',
        detail: null,
      });
    }
  }

  if (decisionDate) {
    entries.push({
      date: decisionDate,
      kind: 'beslut',
      label: `Beslut: ${decision.outcomeLabel}`,
      detail: decision.fee !== null ? `Avgift ${formatKronor(decision.fee)}.` : null,
    });
  }

  // Stable sort by date; same-day entries keep the order they were added in.
  entries.push(...afterDecision);
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => a.entry.date.localeCompare(b.entry.date) || a.index - b.index)
    .map(({ entry }) => entry);
}

function buildDeadline(
  state: CaseState | null,
  assessment: DecisionAssessment | null,
  decisionDate: string | null,
): ReportDeadline {
  const deadlineDate = state?.deadlineDate ?? assessment?.fee.deadline.deadlineDate ?? null;
  const inTime =
    deadlineDate !== null && decisionDate !== null ? decisionDate <= deadlineDate : null;
  const explanation = assessment?.fee.deadline.explanation ?? null;
  let summary: string;
  if (deadlineDate === null) {
    summary = explanation ?? 'Tidsfristen kunde inte räknas fram.';
  } else if (inTime === null) {
    summary = `Sista dag för beslut: ${deadlineDate}.`;
  } else {
    summary = inTime
      ? `Beslutet fattades inom tidsfristen (sista dag ${deadlineDate}).`
      : `Beslutet fattades efter tidsfristen (sista dag ${deadlineDate}). Avgiften ska reduceras enligt 12 kap. 8 a § PBL.`;
  }
  return {
    applicationDate: state?.applicationDate ?? assessment?.fee.deadline.applicationDate ?? null,
    completionDate: state?.completionDate ?? null,
    deadlineDate,
    extensionWeeks: state?.extensionWeeks ?? assessment?.fee.deadline.extensionWeeks ?? 0,
    inTime,
    summary,
  };
}

function toIso(value: Date | string | undefined): string {
  if (value === undefined) return new Date().toISOString();
  return typeof value === 'string' ? value : value.toISOString();
}

/**
 * Builds the decision report. `state` and `assessment` may be null (for example when the
 * saved case state could not be restored); the report then says what is missing.
 */
export function buildDecisionReport(
  caseFile: CaseFile,
  state: CaseState | null,
  decision: ReportDecisionInput,
  assessment: DecisionAssessment | null,
  options: BuildReportOptions = {},
): DecisionReport {
  const warnings: string[] = [];
  const draft = decision.draft ?? {};
  const step = findDecisionStep(caseFile, decision.stepId ?? assessment?.stepId);
  const decisionDate = decision.date ?? assessment?.decisionDate ?? null;

  if (!state)
    warnings.push('Ärendets sparade förlopp saknas, så datumlinjen och stegen är ofullständiga.');
  if (!assessment) warnings.push('Den automatiska bedömningen saknas för det här beslutet.');
  if (!decisionDate) warnings.push('Beslutsdatum saknas.');
  if (!isOutcome(draft.utfall)) warnings.push('Beslutet saknar utfall.');

  const reportDecision = buildDecision(caseFile, draft, assessment);
  const criteriaTexts = assessment?.criteria ?? step?.bedomningspunkter ?? [];
  const checked = decision.checkedCriteria ?? null;
  const notes = trimmed(options.notes);
  const modelMarkdown = trimmed(options.modelDecisionMarkdown);
  if (
    !modelMarkdown &&
    (assessment?.modelDecisionPath ?? step?.modellbeslut ?? caseFile.facit?.modellbeslut)
  ) {
    warnings.push('Modellbeslutet kunde inte läsas in.');
  }

  return {
    caseId: caseFile.id,
    caseTitle: caseFile.titel,
    property: caseFile.fastighet,
    level: caseFile.niva,
    caseSummary: caseFile.sammanfattning,
    contentStatus: caseFile.status,
    legalState: caseFile.rattslage,
    generatedAt: toIso(options.generatedAt),
    decisionDate,
    timeline: buildTimeline(caseFile, state, reportDecision, decisionDate),
    deadline: buildDeadline(state, assessment, decisionDate),
    decision: reportDecision,
    checks: buildChecks(assessment),
    criteria: criteriaTexts.map((text, index) => ({
      text,
      checked: checked === null ? null : checked.includes(index),
    })),
    selfAssessed: checked !== null,
    steps: buildSteps(caseFile, state),
    notes: notes.length > 0 ? notes : null,
    writings: buildWritings(caseFile, state),
    appendix: {
      title: 'Bilaga: Modellbeslut',
      markdown: modelMarkdown.length > 0 ? modelMarkdown : null,
      commonMistakes: [...(assessment?.commonMistakes ?? caseFile.facit?.vanliga_fel ?? [])],
    },
    warnings,
  };
}

/** A file name like "beslutsrapport-A002-bjorken-7-2026-04-21". Without extension. */
export function reportFileBaseName(report: DecisionReport): string {
  const slug = (report.property.split(',')[0] ?? report.property)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const date = report.decisionDate ?? report.generatedAt.slice(0, 10);
  return ['beslutsrapport', report.caseId, slug, date].filter(Boolean).join('-');
}
