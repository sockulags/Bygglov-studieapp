import {
  templateReferences,
  TEMPLATE_PATTERN,
  type CaseEvent,
  type CaseFile,
  type CaseStep,
  type TemplateVariable,
} from '@bygglov/content-schema';
import { addDays, formatSwedishDate, nextWorkingDay } from './dates';
import type { CaseState } from './types';

/**
 * Template variables (mallvariabler, content/README.md) in step texts, event messages and
 * Markdown documents: `{{beslutsdatum}}`, `{{kungorelsedatum+7}}`, `{{frist|iso}}`, … The
 * engine renders event messages when they fire; the case view renders steps and documents
 * when they are shown, so texts follow the learner's own timeline.
 */

/**
 * Days from the decision to the announcement on the municipality's notice board (9 kap.
 * 109 §). The law sets no number of days; the simulator announces two days after the
 * decision.
 */
export const ANNOUNCEMENT_DELAY_DAYS = 2;

/** Values of the template variables; a missing value is left visible in the text. */
export type TemplateValues = Partial<Record<TemplateVariable, string | null>>;

/** The variables a case state gives (dates as YYYY-MM-DD). */
export function caseTemplateValues(state: CaseState): TemplateValues {
  const decided = state.decisions.at(-1)?.date ?? null;
  return {
    simdatum: state.simDate,
    ansokningsdatum: state.applicationDate,
    beslutsdatum: decided,
    kungorelsedatum: decided === null ? null : addDays(decided, ANNOUNCEMENT_DELAY_DAYS),
    frist: state.deadlineDate,
  };
}

/** Replaces the template variables in `text`. Unknown or missing values stay as `{{…}}`. */
export function renderTemplate(text: string, values: TemplateValues): string {
  if (!text.includes('{{')) return text;
  return text.replace(TEMPLATE_PATTERN, (raw) => {
    const ref = templateReferences(raw)[0];
    if (!ref) return raw;
    const value = values[ref.name as TemplateVariable];
    if (value === null || value === undefined) return raw;
    let date = addDays(value, ref.offset);
    if (ref.filters.includes('vardag')) date = nextWorkingDay(date);
    return ref.filters.includes('iso') ? date : formatSwedishDate(date);
  });
}

/** Whether a text still has template variables after rendering (a value was missing). */
export function hasTemplateVariables(text: string): boolean {
  return templateReferences(text).length > 0;
}

function renderDeep<T>(value: T, values: TemplateValues): T {
  if (typeof value === 'string') return renderTemplate(value, values) as T;
  if (Array.isArray(value)) return value.map((v: unknown) => renderDeep(v, values)) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, renderDeep(v, values)]),
    ) as T;
  }
  return value;
}

/** A step with its texts rendered for the case state. */
export function renderStep<S extends CaseStep>(step: S, state: CaseState): S {
  return JSON.stringify(step).includes('{{') ? renderDeep(step, caseTemplateValues(state)) : step;
}

/**
 * The case file with every step text rendered for the state (steps inserted by events
 * included). Ids, answers and everything the engine grades on are unchanged, so the result
 * can be passed to the engine like the original. Returns the same object when the case has
 * no template variables in its steps.
 */
export function renderCaseTexts(caseFile: CaseFile, state: CaseState): CaseFile {
  const hasTemplates = (step: CaseStep) => JSON.stringify(step).includes('{{');
  const inserted = caseFile.handelser.flatMap((e) =>
    e.effekt.nytt_steg ? [e.effekt.nytt_steg] : [],
  );
  if (![...caseFile.steg, ...inserted].some(hasTemplates)) return caseFile;
  return {
    ...caseFile,
    steg: caseFile.steg.map((step) => renderStep(step, state)),
    handelser: caseFile.handelser.map((event): CaseEvent =>
      event.effekt.nytt_steg
        ? {
            ...event,
            effekt: { ...event.effekt, nytt_steg: renderStep(event.effekt.nytt_steg, state) },
          }
        : event,
    ),
  };
}

/** A Markdown document's text rendered for the state; `inkomdatum` is its arrival day. */
export function renderDocumentText(
  text: string,
  state: CaseState,
  receivedDate: string | null,
): string {
  return renderTemplate(text, { ...caseTemplateValues(state), inkomdatum: receivedDate });
}
