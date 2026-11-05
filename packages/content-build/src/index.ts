// @bygglov/content-build
// CLI entry: `tsx src/index.ts check` validates content/, `tsx src/index.ts build` emits JSON,
// `tsx src/index.ts drawings` writes generated SVG drawings into content/.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { buildContent, writeDrawings } from './build';
import { parseLawChapterText } from './law-text';
import { displayPath, loadContentTree } from './load';
import { chapterSourcePath, syncChapterYaml } from './lookup';
import { formatReport } from './report';

export {
  buildContent,
  buildIndex,
  writeDrawings,
  type BuildResult,
  type BuildTargets,
} from './build';
export {
  checkFrontMatter,
  FRONT_MATTER_KEYS,
  loadContentTree,
  splitFrontMatter,
  type ContentTree,
  type Finding,
  type LoadedCase,
  type PlannedDrawing,
} from './load';
export * as drawings from './drawings';
export { normalizeLawText, parseLawChapterText, type ParsedLawSection } from './law-text';
export {
  chapterSourcePath,
  compareWithSource,
  lookupOutputs,
  syncChapterYaml,
  type LoadedLawChapter,
  type LoadedLookup,
} from './lookup';
export { formatReport } from './report';

const USAGE = `Användning: content-build <check|build|drawings|lagtext> [--root <repo-rot>]

  check     Validerar content/ och skriver en rapport. Avslutar med kod 1 vid fel.
  build     Validerar och skriver JSON till apps/desktop/src/content-dist/ samt kopierar
            handlingar, genererade ritningar och ritningsfrågornas ritningar till
            apps/desktop/public/content/. Båda utdatamapparna töms först.
  drawings  Genererar ritningarna (handlingar med parametrar och .svg-fil) in i content/,
            så att de kan granskas och committas.
  lagtext   Uppdaterar lagtexten i content/uppslag/<lag>-<nr>-kap.yaml från
            docs/rattslage/<lag>-<nr>-kap.txt. Sammanfattningarna behålls; nya
            paragrafer får ingen sammanfattning och måste skrivas innan check går igenom.`;

function parseArgs(argv: string[]): { command: string | undefined; root: string } {
  let root = fileURLToPath(new URL('../../../', import.meta.url));
  let command: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--root') {
      const value = argv[i + 1];
      if (!value) throw new Error('--root kräver en sökväg.');
      root = resolve(value);
      i += 1;
    } else if (command === undefined) {
      command = arg;
    }
  }
  return { command, root };
}

export function main(argv: string[]): number {
  const { command, root } = parseArgs(argv);
  if (
    command !== 'check' &&
    command !== 'build' &&
    command !== 'drawings' &&
    command !== 'lagtext'
  ) {
    console.error(USAGE);
    return 2;
  }

  const contentRoot = join(root, 'content');
  if (command === 'lagtext') return syncLawText(contentRoot);
  let tree = loadContentTree(contentRoot);
  if (command === 'drawings') {
    if (tree.errors.length > 0) {
      console.log(formatReport(tree));
      return 1;
    }
    const { written, unchanged } = writeDrawings(tree);
    tree = loadContentTree(contentRoot);
    console.log(formatReport(tree));
    console.log('');
    console.log(
      `Ritningar: ${written.length} skrivna, ${unchanged.length} oförändrade (i ${displayPath(root, contentRoot)}/).`,
    );
    for (const file of written) console.log(`  ${file}`);
    return tree.errors.length > 0 ? 1 : 0;
  }
  console.log(formatReport(tree));
  if (tree.errors.length > 0) return 1;

  if (command === 'build') {
    const targets = {
      distDir: join(root, 'apps/desktop/src/content-dist'),
      publicDir: join(root, 'apps/desktop/public/content'),
    };
    const result = buildContent(tree, targets);
    console.log('');
    console.log(
      `Byggt: ${result.jsonFiles.length} JSON-filer i ${displayPath(root, targets.distDir)}/`,
    );
    for (const file of result.jsonFiles) console.log(`  ${file}`);
    console.log(`Handlingar kopierade till ${displayPath(root, targets.publicDir)}/`);
    for (const dir of result.copiedDirs) console.log(`  ${dir}`);
    if (result.drawings.length > 0) {
      console.log(`Ritningar genererade:`);
      for (const file of result.drawings) console.log(`  ${file}`);
    }
    if (result.questionDrawings.length > 0) {
      console.log(`Ritningar till ritningsfrågor:`);
      for (const file of result.questionDrawings) console.log(`  ${file}`);
    }
  }
  return 0;
}

/** `lagtext`: refreshes the law text of every chapter file from docs/rattslage/. */
function syncLawText(contentRoot: string): number {
  const tree = loadContentTree(contentRoot);
  if (tree.lookup.chapters.length === 0) {
    console.log('Inga kapitelfiler i content/uppslag/ att uppdatera.');
    return 0;
  }
  for (const { file } of tree.lookup.chapters) {
    const target = join(contentRoot, file);
    const source = chapterSourcePath(contentRoot, file);
    const {
      source: yaml,
      changed,
      added,
    } = syncChapterYaml(
      readFileSync(target, 'utf8'),
      parseLawChapterText(readFileSync(source, 'utf8')),
    );
    writeFileSync(target, yaml, 'utf8');
    console.log(
      `${file}: ${changed.length} ändrade och ${added.length} nya paragrafer.${added.length > 0 ? ` Skriv sammanfattning för ${added.map((p) => `${p} §`).join(', ')}.` : ''}`,
    );
  }
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
  }
}
