import {
  allCaseSteps,
  parseLawRef,
  sectionSortKey,
  type Law,
  type LawChapterFile,
  type LawSection,
} from '@bygglov/content-schema';
import type { LookupContent, StudyContent } from '@/content';
import { pluralQuestions } from '@/lib/format';

/**
 * Law register for Uppslag. It collects every lagrum used in the bundled questions, the case
 * steps, the glossary and the process maps, groups them by statute (the first word of the
 * reference, e.g. "PBL") and adds names, chapter headings and links from the law catalogue.
 * Chapters with their own summary file (PBL 9 kap.) are listed section by section.
 */

export interface LawRefEntry {
  reference: string;
  /** Number of questions that cite the reference. */
  questionCount: number;
  moduleIds: string[];
  /** Cases with a step that cites the reference, e.g. ["A002"]. */
  caseIds: string[];
  /** Glossary terms that cite the reference. */
  termIds: string[];
  /** Process maps with a step that cites the reference. */
  processIds: string[];
  uncertain: boolean;
  chapter?: number;
  section?: string;
}

export interface LawChapterGroup {
  /** undefined for references without a chapter ("FL 25 §") or to the whole statute. */
  chapter?: number;
  title?: string;
  entries: LawRefEntry[];
}

export interface LawGroup {
  code: string;
  name: string;
  /** Link to the whole statute (riksdagen.se), when the catalogue has one. */
  url?: string;
  entries: LawRefEntry[];
  chapters: LawChapterGroup[];
}

/** Fallback names when the law catalogue (content/uppslag/lagar.yaml) is not built. */
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

const ORDER = ['PBL', 'PBF', 'FL', 'KL', 'OSL', 'TF', 'MB', 'VägL', 'FMH', 'KML', 'FBL', 'LSO'];

function compareRefs(a: LawRefEntry, b: LawRefEntry): number {
  const ka = [a.chapter ?? -1, ...(a.section ? sectionSortKey(a.section) : [-1, -1])];
  const kb = [b.chapter ?? -1, ...(b.section ? sectionSortKey(b.section) : [-1, -1])];
  for (let i = 0; i < ka.length; i++) {
    const d = (ka[i] ?? 0) - (kb[i] ?? 0);
    if (d !== 0) return d;
  }
  return a.reference.localeCompare(b.reference, 'sv');
}

type RegisterInput = Pick<StudyContent, 'questionsByModule' | 'cases'> & {
  lookup?: Pick<LookupContent, 'glossary' | 'processes' | 'laws'>;
};

export function buildLawRegister(content: RegisterInput): LawGroup[] {
  const entries = new Map<string, LawRefEntry>();
  const entryFor = (reference: string): LawRefEntry => {
    let entry = entries.get(reference);
    if (!entry) {
      const parsed = parseLawRef(reference);
      entry = {
        reference,
        questionCount: 0,
        moduleIds: [],
        caseIds: [],
        termIds: [],
        processIds: [],
        uncertain: false,
        ...(parsed.chapter !== undefined ? { chapter: parsed.chapter } : {}),
        ...(parsed.section !== undefined ? { section: parsed.section } : {}),
      };
      entries.set(reference, entry);
    }
    return entry;
  };
  const addUnique = (list: string[], value: string) => {
    if (!list.includes(value)) list.push(value);
  };
  for (const [moduleId, questions] of content.questionsByModule) {
    for (const q of questions) {
      for (const reference of q.lagrum) {
        const entry = entryFor(reference);
        entry.questionCount += 1;
        addUnique(entry.moduleIds, moduleId);
        if (q.lagrum_osaker) entry.uncertain = true;
      }
    }
  }
  for (const caseFile of content.cases) {
    for (const step of allCaseSteps(caseFile)) {
      for (const reference of step.lagrum ?? [])
        addUnique(entryFor(reference).caseIds, caseFile.id);
    }
  }
  for (const term of content.lookup?.glossary ?? []) {
    for (const reference of term.lagrum) {
      const entry = entryFor(reference);
      addUnique(entry.termIds, term.id);
      if (term.lagrum_osaker) entry.uncertain = true;
    }
  }
  for (const process of content.lookup?.processes ?? []) {
    for (const step of process.steg) {
      for (const reference of step.lagrum) addUnique(entryFor(reference).processIds, process.id);
    }
  }

  const laws = new Map((content.lookup?.laws ?? []).map((law) => [law.kod, law]));
  const catalogOrder = [...laws.keys()];
  const rank = (code: string) => {
    const inCatalog = catalogOrder.indexOf(code);
    if (inCatalog !== -1) return inCatalog;
    const fallback = ORDER.indexOf(code);
    return fallback === -1 ? Number.MAX_SAFE_INTEGER : catalogOrder.length + fallback;
  };
  const groups = new Map<string, LawRefEntry[]>();
  for (const entry of entries.values()) {
    const code = parseLawRef(entry.reference).code;
    groups.set(code, [...(groups.get(code) ?? []), entry]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, 'sv'))
    .map(([code, list]) => {
      const law = laws.get(code);
      const sorted = list.sort(compareRefs);
      return {
        code,
        name: law?.namn ?? LAW_NAMES[code] ?? code,
        ...(law ? { url: law.lank } : {}),
        entries: sorted,
        chapters: chapterGroups(sorted, law),
      };
    });
}

function chapterGroups(entries: readonly LawRefEntry[], law: Law | undefined): LawChapterGroup[] {
  const out: LawChapterGroup[] = [];
  for (const entry of entries) {
    let group = out.find((g) => g.chapter === entry.chapter);
    if (!group) {
      const title = law?.kapitel?.find((c) => c.nr === entry.chapter)?.rubrik;
      group = {
        ...(entry.chapter !== undefined ? { chapter: entry.chapter } : {}),
        ...(title ? { title } : {}),
        entries: [],
      };
      out.push(group);
    }
    group.entries.push(entry);
  }
  return out;
}

/* --------------------------------------------------------------- Chapters section by section */

export interface SectionEntry {
  /** Canonical lagrum, e.g. "PBL 9 kap. 60 §". */
  key: string;
  code: string;
  chapter: number;
  section: LawSection;
  /** References in content that cover the section (exact or as part of a range). */
  usage: LawRefEntry[];
}

export function sectionKey(code: string, chapter: number, paragraf: string): string {
  return `${code} ${chapter} kap. ${paragraf} §`;
}

/**
 * Sections a reference points at in a chapter: "9 kap. 60 §" → ["60"],
 * "9 kap. 94–97 §§" → every listed section from 94 to 97, "9 kap. 41 och 42 §§" → both.
 */
export function sectionsCovered(reference: string, available: readonly string[]): string[] {
  const match = /kap\.\s+([\d\sa-z,–-]+?(?:\s+och\s+[\d\sa-z]+?)?)\s*§/.exec(reference);
  if (!match?.[1]) return [];
  const body = match[1].replace(/\s+och\s+/g, ',');
  const result = new Set<string>();
  for (const part of body.split(',')) {
    const [from, to] = part.split(/[–-]/).map((s) => s.trim());
    if (!from) continue;
    if (to === undefined) {
      if (available.includes(from)) result.add(from);
      continue;
    }
    const lo = sectionSortKey(from);
    const hi = sectionSortKey(to);
    for (const paragraf of available) {
      const key = sectionSortKey(paragraf);
      const afterLo =
        (key[0] ?? 0) > (lo[0] ?? 0) ||
        ((key[0] ?? 0) === (lo[0] ?? 0) && (key[1] ?? 0) >= (lo[1] ?? 0));
      const beforeHi =
        (key[0] ?? 0) < (hi[0] ?? 0) ||
        ((key[0] ?? 0) === (hi[0] ?? 0) && (key[1] ?? 0) <= (hi[1] ?? 0));
      if (afterLo && beforeHi) result.add(paragraf);
    }
  }
  return available.filter((p) => result.has(p));
}

/** Sections of a chapter file, each with the content references that cite it. */
export function chapterSections(
  chapter: LawChapterFile,
  register: readonly LawGroup[],
): SectionEntry[] {
  const available = chapter.paragrafer.map((s) => s.paragraf);
  const usage = new Map<string, LawRefEntry[]>(available.map((p) => [p, []]));
  const group = register.find((g) => g.code === chapter.lag);
  for (const entry of group?.entries ?? []) {
    if (entry.chapter !== chapter.kapitel) continue;
    for (const paragraf of sectionsCovered(entry.reference, available))
      usage.get(paragraf)?.push(entry);
  }
  return chapter.paragrafer.map((section) => ({
    key: sectionKey(chapter.lag, chapter.kapitel, section.paragraf),
    code: chapter.lag,
    chapter: chapter.kapitel,
    section,
    usage: usage.get(section.paragraf) ?? [],
  }));
}

/** The section a reference opens in Uppslag, if a chapter file covers it. */
export function sectionForReference(
  reference: string,
  chapters: readonly LawChapterFile[],
): { chapter: LawChapterFile; key: string } | undefined {
  const parsed = parseLawRef(reference);
  if (parsed.chapter === undefined || parsed.section === undefined) return undefined;
  const chapter = chapters.find((c) => c.lag === parsed.code && c.kapitel === parsed.chapter);
  if (!chapter?.paragrafer.some((s) => s.paragraf === parsed.section)) return undefined;
  return { chapter, key: sectionKey(chapter.lag, chapter.kapitel, parsed.section) };
}

/** Case- and space-insensitive filter on reference text ("9 kap 4" matches "PBL 9 kap. 4 §"). */
export function matchesQuery(reference: string, query: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[.§]/g, '').replace(/\s+/g, ' ').trim();
  const q = normalize(query);
  return q === '' || normalize(reference).includes(q);
}

/** "3 frågor (Lovplikt) · ärende A002 · 2 begrepp · processkarta". */
export function usageText(
  entries: readonly LawRefEntry[],
  moduleTitles: ReadonlyMap<string, string>,
): string {
  const questions = entries.reduce((sum, e) => sum + e.questionCount, 0);
  const modules = [...new Set(entries.flatMap((e) => e.moduleIds))];
  const cases = [...new Set(entries.flatMap((e) => e.caseIds))].sort();
  const terms = new Set(entries.flatMap((e) => e.termIds)).size;
  const processes = new Set(entries.flatMap((e) => e.processIds)).size;
  const parts: string[] = [];
  if (questions > 0) {
    parts.push(
      `${pluralQuestions(questions)} (${modules.map((id) => moduleTitles.get(id) ?? id).join(', ')})`,
    );
  }
  if (cases.length > 0)
    parts.push(`${cases.length === 1 ? 'ärende' : 'ärenden'} ${cases.join(', ')}`);
  if (terms > 0) parts.push(`${terms} begrepp`);
  if (processes > 0) parts.push(processes === 1 ? 'processkarta' : `${processes} processkartor`);
  return parts.join(' · ');
}
