import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ContentIndex } from '@bygglov/content-schema';
import type { ContentTree } from './load';

export interface BuildTargets {
  /** JSON output, e.g. `apps/desktop/src/content-dist`. */
  distDir: string;
  /** Static files, e.g. `apps/desktop/public/content`. */
  publicDir: string;
}

export interface BuildResult {
  jsonFiles: string[];
  copiedDirs: string[];
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** Builds the summary written to `index.json`. */
export function buildIndex(tree: ContentTree): ContentIndex {
  const questions = tree.questionFiles.flatMap((f) => f.data.fragor);
  const countByModule = new Map(tree.questionFiles.map((f) => [f.data.modul, f.data.fragor.length]));
  return {
    format: 1,
    moduler: [...(tree.modules?.moduler ?? [])]
      .sort((a, b) => a.ordning - b.ordning)
      .map((m) => ({ id: m.id, titel: m.titel, ordning: m.ordning, antal_fragor: countByModule.get(m.id) ?? 0 })),
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
  for (const { data } of tree.questionFiles) {
    for (const q of data.fragor) {
      if (q.typ !== 'ritning') continue;
      const source = join(tree.root, q.fil);
      if (!existsSync(source)) continue;
      const target = join(targets.publicDir, q.fil);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(source, target);
    }
  }
  return { jsonFiles, copiedDirs };
}
