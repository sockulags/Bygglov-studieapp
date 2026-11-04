import type { StudyContent } from '@/content';

/**
 * Law register for Uppslag, built from the references used in the bundled questions and
 * modules. Grouped by statute (the first word of the reference, e.g. "PBL").
 */

export interface LawRefEntry {
  reference: string;
  /** Number of questions that cite the reference. */
  questionCount: number;
  moduleIds: string[];
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
};

const ORDER = ['PBL', 'PBF', 'FL', 'KL', 'OSL', 'MB', 'TF'];

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

export function buildLawRegister(content: StudyContent): LawGroup[] {
  const entries = new Map<string, LawRefEntry>();
  for (const [moduleId, questions] of content.questionsByModule) {
    for (const q of questions) {
      for (const reference of q.lagrum) {
        const entry = entries.get(reference) ?? {
          reference,
          questionCount: 0,
          moduleIds: [],
          uncertain: false,
        };
        entry.questionCount += 1;
        if (!entry.moduleIds.includes(moduleId)) entry.moduleIds.push(moduleId);
        if (q.lagrum_osaker) entry.uncertain = true;
        entries.set(reference, entry);
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
