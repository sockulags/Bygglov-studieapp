import { idSafe, shortProperty, titleData, type DrawingContext } from './context';
import {
  defaultOpeningHeight,
  defaultSill,
  type Facade,
  type FacadeOpening,
  type FacadePart,
  type FasadritningParams,
} from './schema';
import {
  INK,
  LINE,
  PAPER,
  TEXT,
  composeSheet,
  dimensionChain,
  el,
  group,
  hatchPattern,
  label,
  level,
  line,
  millimetres,
  polygon,
  rect,
  sheetIndex,
  textWidth,
  viewHeading,
  type ChainPoint,
} from './svg';

const ROOF_THICKNESS = 0.25;
const GROUND_EXTENSION_MM = 10;
const LEVEL_GAP_MM = 12;
const MIN_LABEL_SPACING_MM = 3.6;

interface PartGeometry {
  part: FacadePart;
  x0: number;
  x1: number;
  bh: number;
  nock: number;
  tan: number;
}

function geometry(part: FacadePart): PartGeometry {
  const tan = Math.tan((part.takvinkel * Math.PI) / 180);
  const span = part.vy === 'gavel' ? part.bredd : (part.djup ?? 0);
  const nock = part.nockhojd ?? part.byggnadshojd + (span / 2) * tan;
  return { part, x0: part.x, x1: part.x + part.bredd, bh: part.byggnadshojd, nock, tan };
}

export interface LevelMark {
  z: number;
  /** x (m) of the feature the level refers to. */
  featureX: number;
  text: string;
  note?: string;
}

/** Width needed right of the level line for the labels. */
export function levelLabelWidth(marks: LevelMark[]): number {
  return Math.max(
    ...marks.map(
      (m) => textWidth(m.text, TEXT.normal) + (m.note ? 1.5 + textWidth(m.note, TEXT.small) : 0),
    ),
  );
}

/** Level marks (nivåkotor) on a vertical line at `levelX`, with dashed leaders to the features. */
export function levelColumn(
  marks: LevelMark[],
  o: {
    levelX: number;
    X: (x: number) => number;
    Z: (z: number) => number;
    topY: number;
    groundY: number;
  },
): string {
  const sorted = [...marks].sort((a, b) => b.z - a.z);
  let lastY = -Infinity;
  const parts: string[] = [line(o.levelX, o.topY, o.levelX, o.groundY, LINE.hair)];
  for (const m of sorted) {
    const y = o.Z(m.z);
    const textY = Math.max(y, lastY + MIN_LABEL_SPACING_MM);
    lastY = textY;
    if (Math.abs(m.z) > 0.005) {
      parts.push(
        line(o.X(m.featureX) + 1, y, o.levelX + 1.5, y, LINE.hair, {
          'stroke-dasharray': '1.2 0.8',
        }),
      );
    }
    parts.push(
      polygon(
        [
          [o.levelX, y],
          [o.levelX - 1.1, y - 1.6],
          [o.levelX + 1.1, y - 1.6],
        ],
        { fill: INK },
      ),
    );
    if (textY !== y) parts.push(line(o.levelX + 1.5, y, o.levelX + 3.5, textY - 0.8, LINE.hair));
    parts.push(label(o.levelX + 4, textY - 0.3, m.text, { size: TEXT.normal }));
    if (m.note) {
      parts.push(
        label(o.levelX + 4 + textWidth(m.text, TEXT.normal) + 1.5, textY - 0.3, m.note, {
          size: TEXT.small,
          italic: true,
        }),
      );
    }
  }
  return group(parts, { class: 'nivaer' });
}

/** Intervals of [from, to] not covered by any of `covers`. */
function visibleIntervals(
  from: number,
  to: number,
  covers: [number, number][],
): [number, number][] {
  let result: [number, number][] = [[from, to]];
  for (const [a, b] of covers) {
    result = result.flatMap(([c, d]): [number, number][] => {
      if (b <= c || a >= d) return [[c, d]];
      const out: [number, number][] = [];
      if (a > c) out.push([c, a]);
      if (b < d) out.push([b, d]);
      return out;
    });
  }
  return result;
}

interface Rendered {
  width: number;
  height: number;
  svg: string;
}

function renderOpening(
  o: FacadeOpening,
  g: PartGeometry,
  X: (x: number) => number,
  Z: (z: number) => number,
) {
  const sill = o.underkant ?? defaultSill(o.typ);
  const h = o.hojd ?? defaultOpeningHeight(o.typ);
  const x = g.x0 + o.x;
  const w = o.bredd;
  const left = X(x);
  const top = Z(sill + h);
  const pw = X(x + w) - left;
  const ph = Z(sill) - top;
  const k = pw / w;
  const parts: string[] = [
    rect(left, top, pw, ph, { fill: PAPER, stroke: INK, 'stroke-width': LINE.medium }),
  ];
  const inner = (inset: number, bottomInset = inset) =>
    rect(left + inset * k, top + inset * k, pw - 2 * inset * k, ph - (inset + bottomInset) * k, {
      fill: 'none',
      stroke: INK,
      'stroke-width': LINE.hair,
    });
  if (o.typ === 'fonster') {
    parts.push(inner(0.06));
    if (w > 1.05) parts.push(line(left + pw / 2, top, left + pw / 2, top + ph, LINE.thin));
    // Sill.
    parts.push(
      line(
        left - 0.05 * k,
        top + ph + 0.04 * k,
        left + pw + 0.05 * k,
        top + ph + 0.04 * k,
        LINE.thin,
      ),
    );
  } else if (o.typ === 'altandorr') {
    if (w > 1.3) {
      const half = pw / 2;
      parts.push(line(left + half, top, left + half, top + ph, LINE.thin));
      for (const offset of [0, half]) {
        parts.push(
          rect(left + offset + 0.08 * k, top + 0.08 * k, half - 0.16 * k, ph - 0.4 * k, {
            fill: 'none',
            stroke: INK,
            'stroke-width': LINE.hair,
          }),
        );
      }
    } else {
      parts.push(inner(0.08, 0.32));
    }
  } else if (o.typ === 'dorr') {
    parts.push(inner(0.1, 0.12));
    parts.push(el('circle', { cx: left + pw - 0.12 * k, cy: Z(1.0), r: 0.04 * k, fill: INK }));
  } else {
    for (let z = sill + 0.5; z < sill + h - 0.1; z += 0.5) {
      parts.push(line(left, Z(z), left + pw, Z(z), LINE.hair));
    }
  }
  return parts.join('');
}

function renderFacade(f: Facade, k: number, groundId: string): Rendered {
  const geoms = f.delar.map(geometry);
  const minX = Math.min(...geoms.map((g) => g.x0 - g.part.takutsprang));
  const maxX = Math.max(...geoms.map((g) => g.x1 + g.part.takutsprang));
  const topZ = Math.max(...geoms.map((g) => g.nock));

  // Level labels decide the width to the right.
  const showsHeights = geoms.filter((g) => g.part.visa_hojder);
  const named = showsHeights.length > 1;
  const marks: LevelMark[] = [{ z: 0, featureX: maxX, text: level(0), note: 'mark' }];
  for (const g of showsHeights) {
    const note = named ? g.part.namn?.toLowerCase() : undefined;
    marks.push({ z: g.bh, featureX: g.x1, text: `${level(g.bh)} BH`, note });
    marks.push({
      z: g.nock,
      featureX: g.part.vy === 'gavel' ? (g.x0 + g.x1) / 2 : g.x1 + g.part.takutsprang,
      text: `${level(g.nock)} NH`,
      note,
    });
  }
  const labelWidth = levelLabelWidth(marks);

  const left = GROUND_EXTENSION_MM;
  const top = 10;
  const X = (x: number) => left + (x - minX) * k;
  const Z = (z: number) => top + (topZ - z) * k;
  const groundY = Z(0);
  const levelX = X(maxX) + LEVEL_GAP_MM;
  const width = levelX + 5 + labelWidth + 2;

  const parts: string[] = [];

  // Ground hatch and line.
  parts.push(
    rect(X(minX) - GROUND_EXTENSION_MM, groundY, (maxX - minX) * k + 2 * GROUND_EXTENSION_MM, 2, {
      fill: `url(#${groundId})`,
    }),
  );

  // Parts, back to front.
  geoms.forEach((g) => {
    const p = g.part;
    const weight = p.ny ? LINE.heavy : LINE.medium;
    const o = p.takutsprang;
    if (p.vy === 'gavel') {
      const mid = (g.x0 + g.x1) / 2;
      const t = ROOF_THICKNESS;
      parts.push(
        polygon(
          [
            [X(g.x0), Z(0)],
            [X(g.x0), Z(g.bh - t)],
            [X(mid), Z(g.nock - t)],
            [X(g.x1), Z(g.bh - t)],
            [X(g.x1), Z(0)],
          ],
          { fill: PAPER, stroke: INK, 'stroke-width': weight, 'stroke-linejoin': 'miter' },
        ),
      );
      for (const opening of p.oppningar) parts.push(renderOpening(opening, g, X, Z));
      const eave = g.bh - o * g.tan;
      parts.push(
        polygon(
          [
            [X(g.x0 - o), Z(eave)],
            [X(mid), Z(g.nock)],
            [X(g.x1 + o), Z(eave)],
            [X(g.x1 + o), Z(eave - t)],
            [X(mid), Z(g.nock - t)],
            [X(g.x0 - o), Z(eave - t)],
          ],
          { fill: PAPER, stroke: INK, 'stroke-width': weight, 'stroke-linejoin': 'miter' },
        ),
      );
      // Roof pitch at the left eave.
      if (p.takvinkel > 0) {
        const ex = X(g.x0 - o);
        const ez = Z(eave);
        const r = 1.1 * k;
        const a = (p.takvinkel * Math.PI) / 180;
        parts.push(line(ex, ez, ex + r * 1.35, ez, LINE.hair));
        parts.push(
          el('path', {
            d: `M ${(ex + r).toFixed(2)} ${ez.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 0 ${(ex + r * Math.cos(a)).toFixed(2)} ${(ez - r * Math.sin(a)).toFixed(2)}`,
            fill: 'none',
            stroke: INK,
            'stroke-width': LINE.hair,
          }),
        );
        parts.push(
          label(ex + r * 1.45, ez - 0.6, `${p.takvinkel}°`, {
            size: TEXT.normal,
            halo: true,
          }),
        );
      }
    } else {
      const eave = g.bh - o * g.tan;
      parts.push(
        rect(X(g.x0), Z(g.bh), X(g.x1) - X(g.x0), Z(0) - Z(g.bh), {
          fill: PAPER,
          stroke: INK,
          'stroke-width': weight,
        }),
      );
      for (const opening of p.oppningar) parts.push(renderOpening(opening, g, X, Z));
      const rx = X(g.x0 - o);
      const rw = X(g.x1 + o) - rx;
      parts.push(
        rect(rx, Z(g.nock), rw, Z(eave) - Z(g.nock), {
          fill: PAPER,
          stroke: INK,
          'stroke-width': weight,
        }),
      );
      // Roof tiles as thin courses, fascia at the eave.
      const courses: string[] = [];
      for (let z = eave + 0.35; z < g.nock - 0.1; z += 0.35) {
        courses.push(line(rx, Z(z), rx + rw, Z(z), LINE.hair, { stroke: '#666' }));
      }
      parts.push(group(courses));
      parts.push(line(rx, Z(eave + 0.15), rx + rw, Z(eave + 0.15), LINE.thin));
      if (p.takvinkel > 0) {
        parts.push(
          label(rx + rw / 2, (Z(eave) + Z(g.nock)) / 2, `Takvinkel ${p.takvinkel}°`, {
            anchor: 'middle',
            baseline: 'middle',
            size: TEXT.normal,
            halo: true,
          }),
        );
      }
    }
  });

  parts.push(
    line(X(minX) - GROUND_EXTENSION_MM, groundY, X(maxX) + GROUND_EXTENSION_MM, groundY, LINE.bold),
  );

  parts.push(levelColumn(marks, { levelX, X, Z, topY: Z(topZ) - 2, groundY }));

  // Part names under the ground, on the widest visible stretch of each part.
  geoms.forEach((g, i) => {
    if (!g.part.namn) return;
    const covers = geoms.slice(i + 1).map((other): [number, number] => [other.x0, other.x1]);
    const best = visibleIntervals(g.x0, g.x1, covers).sort(
      (a, b) => b[1] - b[0] - (a[1] - a[0]),
    )[0];
    if (!best) return;
    parts.push(
      label((X(best[0]) + X(best[1])) / 2, groundY + 6, g.part.namn, {
        anchor: 'middle',
        size: TEXT.normal,
        weight: g.part.ny ? 'bold' : 'normal',
      }),
    );
  });

  // Widths in millimetres.
  const points: ChainPoint[] = [];
  for (const g of geoms) {
    points.push({ at: X(g.x0), from: groundY + 2.5 }, { at: X(g.x1), from: groundY + 2.5 });
  }
  const chainY = groundY + 12;
  parts.push(
    dimensionChain({ axis: 'x', at: chainY, points, format: (mm) => millimetres(mm / k) }),
  );
  const uniqueEdges = new Set(points.map((p) => Math.round(p.at * 100)));
  let headingY = chainY + 9;
  if (uniqueEdges.size > 2) {
    const all = points.map((p) => p.at);
    parts.push(
      dimensionChain({
        axis: 'x',
        at: chainY + 6,
        points: [{ at: Math.min(...all) }, { at: Math.max(...all) }],
        format: (mm) => millimetres(mm / k),
      }),
    );
    headingY += 6;
  }

  parts.push(viewHeading((X(minX) + X(maxX)) / 2, headingY, f.rubrik));

  return { width, height: headingY + 3, svg: group(parts, { class: 'fasad' }) };
}

export function renderFasadritning(p: FasadritningParams, context: DrawingContext): string {
  const k = 1000 / p.skala;
  const id = idSafe(context.idPrefix);
  const groundId = `${id}-mark`;
  const defs = [hatchPattern(groundId, { angle: 45, spacing: 1.1, width: LINE.hair })];
  const facades = p.fasader.map((f) => renderFacade(f, k, groundId));

  const footerLines = [
    'BH = byggnadshöjd, NH = nockhöjd.',
    'Höjder i meter över medelmarknivå (±0,00).',
    'Mått i millimeter. Ny del ritas med grövre linje.',
  ];
  const footer = {
    width: Math.max(...footerLines.map((l) => textWidth(l, TEXT.small))),
    height: footerLines.length * 3.4 + 5,
    svg: group([
      label(0, TEXT.normal, 'Anmärkningar', { size: TEXT.normal, weight: 'bold' }),
      ...footerLines.map((l, i) => label(0, 7.5 + i * 3.4, l, { size: TEXT.small })),
    ]),
  };

  const gap = 18;
  let content: { width: number; height: number; svg: string };
  if (facades.length === 1) {
    content = facades[0]!;
  } else {
    const [a, b] = facades as [Rendered, Rendered];
    const side = {
      width: a.width + gap + b.width,
      height: Math.max(a.height, b.height),
      svg: group([
        group([a.svg], {
          transform: `translate(0 ${(Math.max(a.height, b.height) - a.height).toFixed(2)})`,
        }),
        group([b.svg], {
          transform: `translate(${(a.width + gap).toFixed(2)} ${(Math.max(a.height, b.height) - b.height).toFixed(2)})`,
        }),
      ]),
    };
    const stackedWidth = Math.max(a.width, b.width);
    const stacked = {
      width: stackedWidth,
      height: a.height + gap + b.height,
      svg: group([
        group([a.svg], { transform: `translate(${((stackedWidth - a.width) / 2).toFixed(2)} 0)` }),
        group([b.svg], {
          transform: `translate(${((stackedWidth - b.width) / 2).toFixed(2)} ${(a.height + gap).toFixed(2)})`,
        }),
      ]),
    };
    const sideIndex = sheetIndex({ ...side, footer });
    const stackedIndex = sheetIndex({ ...stacked, footer });
    content =
      stackedIndex !== -1 && (sideIndex === -1 || stackedIndex < sideIndex) ? stacked : side;
  }

  return composeSheet({
    content: { ...content, footer },
    defs,
    title: titleData(context, p.ritningshuvud, { ritningstyp: 'Fasadritning', skala: p.skala }),
    description: `${context.titel}, ${shortProperty(context.fastighet)}`,
  });
}

/** Ridge height of a facade part, as drawn. */
export function ridgeHeight(part: FacadePart): number {
  return geometry(part).nock;
}
