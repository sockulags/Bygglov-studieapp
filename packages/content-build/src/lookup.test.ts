import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseGlossaryFile, parseLawChapterFile, parseProcessFile } from '@bygglov/content-schema';
import { buildContent, loadContentTree, main, parseLawChapterText, syncChapterYaml } from './index';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const lawSource = readFileSync(join(repoRoot, 'docs/rattslage/pbl-9-kap.txt'), 'utf8');

let root: string;
let content: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'content-lookup-'));
  content = join(root, 'content');
  cpSync(join(repoRoot, 'content'), content, { recursive: true });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

const edit = (file: string, from: string, to: string) => {
  const path = join(content, file);
  const text = readFileSync(path, 'utf8');
  if (!text.includes(from)) throw new Error(`"${from}" not found in ${file}`);
  writeFileSync(path, text.replace(from, to), 'utf8');
};

const messages = (findings: { file: string; path: string; message: string }[]) =>
  findings.map((f) => `${f.file} ${f.path}: ${f.message}`);

describe('law text parser', () => {
  it('splits PBL 9 kap. into sections with headings, versions and repeals', () => {
    const sections = parseLawChapterText(lawSource);
    expect(sections).toHaveLength(119);
    const by = (p: string) => sections.find((s) => s.paragraf === p);
    expect(by('1')?.rubrik).toBeUndefined();
    expect(by('4')?.rubrik).toBe('Bygglov för nybyggnad');
    expect(by('4')?.lagtext?.split('\n')).toHaveLength(7);
    expect(by('17 a')?.andrad_genom).toBe('Lag (2026:406)');
    expect(by('31')?.andrad_genom).toBeUndefined();
    expect(by('56')?.kommande).toMatchObject({
      fran: '2027-01-01',
      andrad_genom: 'Lag (2026:746)',
    });
    expect(by('56')?.lagtext).toContain('8 kap. 1 §, 2 § första stycket');
    expect(by('56')?.kommande?.lagtext).toContain('8 kap. 1-2 a, 2 c');
    expect(by('67')).toMatchObject({ upphavd: 'Har upphävts genom lag (2026:712)' });
    expect(by('67')?.lagtext).toBeUndefined();
    expect(by('71 a')).toMatchObject({ upphor: '2036-07-01', andrad_genom: 'Lag (2026:504)' });
    expect(by('71 a')?.lagtext).toMatch(/kriminalvårdsanstalt/);
    expect(by('86')?.lagtext).toMatch(/kontrollansvarig enligt 10 kap\. 9 och 10 §§/);
    expect(by('86')?.lagtext).toMatch(/vid lovprövningen om att/);
    expect(by('99')?.lagtext?.split('\n')[0]).toMatch(/inom tio veckor från$/);
  });
});

describe('check of uppslag', () => {
  it('accepts the repository files', () => {
    const tree = loadContentTree(content);
    expect(tree.errors).toEqual([]);
    expect(tree.lookup.glossary?.begrepp.length).toBeGreaterThanOrEqual(100);
    expect(tree.lookup.processes?.processer).toHaveLength(4);
    expect(tree.lookup.chapters.map((c) => c.file)).toEqual(['uppslag/pbl-9-kap.yaml']);
  });

  it('reports unknown modules, glossary references and invented sections', () => {
    edit('uppslag/begrepp.yaml', 'modul: 09-genomforande', 'modul: 99-saknas');
    edit(
      'uppslag/begrepp.yaml',
      'lagrum: [PBL 9 kap. 102 §, PBL 12 kap. 8 a §]',
      'lagrum: [PBL 9 kap. 200 §, XYZ 3 §]',
    );
    edit('uppslag/processer.yaml', 'begrepp: [fullstandighetsgranskning]', 'begrepp: [finns-inte]');
    edit('uppslag/processer.yaml', 'lagrum: [PBL 9 kap. 84 §]', 'lagrum: [PBL 9 kap. 67 §]');
    const errors = messages(loadContentTree(content).errors);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^uppslag\/begrepp\.yaml begrepp\[.*\]\.modul: Modulen "99-saknas" finns inte/,
        ),
        expect.stringMatching(
          /begrepp\[vilande-arende\]\.lagrum\[1\]: "PBL 9 kap\. 200 §": PBL 9 kap\. har ingen 200 §/,
        ),
        expect.stringMatching(/begrepp\[vilande-arende\]\.lagrum\[2\]: Lagkoden "XYZ"/),
        expect.stringMatching(
          /steg\[fullstandighet\]\.begrepp\[1\]: Begreppet "finns-inte" finns inte/,
        ),
        expect.stringMatching(/steg\[lov-i-efterhand\]\.lagrum\[1\]: .*67 § är upphävd/),
      ]),
    );
  });

  it('only warns about invented sections in questions, which belong to other files', () => {
    edit('fragor/06-handlaggning.yaml', 'PBL 9 kap. 99 §', 'PBL 9 kap. 199 §');
    const tree = loadContentTree(content);
    expect(tree.errors).toEqual([]);
    expect(messages(tree.warnings)).toEqual([
      expect.stringMatching(
        /^fragor\/06-handlaggning\.yaml fragor\[.*\]\.lagrum\[\d\]: "PBL 9 kap\. 199 §"/,
      ),
    ]);
  });

  it('warns when the chapter text has drifted from docs/rattslage and lagtext repairs it', () => {
    mkdirSync(join(root, 'docs/rattslage'), { recursive: true });
    writeFileSync(join(root, 'docs/rattslage/pbl-9-kap.txt'), lawSource, 'utf8');
    expect(loadContentTree(content).warnings).toEqual([]);

    edit('uppslag/pbl-9-kap.yaml', 'Det krävs bygglov för nybyggnad.', 'Det krävs inte bygglov.');
    expect(messages(loadContentTree(content).warnings)).toEqual([
      expect.stringMatching(
        /^uppslag\/pbl-9-kap\.yaml : Lagtexten i 3 § skiljer sig från källtexten/,
      ),
    ]);

    expect(main(['lagtext', '--root', root])).toBe(0);
    const tree = loadContentTree(content);
    expect(tree.warnings).toEqual([]);
    const section = tree.lookup.chapters[0]?.data.paragrafer.find((s) => s.paragraf === '3');
    expect(section).toMatchObject({
      lagtext: 'Det krävs bygglov för nybyggnad.',
      sammanfattning: 'Huvudregeln är att nybyggnad kräver bygglov.',
    });
  });

  it('adds new sections without a summary so the check stops until one is written', () => {
    const yaml = readFileSync(join(content, 'uppslag/pbl-9-kap.yaml'), 'utf8');
    const parsed = parseLawChapterText(lawSource);
    const extra = { paragraf: '115 a', lagtext: 'Ny text.', andrad_genom: 'Lag (2027:1)' };
    const { source, changed, added } = syncChapterYaml(yaml, [...parsed, extra]);
    expect(changed).toEqual([]);
    expect(added).toEqual(['115 a']);
    writeFileSync(join(content, 'uppslag/pbl-9-kap.yaml'), source, 'utf8');
    expect(messages(loadContentTree(content).errors)).toEqual([
      expect.stringMatching(/paragrafer\[120\]\.sammanfattning: Fältet saknas/),
    ]);
  });

  it('builds JSON for Uppslag that validates again', () => {
    const tree = loadContentTree(content);
    const distDir = join(root, 'dist');
    const result = buildContent(tree, { distDir, publicDir: join(root, 'public') });
    expect(result.jsonFiles).toEqual(
      expect.arrayContaining([
        'uppslag/lagar.json',
        'uppslag/begrepp.json',
        'uppslag/processer.json',
        'uppslag/pbl-9-kap.json',
      ]),
    );
    const read = (file: string) => JSON.parse(readFileSync(join(distDir, file), 'utf8')) as unknown;
    expect(parseGlossaryFile(read('uppslag/begrepp.json')).success).toBe(true);
    expect(parseProcessFile(read('uppslag/processer.json')).success).toBe(true);
    expect(parseLawChapterFile(read('uppslag/pbl-9-kap.json')).success).toBe(true);
  });
});
