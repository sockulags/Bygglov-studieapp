import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  formatIssues,
  parseCaseFile,
  parseModules,
  parseQuestionFile,
  type ContentIssue,
} from './index';

const contentRoot = fileURLToPath(new URL('../../../content/', import.meta.url));

function loadYaml(relativePath: string): Record<string, unknown> {
  return parse(readFileSync(`${contentRoot}${relativePath}`, 'utf8')) as Record<string, unknown>;
}

const QUESTIONS = 'fragor/03-lovplikt.yaml';
const CASE = 'arenden/A002-tillbyggnad-bjorken-7/arende.yaml';

/** Deep copy so each test can break its own fixture. */
function fixture(relativePath: string): Record<string, unknown> {
  return structuredClone(loadYaml(relativePath));
}

function issuesOf(result: { success: true } | { success: false; issues: ContentIssue[] }) {
  if (result.success) throw new Error('Expected validation to fail');
  return result.issues;
}

function asList(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('Expected a list');
  return value as Record<string, unknown>[];
}

describe('content files in the repository', () => {
  it('validates moduler.yaml', () => {
    const result = parseModules(loadYaml('moduler.yaml'));
    if (!result.success) throw new Error(formatIssues(result.issues));
    expect(result.data.moduler).toHaveLength(13);
    expect(result.data.moduler[2]?.id).toBe('03-lovplikt');
  });

  it('validates the module 3 question file with defaults applied', () => {
    const result = parseQuestionFile(loadYaml(QUESTIONS));
    if (!result.success) throw new Error(formatIssues(result.issues));
    const { fragor } = result.data;
    // The file grows with new content; only the first four (the original examples) are fixed.
    expect(fragor.slice(0, 4).map((q) => q.typ)).toEqual([
      'flerval',
      'flersvar',
      'lucktext',
      'oppen',
    ]);
    for (const q of fragor) {
      expect(q.status).toBe('utkast');
      expect(q.rattslage).toBe('2025-12-01');
      expect(q.lagrum_osaker).toBeUndefined();
    }
    const first = fragor[0];
    if (first?.typ !== 'flerval') throw new Error('Expected flerval');
    expect(first.alternativ.filter((a) => a.ratt)).toHaveLength(1);
    expect(first.alternativ[0]?.ratt).toBe(false);
  });

  it('validates the A002 case file', () => {
    const result = parseCaseFile(loadYaml(CASE));
    if (!result.success) throw new Error(formatIssues(result.issues));
    const c = result.data;
    expect(c.id).toBe('A002');
    expect(c.startdatum).toBe('2026-03-02');
    expect(c.steg.map((s) => s.typ)).toEqual([
      'checklista',
      'skrivelse',
      'berakning',
      'fraga',
      'urval',
      'beslut',
    ]);
    expect(c.handelser.map((e) => e.id)).toEqual(['E1', 'E2', 'E3', 'E4']);
    expect(c.handelser[2]?.utlosare).toEqual({ vid_beslut: 'bevilja', om_missat: 'S5' });
    expect(c.handelser[3]?.effekt.nytt_steg?.typ).toBe('fraga');
  });

  it('accepts minimal questions of every type', () => {
    const base = { svarighet: 1, fraga: 'Fråga ___?', forklaring: 'För att.' };
    const result = parseQuestionFile({
      modul: '03-lovplikt',
      fragor: [
        {
          ...base,
          id: 'a',
          typ: 'flerval',
          alternativ: [{ text: 'Ja', ratt: true }, { text: 'Nej' }],
        },
        {
          ...base,
          id: 'b',
          typ: 'flersvar',
          alternativ: [{ text: 'Ja', ratt: true }, { text: 'Nej' }],
        },
        { ...base, id: 'c', typ: 'sant_falskt', svar: false },
        { ...base, id: 'd', typ: 'lucktext', svar: [10] },
        {
          ...base,
          id: 'e',
          typ: 'para_ihop',
          par: [
            { vanster: 'A', hoger: '1' },
            { vanster: 'B', hoger: '2' },
          ],
        },
        { ...base, id: 'f', typ: 'ordning', poster: ['Först', 'Sedan'] },
        { ...base, id: 'g', typ: 'berakning', svar: 4.9, tolerans: 0.1, enhet: 'm' },
        { ...base, id: 'h', typ: 'oppen', bedomningspunkter: ['Punkt'] },
        { ...base, id: 'i', typ: 'ritning', fil: 'ritningar/fasad.svg', svar: 4.5 },
      ],
    });
    if (!result.success) throw new Error(formatIssues(result.issues));
    const cloze = result.data.fragor[3];
    expect(cloze?.typ === 'lucktext' && cloze.svar).toEqual(['10']);
  });
});

describe('broken question files', () => {
  it('reports a missing field with the question id in the path', () => {
    const data = fixture(QUESTIONS);
    delete asList(data.fragor)[2]?.forklaring;
    const issues = issuesOf(parseQuestionFile(data));
    expect(issues).toContainEqual({
      path: 'fragor[lov-003].forklaring',
      message: 'Fältet saknas men är obligatoriskt.',
    });
  });

  it('reports an unknown question type', () => {
    const data = fixture(QUESTIONS);
    asList(data.fragor)[0]!.typ = 'flervall';
    const issues = issuesOf(parseQuestionFile(data));
    expect(issues[0]?.path).toBe('fragor[lov-001].typ');
    expect(issues[0]?.message).toMatch(/Tillåtna frågetyper: flerval, flersvar/);
  });

  it('reports a misspelled field', () => {
    const data = fixture(QUESTIONS);
    const q = asList(data.fragor)[0]!;
    q.forklarnig = q.forklaring;
    const issues = issuesOf(parseQuestionFile(data));
    expect(issues[0]?.message).toMatch(/Okänt fält: forklarnig/);
  });

  it('requires exactly one correct alternative for flerval', () => {
    const data = fixture(QUESTIONS);
    asList(asList(data.fragor)[0]!.alternativ)[0]!.ratt = true;
    const issues = issuesOf(parseQuestionFile(data));
    expect(issues[0]).toMatchObject({ path: 'fragor[lov-001].alternativ' });
    expect(issues[0]?.message).toMatch(/exakt ett alternativ/);
  });

  it('checks that lucktext has one answer per gap', () => {
    const data = fixture(QUESTIONS);
    asList(data.fragor)[2]!.svar = ['10'];
    const issues = issuesOf(parseQuestionFile(data));
    expect(issues[0]?.message).toMatch(/3 luckor .* 1 rader/);
  });

  it('rejects invalid status, legal state and difficulty', () => {
    const data = fixture(QUESTIONS);
    const q = asList(data.fragor)[0]!;
    q.status = 'klar';
    q.rattslage = '1 dec 2025';
    q.svarighet = 5;
    const messages = issuesOf(parseQuestionFile(data)).map((i) => `${i.path}: ${i.message}`);
    expect(messages).toEqual(
      expect.arrayContaining([
        'fragor[lov-001].status: status ska vara "utkast" eller "granskad".',
        'fragor[lov-001].rattslage: Datum ska skrivas som ÅÅÅÅ-MM-DD, t.ex. 2026-03-02.',
        'fragor[lov-001].svarighet: svarighet ska vara 1, 2 eller 3.',
      ]),
    );
  });

  it('rejects duplicate question ids', () => {
    const data = fixture(QUESTIONS);
    asList(data.fragor)[1]!.id = 'lov-001';
    const issues = issuesOf(parseQuestionFile(data));
    expect(issues[0]?.message).toMatch(/"lov-001" används redan/);
  });
});

describe('broken case files', () => {
  it('reports an event that refers to a missing step', () => {
    const data = fixture(CASE);
    (asList(data.handelser)[0]!.utlosare as Record<string, unknown>).efter_steg = 'S9';
    const issues = issuesOf(parseCaseFile(data));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toBe('handelser[E1].utlosare.efter_steg');
    expect(issues[0]?.message).toMatch(/"S9", som inte finns\. Kända steg: S1, S2/);
  });

  it('reports dold_tills pointing at a missing event and an unknown document in an effect', () => {
    const data = fixture(CASE);
    asList(data.handlingar)[4]!.dold_tills = 'E9';
    const effect = asList(data.handelser)[1]!.effekt as Record<string, unknown>;
    effect.visa_handlingar = ['H8'];
    const paths = issuesOf(parseCaseFile(data)).map((i) => i.path);
    expect(paths).toEqual(['handlingar[H5].dold_tills', 'handelser[E2].effekt.visa_handlingar[1]']);
  });

  it('reports an unknown step type and an unknown decision', () => {
    const data = fixture(CASE);
    asList(data.steg)[0]!.typ = 'kontroll';
    asList(data.steg)[5]!.forvantat_beslut = 'godkann';
    const issues = issuesOf(parseCaseFile(data));
    expect(issues.map((i) => i.path)).toEqual(['steg[S1].typ', 'steg[S6].forvantat_beslut']);
    expect(issues[0]?.message).toMatch(/Tillåtna stegtyper/);
    expect(issues[1]?.message).toMatch(/Tillåtna värden: bevilja/);
  });

  it('requires at least one trigger condition and a valid probability', () => {
    const data = fixture(CASE);
    asList(data.handelser)[0]!.utlosare = {};
    asList(data.handelser)[3]!.utlosare = { slump: 1.5 };
    const issues = issuesOf(parseCaseFile(data));
    expect(issues.map((i) => i.path)).toEqual([
      'handelser[E1].utlosare',
      'handelser[E4].utlosare.slump',
    ]);
  });

  it('reports duplicate step ids, including steps inserted by events', () => {
    const data = fixture(CASE);
    const effect = asList(data.handelser)[1]!.effekt as Record<string, unknown>;
    (effect.nytt_steg as Record<string, unknown>).id = 'S3';
    const issues = issuesOf(parseCaseFile(data));
    expect(issues[0]?.message).toBe('Steg-id "S3" används mer än en gång.');
  });

  it('checks vilande, godtagbara_utfall and ar_forelaggande', () => {
    const data = fixture(CASE);
    asList(data.steg)[0]!.vilande = 'semester';
    asList(data.steg)[1]!.ar_forelaggande = 'ja';
    asList(data.steg)[5]!.godtagbara_utfall = [{ utfall: 'bevilja' }];
    (asList(data.handelser)[0]!.effekt as Record<string, unknown>).vilande_upphor = 1;
    const issues = issuesOf(parseCaseFile(data));
    expect(issues.map((i) => i.path)).toEqual([
      'steg[S1].vilande',
      'steg[S2].ar_forelaggande',
      'steg[S6].godtagbara_utfall[1].motivering',
      'handelser[E1].effekt.vilande_upphor',
    ]);
    expect(issues[0]?.message).toMatch(/strandskydd, expropriation, planarbete/);
  });

  it('accepts the new fields when they are right', () => {
    const data = fixture(CASE);
    asList(data.steg)[0]!.vilande = 'strandskydd';
    asList(data.steg)[5]!.godtagbara_utfall = [{ utfall: 'avsla', motivering: 'Också rimligt.' }];
    (asList(data.handelser)[0]!.effekt as Record<string, unknown>).vilande_upphor = true;
    expect(parseCaseFile(data).success).toBe(true);
  });

  it('reports unknown template variables in step texts and messages', () => {
    const data = fixture(CASE);
    asList(data.steg)[0]!.instruktion = 'Sedan {{beslutdatum}}.';
    (asList(data.handelser)[0]!.effekt as Record<string, unknown>).meddelande =
      'Kom in {{inkomdatum|iso}}, beslut {{beslutsdatum+7|kort}}.';
    const issues = issuesOf(parseCaseFile(data));
    expect(issues.map((i) => i.path)).toEqual([
      'steg[S1].instruktion',
      'handelser[E1].effekt.meddelande',
    ]);
    expect(issues[0]?.message).toMatch(/Okänd mallvariabel \{\{beslutdatum\}\}/);
    expect(issues[1]?.message).toMatch(/Okänt filter \|kort/);
  });

  it('rejects file paths outside the case folder', () => {
    const data = fixture(CASE);
    asList(data.handlingar)[0]!.fil = '../annat/ansokan.pdf';
    const issues = issuesOf(parseCaseFile(data));
    expect(issues[0]?.path).toBe('handlingar[H1].fil');
  });
});

describe('broken module files', () => {
  it('reports duplicate ids and mismatched ordning', () => {
    const data = fixture('moduler.yaml');
    const modules = asList(data.moduler);
    modules[1]!.id = '01-forvaltningsratt';
    modules[3]!.ordning = 5;
    const messages = issuesOf(parseModules(data)).map((i) => i.message);
    expect(messages.some((m) => m.includes('"01-forvaltningsratt" finns redan'))).toBe(true);
    expect(messages.some((m) => m.includes('ordning 5 används redan'))).toBe(true);
  });
});
