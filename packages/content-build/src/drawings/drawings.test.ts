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
import { scaleMetadata } from './svg';

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

describe('scale metadata for measuring', () => {
  const attr = (svg: string, name: string) =>
    new RegExp(`<svg[^>]* ${name}="([^"]*)"`).exec(svg)?.[1];

  it('writes the scale and coordinate system on the root', () => {
    const svg = render('situationsplan', a002Params('situationsplan'));
    expect(attr(svg, 'data-scale')).toBe('1:500');
    expect(attr(svg, 'data-units')).toBe('mm');
    expect(attr(svg, 'data-meters-per-unit')).toBe('0.5');
    const [ax, ay, aw, ah] = attr(svg, 'data-drawing-area')!.split(' ').map(Number);
    expect(aw).toBeGreaterThan(0);
    expect(ah).toBeGreaterThan(0);
    // The drawing group is placed at the drawing area.
    expect(svg).toContain(
      `<g transform="translate(${ax} ${ay})" class="ritning" data-layer="ritning">`,
    );
    // The origin is the plot's north-west corner, where the plot boundary starts.
    const [ox, oy] = attr(svg, 'data-origin')!.split(' ').map(Number);
    const boundary =
      /<rect x="([\d.]+)" y="([\d.]+)" width="[\d.]+" height="[\d.]+" fill="none" stroke="#000" stroke-width="0.7" stroke-dasharray/.exec(
        svg,
      );
    expect(boundary).not.toBeNull();
    expect(Number(boundary![1]) + ax!).toBeCloseTo(ox!, 2);
    expect(Number(boundary![2]) + ay!).toBeCloseTo(oy!, 2);
  });

  it('keeps every scale exact and leaves out the origin when there is none', () => {
    const facade = render('fasadritning', a002Params('fasadritning'));
    expect(attr(facade, 'data-scale')).toBe('1:100');
    expect(attr(facade, 'data-meters-per-unit')).toBe('0.1');
    expect(attr(facade, 'data-origin')).toBeUndefined();
    expect(scaleMetadata(25, { x: 0, y: 0, width: 10, height: 10 })['data-meters-per-unit']).toBe(
      '0.025',
    );
    expect(attr(render('plankarta', a002Params('plankarta')), 'data-meters-per-unit')).toBe('1');
  });

  it('groups the sheet in invisible layers', () => {
    for (const kind of DRAWING_KINDS) {
      const svg = render(kind, a002Params(kind));
      const layers = [...svg.matchAll(/data-layer="([a-z]+)"/g)].map((m) => m[1]);
      // The footer (legend, notes) is there when the drawing has one.
      expect(layers.filter((l) => l !== 'fot')).toEqual(['ram', 'ritning', 'ritningshuvud']);
      expect(svg).not.toMatch(/data-layer="[a-z]+"[^>]*(display|visibility|opacity)=/);
    }
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

describe('fas 4: supervision, alterations and apartment blocks', () => {
  const supervision = {
    skala: 200,
    tomt_bredd: 25,
    tomt_djup: 32,
    hus: [4, 6, 12, 9],
    ovriga_byggnader: [{ rektangel: [17, 21, 5, 8], namn: 'Garage' }],
    lovgivet: [{ rektangel: [17, 21, 5, 8], namn: 'Garage enligt bygglov 2024' }],
    avvikelse: [{ rektangel: [22, 21, 2, 8], namn: 'Förråd utan lov' }],
    utfart: { sida: 'soder', lage: 17, bredd: 5, langd: 3 },
    gata: { sida: 'soder', namn: 'Tallvägen' },
  };

  it('draws a deviation from the permit with its own hatch, outline and legend', () => {
    const svg = render('situationsplan', supervision);
    assertWellFormed(svg);
    expect(svg).toContain('id="TEST-H1-avvikelse"');
    expect(svg).toContain('fill="url(#TEST-H1-avvikelse)"');
    expect(svg).toContain('Utfört utan lov eller i strid med lovet</text>');
    expect(svg).toContain('Garage enligt bygglov 2024</text>');
    expect(svg).toContain('stroke-dasharray="4 1 0.8 1 0.8 1"');
    expect(svg).toContain('Förråd</text>');
    // The deviation is measured to the boundaries like an extension: 22 + 2 + 1 m.
    expect(svg).toContain('>1,0</text>');
    // Nothing new is applied for, so the legend does not offer it.
    expect(svg).not.toContain('Ny byggnad eller tillbyggnad</text>');
    expect(svg).not.toContain('Ny</text>');
  });

  it('divides parking into spaces, draws balconies and names the main building', () => {
    const svg = render('situationsplan', {
      skala: 400,
      tomt_bredd: 40,
      tomt_djup: 36,
      nybyggnad: [5, 4, 30, 12],
      huvudbyggnad_namn: 'Nytt flerbostadshus',
      komplementbyggnad: [29, 31, 10, 4],
      komplementbyggnad_namn: 'Miljöhus',
      prickmark: [{ sida: 'norr', djup: 4 }],
      balkonger: [[6, 2.6, 3.6, 1.4]],
      parkering: [{ rektangel: [0.5, 30.5, 25, 5], platser: 9, tillgangliga: 1 }],
    });
    assertWellFormed(svg);
    expect(svg).toContain('flerbostadshus</text>');
    expect(svg).toContain('Miljöhus</text>');
    expect(svg).not.toContain('>bostadshus</text>');
    expect(svg).toContain('PRH</text>');
    expect(svg).toContain('Parkering, PRH = plats för rörelsehindrade</text>');
    expect(svg).toContain('Balkong, ovan mark</text>');
    // 9 spaces need 8 lines between them, the first after the 5 m wide accessible space.
    const stalls = [...svg.matchAll(/<line x1="([\d.]+)" y1="110.25" x2="\1" y2="122.75"/g)];
    expect(stalls.map((m) => Number(m[1]))).toEqual([
      47.75, 54, 60.25, 66.5, 72.75, 79, 85.25, 91.5,
    ]);
    expect(
      issues('situationsplan', {
        skala: 400,
        tomt_bredd: 40,
        tomt_djup: 36,
        nybyggnad: [5, 4, 30, 12],
        parkering: [{ rektangel: [0, 30, 25, 5], platser: 2, tillgangliga: 3 }],
      }),
    ).toEqual(['parkering[1].tillgangliga: tillgangliga kan inte vara fler än platser.']);
  });

  const facadePart = {
    bredd: 18,
    byggnadshojd: 13.6,
    takvinkel: 38,
    vy: 'langsida',
    djup: 12,
  };

  it('marks new and removed openings, signs and ducts in a facade', () => {
    const svg = render('fasadritning', {
      fasader: [
        {
          rubrik: 'Fasad mot gatan',
          delar: [
            {
              ...facadePart,
              oppningar: [
                { typ: 'fonster', x: 0.6, bredd: 7, hojd: 2.6, underkant: 0.3, status: 'ny' },
                { typ: 'fonster', x: 0.9, bredd: 1.6, hojd: 2, underkant: 0.8, status: 'rivs' },
              ],
              detaljer: [
                { typ: 'skylt', x: 1.8, bredd: 4.6, underkant: 3.2, hojd: 0.7, text: 'KOPPARN' },
                { typ: 'kanal', x: 11.6, bredd: 0.5, underkant: 2.4, hojd: 16.9, ny: true },
              ],
            },
          ],
        },
      ],
    });
    assertWellFormed(svg);
    expect(svg).toContain('KOPPARN</text>');
    expect(svg).toContain('stroke-dasharray="1.2 0.8"');
    expect(svg).toContain('Streckad öppning med kryss tas bort eller sätts igen.</text>');
    expect(svg).toContain('Ny eller ändrad öppning ritas med grov linje.</text>');
    expect(svg).toContain('+19,30</text>');
    expect(svg).toContain('kanal</text>');
  });

  it('draws a flat roof with a parapet and balconies, and puts the door handle on the door', () => {
    const svg = render('fasadritning', {
      fasader: [
        {
          rubrik: 'Fasad mot norr',
          delar: [
            {
              bredd: 30,
              byggnadshojd: 12.4,
              takvinkel: 0,
              vy: 'langsida',
              djup: 12,
              takutsprang: 0,
              attika: 0.3,
              balkonger: [{ x: 1, bredd: 3.6, underkant: 3.5 }],
              oppningar: [{ typ: 'dorr', x: 1.5, bredd: 0.9, hojd: 2.1, underkant: 3.5 }],
            },
          ],
        },
      ],
    });
    assertWellFormed(svg);
    expect(svg).toContain('+12,40 BH</text>');
    expect(svg).toContain('överkant attika</text>');
    expect(svg).toContain('+12,10</text>');
    expect(svg).not.toContain(' NH</text>');
    expect(svg).toContain('class="balkong"');
    // The handle sits 1 m above the door's sill (3.5 m), not 1 m above the ground.
    const handle = /<circle cx="[\d.]+" cy="([\d.]+)" r="0.4" fill="#000"\/>/.exec(svg);
    const ground =
      /<line x1="[\d.]+" y1="([\d.]+)" x2="[\d.]+" y2="\1" stroke="#000" stroke-width="0.7"/.exec(
        svg,
      );
    expect(handle && ground).toBeTruthy();
    expect(Number(ground![1]) - Number(handle![1])).toBeCloseTo(45, 0);
    expect(
      issues('fasadritning', {
        fasader: [{ rubrik: 'A', delar: [{ ...facadePart, attika: 0.5 }] }],
      }),
    ).toEqual(['fasader[1].delar[1].attika: attika gäller bara platta tak (takvinkel 0).']);
  });

  it('writes storeys, ridge height, free provisions and one e-index per percentage', () => {
    const svg = render('plankarta', {
      plan: { beteckning: 'Dp 2019-03', namn: 'Humlan' },
      omrade: [0, 0, 140, 88],
      kvarter: [
        {
          namn: 'Humlan',
          rektangel: [0, 12, 140, 36],
          byggnadsarea_procent: 35,
          vaningar: 4,
          bestammelser: [{ beteckning: 'm1', text: 'Skydd mot trafikbuller' }],
        },
        {
          namn: 'Humlan',
          rektangel: [0, 48, 140, 30],
          byggnadsarea_procent: 25,
          nockhojd: 8.5,
        },
      ],
    });
    assertWellFormed(svg);
    expect(svg).toContain('>IV</text>');
    expect(svg).toContain('Högsta antal våningar</text>');
    expect(svg).toContain('NH 8,5</text>');
    expect(svg).toContain('Högsta nockhöjd i meter</text>');
    expect(svg).toContain('Skydd mot trafikbuller</text>');
    expect(svg).toContain('Största byggnadsarea 35 % av fastighetsarean</text>');
    expect(svg).toContain('Största byggnadsarea 25 % av fastighetsarean</text>');
    expect(svg).toMatch(/>e<tspan[^>]*>2<\/tspan><\/text>/);
    expect(svg).toMatch(/>m<tspan[^>]*>1<\/tspan><\/text>/);
  });

  it('draws balconies in a floor plan and moves the dimension chains out', () => {
    const base = {
      byggnader: [{ rektangel: [0, 0, 10, 8], ny: true }],
      rum: [{ namn: 'Rum', rektangel: [0.3, 0.3, 9.4, 7.4] }],
    };
    const plain = render('planritning', base);
    const withBalcony = render('planritning', {
      ...base,
      balkonger: [{ rektangel: [2, -1.4, 3.6, 1.4] }],
    });
    assertWellFormed(withBalcony);
    expect(withBalcony).toContain('Balkong</text>');
    expect(plain).not.toContain('Balkong</text>');
  });
});

describe('fas 4b: trees, pools, levels, subdivision, ancient monuments and installations', () => {
  it('draws trees to keep and to fell, a pool and existing and new ground levels', () => {
    const svg = render('situationsplan', {
      skala: 200,
      tomt_bredd: 30,
      tomt_djup: 40,
      hus: [8, 8, 14, 10],
      pooler: [{ rektangel: [11, 26, 8, 4], namn: 'Ny pool' }],
      trad: [
        { punkt: [4, 34], namn: 'Ek 4', krondiameter: 8 },
        { punkt: [18, 27], namn: 'Ek 1', stamdiameter: 0.45, krondiameter: 9, status: 'falls' },
      ],
      hojder: [
        { punkt: [21, 20.5], befintlig: 24.75, ny: 24.05 },
        { punkt: [15, 1], befintlig: 25.6 },
      ],
    });
    assertWellFormed(svg);
    expect(svg).toContain('id="TEST-H1-pool"');
    expect(svg).toContain('Ny pool</text>');
    expect(svg).toContain('Ek 4</text>');
    expect(svg).toContain('Ek 1</text>');
    // Crowns at 1:200: 8 m and 9 m across.
    expect(svg).toContain('r="20"');
    expect(svg).toContain('r="22.5"');
    expect(svg).toContain('stroke-dasharray="1.2 0.8"');
    expect(svg).toContain('Träd som bevaras</text>');
    expect(svg).toContain('Träd som fälls</text>');
    expect(svg).toContain('+24,75</text>');
    expect(svg).toContain('+24,05</text>');
    expect(svg).toContain('+25,60</text>');
    expect(svg).toContain('Befintlig marknivå (m)</text>');
    expect(svg).toContain('Ny marknivå (m)</text>');
    expect(svg).toContain('Pool</text>');
  });

  const subdivision = {
    skala: 500,
    tomt_bredd: 56,
    tomt_djup: 54,
    nybyggnad: [8, 12, 14, 9],
    nybyggnader: [{ rektangel: [34, 12, 14, 9], namn: 'Nytt hus' }],
    tomter: [
      { rektangel: [0, 0, 28, 54], namn: 'Tomt 1', area: 1512 },
      { rektangel: [28, 0, 28, 54], namn: 'Tomt 2', area: 1512 },
    ],
    fornlamningar: [{ rektangel: [66, 20, 14, 18], namn: 'Fornlämning' }],
    grannhus: [[-28, 10, 12, 9], { rektangel: [96, 4, 14, 10], namn: 'Kvarnen' }],
  };

  it('draws new plots, their areas and the houses measured to their own plot', () => {
    const svg = render('situationsplan', subdivision);
    assertWellFormed(svg);
    expect(svg).toContain('Tomt 2</text>');
    expect(svg).toContain('1 512 m²</text>');
    expect(svg).toContain('stroke-dasharray="3.5 1.2"');
    expect(svg).toContain('Ny tomtgräns</text>');
    expect(svg).toContain('Gräns för området som ska styckas av</text>');
    expect(svg).not.toContain('>Tomtgräns</text>');
    // The house on plot 2 is 6 m from the plot line between the plots and 8 m from the east.
    expect(svg).toContain('>6,0</text>');
    expect(svg).toContain('>8,0</text>');
    // The plot dimensions are broken at the new plot line.
    expect(svg.match(/>28,0<\/text>/g)?.length).toBe(2);
  });

  it('widens the surroundings for an ancient monument and a named house outside the plot', () => {
    const svg = render('situationsplan', subdivision);
    const without = render('situationsplan', {
      ...subdivision,
      fornlamningar: [],
      grannhus: [
        [-28, 10, 12, 9],
        [96, 4, 14, 10],
      ],
    });
    const width = (s: string) => Number(/data-drawing-area="[\d.]+ [\d.]+ ([\d.]+)/.exec(s)?.[1]);
    expect(width(svg)).toBeGreaterThan(width(without));
    expect(svg).toContain('Kvarnen</text>');
    expect(svg).toContain('Fornlämning</text>');
    expect(svg).toContain('id="TEST-H1-fornlamning"');
    // 10 m from the plot's eastern boundary to the monument area.
    expect(svg).toContain('>10,0</text>');
  });

  it('validates the new situationsplan keys', () => {
    const base = { tomt_bredd: 20, tomt_djup: 20, hus: [5, 5, 8, 8] };
    expect(
      issues('situationsplan', { ...base, trad: [{ punkt: [3, 3], status: 'sagas' }] }),
    ).toEqual(['trad[1].status: status ska vara en av: bevaras, falls.']);
    expect(issues('situationsplan', { ...base, hojder: [{ punkt: [3, 3] }] })).toEqual([
      'hojder[1]: Ange befintlig höjd, ny höjd eller båda.',
    ]);
    expect(issues('situationsplan', { ...base, fornlamningar: [{ namn: 'R' }] })).toEqual([
      'fornlamningar[1]: Ange antingen rektangel (ett område) eller punkt (en enskild fornlämning).',
    ]);
    expect(issues('situationsplan', { ...base, tomter: [{ rektangel: [10, 0, 12, 20] }] })).toEqual(
      ['tomter[1].rektangel: Tomten ligger utanför tomten (0–20 × 0–20 m).'],
    );
  });

  it('draws a stove and a service connection in a floor plan with their own legend rows', () => {
    const base = {
      skala: 50,
      byggnader: [{ rektangel: [0, 0, 10, 8] }],
      rum: [{ namn: 'Rum', rektangel: [0.3, 0.3, 9.4, 7.4] }],
    };
    const svg = render('planritning', {
      ...base,
      installationer: [
        { typ: 'kamin', namn: 'Ny kamin', rektangel: [2, 0.5, 0.55, 0.45] },
        { typ: 'servis', namn: 'Ny VA-servis', rektangel: [8.8, 3, 0.75, 0.9] },
      ],
    });
    assertWellFormed(svg);
    expect(svg).toContain('Ny kamin</text>');
    expect(svg).toContain('Ny VA-servis</text>');
    expect(svg).toContain('Ny eldstad (kamin) med anslutning till rökkanal</text>');
    expect(svg).toContain('Ny VA-servis, V = vatten, S = spillvatten</text>');
    expect(svg).toContain('>V</text>');
    expect(
      issues('planritning', {
        ...base,
        installationer: [{ typ: 'kamin', rektangel: [12, 0, 1, 1] }],
      }),
    ).toEqual(['installationer[1].rektangel: Installationen ligger inte helt inom någon byggnad.']);
    expect(
      issues('planritning', {
        ...base,
        installationer: [{ typ: 'spis', rektangel: [1, 1, 1, 1] }],
      }),
    ).toEqual(['installationer[1].typ: typ ska vara en av: kamin, skorsten, servis, annan.']);
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
