import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  allCaseSteps,
  parseGlossaryFile,
  parseLawCatalog,
  parseLawChapterFile,
  parseLawRef,
  parseProcessFile,
  type CaseFile,
  type GlossaryFile,
  type LawCatalog,
  type LawChapterFile,
  type ParseResult,
  type ProcessFile,
  type QuestionFile,
} from '@bygglov/content-schema';
import { globSync } from 'tinyglobby';
import { isMap, isSeq, parseDocument, type Document, type YAMLMap } from 'yaml';
import { normalizeLawText, parseLawChapterText, type ParsedLawSection } from './law-text';

/*
 * Uppslag (content/uppslag/): loading, validation and cross-checks of the glossary, the
 * process maps, the law catalogue and the chapter files with per-section summaries.
 */

export const LOOKUP_DIR = 'uppslag';
export const GLOSSARY_FILE = `${LOOKUP_DIR}/begrepp.yaml`;
export const PROCESS_FILE = `${LOOKUP_DIR}/processer.yaml`;
export const LAW_CATALOG_FILE = `${LOOKUP_DIR}/lagar.yaml`;
/** Chapter files are named after their source in docs/rattslage, e.g. `pbl-9-kap.yaml`. */
const CHAPTER_PATTERN = /^[a-z]+-\d+-kap\.ya?ml$/;

export interface LoadedLawChapter {
  /** e.g. `uppslag/pbl-9-kap.yaml` */
  file: string;
  data: LawChapterFile;
}

export interface LoadedLookup {
  glossary: GlossaryFile | null;
  processes: ProcessFile | null;
  laws: LawCatalog | null;
  chapters: LoadedLawChapter[];
}

interface LookupContext {
  contentRoot: string;
  moduleIds: ReadonlySet<string> | null;
  readYaml: (file: string) => { ok: true; value: unknown } | { ok: false };
  validate: <T>(
    file: string,
    value: unknown,
    parser: (input: unknown) => ParseResult<T>,
  ) => T | null;
  error: (file: string, message: string, path?: string) => void;
  warn: (file: string, message: string, path?: string) => void;
  questionFiles: readonly { file: string; data: QuestionFile }[];
  cases: readonly { dir: string; data: CaseFile }[];
}

/** Where the source text of a chapter file lives: `docs/rattslage/<same name>.txt`. */
export function chapterSourcePath(contentRoot: string, chapterFile: string): string {
  return join(
    contentRoot,
    '..',
    'docs',
    'rattslage',
    basename(chapterFile).replace(/\.ya?ml$/, '.txt'),
  );
}

export function loadLookup(ctx: LookupContext): LoadedLookup {
  const { contentRoot, error, warn } = ctx;
  const has = (file: string) => existsSync(join(contentRoot, file));
  const load = <T>(file: string, parser: (input: unknown) => ParseResult<T>): T | null => {
    if (!has(file)) {
      warn(file, 'Filen saknas, så Uppslag visar inte den delen.');
      return null;
    }
    const yaml = ctx.readYaml(file);
    return yaml.ok ? ctx.validate(file, yaml.value, parser) : null;
  };

  const laws = load(LAW_CATALOG_FILE, parseLawCatalog);
  const glossary = load(GLOSSARY_FILE, parseGlossaryFile);
  const processes = load(PROCESS_FILE, parseProcessFile);

  const known = new Set([GLOSSARY_FILE, PROCESS_FILE, LAW_CATALOG_FILE].map((f) => basename(f)));
  const chapters: LoadedLawChapter[] = [];
  const lookupFiles = has(LOOKUP_DIR)
    ? globSync(`${LOOKUP_DIR}/*.{yaml,yml}`, { cwd: contentRoot }).sort()
    : [];
  for (const file of lookupFiles) {
    const name = basename(file);
    if (known.has(name)) continue;
    if (!CHAPTER_PATTERN.test(name)) {
      warn(
        file,
        'Okänd fil i uppslag/. Kända filer: begrepp.yaml, processer.yaml, lagar.yaml och kapitelfiler som pbl-9-kap.yaml.',
      );
      continue;
    }
    const yaml = ctx.readYaml(file);
    if (!yaml.ok) continue;
    const data = ctx.validate(file, yaml.value, parseLawChapterFile);
    if (!data) continue;
    const expected = `${data.lag.toLowerCase()}-${data.kapitel}-kap`;
    if (!name.startsWith(`${expected}.`)) {
      error(
        file,
        `Filen innehåller ${data.lag} ${data.kapitel} kap. och ska heta ${expected}.yaml.`,
        'lag',
      );
    }
    chapters.push({ file, data });
  }

  // Modules
  const checkModule = (file: string, moduleId: string, path: string) => {
    if (ctx.moduleIds && !ctx.moduleIds.has(moduleId)) {
      error(file, `Modulen "${moduleId}" finns inte i moduler.yaml.`, path);
    }
  };
  glossary?.begrepp.forEach((term) =>
    checkModule(GLOSSARY_FILE, term.modul, `begrepp[${term.id}].modul`),
  );
  processes?.processer.forEach((process) =>
    checkModule(PROCESS_FILE, process.modul, `processer[${process.id}].modul`),
  );

  // Glossary references from the process maps
  const termIds = new Set(glossary?.begrepp.map((t) => t.id));
  processes?.processer.forEach((process) => {
    process.steg.forEach((step) => {
      step.begrepp?.forEach((id, index) => {
        if (glossary && !termIds.has(id)) {
          error(
            PROCESS_FILE,
            `Begreppet "${id}" finns inte i ${GLOSSARY_FILE}.`,
            `processer[${process.id}].steg[${step.id}].begrepp[${index + 1}]`,
          );
        }
      });
    });
  });

  // Chapter files against the catalogue and their source text
  const lawCodes = new Map(laws?.lagar.map((law) => [law.kod, law]));
  for (const { file, data } of chapters) {
    const law = lawCodes.get(data.lag);
    if (laws && !law) {
      error(file, `Lagen "${data.lag}" finns inte i ${LAW_CATALOG_FILE}.`, 'lag');
    } else if (law?.kapitel && !law.kapitel.some((c) => c.nr === data.kapitel)) {
      warn(file, `${LAW_CATALOG_FILE} saknar kapitel ${data.kapitel} för ${data.lag}.`, 'kapitel');
    }
    const source = chapterSourcePath(contentRoot, file);
    if (existsSync(source)) {
      for (const problem of compareWithSource(
        data,
        parseLawChapterText(readFileSync(source, 'utf8')),
      )) {
        warn(
          file,
          `${problem} Kör pnpm --filter @bygglov/content-build exec tsx src/index.ts lagtext.`,
        );
      }
    }
  }

  // Every lagrum: known statute, and an existing section where a chapter file covers it
  const chapterSections = new Map(
    chapters.map(({ data }) => [
      `${data.lag} ${data.kapitel}`,
      new Map(data.paragrafer.map((s) => [s.paragraf, s])),
    ]),
  );
  const checkRefs = (
    refs: readonly string[] | undefined,
    file: string,
    path: string,
    report: (file: string, message: string, path?: string) => void,
  ) => {
    refs?.forEach((reference, index) => {
      const ref = parseLawRef(reference);
      const where = `${path}.lagrum[${index + 1}]`;
      if (laws && !lawCodes.has(ref.code)) {
        report(
          file,
          `Lagkoden "${ref.code}" i "${reference}" finns inte i ${LAW_CATALOG_FILE}.`,
          where,
        );
        return;
      }
      if (ref.chapter === undefined || ref.section === undefined) return;
      const sections = chapterSections.get(`${ref.code} ${ref.chapter}`);
      if (!sections) return;
      const section = sections.get(ref.section);
      if (!section) {
        report(
          file,
          `"${reference}": ${ref.code} ${ref.chapter} kap. har ingen ${ref.section} §.`,
          where,
        );
      } else if (section.upphavd) {
        report(file, `"${reference}": ${ref.section} § är upphävd (${section.upphavd}).`, where);
      }
    });
  };
  glossary?.begrepp.forEach((t) => checkRefs(t.lagrum, GLOSSARY_FILE, `begrepp[${t.id}]`, error));
  processes?.processer.forEach((p) =>
    p.steg.forEach((s) =>
      checkRefs(s.lagrum, PROCESS_FILE, `processer[${p.id}].steg[${s.id}]`, error),
    ),
  );
  // Questions and cases belong to other files; problems there are warnings, not errors.
  for (const { file, data } of ctx.questionFiles) {
    data.fragor.forEach((q) => checkRefs(q.lagrum, file, `fragor[${q.id}]`, warn));
  }
  for (const { dir, data } of ctx.cases) {
    allCaseSteps(data).forEach((step) =>
      checkRefs(step.lagrum, `${dir}/arende.yaml`, `steg[${step.id}]`, warn),
    );
  }

  return { glossary, processes, laws, chapters };
}

/** Differences between a chapter file and the parsed source text, as Swedish messages. */
export function compareWithSource(
  data: LawChapterFile,
  source: readonly ParsedLawSection[],
): string[] {
  const problems: string[] = [];
  const inFile = new Map(data.paragrafer.map((s) => [s.paragraf, s]));
  for (const parsed of source) {
    const section = inFile.get(parsed.paragraf);
    if (!section) {
      problems.push(`${parsed.paragraf} § finns i källtexten men inte i filen.`);
      continue;
    }
    const same =
      normalizeLawText(section.lagtext) === normalizeLawText(parsed.lagtext) &&
      normalizeLawText(section.kommande?.lagtext) === normalizeLawText(parsed.kommande?.lagtext) &&
      (section.upphavd ?? '') === (parsed.upphavd ?? '');
    if (!same) problems.push(`Lagtexten i ${parsed.paragraf} § skiljer sig från källtexten.`);
  }
  const inSource = new Set(source.map((s) => s.paragraf));
  for (const section of data.paragrafer) {
    if (!inSource.has(section.paragraf)) {
      problems.push(`${section.paragraf} § finns i filen men inte i källtexten.`);
    }
  }
  return problems;
}

/** The fields of a section that come from the source text (everything but the summary). */
const SOURCE_FIELDS = [
  'rubrik',
  'lagtext',
  'andrad_genom',
  'upphavd',
  'upphor',
  'kommande',
] as const;

/**
 * Updates the law text of a chapter YAML from the parsed source, keeping the summaries and
 * comments. New sections get no summary, so `content:check` stops until one is written.
 * Returns the new YAML and the sections that changed or were added.
 */
export function syncChapterYaml(
  yamlSource: string,
  parsed: readonly ParsedLawSection[],
): { source: string; changed: string[]; added: string[] } {
  const doc: Document = parseDocument(yamlSource);
  const list = doc.get('paragrafer');
  if (!isSeq(list)) throw new Error('Filen saknar listan paragrafer.');
  const items = new Map<string, YAMLMap>();
  for (const item of list.items) {
    if (isMap(item)) items.set(String(item.get('paragraf')), item);
  }
  const changed: string[] = [];
  const added: string[] = [];
  const ordered: YAMLMap[] = [];
  for (const section of parsed) {
    let item = items.get(section.paragraf);
    if (!item) {
      item = doc.createNode({ paragraf: section.paragraf }) as YAMLMap;
      added.push(section.paragraf);
    }
    let differs = false;
    for (const field of SOURCE_FIELDS) {
      const value = section[field];
      const before = JSON.stringify(item.toJSON()?.[field] ?? null);
      if (value === undefined) {
        if (item.has(field)) item.delete(field);
      } else {
        item.set(field, doc.createNode(value));
      }
      if (before !== JSON.stringify(value ?? null)) differs = true;
    }
    if (differs && !added.includes(section.paragraf)) changed.push(section.paragraf);
    ordered.push(item);
  }
  list.items = ordered;
  return { source: doc.toString({ lineWidth: 0, blockQuote: 'literal' }), changed, added };
}

/** JSON files for Uppslag in `content-dist/`, as [relative path, value]. */
export function lookupOutputs(tree: { lookup: LoadedLookup }): [string, unknown][] {
  const out: [string, unknown][] = [];
  const { glossary, processes, laws, chapters } = tree.lookup;
  if (laws) out.push([`${LOOKUP_DIR}/lagar.json`, laws]);
  if (glossary) out.push([`${LOOKUP_DIR}/begrepp.json`, glossary]);
  if (processes) out.push([`${LOOKUP_DIR}/processer.json`, processes]);
  for (const { file, data } of chapters) {
    out.push([`${LOOKUP_DIR}/${basename(file).replace(/\.ya?ml$/, '.json')}`, data]);
  }
  return out;
}
