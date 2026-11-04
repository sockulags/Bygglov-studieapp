import { allCaseSteps, type CaseFile } from '@bygglov/content-schema';
import type { CaseStatus } from '@/data';
import { deadlineStatus, restoreCaseState, stepById, type CaseState } from '@/engine';

/**
 * Pure helpers for the case views: list status, progress, deadline text and the formatting
 * of facts. Kept free of React so they can be unit-tested.
 */

/** Status shown in the case list (docs/04 → Ärenden). */
export type CaseListStatus = 'ny' | 'pagar' | 'inlamnat' | 'bedomt';

export const CASE_LIST_STATUS_LABELS: Record<CaseListStatus, string> = {
  ny: 'Ny',
  pagar: 'Pågår',
  inlamnat: 'Inlämnat',
  bedomt: 'Bedömt',
};

export function listStatusOf(row: Pick<CaseStatus, 'status'> | null | undefined): CaseListStatus {
  if (!row) return 'ny';
  switch (row.status) {
    case 'in_progress':
      return 'pagar';
    case 'submitted':
      return 'inlamnat';
    case 'reviewed':
      return 'bedomt';
  }
}

/** The engine's progress (CaseState.status) as list status. */
export const PROGRESS_STATUS: Record<CaseState['status'], CaseListStatus> = {
  pagar: 'pagar',
  inlamnat: 'inlamnat',
  bedomt: 'bedomt',
};

export interface CaseProgress {
  /** Completed or skipped steps. */
  done: number;
  /** Steps in the queue so far (events can add more). */
  total: number;
  currentStepTitle: string | null;
}

export function caseProgress(caseFile: CaseFile, state: CaseState): CaseProgress {
  const id = state.queue[state.currentIndex];
  const current = id === undefined ? null : stepById(caseFile, id);
  return {
    done: Math.min(state.currentIndex, state.queue.length),
    total: state.queue.length,
    currentStepTitle: current?.rubrik ?? null,
  };
}

/** The stored engine state of a status row, or null when it is missing or out of date. */
export function storedState(caseFile: CaseFile, row: CaseStatus | null | undefined) {
  if (!row || row.state === null || row.state === undefined) return null;
  const restored = restoreCaseState(caseFile, row.state);
  return restored.ok ? restored.state : null;
}

/** "Björken 7, Åkerslunda kommun" → "Björken 7". */
export function propertyName(caseFile: Pick<CaseFile, 'fastighet'>): string {
  return caseFile.fastighet.split(',')[0]?.trim() ?? caseFile.fastighet;
}

/** "Björken 7, Åkerslunda kommun" → "Åkerslunda kommun"; a fallback when not given. */
export function municipalityName(caseFile: Pick<CaseFile, 'fastighet'>): string {
  const part = caseFile.fastighet.split(',').slice(1).join(',').trim();
  return part === '' ? 'kommunen' : part;
}

/* ----------------------------------------------------------------------- deadline */

export interface DeadlineSummary {
  /** Short text for the header, e.g. "63 dagar kvar". */
  label: string;
  /** Longer explanation for a tooltip or screen readers. */
  detail: string;
  tone: 'normal' | 'warning' | 'overdue' | 'paused' | 'done';
}

/** The 9 kap. 99 § deadline as shown in the case header. */
export function deadlineSummary(state: CaseState): DeadlineSummary {
  // Once the decision is made the deadline is settled: it was met or it was not.
  const decided = state.decisions[0];
  if (decided) {
    const atDecision = deadlineStatus(state, decided.date);
    if (atDecision.deadlineDate !== null && atDecision.daysLeft !== null) {
      const late = -atDecision.daysLeft;
      return late > 0
        ? {
            label: `Beslut ${late} ${late === 1 ? 'dag' : 'dagar'} för sent`,
            detail: `Beslutet fattades ${decided.date}, efter tidsfristen som löpte ut ${atDecision.deadlineDate} (9 kap. 99 §). Avgiften ska reduceras (12 kap. 8 a §).`,
            tone: 'overdue',
          }
        : {
            label: 'Beslut inom fristen',
            detail: `Beslutet fattades ${decided.date}, inom tidsfristen som löpte ut ${atDecision.deadlineDate} (9 kap. 99 §).`,
            tone: 'done',
          };
    }
  }
  const status = deadlineStatus(state);
  if (status.deadlineDate === null || status.daysLeft === null) {
    return {
      label: 'Fristen väntar',
      detail: `${status.explanation} Tioveckorsfristen börjar löpa när kompletteringen kommit in.`,
      tone: 'paused',
    };
  }
  const days = status.daysLeft;
  const elapsed =
    status.daysElapsed === null
      ? ''
      : ` ${status.daysElapsed} ${status.daysElapsed === 1 ? 'dag' : 'dagar'} sedan ${
          status.basis === 'komplettering' ? 'kompletteringen' : 'ansökningsdagen'
        }.`;
  if (days < 0) {
    return {
      label: `${-days} ${days === -1 ? 'dag' : 'dagar'} över fristen`,
      detail: `Tidsfristen löpte ut ${status.deadlineDate}.${elapsed} Avgiften ska reduceras (12 kap. 8 a §).`,
      tone: 'overdue',
    };
  }
  return {
    label: days === 0 ? 'Sista dagen i dag' : `${days} ${days === 1 ? 'dag' : 'dagar'} kvar`,
    detail: `Beslut senast ${status.deadlineDate} (9 kap. 99 §).${elapsed}`,
    tone: days <= 14 ? 'warning' : 'normal',
  };
}

/* ---------------------------------------------------------------------- units */

/** "Tillbyggnadens byggnadshöjd (m)" → { label: "Tillbyggnadens byggnadshöjd", unit: "m" }. */
export function splitUnit(text: string, unit?: string): { label: string; unit: string | null } {
  const match = /\s*\(([^()\d]{1,12})\)\s*(\??)\s*$/u.exec(text);
  if (unit) return { label: match ? text.slice(0, match.index) + (match[2] ?? '') : text, unit };
  if (!match) return { label: text, unit: null };
  return { label: text.slice(0, match.index) + (match[2] ?? ''), unit: match[1]?.trim() ?? null };
}

/* -------------------------------------------------------------------------- facts */

/** Swedish words for the ASCII spellings used in `fakta` keys. */
const WORDS: Record<string, string> = {
  hogsta: 'högsta',
  storsta: 'största',
  minsta: 'minsta',
  byggnadshojd: 'byggnadshöjd',
  nockhojd: 'nockhöjd',
  totalhojd: 'totalhöjd',
  hojd: 'höjd',
  avstand: 'avstånd',
  grans: 'gräns',
  ovriga: 'övriga',
  atgard: 'åtgärd',
  genomforandetid: 'genomförandetid',
  utgangen: 'utgången',
  lamnat: 'lämnat',
  ansokan: 'ansökan',
  aterkallad: 'återkallad',
  agare: 'ägare',
  invandning: 'invändning',
  vag: 'väg',
  vagen: 'vägen',
  strandlinje: 'strandlinje',
  oversiktsplan: 'översiktsplan',
  tomtarea: 'tomtarea',
  fastighet: 'fastighet',
  sjo: 'sjö',
  langd: 'längd',
  bredd: 'bredd',
  pagar: 'pågår',
  for: 'för',
  fran: 'från',
  till: 'till',
};

const UNIT_SUFFIX: [RegExp, string][] = [
  [/_kvm$/, ' (m²)'],
  [/_m2$/, ' (m²)'],
  [/_procent$/, ' (%)'],
  [/_m$/, ' (m)'],
  [/_dagar$/, ' (dagar)'],
  [/_kr$/, ' (kr)'],
];

/** `hogsta_byggnadshojd` → "Högsta byggnadshöjd", `byggnadsarea_kvm` → "Byggnadsarea (m²)". */
export function factLabel(key: string): string {
  let unit = '';
  let base = key;
  for (const [pattern, suffix] of UNIT_SUFFIX) {
    if (pattern.test(base)) {
      base = base.replace(pattern, '');
      unit = suffix;
      break;
    }
  }
  const words = base
    .split('_')
    .filter((w) => w !== '')
    .map((w) => WORDS[w] ?? w);
  const text = words.join(' ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}${unit}`;
}

/** Swedish display of a fact value: decimal comma, Ja/Nej, lists joined. */
export function factValue(value: unknown): string {
  if (value === null || value === undefined) return '–';
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nej';
  if (typeof value === 'number') return String(value).replace('.', ',');
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(factValue).join(', ');
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${factLabel(k)}: ${factValue(v)}`)
      .join('; ');
  }
  return String(value);
}

/* ----------------------------------------------------------------- law references */

/**
 * Law references the case works with: every step's `lagrum` in the order the steps come,
 * without duplicates. Used in Uppslag and as the choice list for the decision's lagstöd.
 */
export function caseLawRefs(caseFile: CaseFile, state?: CaseState): string[] {
  const steps = state
    ? state.queue.flatMap((id) => {
        const step = stepById(caseFile, id);
        return step ? [step] : [];
      })
    : allCaseSteps(caseFile);
  const refs: string[] = [];
  for (const step of steps) {
    for (const ref of step.lagrum ?? []) if (!refs.includes(ref)) refs.push(ref);
  }
  return refs;
}

/* ------------------------------------------------------------------- recipients */

/**
 * Suggestions for the decision's expediering: the applicant, the owner and the parties
 * the case lets the learner choose between (an urval step), as "Ägaren till …".
 */
export function recipientSuggestions(caseFile: CaseFile): string[] {
  const list = ['Sökanden', `Fastighetsägaren (${propertyName(caseFile)})`];
  for (const step of allCaseSteps(caseFile)) {
    if (step.typ !== 'urval') continue;
    for (const alt of step.alternativ) {
      const name = alt.text.replace(/\s*\(.*\)\s*$/, '').trim();
      const suggestion = `Ägaren till ${name}`;
      if (name !== '' && !list.includes(suggestion)) list.push(suggestion);
    }
  }
  return list;
}
