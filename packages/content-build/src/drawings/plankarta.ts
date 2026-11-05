import { idSafe, shortProperty, titleData, type DrawingContext } from './context';
import {
  PUBLIC_USE_LABELS,
  type Block,
  type PlankartaParams,
  type Rectangle,
  type Side,
} from './schema';
import {
  INK,
  LINE,
  PAPER,
  TEXT,
  composeSheet,
  dotPattern,
  el,
  group,
  label,
  legend,
  line,
  northArrow,
  rect,
  scaleBar,
  sv,
  textWidth,
  type LegendEntry,
} from './svg';

const GRID = '#777';
const PLAN_BOUNDARY_DASH = '4.5 1.2 1 1.2 1 1.2';
const USE_BOUNDARY_DASH = '3.5 1 1 1';
const PROPERTY_DASH = '2.4 1.2';

/** The strip of `r` along `side` with depth `depth`. */
function strip(r: Rectangle, side: Side, depth: number): Rectangle {
  const [x, y, w, d] = r;
  if (side === 'norr') return [x, y, w, depth];
  if (side === 'soder') return [x, y + d - depth, w, depth];
  if (side === 'vaster') return [x, y, depth, d];
  return [x + w - depth, y, depth, d];
}

/** Inner edge of a strip, as a line. */
function innerEdge(r: Rectangle, side: Side, depth: number): [number, number, number, number] {
  const [x, y, w, d] = r;
  if (side === 'norr') return [x, y + depth, x + w, y + depth];
  if (side === 'soder') return [x, y + d - depth, x + w, y + d - depth];
  if (side === 'vaster') return [x + depth, y, x + depth, y + d];
  return [x + w - depth, y, x + w - depth, y + d];
}

/** "e₁" drawn with a lowered index, as on Swedish plan maps. */
function indexed(x: number, y: number, base: string, index: string, size: number): string {
  return el(
    'text',
    { x, y, 'font-size': size, 'font-style': 'italic', 'text-anchor': 'middle', fill: INK },
    `${base}${el('tspan', { dy: size * 0.3, 'font-size': size * 0.7 }, index)}`,
  );
}

interface PlanSymbol {
  text: string;
  sub?: string;
  italic?: boolean;
  bold?: boolean;
}

const ROMAN: [number, string][] = [
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

/** 4 → "IV", as storeys are written on Swedish plan maps. */
export function roman(value: number): string {
  let rest = value;
  let out = '';
  for (const [n, s] of ROMAN) {
    while (rest >= n) {
      out += s;
      rest -= n;
    }
  }
  return out;
}

/** "m1" → letters with the trailing number as an index. */
function splitDesignation(value: string): PlanSymbol {
  const match = /^(\D+?)(\d+)$/.exec(value);
  return match ? { text: match[1]!, sub: match[2]!, italic: true } : { text: value, italic: true };
}

/** Index of the e-provision per building-area percentage, in order of appearance (e₁, e₂ …). */
function areaIndex(blocks: Block[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const b of blocks) {
    if (b.byggnadsarea_procent !== undefined && !map.has(b.byggnadsarea_procent)) {
      map.set(b.byggnadsarea_procent, map.size + 1);
    }
  }
  return map;
}

function blockSymbols(b: Block, areas: Map<number, number>): PlanSymbol[] {
  const symbols: PlanSymbol[] = [{ text: b.anvandning, bold: true }];
  if (b.byggnadsarea_procent !== undefined) {
    symbols.push({ text: 'e', sub: String(areas.get(b.byggnadsarea_procent)), italic: true });
  }
  if (b.vaningar !== undefined) symbols.push({ text: roman(b.vaningar) });
  if (b.byggnadshojd !== undefined) symbols.push({ text: sv(b.byggnadshojd, 1) });
  if (b.nockhojd !== undefined) symbols.push({ text: `NH ${sv(b.nockhojd, 1)}` });
  for (const extra of b.bestammelser) symbols.push(splitDesignation(extra.beteckning));
  return symbols;
}

export function renderPlankarta(p: PlankartaParams, context: DrawingContext): string {
  const k = 1000 / p.skala;
  const id = idSafe(context.idPrefix);
  const dotsId = `${id}-prickmark`;
  const defs = [dotPattern(dotsId, { spacing: 1.4, radius: 0.17 })];
  const [ox, oy, ow, od] = p.omrade;
  const margin = 8;
  const X = (x: number) => margin + (x - ox) * k;
  const Y = (y: number) => margin + (y - oy) * k;
  const mapW = ow * k + 2 * margin;
  const mapH = od * k + 2 * margin;
  const parts: string[] = [];
  const areas = areaIndex(p.kvarter);

  // Base map: property boundaries and numbers (grey, as on the underlying map).
  const base: string[] = [];
  for (const b of p.kvarter) {
    for (const f of b.fastigheter) {
      const [x, y, w, d] = f.rektangel;
      base.push(
        rect(X(x), Y(y), w * k, d * k, { fill: 'none', stroke: GRID, 'stroke-width': LINE.hair }),
      );
    }
  }

  // Prickmark per property (or per block when no properties are given).
  for (const b of p.kvarter) {
    const areas = b.fastigheter.length > 0 ? b.fastigheter.map((f) => f.rektangel) : [b.rektangel];
    for (const zone of b.prickmark) {
      for (const r of areas) {
        const [x, y, w, d] = strip(r, zone.sida, zone.djup);
        parts.push(rect(X(x), Y(y), w * k, d * k, { fill: `url(#${dotsId})` }));
      }
      const [x1, y1, x2, y2] = innerEdge(b.rektangel, zone.sida, zone.djup);
      parts.push(
        line(X(x1), Y(y1), X(x2), Y(y2), LINE.thin, { 'stroke-dasharray': PROPERTY_DASH }),
      );
    }
  }
  parts.unshift(group(base, { class: 'grundkarta' }));

  // Public places.
  for (const place of p.allmanna_platser) {
    const [x, y, w, d] = place.rektangel;
    parts.push(
      rect(X(x), Y(y), w * k, d * k, {
        fill: 'none',
        stroke: INK,
        'stroke-width': LINE.thin,
        'stroke-dasharray': USE_BOUNDARY_DASH,
      }),
    );
    const horizontal = w >= d;
    const cx = X(x + w / 2);
    const cy = Y(y + d / 2);
    const rotate = horizontal ? 0 : -90;
    parts.push(
      label(cx, cy - (place.namn ? 1.6 : 0), place.anvandning, {
        anchor: 'middle',
        baseline: 'middle',
        size: TEXT.label,
        weight: 'bold',
        rotate,
        halo: true,
      }),
    );
    if (place.namn) {
      parts.push(
        label(cx, cy + 2.4, place.namn, {
          anchor: 'middle',
          baseline: 'middle',
          size: TEXT.small,
          italic: true,
          rotate,
          halo: true,
        }),
      );
    }
  }

  // Blocks: use boundary, block name, property numbers and plan symbols.
  for (const b of p.kvarter) {
    const [x, y, w, d] = b.rektangel;
    parts.push(
      rect(X(x), Y(y), w * k, d * k, {
        fill: 'none',
        stroke: INK,
        'stroke-width': LINE.medium,
        'stroke-dasharray': USE_BOUNDARY_DASH,
      }),
    );
    // Free band for texts: away from the prickmark side.
    const southPrick = b.prickmark.some((z) => z.sida === 'soder');
    const northPrick = b.prickmark.some((z) => z.sida === 'norr');
    const bandY =
      southPrick && !northPrick
        ? y + d * 0.28
        : northPrick && !southPrick
          ? y + d * 0.72
          : y + d / 2;
    for (const f of b.fastigheter) {
      const [fx, fy, fw, fd] = f.rektangel;
      if (f.markerad) {
        parts.push(
          rect(X(fx) + 0.6, Y(fy) + 0.6, fw * k - 1.2, fd * k - 1.2, {
            fill: 'none',
            stroke: INK,
            'stroke-width': LINE.heavy,
          }),
        );
      }
      parts.push(
        label(X(fx + fw / 2), Y(bandY) - 3.6, f.beteckning, {
          anchor: 'middle',
          size: TEXT.normal,
          fill: GRID,
          italic: true,
        }),
      );
    }
    const nameY =
      southPrick && !northPrick
        ? y + d * 0.6
        : northPrick && !southPrick
          ? y + d * 0.42
          : y + d * 0.8;
    parts.push(
      label(X(x + w / 2), Y(nameY), b.namn.toUpperCase(), {
        anchor: 'middle',
        baseline: 'middle',
        size: TEXT.normal,
        italic: true,
        letterSpacing: 1.2,
        fill: GRID,
        halo: true,
      }),
    );
    // One symbol cluster per property, or one for the block.
    const anchors =
      b.fastigheter.length > 0
        ? b.fastigheter.map((f) => f.rektangel[0] + f.rektangel[2] / 2)
        : [x + w / 2];
    const symbols = blockSymbols(b, areas);
    const size = TEXT.label;
    const gapMm = 1.6;
    const widths = symbols.map((s) => textWidth(s.text + (s.sub ?? ''), size, s.bold));
    const total = widths.reduce((sum, v) => sum + v, 0) + gapMm * (symbols.length - 1);
    for (const ax of anchors) {
      let cursor = X(ax) - total / 2;
      symbols.forEach((s, i) => {
        const cx = cursor + widths[i]! / 2;
        if (s.sub) parts.push(indexed(cx, Y(bandY) + 2.4, s.text, s.sub, size));
        else
          parts.push(
            label(cx, Y(bandY) + 2.4, s.text, {
              anchor: 'middle',
              size,
              weight: s.bold ? 'bold' : 'normal',
            }),
          );
        cursor += widths[i]! + gapMm;
      });
    }
  }

  // Plan boundary.
  parts.push(
    rect(X(ox) - 1, Y(oy) - 1, ow * k + 2, od * k + 2, {
      fill: 'none',
      stroke: INK,
      'stroke-width': LINE.bold,
      'stroke-dasharray': PLAN_BOUNDARY_DASH,
    }),
  );

  // Legend to the right of the map.
  const lx = mapW + 10;
  const heights = [
    ...new Set(p.kvarter.flatMap((b) => (b.byggnadshojd === undefined ? [] : [b.byggnadshojd]))),
  ];
  const uses = [...new Set(p.kvarter.map((b) => b.anvandning))];
  const publicUses = [...new Set(p.allmanna_platser.map((a) => a.anvandning))];
  const entries: LegendEntry[] = [
    {
      swatch: { type: 'line', width: LINE.bold, dash: PLAN_BOUNDARY_DASH },
      text: 'Planområdesgräns',
    },
    {
      swatch: { type: 'line', width: LINE.medium, dash: USE_BOUNDARY_DASH },
      text: 'Användningsgräns',
    },
    { swatch: { type: 'line', width: LINE.thin, dash: PROPERTY_DASH }, text: 'Egenskapsgräns' },
    ...publicUses.map((u): LegendEntry => ({
      swatch: { type: 'symbol', text: u, weight: 'bold' },
      text: `${PUBLIC_USE_LABELS[u]}, allmän plats`,
    })),
    ...uses.map((u): LegendEntry => ({
      swatch: { type: 'symbol', text: u, weight: 'bold' },
      text: u === 'B' ? 'Bostadsändamål, kvartersmark' : 'Kvartersmark',
    })),
  ];
  if (p.kvarter.some((b) => b.prickmark.length > 0)) {
    entries.push({
      swatch: { type: 'fill', fill: `url(#${dotsId})`, strokeWidth: LINE.hair },
      text: 'Marken får inte bebyggas (prickmark)',
    });
  }
  for (const [percent, index] of areas) {
    entries.push({
      swatch: { type: 'symbol', text: `e${index}`, italic: true },
      text: `Största byggnadsarea ${sv(percent, 0)} % av fastighetsarean`,
    });
  }
  const storeys = [
    ...new Set(p.kvarter.flatMap((b) => (b.vaningar === undefined ? [] : [b.vaningar]))),
  ];
  for (const v of storeys) {
    entries.push({ swatch: { type: 'symbol', text: roman(v) }, text: 'Högsta antal våningar' });
  }
  for (const h of heights) {
    entries.push({
      swatch: { type: 'symbol', text: sv(h, 1) },
      text: 'Högsta byggnadshöjd i meter',
    });
  }
  const ridges = [
    ...new Set(p.kvarter.flatMap((b) => (b.nockhojd === undefined ? [] : [b.nockhojd]))),
  ];
  for (const h of ridges) {
    entries.push({
      swatch: { type: 'symbol', text: `NH ${sv(h, 1)}` },
      text: 'Högsta nockhöjd i meter',
    });
  }
  const seen = new Set<string>();
  for (const b of p.kvarter) {
    for (const extra of b.bestammelser) {
      if (seen.has(extra.beteckning)) continue;
      seen.add(extra.beteckning);
      entries.push({
        swatch: { type: 'symbol', text: extra.beteckning, italic: true },
        text: extra.text,
      });
    }
  }
  entries.push({
    swatch: { type: 'line', width: LINE.hair, color: GRID },
    text: 'Fastighetsgräns (grundkarta)',
  });
  if (p.kvarter.some((b) => b.fastigheter.some((f) => f.markerad))) {
    entries.push({
      swatch: { type: 'fill', fill: PAPER, strokeWidth: LINE.heavy },
      text: 'Fastighet som ansökan avser',
    });
  }
  const leg = legend(lx, 22, 'Planbestämmelser', entries, { rowHeight: 5.4, size: TEXT.small });
  const planLines = [
    p.plan.namn,
    `${p.plan.beteckning}${p.plan.laga_kraft ? `, laga kraft ${p.plan.laga_kraft}` : ''}`,
    ...(p.plan.anmarkning ? [p.plan.anmarkning] : []),
  ];
  const header = [
    label(lx, 8, planLines[0]!, { size: TEXT.normal, weight: 'bold' }),
    ...planLines.slice(1).map((l, i) => label(lx, 12.5 + i * 3.6, l, { size: TEXT.small })),
  ];
  // Legend symbols like "e1" and "m1": draw the index properly over the plain symbol text.
  const indexedSymbols = new Set([
    ...[...areas.values()].map((i) => `e${i}`),
    ...p.kvarter.flatMap((b) => b.bestammelser.map((x) => x.beteckning)),
  ]);
  const legendSvg = leg.svg.replace(
    /<text([^>]*font-style="italic"[^>]*)>([^<]+)<\/text>/g,
    (whole, attrs: string, value: string) => {
      const symbol = splitDesignation(value);
      if (!indexedSymbols.has(value) || !symbol.sub) return whole;
      return `<text${attrs}>${symbol.text}${el('tspan', { dy: TEXT.normal * 0.3, 'font-size': TEXT.normal * 0.7 }, symbol.sub)}</text>`;
    },
  );
  const legendWidth = Math.max(
    leg.width,
    ...planLines.map((l, i) => textWidth(l, i === 0 ? TEXT.normal : TEXT.small, i === 0)),
  );
  parts.push(...header, legendSvg);

  const bar = scaleBar(lx, 22 + leg.height + 8, k, p.skala, 40);
  parts.push(bar.svg);
  parts.push(northArrow(lx + bar.width + 10, 22 + leg.height + 10, p.norr_vinkel, 4.5));

  const width = lx + Math.max(legendWidth, bar.width + 18);
  const height = Math.max(mapH, 22 + leg.height + 8 + bar.height + 4);

  return composeSheet({
    content: { width, height, svg: group(parts) },
    defs,
    title: titleData(context, p.ritningshuvud, { ritningstyp: 'Plankarta', skala: p.skala }),
    description: `${context.titel}, ${shortProperty(context.fastighet)}`,
    scale: p.skala,
    origin: [X(0), Y(0)],
  });
}
