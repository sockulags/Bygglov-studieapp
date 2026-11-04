import { idSafe, shortProperty, titleData, type DrawingContext } from './context';
import type { Rectangle, Side, SituationsplanParams } from './schema';
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
  legend,
  line,
  northArrow,
  rect,
  scaleBar,
  sv,
  textBlock,
  textWidth,
  type ChainPoint,
} from './svg';

/** Paper distance (mm) from the plot to the edge of the drawn surroundings. */
const SURROUNDINGS_MM = 34;

interface Building {
  r: Rectangle;
  lines: string[];
  kind: 'befintlig' | 'ny' | 'ovrig';
}

const isHorizontalSide = (s: Side) => s === 'norr' || s === 'soder';

/** Font size that makes every line fit inside `width` mm. */
function fitSize(lines: string[], width: number, preferred: number, min = 1.4): number {
  const widest = Math.max(...lines.map((l) => textWidth(l, 1)));
  return Math.max(min, Math.min(preferred, (width - 1.2) / widest));
}

export function renderSituationsplan(p: SituationsplanParams, context: DrawingContext): string {
  const k = 1000 / p.skala;
  const W = p.tomt_bredd;
  const D = p.tomt_djup;
  const id = idSafe(context.idPrefix);
  const street = p.gata;
  const margin = SURROUNDINGS_MM / k;
  const extra = (s: Side) => (street?.sida === s ? street.bredd : 0);

  const x0 = -margin - extra('vaster');
  const x1 = W + margin + extra('oster');
  const y0 = -margin - extra('norr');
  const y1 = D + margin + extra('soder');
  const X = (x: number) => (x - x0) * k;
  const Y = (y: number) => (y - y0) * k;
  const width = (x1 - x0) * k;
  const height = (y1 - y0) * k;
  const mm = (paper: number) => paper / k; // paper mm → metres

  const ids = {
    clip: `${id}-vy`,
    prick: `${id}-prickmark`,
    ny: `${id}-ny`,
  };
  const defs = [
    el('clipPath', { id: ids.clip }, rect(0, 0, width, height)),
    hatchPattern(ids.prick, { angle: 45, spacing: 1.6, width: LINE.hair }),
    hatchPattern(ids.ny, { angle: -45, spacing: 0.9, width: LINE.hair }),
  ];

  const buildings: Building[] = [
    ...p.ovriga_byggnader.map(
      (b): Building => ({
        r: b.rektangel,
        lines: b.namn ? b.namn.split(/\s+(?=\S)/).slice(0, 3) : [],
        kind: 'ovrig',
      }),
    ),
    { r: p.hus, lines: ['Befintligt', 'bostadshus'], kind: 'befintlig' },
  ];
  if (p.tillbyggnad) buildings.push({ r: p.tillbyggnad, lines: ['Ny', 'tillbyggnad'], kind: 'ny' });
  if (p.komplementbyggnad)
    buildings.push({ r: p.komplementbyggnad, lines: ['Ny komplement-', 'byggnad'], kind: 'ny' });

  const parts: string[] = [];
  const clipped: string[] = [];

  // Neighbouring houses.
  for (const [x, y, w, d] of p.grannhus) {
    clipped.push(
      rect(X(x), Y(y), w * k, d * k, {
        fill: '#ececec',
        stroke: INK,
        'stroke-width': LINE.normal,
      }),
    );
  }

  // Street band and its edges.
  if (street) {
    const s = street.sida;
    const b = street.bredd;
    const edges: [number, number, number, number][] = [];
    if (s === 'soder') edges.push([x0, D + b, x1, D + b]);
    if (s === 'norr') edges.push([x0, -b, x1, -b]);
    if (s === 'vaster') edges.push([-b, y0, -b, y1]);
    if (s === 'oster') edges.push([W + b, y0, W + b, y1]);
    for (const [ax, ay, bx, by] of edges)
      clipped.push(line(X(ax), Y(ay), X(bx), Y(by), LINE.medium));
    const horizontal = isHorizontalSide(s);
    const cx = horizontal ? (X(x0) + X(x1)) / 2 : X(s === 'vaster' ? -b / 2 : W + b / 2);
    const cy = horizontal ? Y(s === 'norr' ? -b / 2 : D + b / 2) : (Y(y0) + Y(y1)) / 2;
    const rotate = horizontal ? 0 : -90;
    const nameSize = Math.min(TEXT.label, b * k * 0.38);
    const offset = street.fastighet ? nameSize * 0.55 : 0;
    parts.push(
      label(horizontal ? cx : cx - offset, horizontal ? cy - offset : cy, street.namn.toUpperCase(), {
        anchor: 'middle',
        baseline: 'middle',
        size: nameSize,
        letterSpacing: nameSize * 0.25,
        rotate,
      }),
    );
    if (street.fastighet) {
      parts.push(
        label(
          horizontal ? cx : cx + nameSize * 0.75,
          horizontal ? cy + nameSize * 0.75 : cy,
          street.fastighet,
          { anchor: 'middle', baseline: 'middle', size: TEXT.small, italic: true, rotate },
        ),
      );
    }
  }

  // Neighbouring property lines: the plot's edges extended, interrupted by the street.
  const streetBand = (s: Side): [number, number] | undefined => {
    if (!street || street.sida !== s) return undefined;
    if (s === 'soder') return [D, D + street.bredd];
    if (s === 'norr') return [-street.bredd, 0];
    if (s === 'vaster') return [-street.bredd, 0];
    return [W, W + street.bredd];
  };
  const spans = (from: number, to: number, holes: ([number, number] | undefined)[]) => {
    let result: [number, number][] = [[from, to]];
    for (const hole of holes) {
      if (!hole) continue;
      result = result.flatMap(([a, b]): [number, number][] => {
        if (hole[1] <= a || hole[0] >= b) return [[a, b]];
        const out: [number, number][] = [];
        if (hole[0] > a) out.push([a, hole[0]]);
        if (hole[1] < b) out.push([hole[1], b]);
        return out;
      });
    }
    return result;
  };
  for (const x of [0, W]) {
    for (const [a, b] of spans(y0, y1, [streetBand('norr'), streetBand('soder')]))
      clipped.push(line(X(x), Y(a), X(x), Y(b), LINE.thin));
  }
  for (const y of [0, D]) {
    for (const [a, b] of spans(x0, x1, [streetBand('vaster'), streetBand('oster')]))
      clipped.push(line(X(a), Y(y), X(b), Y(y), LINE.thin));
  }
  parts.push(group(clipped, { 'clip-path': `url(#${ids.clip})` }));

  // Prickmark.
  const zoneRect = (s: Side, depth: number): Rectangle => {
    if (s === 'norr') return [0, 0, W, depth];
    if (s === 'soder') return [0, D - depth, W, depth];
    if (s === 'vaster') return [0, 0, depth, D];
    return [W - depth, 0, depth, D];
  };
  for (const zone of p.prickmark) {
    const [x, y, w, d] = zoneRect(zone.sida, zone.djup);
    parts.push(rect(X(x), Y(y), w * k, d * k, { fill: `url(#${ids.prick})` }));
  }

  // Plot boundary.
  parts.push(
    rect(X(0), Y(0), W * k, D * k, {
      fill: 'none',
      stroke: INK,
      'stroke-width': LINE.bold,
      'stroke-dasharray': '7 1.2 1.2 1.2',
    }),
  );

  // Buildings.
  for (const b of buildings) {
    const [x, y, w, d] = b.r;
    parts.push(rect(X(x), Y(y), w * k, d * k, { fill: PAPER }));
    if (b.kind === 'ny') parts.push(rect(X(x), Y(y), w * k, d * k, { fill: `url(#${ids.ny})` }));
    parts.push(
      rect(X(x), Y(y), w * k, d * k, {
        fill: 'none',
        stroke: INK,
        'stroke-width': b.kind === 'ny' ? LINE.bold : b.kind === 'befintlig' ? LINE.heavy : LINE.medium,
      }),
    );
  }

  // Prickmark boundaries on top, so an intrusion shows across the building.
  for (const zone of p.prickmark) {
    const d = zone.djup;
    const seg: [number, number, number, number] =
      zone.sida === 'norr'
        ? [0, d, W, d]
        : zone.sida === 'soder'
          ? [0, D - d, W, D - d]
          : zone.sida === 'vaster'
            ? [d, 0, d, D]
            : [W - d, 0, W - d, D];
    parts.push(
      line(X(seg[0]), Y(seg[1]), X(seg[2]), Y(seg[3]), LINE.medium, {
        'stroke-dasharray': '2.4 1.2',
      }),
    );
    const [zx, zy, zw, zh] = zoneRect(zone.sida, d);
    const text = 'Prickmark, mark som inte får bebyggas';
    if (isHorizontalSide(zone.sida)) {
      parts.push(
        label(X(zx) + 2, Y(zone.sida === 'soder' ? zy + zh : zy + zh) - 1.6, text, {
          size: TEXT.small,
          halo: true,
        }),
      );
    } else {
      parts.push(
        label(X(zx + zw / 2) + TEXT.small * 0.35, Y(zy) + 2 + textWidth(text, TEXT.small), text, {
          size: TEXT.small,
          halo: true,
          rotate: -90,
        }),
      );
    }
  }

  // Building labels.
  for (const b of buildings) {
    if (b.lines.length === 0) continue;
    const [x, y, w, d] = b.r;
    const size = fitSize(b.lines, w * k, 2.2);
    if (size * b.lines.length * 1.25 > d * k) continue;
    parts.push(
      textBlock(X(x + w / 2), Y(y + d / 2), b.lines, {
        size,
        halo: b.kind === 'ny',
        firstBold: false,
      }),
    );
  }

  // Property labels.
  const own = p.fastighet ?? shortProperty(context.fastighet);
  const house = p.hus;
  const ownY = house[1] * k > 14 ? house[1] / 2 : (house[1] + house[3] + D) / 2;
  parts.push(
    label(X(W / 2), Y(ownY), own, {
      anchor: 'middle',
      baseline: 'middle',
      size: TEXT.heading,
      weight: 'bold',
      halo: true,
    }),
  );
  const neighbourOffset = (s: Side) => extra(s) + margin * 0.55;
  const neighbourAt: Record<Side, [number, number]> = {
    norr: [W / 2, -neighbourOffset('norr')],
    soder: [W / 2, D + neighbourOffset('soder')],
    vaster: [-neighbourOffset('vaster') - mm(4), D / 2],
    oster: [W + neighbourOffset('oster') + mm(2), D / 2],
  };
  for (const s of ['norr', 'oster', 'soder', 'vaster'] as const) {
    const name = p.grannar[s];
    if (!name) continue;
    const [nx, ny] = neighbourAt[s];
    parts.push(
      label(X(nx), Y(ny), name, {
        anchor: 'middle',
        baseline: 'middle',
        size: TEXT.label,
        halo: true,
      }),
    );
  }

  // Dimensions (metres).
  const metres = (lengthMm: number) => sv(lengthMm / k, 1);
  const chains: string[] = [];
  const horizontalChain = (y: number, r: Rectangle, fromY: number) =>
    dimensionChain({
      axis: 'x',
      at: Y(y),
      points: [
        { at: X(0) },
        { at: X(r[0]), from: Y(fromY) },
        { at: X(r[0] + r[2]), from: Y(fromY) },
        { at: X(W) },
      ],
      format: metres,
    });
  const houseCenter = house[1] + house[3] / 2;
  if (house[1] * k >= 14) {
    chains.push(horizontalChain(house[1] - mm(6), house, house[1]));
  } else {
    chains.push(horizontalChain(house[1] + house[3] + mm(6), house, house[1] + house[3]));
  }
  for (const b of buildings.filter((x) => x.kind === 'ny')) {
    const [, y, , d] = b.r;
    const below = y + d / 2 > houseCenter;
    chains.push(
      below
        ? horizontalChain(y + d + mm(4), b.r, y + d)
        : horizontalChain(y - mm(4), b.r, y),
    );
  }

  // One vertical chain on the side with more room, collecting every building edge.
  const measured = buildings.filter((b) => b.kind !== 'ovrig');
  const right = Math.max(...measured.map((b) => b.r[0] + b.r[2]));
  const left = Math.min(...measured.map((b) => b.r[0]));
  const east = W - right >= left - 1;
  // Between the buildings and the boundary, a little closer to the boundary.
  const chainX = east ? right + (W - right) * 0.6 : left * 0.4;
  const edges = new Map<number, number>();
  for (const b of measured) {
    const [x, y, w, d] = b.r;
    const face = east ? x + w : x;
    for (const at of [y, y + d]) {
      const key = Math.round(at * 1000) / 1000;
      const current = edges.get(key);
      const better =
        current === undefined || (east ? face > current : face < current);
      if (better) edges.set(key, face);
    }
  }
  const verticalPoints: ChainPoint[] = [{ at: Y(0) }, { at: Y(D) }];
  for (const [at, face] of edges) verticalPoints.push({ at: Y(at), from: X(face) });
  chains.push(
    dimensionChain({
      axis: 'y',
      at: X(chainX),
      points: verticalPoints,
      format: metres,
      textSide: east ? 'before' : 'after',
    }),
  );

  // Plot dimensions outside the plot, broken at prickmark boundaries.
  const outerChains = (axis: 'x' | 'y') => {
    const size = axis === 'x' ? W : D;
    const breaks = p.prickmark
      .filter((z) => (axis === 'x' ? !isHorizontalSide(z.sida) : isHorizontalSide(z.sida)))
      .map((z) => (z.sida === 'norr' || z.sida === 'vaster' ? z.djup : size - z.djup));
    const toPaper = axis === 'x' ? X : Y;
    const lineAt = (offsetMm: number) => (axis === 'x' ? Y(0) - offsetMm : X(0) - offsetMm);
    const out: string[] = [];
    if (breaks.length > 0) {
      out.push(
        dimensionChain({
          axis,
          at: lineAt(5),
          points: [0, ...breaks, size].map((v) => ({ at: toPaper(v) })),
          format: metres,
        }),
      );
    }
    out.push(
      dimensionChain({
        axis,
        at: lineAt(breaks.length > 0 ? 10 : 5),
        points: [{ at: toPaper(0) }, { at: toPaper(size) }],
        format: metres,
      }),
    );
    return out;
  };
  chains.push(...outerChains('x'), ...outerChains('y'));
  parts.push(group(chains, { class: 'matt' }));

  // North arrow and scale bar.
  parts.push(northArrow(width - 9, 12, p.norr_vinkel));
  const bar = scaleBar(3, 5, k, p.skala, 36);
  parts.push(bar.svg);
  parts.push(label(3, 14.5, 'Mått i meter', { size: TEXT.small }));

  if (p.visa_areor) {
    const plot = W * D;
    const area = (r: Rectangle) => r[2] * r[3];
    const existing =
      area(p.hus) + p.ovriga_byggnader.reduce((sum, b) => sum + area(b.rektangel), 0);
    const added =
      (p.tillbyggnad ? area(p.tillbyggnad) : 0) +
      (p.komplementbyggnad ? area(p.komplementbyggnad) : 0);
    const rows = [
      `Tomtarea ${sv(plot, 1)} m²`,
      `Byggnadsarea befintlig ${sv(existing, 1)} m²`,
      `Byggnadsarea ny ${sv(added, 1)} m²`,
      `Byggnadsarea totalt ${sv(existing + added, 1)} m² (${sv(((existing + added) / plot) * 100, 1)} %)`,
    ];
    rows.forEach((row, i) =>
      parts.push(label(4, height - 14 - (rows.length - 1 - i) * 3, row, { size: TEXT.small, halo: true })),
    );
  }

  const entries = [
    { swatch: { type: 'fill' as const, fill: PAPER, strokeWidth: LINE.heavy }, text: 'Befintlig byggnad' },
    {
      swatch: { type: 'fill' as const, fill: `url(#${ids.ny})`, strokeWidth: LINE.bold },
      text: 'Ny byggnad eller tillbyggnad',
    },
    ...(p.prickmark.length > 0
      ? [
          {
            swatch: {
              type: 'fill' as const,
              fill: `url(#${ids.prick})`,
              strokeWidth: LINE.medium,
              dash: '2.4 1.2',
            },
            text: 'Prickmark (enligt detaljplan)',
          },
        ]
      : []),
    { swatch: { type: 'line' as const, width: LINE.bold, dash: '7 1.2 1.2 1.2' }, text: 'Tomtgräns' },
    { swatch: { type: 'line' as const, width: LINE.thin }, text: 'Fastighetsgräns, grannar' },
    ...(p.grannhus.length > 0
      ? [{ swatch: { type: 'fill' as const, fill: '#ececec', strokeWidth: LINE.normal }, text: 'Byggnad på grannfastighet' }]
      : []),
  ];
  const footer = legend(0, 0, 'Teckenförklaring', entries, { rowHeight: 5 });

  return composeSheet({
    content: {
      width,
      height,
      svg: group(parts),
      footer: { width: footer.width, height: footer.height, svg: footer.svg },
    },
    defs,
    title: titleData(context, p.ritningshuvud, { ritningstyp: 'Situationsplan', skala: p.skala }),
    description: `${context.titel}, ${shortProperty(context.fastighet)}`,
  });
}
