import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  DRAWING_KINDS,
  DrawingDoesNotFitError,
  generateDrawing,
  isDrawingKind,
  isGeneratedDrawing,
  parseDrawing,
  renderDrawing,
  type DrawingContext,
  type DrawingKind,
} from './index';

const caseFile = fileURLToPath(
  new URL('../../../../content/arenden/A002-tillbyggnad-bjorken-7/arende.yaml', import.meta.url),
);

interface RawHandling {
  id: string;
  typ: string;
  fil: string;
  parametrar?: unknown;
}

const a002 = parse(readFileSync(caseFile, 'utf8')) as { handlingar: RawHandling[] };

/** A002's parameters for each drawing kind. */
const a002Params = (kind: DrawingKind): unknown => {
  const h = a002.handlingar.find((x) => x.typ === kind && x.parametrar !== undefined);
  if (!h) throw new Error(`A002 has no ${kind}`);
  return h.parametrar;
};

const context: DrawingContext = {
  fastighet: 'Björken 7, Åkerslunda kommun',
  projekt: 'Tillbyggnad av enbostadshus',
  titel: 'Ritning',
  datum: '2026-03-02',
  idPrefix: 'TEST-H1',
};

/** Minimal XML well-formedness check: balanced tags and escaped ampersands. */
function assertWellFormed(svg: string) {
  expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
  expect(svg.endsWith('</svg>\n')).toBe(true);
  expect(svg).not.toMatch(/&(?!amp;|lt;|gt;|quot;|#\d+;)/);
  const stack: string[] = [];
  const tag = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>/g;
  let consumed = 0;
  for (const m of svg.matchAll(tag)) {
    const [whole, closing, name, , selfClosing] = m;
    // Only text may sit between tags, and it may not contain markup characters.
    expect(svg.slice(consumed, m.index)).not.toMatch(/[<>]/);
    consumed = m.index + whole.length;
    if (closing) expect(stack.pop()).toBe(name);
    else if (!selfClosing) stack.push(name!);
  }
  expect(svg.slice(consumed).trim()).toBe('');
  expect(stack).toEqual([]);
}

function issues(kind: DrawingKind, input: unknown): string[] {
  const result = parseDrawing(kind, input);
  return result.success ? [] : result.issues.map((i) => `${i.path}: ${i.message}`);
}

function render(kind: DrawingKind, params: unknown, ctx: DrawingContext = context): string {
  return generateDrawing(kind, params, ctx);
}

describe('drawing generator', () => {
  it.each(DRAWING_KINDS)('renders A002 %s as well-formed SVG with a title block', (kind) => {
    const svg = render(kind, a002Params(kind));
    assertWellFormed(svg);
    expect(svg).toContain('FIKTIV HANDLING FÖR UTBILDNING');
    expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/);
    expect(svg).toContain('<title>');
  });

  it('puts the facts of A002 on the drawings', () => {
    const situation = render('situationsplan', a002Params('situationsplan'));
    for (const text of [
      'Björken 7',
      'Björken 8',
      'BJÖRKVÄGEN',
      '24,0',
      '32,0',
      '5,5',
      '7,0',
      '1:500',
    ]) {
      expect(situation).toContain(text);
    }
    const facades = render('fasadritning', a002Params('fasadritning'));
    for (const text of [
      '+4,90 BH',
      '+4,40 BH',
      '27°',
      'FASAD MOT SÖDER',
      'FASAD MOT ÖSTER',
      '7 000',
    ]) {
      expect(facades).toContain(text);
    }
    const plan = render('planritning', a002Params('planritning'));
    for (const text of ['Allrum', '33,3 m²', 'SEKTION A-A', '12 500', '5 500']) {
      expect(plan).toContain(text);
    }
    const map = render('plankarta', a002Params('plankarta'));
    for (const text of ['Dp 1978-14', 'GATA', 'PARK', '4,5', 'Högsta byggnadshöjd i meter']) {
      expect(map).toContain(text);
    }
  });

  it('is deterministic, also when keys come in another order', () => {
    const params = a002Params('situationsplan') as Record<string, unknown>;
    const reversed = Object.fromEntries(Object.entries(params).reverse());
    const first = render('situationsplan', params);
    expect(render('situationsplan', params)).toBe(first);
    expect(render('situationsplan', reversed)).toBe(first);
    for (const kind of DRAWING_KINDS) {
      expect(render(kind, a002Params(kind))).toBe(render(kind, a002Params(kind)));
    }
  });

  it('uses the id prefix so several drawings can share one page', () => {
    const svg = render('situationsplan', a002Params('situationsplan'), {
      ...context,
      idPrefix: 'A002-H2',
    });
    expect(svg).toContain('id="A002-H2-prickmark"');
    expect(svg).toContain('url(#A002-H2-prickmark)');
  });

  it('chooses a larger sheet when the drawing needs it', () => {
    expect(render('situationsplan', a002Params('situationsplan'))).toContain('A4 stående');
    expect(render('fasadritning', a002Params('fasadritning'))).toMatch(/data-papper="A3/);
  });

  it('throws a readable error when nothing fits', () => {
    const params = { ...(a002Params('situationsplan') as object), skala: 20 };
    expect(() => render('situationsplan', params)).toThrow(DrawingDoesNotFitError);
    expect(() => render('situationsplan', params)).toThrow(/får inte plats/);
  });
});

describe('situationsplan for a new house by a lake', () => {
  const lakePlot = {
    skala: 1000,
    tomt_bredd: 60,
    tomt_djup: 70,
    nybyggnad: [22, 30, 16, 10],
    anlaggningar: [
      { rektangel: [26, 40, 8, 4], namn: 'Altan' },
      { rektangel: [46, 16, 8, 8], namn: 'Markbädd' },
    ],
    punkter: [{ punkt: [10, 28], namn: 'Borrad brunn' }],
    utfart: { sida: 'norr', lage: 30, bredd: 5 },
    strandlinje: { sida: 'soder', avstand: 65, namn: 'Långsjön' },
    strandskydd: { avstand: 100 },
    gata: { sida: 'norr', namn: 'Väg 612', bredd: 7 },
    grannar: { oster: 'Strandvik 1:12' },
  };

  it('draws the new house, features, driveway, shoreline and protection line', () => {
    const svg = render('situationsplan', lakePlot);
    assertWellFormed(svg);
    for (const text of [
      'Nytt</text>',
      'bostadshus</text>',
      'Altan</text>',
      'Markbädd</text>',
      'Borrad brunn</text>',
      'Utfart</text>',
      'LÅNGSJÖN</text>',
      'Strandskyddsgräns</text>',
      'Strandskyddsgräns, 100 m från strandlinjen</text>',
      'Vatten och strandlinje</text>',
      '>30,0</text>',
    ]) {
      expect(svg).toContain(text);
    }
    // No existing building on the plot, so the legend does not offer one.
    expect(svg).not.toContain('Befintlig byggnad</text>');
    expect(svg).not.toContain('Befintligt</text>');
  });

  it('validates the new keys', () => {
    const { nybyggnad: _house, ...withoutHouse } = lakePlot;
    expect(issues('situationsplan', withoutHouse)).toEqual([
      'hus: Ange hus (befintlig byggnad) eller nybyggnad (ny byggnad).',
    ]);
    expect(
      issues('situationsplan', { ...lakePlot, utfart: { sida: 'norr', lage: 58, bredd: 5 } }),
    ).toEqual(['utfart.lage: Utfarten går utanför tomtgränsen (60 m).']);
    const { strandlinje: _shore, ...withoutShore } = lakePlot;
    expect(issues('situationsplan', withoutShore)).toEqual([
      'strandskydd: strandskydd kräver strandlinje (gränsen mäts från strandlinjen).',
    ]);
    expect(
      issues('situationsplan', {
        ...lakePlot,
        anlaggningar: [{ rektangel: [58, 0, 5, 5], namn: 'Bod' }],
      }),
    ).toEqual(['anlaggningar[1].rektangel: Anläggningen ligger utanför tomten (0–60 × 0–70 m).']);
  });
});

describe('parameter validation', () => {
  it('accepts all A002 parameters', () => {
    for (const kind of DRAWING_KINDS) expect(issues(kind, a002Params(kind))).toEqual([]);
  });

  it('reports missing fields, wrong types and unknown keys in Swedish', () => {
    expect(issues('situationsplan', { tomt_bredd: 24, hus: [1, 1, 5, 5], tomt_hojd: 3 })).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^tomt_djup: Fältet saknas/),
        expect.stringMatching(/^: Okänt fält: tomt_hojd/),
      ]),
    );
    expect(issues('situationsplan', { tomt_bredd: 24, tomt_djup: 32, hus: [1, 1, 5] })).toEqual([
      expect.stringMatching(/^hus: Ska vara en rektangel \[x, y, bredd, djup\]/),
    ]);
    expect(
      issues('situationsplan', {
        tomt_bredd: 24,
        tomt_djup: 32,
        hus: [1, 1, 5, 5],
        prickmark: [{ sida: 'syd', djup: 6 }],
      }),
    ).toEqual([expect.stringMatching(/^prickmark\[1\]\.sida: Ska vara ett väderstreck/)]);
  });

  it('checks geometry: buildings inside the plot, roof data, doors', () => {
    expect(issues('situationsplan', { tomt_bredd: 24, tomt_djup: 32, hus: [20, 1, 8, 5] })).toEqual(
      ['hus: Huset ligger utanför tomten (0–24 × 0–32 m).'],
    );
    const facade = {
      fasader: [
        {
          rubrik: 'Fasad',
          delar: [
            {
              bredd: 5,
              byggnadshojd: 3,
              takvinkel: 27,
              vy: 'langsida',
              oppningar: [{ typ: 'fonster', x: 4.5, bredd: 1 }],
            },
          ],
        },
      ],
    };
    expect(issues('fasadritning', facade)).toEqual([
      expect.stringMatching(/^fasader\[1\]\.delar\[1\]\.djup: vy langsida behöver djup/),
      expect.stringMatching(/^fasader\[1\]\.delar\[1\]\.oppningar\[1\]\.x: Öppningen slutar/),
    ]);
    const plan = {
      byggnader: [{ rektangel: [0, 0, 10, 8] }],
      rum: [{ namn: 'Rum', rektangel: [0.3, 0.3, 12, 7] }],
      dorrar: [{ position: [2, 0], vagg: 'horisontell', oppnas_mot: 'oster' }],
    };
    expect(issues('planritning', plan)).toEqual([
      'rum[1].rektangel: Rummet "Rum" ligger inte helt inom någon byggnad.',
      'dorrar[1].oppnas_mot: En dörr i en horisontell vägg öppnas mot norr eller soder.',
    ]);
  });

  it('knows which handlingar are generated', () => {
    expect(DRAWING_KINDS).toEqual(['situationsplan', 'fasadritning', 'planritning', 'plankarta']);
    expect(isDrawingKind('situationsplan')).toBe(true);
    expect(isDrawingKind('sektionsritning')).toBe(false);
    expect(isGeneratedDrawing({ fil: 'handlingar/a.svg', parametrar: {} })).toBe(true);
    expect(isGeneratedDrawing({ fil: 'handlingar/a.svg' })).toBe(false);
    expect(isGeneratedDrawing({ fil: 'handlingar/a.md', parametrar: {} })).toBe(false);
  });

  it('renders a parsed spec the same as generateDrawing', () => {
    const parsed = parseDrawing('plankarta', a002Params('plankarta'));
    if (!parsed.success) throw new Error('invalid');
    expect(renderDrawing(parsed.data, context)).toBe(render('plankarta', a002Params('plankarta')));
  });
});
