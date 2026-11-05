import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { questionDrawingPath, type ContentIndex } from '@bygglov/content-schema';
import type { ContentTree } from './load';
import { lookupOutputs } from './lookup';

export interface BuildTargets {
  /** JSON output, e.g. `apps/desktop/src/content-dist`. */
  distDir: string;
  /** Static files, e.g. `apps/desktop/public/content`. */
  publicDir: string;
}

export interface BuildResult {
  jsonFiles: string[];
  copiedDirs: string[];
  /** Generated drawings, relative to the public folder. */
  drawings: string[];
  /** Drawings of `ritning` questions, relative to the public folder. */
  questionDrawings: string[];
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** Builds the summary written to `index.json`. */
export function buildIndex(tree: ContentTree): ContentIndex {
  const questions = tree.questionFiles.flatMap((f) => f.data.fragor);
  const countByModule = new Map(
    tree.questionFiles.map((f) => [f.data.modul, f.data.fragor.length]),
  );
  return {
    format: 1,
    moduler: [...(tree.modules?.moduler ?? [])]
      .sort((a, b) => a.ordning - b.ordning)
      .map((m) => ({
        id: m.id,
        titel: m.titel,
        ordning: m.ordning,
        antal_fragor: countByModule.get(m.id) ?? 0,
      })),
    fragor: {
      totalt: questions.length,
      status: {
        utkast: questions.filter((q) => q.status === 'utkast').length,
        granskad: questions.filter((q) => q.status === 'granskad').length,
      },
    },
    arenden: [...tree.cases]
      .sort((a, b) => a.data.id.localeCompare(b.data.id))
      .map(({ data }) => ({
        id: data.id,
        titel: data.titel,
        niva: data.niva,
        status: data.status,
        rattslage: data.rattslage,
        antal_steg: data.steg.length,
        antal_handlingar: data.handlingar.length,
      })),
  };
}

/**
 * Writes validated content as JSON and copies case documents. Both target folders are
 * generated and are emptied first. Call only for a tree without errors.
 */
export function buildContent(tree: ContentTree, targets: BuildTargets): BuildResult {
  if (tree.errors.length > 0 || !tree.modules) {
    throw new Error('Innehållet har fel och kan inte byggas. Kör content:check.');
  }
  rmSync(targets.distDir, { recursive: true, force: true });
  rmSync(targets.publicDir, { recursive: true, force: true });

  const jsonFiles: string[] = [];
  const emit = (relativePath: string, value: unknown) => {
    writeJson(join(targets.distDir, relativePath), value);
    jsonFiles.push(relativePath);
  };

  emit('moduler.json', {
    moduler: [...tree.modules.moduler].sort((a, b) => a.ordning - b.ordning),
  });
  for (const { data } of tree.questionFiles) emit(`fragor/${data.modul}.json`, data);
  for (const { data } of tree.cases) emit(`arenden/${data.id}.json`, data);
  for (const [relativePath, value] of lookupOutputs(tree)) emit(relativePath, value);
  emit('index.json', buildIndex(tree));

  const copiedDirs: string[] = [];
  const skipHidden = (source: string) => !/(^|[\\/])\.[^\\/]+$/.test(source);
  for (const { dir, data } of tree.cases) {
    const target = join(targets.publicDir, 'arenden', data.id, 'handlingar');
    mkdirSync(target, { recursive: true });
    const source = join(tree.root, dir, 'handlingar');
    if (existsSync(source)) cpSync(source, target, { recursive: true, filter: skipHidden });
    copiedDirs.push(`arenden/${data.id}/handlingar`);
  }
  // Generated drawings are always written fresh from their parameters.
  const drawings: string[] = [];
  for (const { data, drawings: planned } of tree.cases) {
    for (const drawing of planned) {
      const relativePath = `arenden/${data.id}/${drawing.fil}`;
      const target = join(targets.publicDir, relativePath);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, drawing.svg, 'utf8');
      drawings.push(relativePath);
    }
  }
  // Drawings shown by `ritning` questions get a stable path per question, independent of
  // which case folder they come from. A generated drawing is taken from its parameters, like
  // above; other files are copied. Missing files are reported as warnings by content:check.
  const generated = new Map<string, string>(
    tree.cases.flatMap(({ dir, drawings: planned }) =>
      planned.map((d) => [`${dir}/${d.fil}`, d.svg] as const),
    ),
  );
  const questionDrawings: string[] = [];
  for (const { data } of tree.questionFiles) {
    for (const q of data.fragor) {
      if (q.typ !== 'ritning') continue;
      const relativePath = questionDrawingPath(data.modul, q);
      const target = join(targets.publicDir, relativePath);
      const svg = generated.get(q.fil);
      const source = join(tree.root, q.fil);
      if (svg === undefined && !existsSync(source)) continue;
      mkdirSync(dirname(target), { recursive: true });
      if (svg !== undefined) writeFileSync(target, svg, 'utf8');
      else cpSync(source, target);
      questionDrawings.push(relativePath);
    }
  }
  return { jsonFiles, copiedDirs, drawings, questionDrawings };
}

/**
 * Writes generated drawings into the case folders in `content/`, so they can be reviewed and
 * committed. Returns the written paths relative to the content root. Files that already match
 * are left untouched.
 */
export function writeDrawings(tree: ContentTree): { written: string[]; unchanged: string[] } {
  if (tree.errors.length > 0) {
    throw new Error('Innehållet har fel och ritningarna kan inte genereras. Kör content:check.');
  }
  const written: string[] = [];
  const unchanged: string[] = [];
  for (const { dir, drawings } of tree.cases) {
    for (const drawing of drawings) {
      const relativePath = `${dir}/${drawing.fil}`;
      const target = join(tree.root, relativePath);
      if (existsSync(target) && readFileSync(target, 'utf8') === drawing.svg) {
        unchanged.push(relativePath);
        continue;
      }
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, drawing.svg, 'utf8');
      written.push(relativePath);
    }
  }
  return { written, unchanged };
}
