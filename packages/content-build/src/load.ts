import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  allCaseSteps,
  parseCaseFile,
  parseModules,
  parseQuestionFile,
  type CaseFile,
  type ContentIssue,
  type ModulesFile,
  type ParseResult,
  type QuestionFile,
} from '@bygglov/content-schema';
import { globSync } from 'tinyglobby';
import { parse, YAMLParseError } from 'yaml';
import {
  DRAWING_KINDS,
  DrawingDoesNotFitError,
  isDrawingKind,
  isGeneratedDrawing,
  parseDrawing,
  renderDrawing,
  type DrawingKind,
} from './drawings';

/** A problem tied to a file. `path` locates it inside the file, if known. */
export interface Finding extends ContentIssue {
  file: string;
}

export interface LoadedQuestionFile {
  /** Path relative to the content root, e.g. `fragor/03-lovplikt.yaml`. */
  file: string;
  data: QuestionFile;
}

/** A handling whose SVG is generated from `parametrar`. */
export interface PlannedDrawing {
  handling: string;
  kind: DrawingKind;
  /** Path inside the case folder, e.g. `handlingar/situationsplan.svg`. */
  fil: string;
  /** The rendered SVG. */
  svg: string;
}

export interface LoadedCase {
  /** Folder relative to the content root, e.g. `arenden/A002-tillbyggnad-bjorken-7`. */
  dir: string;
  data: CaseFile;
  /** Generated drawings, rendered from the validated parameters. */
  drawings: PlannedDrawing[];
}

/** Keys allowed in the front matter of a Markdown handling. */
export const FRONT_MATTER_KEYS = ['rubrik', 'avsandare', 'datum', 'diarienummer'] as const;

/**
 * Splits optional front matter (`---` YAML `---`) from a Markdown document. Returns
 * `undefined` for `frontMatter` when there is none.
 */
export function splitFrontMatter(source: string): { frontMatter?: string; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source);
  if (!match) return { body: source };
  return { frontMatter: match[1] ?? '', body: source.slice(match[0].length) };
}

/** Problems in a Markdown handling's front matter, as Swedish messages. */
export function checkFrontMatter(source: string): string[] {
  const { frontMatter } = splitFrontMatter(source);
  if (frontMatter === undefined) return [];
  let value: unknown;
  try {
    value = parse(frontMatter) as unknown;
  } catch (cause) {
    const first = (cause instanceof Error ? cause.message : String(cause)).split('\n')[0];
    return [`Front matter är inte giltig YAML: ${first}`];
  }
  if (value === null || value === undefined) return [];
  if (typeof value !== 'object' || Array.isArray(value)) {
    return ['Front matter ska vara nyckel: värde-rader mellan två rader med ---.'];
  }
  const problems: string[] = [];
  for (const [key, field] of Object.entries(value)) {
    if (!(FRONT_MATTER_KEYS as readonly string[]).includes(key)) {
      problems.push(
        `Okänd nyckel i front matter: ${key}. Tillåtna nycklar: ${FRONT_MATTER_KEYS.join(', ')}.`,
      );
    } else if (typeof field !== 'string' || field.trim() === '') {
      problems.push(`${key} i front matter ska vara en text.`);
    } else if (key === 'datum' && !/^\d{4}-\d{2}-\d{2}$/.test(field)) {
      problems.push('datum i front matter ska skrivas som ÅÅÅÅ-MM-DD.');
    }
  }
  return problems;
}

export interface ContentTree {
  root: string;
  modules: ModulesFile | null;
  questionFiles: LoadedQuestionFile[];
  cases: LoadedCase[];
  errors: Finding[];
  warnings: Finding[];
  /** Number of files that were read. */
  fileCount: number;
}

const MODULES_FILE = 'moduler.yaml';

function toPosix(path: string): string {
  return path.split('\\').join('/');
}

/**
 * Reads, validates and cross-checks everything under `contentRoot`. Never throws for
 * content problems; they are collected as errors and warnings.
 */
export function loadContentTree(contentRoot: string): ContentTree {
  const errors: Finding[] = [];
  const warnings: Finding[] = [];
  let fileCount = 0;

  const error = (file: string, message: string, path = '') => errors.push({ file, path, message });
  const warn = (file: string, message: string, path = '') => warnings.push({ file, path, message });

  function readYaml(file: string): { ok: true; value: unknown } | { ok: false } {
    fileCount += 1;
    let source: string;
    try {
      source = readFileSync(join(contentRoot, file), 'utf8');
    } catch (cause) {
      error(
        file,
        `Filen kunde inte läsas: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
      return { ok: false };
    }
    try {
      return { ok: true, value: parse(source) as unknown };
    } catch (cause) {
      if (cause instanceof YAMLParseError) {
        const where = cause.linePos
          ? `rad ${cause.linePos[0].line}, kolumn ${cause.linePos[0].col}`
          : '';
        const firstLine = cause.message.split('\n')[0] ?? cause.message;
        error(file, `YAML-fel${where ? ` på ${where}` : ''}: ${firstLine}`);
      } else {
        error(file, `YAML-fel: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
      return { ok: false };
    }
  }

  function validate<T>(file: string, value: unknown, parser: (input: unknown) => ParseResult<T>) {
    const result = parser(value);
    if (result.success) return result.data;
    for (const issue of result.issues) errors.push({ file, ...issue });
    return null;
  }

  const fileExists = (relativePath: string) => {
    const full = join(contentRoot, relativePath);
    return existsSync(full) && statSync(full).isFile();
  };

  // Modules
  let modules: ModulesFile | null = null;
  if (!existsSync(join(contentRoot, MODULES_FILE))) {
    error(MODULES_FILE, 'Filen saknas. Den listar alla moduler och måste finnas.');
  } else {
    const yaml = readYaml(MODULES_FILE);
    if (yaml.ok) modules = validate(MODULES_FILE, yaml.value, parseModules);
  }
  const moduleIds = new Set(modules?.moduler.map((m) => m.id));
  const knownModules = () => [...moduleIds].join(', ');

  // Questions
  const questionFiles: LoadedQuestionFile[] = [];
  const questionIds = new Map<string, string>();
  const moduleFiles = new Map<string, string>();
  for (const file of globSync('fragor/*.{yaml,yml}', { cwd: contentRoot }).sort()) {
    const yaml = readYaml(file);
    if (!yaml.ok) continue;
    const data = validate(file, yaml.value, parseQuestionFile);
    if (!data) continue;

    const expectedName = `fragor/${data.modul}.yaml`;
    if (toPosix(file) !== expectedName) {
      error(
        file,
        `Filen innehåller modul "${data.modul}" och ska därför heta ${expectedName}.`,
        'modul',
      );
    }
    if (modules && !moduleIds.has(data.modul)) {
      error(
        file,
        `Modulen "${data.modul}" finns inte i ${MODULES_FILE}. Kända moduler: ${knownModules()}.`,
        'modul',
      );
    }
    const otherFile = moduleFiles.get(data.modul);
    if (otherFile) {
      error(file, `Modulen "${data.modul}" har redan en frågefil: ${otherFile}.`, 'modul');
    } else {
      moduleFiles.set(data.modul, file);
    }

    data.fragor.forEach((question) => {
      const path = `fragor[${question.id}]`;
      const first = questionIds.get(question.id);
      if (first && first !== file) {
        error(
          file,
          `Fråge-id "${question.id}" används redan i ${first}. Id måste vara unika i allt innehåll.`,
          `${path}.id`,
        );
      } else {
        questionIds.set(question.id, file);
      }
      if (question.typ === 'ritning' && !fileExists(question.fil)) {
        warn(
          file,
          `Ritningen ${question.fil} finns inte ännu (sökväg relativt content/).`,
          `${path}.fil`,
        );
      }
    });
    questionFiles.push({ file: toPosix(file), data });
  }

  // Cases
  const cases: LoadedCase[] = [];
  const caseIds = new Map<string, string>();
  const caseDirs = existsSync(join(contentRoot, 'arenden'))
    ? readdirSync(join(contentRoot, 'arenden'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => `arenden/${entry.name}`)
        .sort()
    : [];
  for (const dir of caseDirs) {
    const file = `${dir}/arende.yaml`;
    if (!fileExists(file)) {
      warn(dir, 'Mappen saknar arende.yaml och hoppas över.');
      continue;
    }
    const yaml = readYaml(file);
    if (!yaml.ok) continue;
    const data = validate(file, yaml.value, parseCaseFile);
    if (!data) continue;

    const folderName = dir.slice('arenden/'.length);
    if (folderName !== data.id && !folderName.startsWith(`${data.id}-`)) {
      error(file, `Mappnamnet ska börja med ärendets id, t.ex. ${data.id}-kort-beskrivning.`, 'id');
    }
    const otherCase = caseIds.get(data.id);
    if (otherCase) {
      error(file, `Ärende-id "${data.id}" används redan i ${otherCase}.`, 'id');
    } else {
      caseIds.set(data.id, file);
    }
    data.moduler?.forEach((moduleId, index) => {
      if (modules && !moduleIds.has(moduleId)) {
        error(
          file,
          `Modulen "${moduleId}" finns inte i ${MODULES_FILE}. Kända moduler: ${knownModules()}.`,
          `moduler[${index + 1}]`,
        );
      }
    });

    // Generated drawings: validate the parameters and render once.
    const drawings: PlannedDrawing[] = [];
    data.handlingar.forEach((h) => {
      if (!isGeneratedDrawing(h)) return;
      const path = `handlingar[${h.id}]`;
      if (!isDrawingKind(h.typ)) {
        error(
          file,
          `Handlingen har parametrar och en .svg-fil men det finns ingen ritningsgenerator för typ ${h.typ}. Generatorer finns för: ${DRAWING_KINDS.join(', ')}.`,
          `${path}.typ`,
        );
        return;
      }
      const parsed = parseDrawing(h.typ, h.parametrar);
      if (!parsed.success) {
        for (const issue of parsed.issues) {
          error(file, issue.message, `${path}.parametrar${issue.path ? `.${issue.path}` : ''}`);
        }
        return;
      }
      let svg: string;
      try {
        svg = renderDrawing(parsed.data, {
          fastighet: data.fastighet,
          projekt: data.titel,
          titel: h.titel,
          datum: h.inkom ?? data.startdatum,
          idPrefix: `${data.id}-${h.id}`,
        });
      } catch (cause) {
        if (!(cause instanceof DrawingDoesNotFitError)) throw cause;
        error(file, cause.message, `${path}.parametrar`);
        return;
      }
      drawings.push({ handling: h.id, kind: h.typ, fil: h.fil, svg });
      const target = join(contentRoot, dir, h.fil);
      if (!fileExists(`${dir}/${h.fil}`)) {
        warn(
          file,
          `Ritningen ${h.fil} är inte genererad ännu. Kör pnpm content:drawings.`,
          `${path}.fil`,
        );
      } else if (readFileSync(target, 'utf8') !== svg) {
        warn(
          file,
          `Ritningen ${h.fil} stämmer inte med parametrarna. Kör pnpm content:drawings.`,
          `${path}.fil`,
        );
      }
    });

    // Referenced files that do not exist yet are allowed while a case is being written.
    const missing = (relativePath: string, path: string) => {
      if (!fileExists(`${dir}/${relativePath}`)) {
        warn(file, `Filen ${relativePath} finns inte ännu.`, path);
        return;
      }
      if (relativePath.toLowerCase().endsWith('.md')) {
        const source = readFileSync(join(contentRoot, dir, relativePath), 'utf8');
        for (const problem of checkFrontMatter(source))
          error(file, `${relativePath}: ${problem}`, path);
      }
    };
    data.handlingar.forEach((h) => {
      if (!isGeneratedDrawing(h)) missing(h.fil, `handlingar[${h.id}].fil`);
    });
    allCaseSteps(data).forEach((step) => {
      if (step.typ === 'skrivelse' && step.modelltext)
        missing(step.modelltext, `steg[${step.id}].modelltext`);
      if (step.typ === 'beslut' && step.modellbeslut)
        missing(step.modellbeslut, `steg[${step.id}].modellbeslut`);
    });
    if (data.facit?.modellbeslut) missing(data.facit.modellbeslut, 'facit.modellbeslut');

    // A hidden document should be revealed by the event it waits for.
    data.handlingar.forEach((h) => {
      if (h.dold_tills === undefined) return;
      const event = data.handelser.find((e) => e.id === h.dold_tills);
      if (event && !event.effekt.visa_handlingar?.includes(h.id)) {
        warn(
          file,
          `Handlingen är dold till ${event.id}, men ${event.id} visar den inte (lägg till ${h.id} i effekt.visa_handlingar).`,
          `handlingar[${h.id}].dold_tills`,
        );
      }
    });

    cases.push({ dir, data, drawings });
  }

  return {
    root: contentRoot,
    modules,
    questionFiles,
    cases,
    errors,
    warnings,
    fileCount,
  };
}

/** Makes an absolute path readable relative to `base`. */
export function displayPath(base: string, path: string): string {
  return toPosix(relative(base, path)) || '.';
}
