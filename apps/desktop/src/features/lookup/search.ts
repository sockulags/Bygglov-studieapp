import type { LookupContent } from '@/content';
import { chapterSections, type LawGroup } from './law-register';

/**
 * Search across Uppslag: glossary terms, process maps and their steps, and lagrum (the
 * sections of PBL 9 kap. and every other reference in the register). Pure functions, so the
 * ranking can be tested without rendering.
 */

export type LookupTarget =
  | { kind: 'term'; id: string }
  | { kind: 'process'; processId: string; stepId?: string }
  | { kind: 'section'; key: string }
  | { kind: 'reference'; reference: string };

export type SearchKind = 'begrepp' | 'process' | 'lagrum';

export interface SearchDocument {
  kind: SearchKind;
  /** Unique within the index. */
  id: string;
  title: string;
  /** One line under the title. */
  detail: string;
  /** Other names that should match almost as well as the title. */
  aliases: string[];
  /** Everything else that may match. */
  body: string;
  target: LookupTarget;
}

export interface SearchHit {
  doc: SearchDocument;
  score: number;
}

/** Lower case without diacritics, punctuation and "§", single spaces ("9 kap. 60 §" → "9 kap 60"). */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/§/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "9:60" (older shorthand) → "9 kap 60"; otherwise like `normalize`. */
export function normalizeQuery(query: string): string {
  return normalize(query.replace(/\b(\d+)\s*:\s*(\d+)\b/g, '$1 kap $2'));
}

const words = (text: string) => text.split(' ').filter(Boolean);

/** Every query word is the start of some word in the text. */
function allPrefixes(queryWords: readonly string[], text: string): boolean {
  const textWords = words(text);
  return queryWords.every((q) => textWords.some((w) => w.startsWith(q)));
}

/** The query occurs in the text starting at a word boundary. */
function phraseAt(query: string, text: string): boolean {
  return ` ${text} `.includes(` ${query}`);
}

interface PreparedDocument {
  doc: SearchDocument;
  title: string;
  aliases: string[];
  all: string;
}

export interface SearchIndex {
  documents: PreparedDocument[];
}

export function buildSearchIndex(lookup: LookupContent, register: readonly LawGroup[]): SearchIndex {
  const docs: SearchDocument[] = [];
  for (const term of lookup.glossary) {
    docs.push({
      kind: 'begrepp',
      id: `begrepp:${term.id}`,
      title: term.term,
      detail: term.definition,
      aliases: term.synonymer ?? [],
      body: [term.definition, ...term.lagrum].join(' '),
      target: { kind: 'term', id: term.id },
    });
  }
  for (const process of lookup.processes) {
    docs.push({
      kind: 'process',
      id: `process:${process.id}`,
      title: process.titel,
      detail: process.beskrivning,
      aliases: ['processkarta'],
      body: process.beskrivning,
      target: { kind: 'process', processId: process.id },
    });
    for (const step of process.steg) {
      docs.push({
        kind: 'process',
        id: `steg:${process.id}:${step.id}`,
        title: step.titel,
        detail: `${process.titel}${step.fraga ? ` · ${step.fraga}` : ''}`,
        aliases: [],
        body: [step.beskrivning, step.fraga ?? '', step.frist ?? '', ...step.lagrum].join(' '),
        target: { kind: 'process', processId: process.id, stepId: step.id },
      });
    }
  }
  const covered = new Set<string>();
  for (const chapter of lookup.chapters) {
    const law = lookup.laws.find((l) => l.kod === chapter.lag);
    for (const entry of chapterSections(chapter, register)) {
      covered.add(entry.key);
      const { section } = entry;
      docs.push({
        kind: 'lagrum',
        id: `lagrum:${entry.key}`,
        title: entry.key,
        detail: [section.rubrik, section.sammanfattning].filter(Boolean).join(' · '),
        aliases: [`${chapter.kapitel} kap ${section.paragraf}`],
        body: [section.rubrik ?? '', section.sammanfattning, law?.namn ?? ''].join(' '),
        target: { kind: 'section', key: entry.key },
      });
    }
  }
  for (const group of register) {
    for (const chapterGroup of group.chapters) {
      for (const entry of chapterGroup.entries) {
        if (covered.has(entry.reference)) continue;
        docs.push({
          kind: 'lagrum',
          id: `lagrum:${entry.reference}`,
          title: entry.reference,
          detail: [group.name, chapterGroup.title && `${chapterGroup.chapter} kap. ${chapterGroup.title}`]
            .filter(Boolean)
            .join(' · '),
          aliases: [],
          body: [group.name, chapterGroup.title ?? ''].join(' '),
          target: { kind: 'reference', reference: entry.reference },
        });
      }
    }
  }
  return {
    documents: docs.map((doc) => {
      const title = normalize(doc.title);
      const aliases = doc.aliases.map(normalize);
      return { doc, title, aliases, all: [title, ...aliases, normalize(doc.body)].join(' ') };
    }),
  };
}

function scoreOf(doc: PreparedDocument, query: string, queryWords: readonly string[]): number {
  // A lagrum without its statute ("9 kap 60") should still hit "pbl 9 kap 60".
  const titles = [doc.title, ...doc.aliases];
  if (titles.some((t) => t === query)) return 100;
  if (doc.doc.kind === 'lagrum' && titles.some((t) => t.endsWith(` ${query}`))) return 95;
  if (titles.some((t) => t.startsWith(query))) return 85;
  if (titles.some((t) => phraseAt(query, t))) return 75;
  if (titles.some((t) => allPrefixes(queryWords, t))) return 60;
  if (phraseAt(query, doc.all)) return 30;
  if (allPrefixes(queryWords, doc.all)) return 20;
  return 0;
}

/** Hits sorted by score, then by kind (terms first) and title. */
export function searchLookup(index: SearchIndex, rawQuery: string): SearchHit[] {
  const query = normalizeQuery(rawQuery);
  if (query === '') return [];
  const queryWords = words(query);
  const kindOrder: Record<SearchKind, number> = { begrepp: 0, lagrum: 1, process: 2 };
  return index.documents
    .map((doc) => ({ doc: doc.doc, score: scoreOf(doc, query, queryWords) }))
    .filter((hit) => hit.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        kindOrder[a.doc.kind] - kindOrder[b.doc.kind] ||
        a.doc.title.localeCompare(b.doc.title, 'sv'),
    );
}

export interface SearchGroup {
  kind: SearchKind;
  label: string;
  hits: SearchHit[];
  total: number;
}

const GROUP_LABELS: Record<SearchKind, string> = {
  begrepp: 'Begrepp',
  lagrum: 'Lagrum',
  process: 'Processkartor',
};

/** Hits grouped by kind, best group first, with at most `limit` hits per group. */
export function groupHits(hits: readonly SearchHit[], limit = 8): SearchGroup[] {
  const groups = new Map<SearchKind, SearchHit[]>();
  for (const hit of hits) groups.set(hit.doc.kind, [...(groups.get(hit.doc.kind) ?? []), hit]);
  return [...groups.entries()]
    .sort(([, a], [, b]) => (b[0]?.score ?? 0) - (a[0]?.score ?? 0))
    .map(([kind, list]) => ({ kind, label: GROUP_LABELS[kind], hits: list.slice(0, limit), total: list.length }));
}
