/**
 * Uppslag content bundled with the app: glossary, process maps, law catalogue and chapter
 * summaries (`src/content-dist/uppslag/*.json`, written by `pnpm content:build`). Kept apart
 * from `StudyContent` so the study views do not carry it.
 */
import {
  parseGlossaryFile,
  parseLawCatalog,
  parseLawChapterFile,
  parseProcessFile,
  type GlossaryTerm,
  type Law,
  type LawChapterFile,
  type ParseResult,
  type Process,
} from '@bygglov/content-schema';
import { ContentLoadError } from './assemble';

export interface LookupContent {
  /** Terms sorted alphabetically (Swedish collation). */
  glossary: readonly GlossaryTerm[];
  /** Process maps in file order. */
  processes: readonly Process[];
  /** Statutes in the law catalogue, in file order. */
  laws: readonly Law[];
  /** Chapters with per-section summaries, e.g. PBL 9 kap. */
  chapters: readonly LawChapterFile[];
}

export const EMPTY_LOOKUP: LookupContent = { glossary: [], processes: [], laws: [], chapters: [] };

const LOOKUP_PREFIX = 'uppslag/';

function validated<T>(file: string, value: unknown, parse: (input: unknown) => ParseResult<T>): T {
  const result = parse(value);
  if (!result.success) throw new ContentLoadError(file, result.issues);
  return result.data;
}

/**
 * Builds `LookupContent` from generated JSON keyed by path relative to `content-dist/`
 * (e.g. `uppslag/begrepp.json`). Other files are ignored. Every file is validated again.
 */
export function assembleLookup(files: Readonly<Record<string, unknown>>): LookupContent {
  let glossary: GlossaryTerm[] = [];
  let processes: Process[] = [];
  let laws: Law[] = [];
  const chapters: LawChapterFile[] = [];
  for (const [file, value] of Object.entries(files)) {
    if (!file.startsWith(LOOKUP_PREFIX)) continue;
    const name = file.slice(LOOKUP_PREFIX.length);
    if (name === 'begrepp.json') glossary = [...validated(file, value, parseGlossaryFile).begrepp];
    else if (name === 'processer.json') processes = [...validated(file, value, parseProcessFile).processer];
    else if (name === 'lagar.json') laws = [...validated(file, value, parseLawCatalog).lagar];
    else if (/-kap\.json$/.test(name)) chapters.push(validated(file, value, parseLawChapterFile));
  }
  glossary.sort((a, b) => a.term.localeCompare(b.term, 'sv'));
  chapters.sort((a, b) => a.lag.localeCompare(b.lag, 'sv') || a.kapitel - b.kapitel);
  return { glossary, processes, laws, chapters };
}

const DIST_PREFIX = '../content-dist/';

const lookupFiles = import.meta.glob<unknown>('../content-dist/uppslag/*.json', {
  eager: true,
  import: 'default',
});

let cached: LookupContent | undefined;

/** Loads and validates the bundled Uppslag content once; later calls return the same object. */
export function loadLookup(): LookupContent {
  if (!cached) {
    const files: Record<string, unknown> = {};
    for (const [path, value] of Object.entries(lookupFiles)) {
      files[path.startsWith(DIST_PREFIX) ? path.slice(DIST_PREFIX.length) : path] = value;
    }
    cached = assembleLookup(files);
  }
  return cached;
}
