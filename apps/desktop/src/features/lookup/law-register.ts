import { allCaseSteps } from '@bygglov/content-schema';
import type { StudyContent } from '@/content';

/**
 * Law register for Uppslag, built from the references used in the bundled questions and in
 * the steps of the cases. Grouped by statute (the first word of the reference, e.g. "PBL").
 */

export interface LawRefEntry {
  reference: string;
  /** Number of questions that cite the reference. */
  questionCount: number;
  moduleIds: string[];
  /** Cases with a step that cites the reference, e.g. ["A002"]. */
  caseIds: string[];
  uncertain: boolean;
}

export interface LawGroup {
  code: string;
  name: string;
  entries: LawRefEntry[];
}

export const LAW_NAMES: Readonly<Record<string, string>> = {
  PBL: 'Plan- och bygglagen (2010:900)',
  PBF: 'Plan- och byggförordningen (2011:338)',
  FL: 'Förvaltningslagen (2017:900)',
  KL: 'Kommunallagen (2017:725)',
  OSL: 'Offentlighets- och sekretesslagen (2009:400)',
  MB: 'Miljöbalken (1998:808)',
  TF: 'Tryckfrihetsförordningen',
  VägL: 'Väglagen (1971:948)',
  FMH: 'Förordningen (1998:899) om miljöfarlig verksamhet och hälsoskydd',
};

const ORDER = ['PBL', 'PBF', 'FL', 'KL', 'OSL', 'MB', 'VägL', 'FMH', 'TF'];

/** Numeric parts of a reference ("9 kap. 4 a §" → [9, 4]) for natural sorting. */
function sortKey(reference: string): number[] {
  return (reference.match(/\d+/g) ?? []).map(Number);
}

function compareRefs(a: string, b: string): number {
  const ka = sortKey(a);
  const kb = sortKey(b);
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    const d = (ka[i] ?? -1) - (kb[i] ?? -1);
    if (d !== 0) return d;
  }
  return a.localeCompare(b, 'sv');
}

export function buildLawRegister(
  content: Pick<StudyContent, 'questionsByModule' | 'cases'>,
): LawGroup[] {
  const entries = new Map<string, LawRefEntry>();
  const entryFor = (reference: string): LawRefEntry => {
    const entry = entries.get(reference) ?? {
      reference,
      questionCount: 0,
      moduleIds: [],
      caseIds: [],
      uncertain: false,
    };
    entries.set(reference, entry);
    return entry;
  };
  for (const [moduleId, questions] of content.questionsByModule) {
    for (const q of questions) {
      for (const reference of q.lagrum) {
        const entry = entryFor(reference);
        entry.questionCount += 1;
        if (!entry.moduleIds.includes(moduleId)) entry.moduleIds.push(moduleId);
        if (q.lagrum_osaker) entry.uncertain = true;
      }
    }
  }
  for (const caseFile of content.cases) {
    for (const step of allCaseSteps(caseFile)) {
      for (const reference of step.lagrum ?? []) {
        const entry = entryFor(reference);
        if (!entry.caseIds.includes(caseFile.id)) entry.caseIds.push(caseFile.id);
      }
    }
  }
  const groups = new Map<string, LawRefEntry[]>();
  for (const entry of entries.values()) {
    const code = entry.reference.split(/\s+/)[0] ?? entry.reference;
    groups.set(code, [...(groups.get(code) ?? []), entry]);
  }
  const rank = (code: string) => {
    const index = ORDER.indexOf(code);
    return index === -1 ? ORDER.length : index;
  };
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, 'sv'))
    .map(([code, list]) => ({
      code,
      name: LAW_NAMES[code] ?? code,
      entries: list.sort((a, b) => compareRefs(a.reference, b.reference)),
    }));
}

/** Case- and space-insensitive filter on reference text ("9 kap 4" matches "PBL 9 kap. 4 §"). */
export function matchesQuery(reference: string, query: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[.§]/g, '').replace(/\s+/g, ' ').trim();
  const q = normalize(query);
  return q === '' || normalize(reference).includes(q);
}
