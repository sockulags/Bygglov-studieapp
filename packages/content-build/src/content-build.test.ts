import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseCaseFile, parseContentIndex, parseQuestionFile } from '@bygglov/content-schema';
import { buildContent, checkFrontMatter, loadContentTree, main, writeDrawings } from './index';

const repoContent = fileURLToPath(new URL('../../../content/', import.meta.url));

let root: string;
let content: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'content-build-'));
  content = join(root, 'content');
  cpSync(repoContent, content, { recursive: true });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

const write = (relativePath: string, text: string) => {
  mkdirSync(join(content, relativePath, '..'), { recursive: true });
  writeFileSync(join(content, relativePath), text, 'utf8');
};

const question = (id: string) => `
  - id: ${id}
    typ: sant_falskt
    svarighet: 1
    fraga: Ett påstående.
    svar: true
    forklaring: Därför.
`;

describe('check', () => {
  it('accepts the repository content without errors', () => {
    const tree = loadContentTree(repoContent);
    expect(tree.errors).toEqual([]);
    expect(tree.warnings).toEqual([]);
    expect(tree.questionFiles.map((f) => f.file)).toEqual(
      expect.arrayContaining(['fragor/03-lovplikt.yaml', 'fragor/06-handlaggning.yaml']),
    );
    expect(tree.cases.map((c) => c.data.id)).toEqual(['A002']);
  });

  it('reports duplicate ids across files, unknown modules and wrong file names', () => {
    write('fragor/04-detaljplan.yaml', `modul: 04-detaljplan\nfragor:${question('lov-001')}`);
    write('fragor/99-saknas.yaml', `modul: 99-saknas\nfragor:${question('x-001')}`);
    write('fragor/fel-namn.yaml', `modul: 05-utanfor-plan\nfragor:${question('x-002')}`);
    const messages = loadContentTree(content).errors.map(
      (e) => `${e.file} ${e.path}: ${e.message}`,
    );
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^fragor\/04-detaljplan\.yaml fragor\[lov-001\]\.id: .*används redan i fragor\/03-lovplikt\.yaml/,
        ),
        expect.stringMatching(
          /^fragor\/99-saknas\.yaml modul: Modulen "99-saknas" finns inte i moduler\.yaml/,
        ),
        expect.stringMatching(
          /^fragor\/fel-namn\.yaml modul: .*ska därför heta fragor\/05-utanfor-plan\.yaml/,
        ),
      ]),
    );
  });

  it('reports YAML syntax errors with a line number', () => {
    write(
      'fragor/04-detaljplan.yaml',
      'modul: 04-detaljplan\nfragor:\n  - id: a\n   typ: flerval\n',
    );
    const [first] = loadContentTree(content).errors;
    expect(first?.file).toBe('fragor/04-detaljplan.yaml');
    expect(first?.message).toMatch(/^YAML-fel på rad \d+/);
  });

  it('reports a case folder that does not match the case id and broken references', () => {
    const source = join(content, 'arenden/A002-tillbyggnad-bjorken-7/arende.yaml');
    const text = readFileSync(source, 'utf8').replace('dold_tills: E2', 'dold_tills: E9');
    write('arenden/A003-kopia/arende.yaml', text);
    const errors = loadContentTree(content).errors;
    expect(errors.map((e) => `${e.file} ${e.path}`)).toEqual([
      'arenden/A003-kopia/arende.yaml handlingar[H7].dold_tills',
    ]);
    write('arenden/A003-kopia/arende.yaml', readFileSync(source, 'utf8'));
    const second = loadContentTree(content).errors.map((e) => e.message);
    expect(second).toEqual([
      'Mappnamnet ska börja med ärendets id, t.ex. A002-kort-beskrivning.',
      'Ärende-id "A002" används redan i arenden/A002-tillbyggnad-bjorken-7/arende.yaml.',
    ]);
  });

  it('exits with code 1 on errors and 0 otherwise', () => {
    expect(main(['check', '--root', root])).toBe(0);
    write('moduler.yaml', 'moduler: []\n');
    expect(main(['check', '--root', root])).toBe(1);
    expect(main(['okant'])).toBe(2);
  });
});

describe('drawings', () => {
  const caseFile = 'arenden/A002-tillbyggnad-bjorken-7/arende.yaml';
  const edit = (from: string, to: string) => {
    const path = join(content, caseFile);
    const source = readFileSync(path, 'utf8');
    expect(source).toContain(from);
    writeFileSync(path, source.replace(from, to), 'utf8');
  };

  it('renders the generated drawings of A002 when loading', () => {
    const [a002] = loadContentTree(content).cases;
    expect(a002?.drawings.map((d) => `${d.handling} ${d.kind} ${d.fil}`)).toEqual([
      'H2 situationsplan handlingar/situationsplan.svg',
      'H3 fasadritning handlingar/fasader.svg',
      'H5 planritning handlingar/planritning.svg',
      'H9 plankarta handlingar/plankarta.svg',
    ]);
  });

  it('reports invalid parameters with a readable path', () => {
    edit('tomt_djup: 32', 'tomt_djup: -1');
    const errors = loadContentTree(content).errors.map((e) => `${e.path}: ${e.message}`);
    expect(errors).toEqual(
      expect.arrayContaining(['handlingar[H2].parametrar.tomt_djup: Ska vara större än 0.']),
    );
  });

  it('reports a generated handling without a generator for its typ', () => {
    edit('typ: plankarta', 'typ: karta');
    const errors = loadContentTree(content).errors;
    expect(errors.map((e) => e.path)).toEqual(['handlingar[H9].typ']);
    expect(errors[0]?.message).toMatch(/ingen ritningsgenerator för typ karta/);
  });

  it('warns about stale or missing drawings and the drawings command fixes them', () => {
    const dir = join(content, 'arenden/A002-tillbyggnad-bjorken-7/handlingar');
    writeFileSync(join(dir, 'situationsplan.svg'), '<svg/>', 'utf8');
    rmSync(join(dir, 'fasader.svg'));
    const warnings = loadContentTree(content).warnings.map((w) => `${w.path}: ${w.message}`);
    expect(warnings).toEqual([
      'handlingar[H2].fil: Ritningen handlingar/situationsplan.svg stämmer inte med parametrarna. Kör pnpm content:drawings.',
      'handlingar[H3].fil: Ritningen handlingar/fasader.svg är inte genererad ännu. Kör pnpm content:drawings.',
    ]);

    expect(main(['drawings', '--root', root])).toBe(0);
    const tree = loadContentTree(content);
    expect(tree.warnings).toEqual([]);
    expect(readFileSync(join(dir, 'situationsplan.svg'), 'utf8')).toBe(
      tree.cases[0]?.drawings[0]?.svg,
    );
    expect(writeDrawings(tree)).toEqual({
      written: [],
      unchanged: expect.arrayContaining([
        'arenden/A002-tillbyggnad-bjorken-7/handlingar/situationsplan.svg',
      ]) as unknown,
    });
  });

  it('refuses to write drawings for content with errors', () => {
    edit('tomt_djup: 32', 'tomt_djup: nej');
    expect(main(['drawings', '--root', root])).toBe(1);
  });

  it('checks the front matter of Markdown handlingar', () => {
    expect(checkFrontMatter('# Utan front matter')).toEqual([]);
    expect(checkFrontMatter('---\nrubrik: Ansökan\ndatum: 2026-03-02\n---\n# Text')).toEqual([]);
    expect(checkFrontMatter('---\nrubrik: Ansökan\nfran: Någon\ndatum: 2 mars\n---\n')).toEqual([
      'Okänd nyckel i front matter: fran. Tillåtna nycklar: rubrik, avsandare, datum, diarienummer.',
      'datum i front matter ska skrivas som ÅÅÅÅ-MM-DD.',
    ]);
    write(
      'arenden/A002-tillbyggnad-bjorken-7/handlingar/ka.md',
      '---\nrubrik: [inte, text]\n---\n# KA',
    );
    expect(loadContentTree(content).errors.map((e) => `${e.path}: ${e.message}`)).toEqual([
      'handlingar[H6].fil: handlingar/ka.md: rubrik i front matter ska vara en text.',
    ]);
  });
});

describe('build', () => {
  it('writes JSON that validates again and copies case documents', () => {
    write('arenden/A002-tillbyggnad-bjorken-7/handlingar/ansokan.pdf', '%PDF-1.4');
    const tree = loadContentTree(content);
    const distDir = join(root, 'dist');
    const publicDir = join(root, 'public');
    const result = buildContent(tree, { distDir, publicDir });

    // The repository content grows; check the fixed points rather than the exact list.
    expect(result.jsonFiles[0]).toBe('moduler.json');
    expect(result.jsonFiles.at(-1)).toBe('index.json');
    expect(result.jsonFiles).toEqual(
      expect.arrayContaining([
        'fragor/03-lovplikt.json',
        'fragor/06-handlaggning.json',
        'arenden/A002.json',
      ]),
    );
    const readJson = (file: string): unknown =>
      JSON.parse(readFileSync(join(distDir, file), 'utf8'));
    expect(parseQuestionFile(readJson('fragor/03-lovplikt.json')).success).toBe(true);
    expect(parseCaseFile(readJson('arenden/A002.json')).success).toBe(true);
    const index = parseContentIndex(readJson('index.json'));
    if (!index.success) throw new Error('index.json is invalid');
    const total = tree.questionFiles.reduce((sum, file) => sum + file.data.fragor.length, 0);
    expect(total).toBeGreaterThan(4);
    expect(index.data.fragor.totalt).toBe(total);
    expect(index.data.fragor.status.utkast + index.data.fragor.status.granskad).toBe(total);
    expect(index.data.arenden[0]).toMatchObject({ id: 'A002', niva: 2, antal_steg: 6 });

    const copied = join(publicDir, 'arenden/A002/handlingar');
    expect(existsSync(join(copied, 'ansokan.pdf'))).toBe(true);
    expect(existsSync(join(copied, 'ansokan.md'))).toBe(true);
    expect(existsSync(join(copied, '.gitkeep'))).toBe(false);

    // Generated drawings are written from the parameters, not copied.
    expect(result.drawings).toContain('arenden/A002/handlingar/situationsplan.svg');
    expect(readFileSync(join(copied, 'situationsplan.svg'), 'utf8')).toBe(
      tree.cases[0]?.drawings[0]?.svg,
    );
  });

  it('refuses to build content with errors', () => {
    write('moduler.yaml', 'moduler: []\n');
    expect(main(['build', '--root', root])).toBe(1);
    expect(existsSync(join(root, 'apps/desktop/src/content-dist'))).toBe(false);
  });
});
