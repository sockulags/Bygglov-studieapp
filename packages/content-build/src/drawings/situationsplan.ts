import { idSafe, shortProperty, titleData, type DrawingContext } from './context';
import type { Rectangle, Side, SituationsplanParams } from './schema';
import {
  INK,
  LINE,
  PAPER,
  TEXT,
  composeSheet,
  dimensionChain,
  dotPattern,
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

/** Axis-aligned box in metres: [x0, y0, x1, y1]. */
type Box = [number, number, number, number];

const boxOf = (r: Rectangle, pad = 0): Box => [
  r[0] - pad,
  r[1] - pad,
  r[0] + r[2] + pad,
  r[1] + r[3] + pad,
];

const overlaps = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/** Removes the `holes` from [from, to] and returns what is left. */
function spans(
  from: number,
  to: number,
  holes: ([number, number] | undefined)[],
): [number, number][] {
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
}

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
  const shore = p.strandlinje;
  const margin = SURROUNDINGS_MM / k;
  const mm = (paper: number) => paper / k; // paper mm → metres
  const extra = (s: Side) => (street?.sida === s ? street.bredd : 0);
  // How far the drawn surroundings reach beyond the boundary on each side.
  const reach = (s: Side) => {
    const base = margin + extra(s);
    return shore?.sida === s ? Math.max(base, shore.avstand + mm(16)) : base;
  };

  const x0 = -reach('vaster');
  const x1 = W + reach('oster');
  const y0 = -reach('norr');
  const y1 = D + reach('soder');
  const X = (x: number) => (x - x0) * k;
  const Y = (y: number) => (y - y0) * k;
  const width = (x1 - x0) * k;
  const height = (y1 - y0) * k;

  const ids = {
    clip: `${id}-vy`,
    prick: `${id}-prickmark`,
    ny: `${id}-ny`,
    utfart: `${id}-utfart`,
    vatten: `${id}-vatten`,
  };
  const defs = [
    el('clipPath', { id: ids.clip }, rect(0, 0, width, height)),
    hatchPattern(ids.prick, { angle: 45, spacing: 1.6, width: LINE.hair }),
    hatchPattern(ids.ny, { angle: -45, spacing: 0.9, width: LINE.hair }),
  ];
  if (p.utfart) defs.push(dotPattern(ids.utfart, { spacing: 1.2, radius: 0.12 }));
  if (shore) defs.push(hatchPattern(ids.vatten, { angle: 90, spacing: 1.4, width: LINE.hair }));

  // The main building is the existing house, or the new house on an empty plot.
  const main: Rectangle = p.hus ?? (p.nybyggnad as Rectangle);

  const buildings: Building[] = [
    ...p.ovriga_byggnader.map((b): Building => ({
      r: b.rektangel,
      lines: b.namn ? b.namn.split(/\s+(?=\S)/).slice(0, 3) : [],
      kind: 'ovrig',
    })),
  ];
  if (p.hus) buildings.push({ r: p.hus, lines: ['Befintligt', 'bostadshus'], kind: 'befintlig' });
  if (p.nybyggnad) buildings.push({ r: p.nybyggnad, lines: ['Nytt', 'bostadshus'], kind: 'ny' });
  if (p.tillbyggnad) buildings.push({ r: p.tillbyggnad, lines: ['Ny', 'tillbyggnad'], kind: 'ny' });
  if (p.komplementbyggnad)
    buildings.push({ r: p.komplementbyggnad, lines: ['Ny komplement-', 'byggnad'], kind: 'ny' });

  const parts: string[] = [];
  const clipped: string[] = [];

  // Shoreline and water beyond it.
  const shoreAt = shore
    ? shore.sida === 'norr'
      ? -shore.avstand
      : shore.sida === 'soder'
        ? D + shore.avstand
        : shore.sida === 'vaster'
          ? -shore.avstand
          : W + shore.avstand
    : 0;
  const waterBand = (s: Side): [number, number] | undefined => {
    if (!shore || shore.sida !== s) return undefined;
    if (s === 'norr') return [y0, shoreAt];
    if (s === 'soder') return [shoreAt, y1];
    if (s === 'vaster') return [x0, shoreAt];
    return [shoreAt, x1];
  };
  if (shore) {
    const s = shore.sida;
    const band = waterBand(s) as [number, number];
    const water: Rectangle = isHorizontalSide(s)
      ? [x0, band[0], x1 - x0, band[1] - band[0]]
      : [band[0], y0, band[1] - band[0], y1 - y0];
    clipped.push(
      rect(X(water[0]), Y(water[1]), water[2] * k, water[3] * k, {
        fill: `url(#${ids.vatten})`,
      }),
    );
    clipped.push(
      isHorizontalSide(s)
        ? line(X(x0), Y(shoreAt), X(x1), Y(shoreAt), LINE.heavy)
        : line(X(shoreAt), Y(y0), X(shoreAt), Y(y1), LINE.heavy),
    );
    if (shore.namn) {
      const size = TEXT.heading;
      const cx = isHorizontalSide(s) ? (X(x0) + X(x1)) / 2 : X((band[0] + band[1]) / 2);
      const cy = isHorizontalSide(s) ? Y((band[0] + band[1]) / 2) : (Y(y0) + Y(y1)) / 2;
      parts.push(
        label(cx, cy, shore.namn.toUpperCase(), {
          anchor: 'middle',
          baseline: 'middle',
          size,
          italic: true,
          halo: true,
          letterSpacing: size * 0.3,
          rotate: isHorizontalSide(s) ? 0 : -90,
        }),
      );
    }
  }

  // Shoreline protection boundary: the shoreline moved `avstand` metres inland.
  const protectionAt =
    shore && p.strandskydd
      ? shore.sida === 'norr' || shore.sida === 'vaster'
        ? shoreAt + p.strandskydd.avstand
        : shoreAt - p.strandskydd.avstand
      : undefined;
  const protectionDash = '5 1.4 1.2 1.4 1.2 1.4';
  if (shore && protectionAt !== undefined) {
    clipped.push(
      isHorizontalSide(shore.sida)
        ? line(X(x0), Y(protectionAt), X(x1), Y(protectionAt), LINE.medium, {
            'stroke-dasharray': protectionDash,
          })
        : line(X(protectionAt), Y(y0), X(protectionAt), Y(y1), LINE.medium, {
            'stroke-dasharray': protectionDash,
          }),
    );
  }

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
      label(
        horizontal ? cx : cx - offset,
        horizontal ? cy - offset : cy,
        street.namn.toUpperCase(),
        {
          anchor: 'middle',
          baseline: 'middle',
          size: nameSize,
          letterSpacing: nameSize * 0.25,
          rotate,
        },
      ),
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

  // Neighbouring property lines: the plot's edges extended, interrupted by street and water.
  const streetBand = (s: Side): [number, number] | undefined => {
    if (!street || street.sida !== s) return undefined;
    if (s === 'soder') return [D, D + street.bredd];
    if (s === 'norr') return [-street.bredd, 0];
    if (s === 'vaster') return [-street.bredd, 0];
    return [W, W + street.bredd];
  };
  for (const x of [0, W]) {
    const holes = [streetBand('norr'), streetBand('soder'), waterBand('norr'), waterBand('soder')];
    for (const [a, b] of spans(y0, y1, holes))
      clipped.push(line(X(x), Y(a), X(x), Y(b), LINE.thin));
  }
  for (const y of [0, D]) {
    const holes = [
      streetBand('vaster'),
      streetBand('oster'),
      waterBand('vaster'),
      waterBand('oster'),
    ];
    for (const [a, b] of spans(x0, x1, holes))
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

  // Everything that labels and dimension lines should keep clear of, in metres.
  const occupied: Box[] = [];

  // Other features: thin dashed outlines.
  for (const a of p.anlaggningar) {
    const [x, y, w, d] = a.rektangel;
    parts.push(
      rect(X(x), Y(y), w * k, d * k, {
        fill: PAPER,
        stroke: INK,
        'stroke-width': LINE.normal,
        'stroke-dasharray': '1.6 0.8',
      }),
    );
    occupied.push(boxOf(a.rektangel, mm(1)));
  }

  // Driveway.
  const driveway: Rectangle | undefined = p.utfart
    ? p.utfart.sida === 'norr'
      ? [p.utfart.lage, 0, p.utfart.bredd, p.utfart.langd]
      : p.utfart.sida === 'soder'
        ? [p.utfart.lage, D - p.utfart.langd, p.utfart.bredd, p.utfart.langd]
        : p.utfart.sida === 'vaster'
          ? [0, p.utfart.lage, p.utfart.langd, p.utfart.bredd]
          : [W - p.utfart.langd, p.utfart.lage, p.utfart.langd, p.utfart.bredd]
    : undefined;
  if (driveway) {
    const [x, y, w, d] = driveway;
    parts.push(
      rect(X(x), Y(y), w * k, d * k, {
        fill: `url(#${ids.utfart})`,
        stroke: INK,
        'stroke-width': LINE.thin,
      }),
    );
    occupied.push(boxOf(driveway, mm(1)));
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
  // The driveway opens the boundary towards the street.
  if (driveway && p.utfart) {
    const u = p.utfart;
    const horizontal = isHorizontalSide(u.sida);
    const at = u.sida === 'norr' ? 0 : u.sida === 'soder' ? D : u.sida === 'vaster' ? 0 : W;
    parts.push(
      horizontal
        ? line(X(u.lage), Y(at), X(u.lage + u.bredd), Y(at), LINE.bold * 1.6, { stroke: PAPER })
        : line(X(at), Y(u.lage), X(at), Y(u.lage + u.bredd), LINE.bold * 1.6, { stroke: PAPER }),
    );
  }

  // Buildings.
  for (const b of buildings) {
    const [x, y, w, d] = b.r;
    parts.push(rect(X(x), Y(y), w * k, d * k, { fill: PAPER }));
    if (b.kind === 'ny') parts.push(rect(X(x), Y(y), w * k, d * k, { fill: `url(#${ids.ny})` }));
    parts.push(
      rect(X(x), Y(y), w * k, d * k, {
        fill: 'none',
        stroke: INK,
        'stroke-width':
          b.kind === 'ny' ? LINE.bold : b.kind === 'befintlig' ? LINE.heavy : LINE.medium,
      }),
    );
    occupied.push(boxOf(b.r, mm(1)));
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
    const textLength = mm(textWidth(text, TEXT.small));
    if (isHorizontalSide(zone.sida)) {
      parts.push(
        label(X(zx) + 2, Y(zy + zh) - 1.6, text, {
          size: TEXT.small,
          halo: true,
        }),
      );
      occupied.push([zx + mm(2), zy + zh - mm(4), zx + mm(2) + textLength, zy + zh + mm(0.5)]);
    } else {
      parts.push(
        label(X(zx + zw / 2) + TEXT.small * 0.35, Y(zy) + 2 + textWidth(text, TEXT.small), text, {
          size: TEXT.small,
          halo: true,
          rotate: -90,
        }),
      );
      occupied.push([zx, zy + mm(2), zx + zw, zy + mm(2) + textLength]);
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

  // Labels of other features: inside when they fit, otherwise to the east.
  for (const a of p.anlaggningar) {
    if (!a.namn) continue;
    const [x, y, w, d] = a.rektangel;
    const size = fitSize([a.namn], w * k, 2, 1.6);
    if (textWidth(a.namn, size) <= w * k - 1.2 && size * 1.3 <= d * k) {
      parts.push(
        label(X(x + w / 2), Y(y + d / 2), a.namn, { anchor: 'middle', baseline: 'middle', size }),
      );
    } else {
      parts.push(
        label(X(x + w) + 1.2, Y(y + d / 2), a.namn, {
          baseline: 'middle',
          size: TEXT.small,
          halo: true,
        }),
      );
      occupied.push([
        x + w,
        y + d / 2 - mm(1.5),
        x + w + mm(1.5 + textWidth(a.namn, TEXT.small)),
        y + d / 2 + mm(1.5),
      ]);
    }
  }

  // Point features: a circle with a cross and the name to the east.
  for (const pt of p.punkter) {
    const [px, py] = pt.punkt;
    const r = 1.1;
    parts.push(
      el('circle', {
        cx: X(px),
        cy: Y(py),
        r,
        fill: PAPER,
        stroke: INK,
        'stroke-width': LINE.normal,
      }),
      line(X(px) - r, Y(py), X(px) + r, Y(py), LINE.thin),
      line(X(px), Y(py) - r, X(px), Y(py) + r, LINE.thin),
      label(X(px) + r + 1, Y(py), pt.namn, { baseline: 'middle', size: TEXT.small, halo: true }),
    );
    occupied.push([
      px - mm(r + 0.5),
      py - mm(1.6),
      px + mm(r + 1.5 + textWidth(pt.namn, TEXT.small)),
      py + mm(1.6),
    ]);
  }

  // Dimensions (metres).
  const metres = (lengthMm: number) => sv(lengthMm / k, 1);
  const chains: string[] = [];
  // Where dimensionChain puts its values (default text size, text before the line unless
  // `after`), as boxes in metres, so that two chains can be kept from writing on each other.
  const chainTexts = (axis: 'x' | 'y', at: number, positions: number[], after = false): Box[] => {
    const sorted = [...new Set(positions.map((v) => Math.round(v * 1000) / 1000))].sort(
      (a, b) => a - b,
    );
    const size = TEXT.normal;
    const boxes: Box[] = [];
    for (let i = 0; i < sorted.length - 1; i += 1) {
      const a = sorted[i] as number;
      const b = sorted[i + 1] as number;
      const w = mm(textWidth(metres((b - a) * k), size));
      const along =
        w + mm(1) < b - a ? (a + b) / 2 : i === 0 ? a - w / 2 - mm(2) : b + w / 2 + mm(2);
      const across: [number, number] = after
        ? [at + mm(0.9), at + mm(0.9 + size)]
        : [at - mm(0.9 + size), at - mm(0.9)];
      boxes.push(
        axis === 'x'
          ? [along - w / 2, across[0], along + w / 2, across[1]]
          : [across[0], along - w / 2, across[1], along + w / 2],
      );
    }
    return boxes;
  };
  const horizontalTexts: Box[] = [];
  const horizontalChain = (y: number, r: Rectangle, fromY: number) => {
    horizontalTexts.push(...chainTexts('x', y, [0, r[0], r[0] + r[2], W]));
    return dimensionChain({
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
  };
  // Horizontal chains claim a band across the plot (text above the line).
  const chainBand = (y: number): Box => [0, y - mm(3.5), W, y + mm(1)];
  const features: Box[] = p.anlaggningar.map((a) => boxOf(a.rektangel, mm(1)));
  if (driveway) features.push(boxOf(driveway, mm(1)));
  for (const pt of p.punkter) {
    const [px, py] = pt.punkt;
    features.push([
      px - mm(1.6),
      py - mm(1.6),
      px + mm(2.6 + textWidth(pt.namn, TEXT.small)),
      py + mm(1.6),
    ]);
  }
  const anchors = p.anlaggningar.length + p.punkter.length + (driveway ? 1 : 0);
  const northLimit = Math.max(
    0,
    ...p.prickmark.filter((z) => z.sida === 'norr').map((z) => z.djup),
  );
  const southLimit = Math.min(
    D,
    ...p.prickmark.filter((z) => z.sida === 'soder').map((z) => D - z.djup),
  );
  // Above the main building if there is room and nothing in the way, otherwise below it.
  const mainTop = main[1];
  const mainBottom = main[1] + main[3];
  const inBand = (top: number, bottom: number) =>
    features.filter((f) => overlaps(f, [0, top, W, bottom]));
  const aboveHits = inBand(mainTop - mm(9), mainTop);
  const belowHits = inBand(mainBottom, mainBottom + mm(9));
  const aboveY = Math.min(mainTop, ...aboveHits.map((f) => f[1])) - mm(6);
  const belowY = Math.max(mainBottom, ...belowHits.map((f) => f[3])) + mm(6);
  const aboveOk = mainTop * k >= 14 && aboveY - mm(8) >= northLimit - 1e-9;
  const belowOk = belowY + mm(2) <= southLimit + 1e-9;
  let mainChainY: number;
  let mainChainFrom: number;
  if (anchors === 0) {
    // Without other features this is the rule the existing drawings were made with.
    const above = mainTop * k >= 14 && mainTop - mm(14) >= northLimit - 1e-9;
    mainChainY = above ? aboveY : belowY;
    mainChainFrom = above ? mainTop : mainBottom;
    if (!above && !belowOk && aboveOk) {
      mainChainY = aboveY;
      mainChainFrom = mainTop;
    }
  } else {
    const aboveCost = aboveOk ? mainTop - mm(6) - aboveY : Infinity;
    const belowCost = belowOk ? belowY - mainBottom - mm(6) : Infinity;
    const above = aboveCost < belowCost || (aboveCost === belowCost && aboveCost !== Infinity);
    mainChainY = above ? aboveY : belowY;
    mainChainFrom = above ? mainTop : mainBottom;
  }
  chains.push(horizontalChain(mainChainY, main, mainChainFrom));
  occupied.push(chainBand(mainChainY));
  const mainCenter = main[1] + main[3] / 2;
  for (const b of buildings.filter((x) => x.kind === 'ny' && x.r !== main)) {
    const [, y, , d] = b.r;
    const below = y + d / 2 > mainCenter;
    const at = below ? y + d + mm(4) : y - mm(4);
    chains.push(horizontalChain(at, b.r, below ? y + d : y));
    occupied.push(chainBand(at));
  }

  // The driveway's position along the boundary.
  if (p.utfart && driveway) {
    const u = p.utfart;
    const horizontal = isHorizontalSide(u.sida);
    const end = horizontal ? W : D;
    const points = [0, u.lage, u.lage + u.bredd, end];
    if (horizontal) {
      const at = u.sida === 'norr' ? u.langd + mm(5) : D - u.langd - mm(3);
      chains.push(
        dimensionChain({
          axis: 'x',
          at: Y(at),
          points: points.map((v, i) => ({
            at: X(v),
            from: i === 1 || i === 2 ? Y(u.sida === 'norr' ? u.langd : D - u.langd) : undefined,
          })),
          format: (lengthMm, i) => (i < 2 ? metres(lengthMm) : ''),
        }),
      );
      occupied.push([0, at - mm(3.5), u.lage + u.bredd + mm(2), at + mm(1)]);
    } else {
      const at = u.sida === 'vaster' ? u.langd + mm(5) : W - u.langd - mm(5);
      chains.push(
        dimensionChain({
          axis: 'y',
          at: X(at),
          points: points.map((v, i) => ({
            at: Y(v),
            from: i === 1 || i === 2 ? X(u.sida === 'vaster' ? u.langd : W - u.langd) : undefined,
          })),
          format: (lengthMm, i) => (i < 2 ? metres(lengthMm) : ''),
          textSide: u.sida === 'vaster' ? 'after' : 'before',
        }),
      );
      occupied.push([at - mm(4), 0, at + mm(4), u.lage + u.bredd + mm(2)]);
    }
    const textAt: [number, number] = horizontal
      ? [u.lage + u.bredd + mm(1.5), u.sida === 'norr' ? u.langd / 2 : D - u.langd / 2]
      : [u.sida === 'vaster' ? u.langd + mm(1.5) : W - u.langd - mm(1.5), u.lage + u.bredd / 2];
    parts.push(
      label(X(textAt[0]), Y(textAt[1]), 'Utfart', {
        baseline: 'middle',
        size: TEXT.small,
        halo: true,
        anchor: horizontal || u.sida === 'vaster' ? 'start' : 'end',
      }),
    );
  }

  // One vertical chain on the side with more room, collecting every building edge.
  const measured = buildings.filter((b) => b.kind !== 'ovrig');
  const right = Math.max(...measured.map((b) => b.r[0] + b.r[2]));
  const left = Math.min(...measured.map((b) => b.r[0]));
  let east = W - right >= left - 1;
  // Between the buildings and the boundary, a little closer to the boundary.
  let chainX = east ? right + (W - right) * 0.6 : left * 0.4;
  if (anchors > 0) {
    // Other features: look for the widest free strip on either side, with room for the text.
    const textRoom = mm(5);
    const candidates: { east: boolean; from: number; to: number }[] = [];
    for (const side of [true, false]) {
      const [a, b] = side ? [right, W] : [0, left];
      const holes = features
        .map((f): [number, number] => [f[0] - mm(1), f[2] + mm(1)])
        .sort((m, n) => m[0] - n[0]);
      for (const [from, to] of spans(a, b, holes)) {
        const usable: [number, number] = side
          ? [from + textRoom, to - mm(1)]
          : [from + mm(1), to - textRoom];
        if (usable[1] >= usable[0]) candidates.push({ east: side, from: usable[0], to: usable[1] });
      }
    }
    const best = candidates.sort((m, n) => n.to - n.from - (m.to - m.from))[0];
    if (best) {
      east = best.east;
      chainX = best.from + (best.to - best.from) * (east ? 0.6 : 0.4);
    }
  }
  // When its values would land on the values of a horizontal chain, the chain moves outside
  // the plot on the east side (the outer plot dimensions are on the west side then).
  const collectEdges = (onEast: boolean) => {
    const found = new Map<number, number>();
    for (const b of measured) {
      const [x, y, w, d] = b.r;
      const face = onEast ? x + w : x;
      for (const at of [y, y + d]) {
        const key = Math.round(at * 1000) / 1000;
        const current = found.get(key);
        const better = current === undefined || (onEast ? face > current : face < current);
        if (better) found.set(key, face);
      }
    }
    return found;
  };
  let outside = false;
  const verticalTexts = chainTexts('y', chainX, [0, D, ...collectEdges(east).keys()], !east);
  const clash = verticalTexts.some((v) => horizontalTexts.some((h) => overlaps(v, h)));
  const outsideFree = street?.sida !== 'vaster' && street?.sida !== 'oster';
  if (clash && outsideFree) {
    outside = true;
    east = true;
    chainX = W + mm(5);
  }
  const edges = new Map<number, number>();
  for (const b of measured) {
    const [x, y, w, d] = b.r;
    const face = east ? x + w : x;
    for (const at of [y, y + d]) {
      const key = Math.round(at * 1000) / 1000;
      const current = edges.get(key);
      const better = current === undefined || (east ? face > current : face < current);
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
      textSide: east && !outside ? 'before' : 'after',
    }),
  );
  if (!outside) occupied.push([chainX - mm(4), 0, chainX + mm(4), D]);

  // Plot dimensions outside the plot, broken at prickmark boundaries. They go on the side
  // away from the street, so they do not collide with the street's name.
  const outerChains = (axis: 'x' | 'y') => {
    const size = axis === 'x' ? W : D;
    const breaks = p.prickmark
      .filter((z) => (axis === 'x' ? !isHorizontalSide(z.sida) : isHorizontalSide(z.sida)))
      .map((z) => (z.sida === 'norr' || z.sida === 'vaster' ? z.djup : size - z.djup));
    const toPaper = axis === 'x' ? X : Y;
    const flip = axis === 'x' ? street?.sida === 'norr' : street?.sida === 'vaster';
    const lineAt = (offsetMm: number) =>
      axis === 'x'
        ? flip
          ? Y(D) + offsetMm
          : Y(0) - offsetMm
        : flip
          ? X(W) + offsetMm
          : X(0) - offsetMm;
    const textSide = flip ? ('after' as const) : undefined;
    const out: string[] = [];
    if (breaks.length > 0) {
      out.push(
        dimensionChain({
          axis,
          at: lineAt(5),
          points: [0, ...breaks, size].map((v) => ({ at: toPaper(v) })),
          format: metres,
          textSide,
        }),
      );
    }
    out.push(
      dimensionChain({
        axis,
        at: lineAt(breaks.length > 0 ? 10 : 5),
        points: [{ at: toPaper(0) }, { at: toPaper(size) }],
        format: metres,
        textSide,
      }),
    );
    return out;
  };
  chains.push(...outerChains('x'), ...outerChains('y'));
  parts.push(group(chains, { class: 'matt' }));

  // Property label: where the old rule puts it if that spot is free, otherwise the nearest
  // free spot inside the plot.
  const own = p.fastighet ?? shortProperty(context.fastighet);
  const ownWidth = mm(textWidth(own, TEXT.heading, true) + 2);
  const ownHeight = mm(TEXT.heading * 1.5);
  const preferredY = main[1] * k > 14 ? main[1] / 2 : (main[1] + main[3] + D) / 2;
  const free = (cx: number, cy: number) => {
    const box: Box = [cx - ownWidth / 2, cy - ownHeight / 2, cx + ownWidth / 2, cy + ownHeight / 2];
    if (box[0] < 0 || box[2] > W || box[1] < 0 || box[3] > D) return false;
    return !occupied.some((o) => overlaps(o, box));
  };
  let ownAt: [number, number] = [W / 2, preferredY];
  if (!free(W / 2, preferredY)) {
    const step = mm(1);
    const options: [number, number][] = [];
    for (const cx of [W / 2, W / 4, (3 * W) / 4]) {
      for (let cy = ownHeight / 2; cy <= D - ownHeight / 2; cy += step) options.push([cx, cy]);
    }
    const distance = ([cx, cy]: [number, number]) =>
      Math.abs(cy - preferredY) + Math.abs(cx - W / 2) * 2;
    const found = options
      .filter(([cx, cy]) => free(cx, cy))
      .sort((a, b) => distance(a) - distance(b))[0];
    if (found) ownAt = found;
  }
  parts.push(
    label(X(ownAt[0]), Y(ownAt[1]), own, {
      anchor: 'middle',
      baseline: 'middle',
      size: TEXT.heading,
      weight: 'bold',
      halo: true,
    }),
  );

  // Neighbour labels. On the east and west sides they move away from the protection line.
  const neighbourOffset = (s: Side) => extra(s) + margin * 0.55;
  const sideY = [D / 2, D * 0.3, D * 0.7].find(
    (y) =>
      protectionAt === undefined ||
      (shore && !isHorizontalSide(shore.sida)) ||
      Math.abs(y - protectionAt) > mm(6),
  ) as number;
  const neighbourAt: Record<Side, [number, number]> = {
    norr: [W / 2, -neighbourOffset('norr')],
    soder: [W / 2, D + neighbourOffset('soder')],
    vaster: [-neighbourOffset('vaster') - mm(4), sideY],
    oster: [W + neighbourOffset('oster') + mm(2), sideY],
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

  // Name of the protection line, at the edge of the drawn surroundings.
  if (shore && protectionAt !== undefined) {
    const text = 'Strandskyddsgräns';
    parts.push(
      isHorizontalSide(shore.sida)
        ? label(X(x1) - 2, Y(protectionAt) - 1, text, {
            anchor: 'end',
            size: TEXT.small,
            halo: true,
          })
        : label(X(protectionAt) - 1, Y(y1) - 2, text, {
            size: TEXT.small,
            halo: true,
            rotate: -90,
          }),
    );
  }

  // North arrow and scale bar.
  parts.push(northArrow(width - 9, 12, p.norr_vinkel));
  const bar = scaleBar(3, 5, k, p.skala, 36);
  parts.push(bar.svg);
  parts.push(label(3, 14.5, 'Mått i meter', { size: TEXT.small }));

  if (p.visa_areor) {
    const plot = W * D;
    const area = (r: Rectangle) => r[2] * r[3];
    const existing =
      (p.hus ? area(p.hus) : 0) + p.ovriga_byggnader.reduce((sum, b) => sum + area(b.rektangel), 0);
    const added =
      (p.nybyggnad ? area(p.nybyggnad) : 0) +
      (p.tillbyggnad ? area(p.tillbyggnad) : 0) +
      (p.komplementbyggnad ? area(p.komplementbyggnad) : 0);
    const rows = [
      `Tomtarea ${sv(plot, 1)} m²`,
      `Byggnadsarea befintlig ${sv(existing, 1)} m²`,
      `Byggnadsarea ny ${sv(added, 1)} m²`,
      `Byggnadsarea totalt ${sv(existing + added, 1)} m² (${sv(((existing + added) / plot) * 100, 1)} %)`,
    ];
    rows.forEach((row, i) =>
      parts.push(
        label(4, height - 14 - (rows.length - 1 - i) * 3, row, { size: TEXT.small, halo: true }),
      ),
    );
  }

  const entries = [
    ...(p.hus || p.ovriga_byggnader.length > 0
      ? [
          {
            swatch: { type: 'fill' as const, fill: PAPER, strokeWidth: LINE.heavy },
            text: 'Befintlig byggnad',
          },
        ]
      : []),
    {
      swatch: { type: 'fill' as const, fill: `url(#${ids.ny})`, strokeWidth: LINE.bold },
      text: 'Ny byggnad eller tillbyggnad',
    },
    ...(p.anlaggningar.length > 0
      ? [
          {
            swatch: {
              type: 'fill' as const,
              fill: PAPER,
              strokeWidth: LINE.normal,
              dash: '1.6 0.8',
            },
            text: 'Anläggning på tomten',
          },
        ]
      : []),
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
    {
      swatch: { type: 'line' as const, width: LINE.bold, dash: '7 1.2 1.2 1.2' },
      text: 'Tomtgräns',
    },
    { swatch: { type: 'line' as const, width: LINE.thin }, text: 'Fastighetsgräns, grannar' },
    ...(p.grannhus.length > 0
      ? [
          {
            swatch: { type: 'fill' as const, fill: '#ececec', strokeWidth: LINE.normal },
            text: 'Byggnad på grannfastighet',
          },
        ]
      : []),
    ...(shore
      ? [
          {
            swatch: { type: 'fill' as const, fill: `url(#${ids.vatten})`, strokeWidth: LINE.heavy },
            text: 'Vatten och strandlinje',
          },
        ]
      : []),
    ...(shore && p.strandskydd
      ? [
          {
            swatch: { type: 'line' as const, width: LINE.medium, dash: protectionDash },
            text: `Strandskyddsgräns, ${sv(p.strandskydd.avstand, 0)} m från strandlinjen`,
          },
        ]
      : []),
  ];
  // The legend must fit beside the title block (40 mm), so long legends get tighter rows.
  const rowHeight = entries.length > 7 ? Math.min(5, 34.5 / entries.length) : 5;
  const footer = legend(0, 0, 'Teckenförklaring', entries, { rowHeight });

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
