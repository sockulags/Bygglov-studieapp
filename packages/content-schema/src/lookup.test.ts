import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  formatIssues,
  layoutProcessGraph,
  parseGlossaryFile,
  parseLawCatalog,
  parseLawChapterFile,
  parseLawRef,
  parseProcessFile,
  processEdges,
  sectionSortKey,
  type ContentIssue,
} from './index';

const contentRoot = fileURLToPath(new URL('../../../content/', import.meta.url));
const load = (file: string) => parse(readFileSync(`${contentRoot}${file}`, 'utf8')) as unknown;

function issuesOf(result: { success: true } | { success: false; issues: ContentIssue[] }) {
  if (result.success) throw new Error('Expected validation to fail');
  return result.issues.map((i) => `${i.path}: ${i.message}`);
}

const term = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  term: id,
  definition: 'En definition.',
  modul: '03-lovplikt',
  ...extra,
});

const step = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  titel: `Steg ${id}`,
  beskrivning: 'Något händer.',
  ...extra,
});

const processFile = (steg: unknown[], extra: Record<string, unknown> = {}) => ({
  processer: [
    { id: 'p', titel: 'P', beskrivning: 'En process.', modul: '06-handlaggning', steg, ...extra },
  ],
});

describe('uppslag files in the repository', () => {
  it('validates the glossary with 100–140 draft terms', () => {
    const result = parseGlossaryFile(load('uppslag/begrepp.yaml'));
    if (!result.success) throw new Error(formatIssues(result.issues));
    const { begrepp } = result.data;
    expect(begrepp.length).toBeGreaterThanOrEqual(100);
    expect(begrepp.length).toBeLessThanOrEqual(140);
    for (const t of begrepp) {
      expect(t.status).toBe('utkast');
      expect(t.rattslage).toBe('2025-12-01');
    }
    expect(begrepp.map((t) => t.id)).toEqual(
      expect.arrayContaining(['byggnadsarea', 'liten-avvikelse', 'startbesked', 'strandskydd']),
    );
  });

  it('validates the four process maps without layout collisions', () => {
    const result = parseProcessFile(load('uppslag/processer.yaml'));
    if (!result.success) throw new Error(formatIssues(result.issues));
    expect(result.data.processer.map((p) => p.id)).toEqual([
      'bygglov-inom-plan',
      'startbesked-slutbesked',
      'tillsyn',
      'overklagande',
    ]);
    for (const process of result.data.processer) {
      const graph = layoutProcessGraph(process);
      expect(graph.unreachable).toEqual([]);
      expect(graph.collisions).toEqual([]);
    }
  });

  it('validates the law catalogue and the PBL 9 kap. summaries', () => {
    const catalog = parseLawCatalog(load('uppslag/lagar.yaml'));
    if (!catalog.success) throw new Error(formatIssues(catalog.issues));
    expect(catalog.data.lagar.find((l) => l.kod === 'PBL')?.kapitel).toHaveLength(16);

    const chapter = parseLawChapterFile(load('uppslag/pbl-9-kap.yaml'));
    if (!chapter.success) throw new Error(formatIssues(chapter.issues));
    const sections = chapter.data.paragrafer;
    expect(sections).toHaveLength(119);
    expect(sections[0]?.paragraf).toBe('1');
    expect(sections.at(-1)?.paragraf).toBe('115');
    const s60 = sections.find((s) => s.paragraf === '60');
    expect(s60?.rubrik).toMatch(/avvikelse/);
    expect(s60?.lagtext).toMatch(/^Trots 56 § första stycket 2/);
    expect(sections.find((s) => s.paragraf === '56')?.kommande?.fran).toBe('2027-01-01');
    expect(sections.find((s) => s.paragraf === '67')?.upphavd).toMatch(/upphävts/);
  });
});

describe('glossary schema', () => {
  it('reports duplicate ids, duplicate terms and broken related terms', () => {
    const issues = issuesOf(
      parseGlossaryFile({
        begrepp: [
          term('a', { relaterade: ['b', 'saknas', 'a', 'b'] }),
          term('b'),
          term('a'),
          { ...term('c'), term: 'B' },
        ],
      }),
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^begrepp\[a\]\.id: .*finns redan/),
        expect.stringMatching(/^begrepp\[c\]\.term: Begreppet "B" finns redan/),
        expect.stringMatching(/relaterade\[2\]: Begreppet "saknas" finns inte/),
        expect.stringMatching(/relaterade\[3\]: .*sig självt/),
        expect.stringMatching(/relaterade\[4\]: "b" står två gånger/),
      ]),
    );
  });

  it('needs a module id and a definition', () => {
    const issues = issuesOf(
      parseGlossaryFile({ begrepp: [{ id: 'x', term: 'X', modul: 'lovplikt' }] }),
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^begrepp\[x\]\.definition: Fältet saknas/),
        expect.stringMatching(/^begrepp\[x\]\.modul: Modul-id ska ha formatet/),
      ]),
    );
  });
});

describe('process schema', () => {
  it('lays out rows from forward arrows and keeps loops out of the ranking', () => {
    const steg = [
      step('A', {
        fraga: 'Komplett?',
        nasta: [
          { till: 'C', etikett: 'Ja' },
          { till: 'B', etikett: 'Nej' },
        ],
      }),
      step('B', { spar: 1 }),
      step('C', { nasta: [{ till: 'D' }] }),
      step('D', { spar: 1, nasta: [{ till: 'C', etikett: 'Igen' }] }),
    ];
    const result = parseProcessFile(processFile(steg));
    if (!result.success) throw new Error(formatIssues(result.issues));
    const process = result.data.processer[0];
    if (!process) throw new Error('missing process');
    const graph = layoutProcessGraph(process);
    expect(graph.nodes).toEqual([
      { id: 'A', rank: 0, lane: 0 },
      { id: 'B', rank: 1, lane: 1 },
      { id: 'C', rank: 2, lane: 0 },
      { id: 'D', rank: 3, lane: 1 },
    ]);
    expect(graph.rows).toBe(4);
    expect(processEdges(process)).toEqual([
      { from: 'A', to: 'C', label: 'Ja', back: false },
      { from: 'A', to: 'B', label: 'Nej', back: false },
      { from: 'B', to: 'C', back: false },
      { from: 'C', to: 'D', back: false },
      { from: 'D', to: 'C', label: 'Igen', back: true },
    ]);
  });

  it('reports unknown targets, missing labels, lone questions and slut with nasta', () => {
    const issues = issuesOf(
      parseProcessFile(
        processFile([
          step('A', { fraga: 'Ja eller nej?', nasta: [{ till: 'B' }] }),
          step('B', { nasta: [{ till: 'X', etikett: 'Ja' }, { till: 'C' }] }),
          step('C', { slut: true, nasta: [{ till: 'A' }] }),
        ]),
      ),
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/steg\[A\]\.fraga: .*minst två vägar/),
        expect.stringMatching(/steg\[B\]\.nasta\[1\]\.till: Steget "X" finns inte/),
        expect.stringMatching(/steg\[B\]\.nasta\[2\]: .*etikett/),
        expect.stringMatching(/steg\[C\]\.slut: .*inte också ha nasta/),
      ]),
    );
  });

  it('reports unreachable steps, layout collisions and unknown processes', () => {
    const issues = issuesOf(
      parseProcessFile(
        processFile([
          step('A', {
            fraga: 'Vilken väg?',
            nasta: [
              { till: 'B', etikett: 'Ett' },
              { till: 'C', etikett: 'Två' },
            ],
          }),
          step('B', { slut: true }),
          step('C', { slut: true, se_process: 'saknas' }),
          step('D'),
        ]),
      ),
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/steg\[D\]: Steget "D" går inte att nå/),
        expect.stringMatching(/steg\[C\]\.spar: .*samma rad och i samma spår som "B"/),
        expect.stringMatching(/se_process: Processen "saknas" finns inte/),
      ]),
    );
  });

  it('limits step titles so they fit the map', () => {
    const issues = issuesOf(
      parseProcessFile(processFile([step('A', { titel: 'x'.repeat(57) }), step('B')])),
    );
    expect(issues).toEqual([
      expect.stringMatching(/steg\[A\]\.titel: titel får vara högst 56 tecken/),
    ]);
  });
});

describe('law references and chapters', () => {
  it('splits a lagrum into statute, chapter and section', () => {
    expect(parseLawRef('PBL 9 kap. 60 §')).toEqual({ code: 'PBL', chapter: 9, section: '60' });
    expect(parseLawRef('PBL 9 kap. 17 a §')).toEqual({ code: 'PBL', chapter: 9, section: '17 a' });
    expect(parseLawRef('PBL 9 kap. 85–115 §§')).toEqual({ code: 'PBL', chapter: 9, section: '85' });
    expect(parseLawRef('PBL 9 kap.')).toEqual({ code: 'PBL', chapter: 9 });
    expect(parseLawRef('FL 25 §')).toEqual({ code: 'FL', section: '25' });
    expect(parseLawRef('FL 40–47 §§')).toEqual({ code: 'FL', section: '40' });
    expect(parseLawRef('SS 21054:2020')).toEqual({ code: 'SS' });
    expect(parseLawRef('MB 7 kap. 18 c §')).toEqual({ code: 'MB', chapter: 7, section: '18 c' });
  });

  it('sorts sections with letters after the plain number', () => {
    expect(sectionSortKey('17')).toEqual([17, 0]);
    expect(sectionSortKey('17 a')).toEqual([17, 1]);
  });

  it('requires sections in the order of the law and text unless repealed', () => {
    const issues = issuesOf(
      parseLawChapterFile({
        lag: 'PBL',
        kapitel: 9,
        rubrik: 'Lov',
        kalla: 'riksdagen.se',
        andrad_tom: 'SFS 2026:1583',
        hamtad: '2026-11-04',
        paragrafer: [
          { paragraf: '2', sammanfattning: 'Två.', lagtext: 'Text.' },
          { paragraf: '1', sammanfattning: 'Ett.', lagtext: 'Text.' },
          { paragraf: '2', sammanfattning: 'Igen.' },
          { paragraf: '3 §', sammanfattning: 'Fel.', lagtext: 'Text.' },
        ],
      }),
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/paragrafer\[2\]\.paragraf: 1 § står i fel ordning/),
        expect.stringMatching(/paragrafer\[3\]\.paragraf: 2 § finns redan/),
        expect.stringMatching(/paragrafer\[3\]\.lagtext: Paragrafen behöver lagtext/),
        expect.stringMatching(/paragrafer\[4\]\.paragraf: paragraf ska skrivas som/),
      ]),
    );
  });
});
