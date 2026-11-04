/**
 * Test helper: loads content/arenden/A002 from YAML through the real content schema.
 * Only imported by tests (it uses node:fs).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseCaseFile, type CaseFile } from '@bygglov/content-schema';

const repoRoot = new URL('../../../../../', import.meta.url);

/**
 * The desktop app has no YAML parser of its own; borrow the one the content schema package
 * uses for its tests, resolved from that package so it works with pnpm's strict layout.
 */
const requireFromSchema = createRequire(
  fileURLToPath(new URL('packages/content-schema/package.json', repoRoot)),
);
const { parse } = requireFromSchema('yaml') as { parse: (source: string) => unknown };

export function loadCaseYaml(folder: string): CaseFile {
  const source = readFileSync(
    fileURLToPath(new URL(`content/arenden/${folder}/arende.yaml`, repoRoot)),
    'utf8',
  );
  const result = parseCaseFile(parse(source));
  if (!result.success) {
    throw new Error(`${folder}: ${result.issues.map((i) => `${i.path} ${i.message}`).join('; ')}`);
  }
  return result.data;
}

export const loadA002 = (): CaseFile => loadCaseYaml('A002-tillbyggnad-bjorken-7');
