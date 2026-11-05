import { idSafe, shortProperty, titleData, type DrawingContext } from './context';
import type { NamedRectangle, Rectangle, Side, SituationsplanParams } from './schema';
import {
  INK,
  LINE,
  PAPER,
  TEXT,
  composeSheet,
  crossHatchPattern,
  dimensionChain,
  dotPattern,
  el,
  group,
  hatchPattern,
  label,
  legend,
  level,
  line,
  northArrow,
  rect,
  scaleBar,
  sv,
  textBlock,
  textWidth,
  type ChainPoint,
  type LegendEntry,
} from './svg';

/** Paper distance (mm) from the plot to the edge of the drawn surroundings. */
const SURROUNDINGS_MM = 34;

interface Building {
  r: Rectangle;
  lines: string[];
  kind: 'befintlig' | 'ny' | 'ovrig' | 'avvikelse';
}

/** Parking spaces for disabled persons are drawn at least this wide where there is room. */
const ACCESSIBLE_SPACE_M = 5;
const MIN_SPACE_M = 2.3;
const LOVGIVET_DASH = '4 1 0.8 1 0.8 1';
const BALCONY_DASH = '0.6 0.6';
/** New property boundaries inside the plot (subdivision). */
const NEW_BOUNDARY_DASH = '3.5 1.2';
const MONUMENT_DASH = '0.5 0.7';
const FELLED_CROWN_DASH = '1.2 0.8';
/** Grey of buildings on the neighbours' properties. */
const NEIGHBOUR_FILL = '#ececec';

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

/** A name as two or three balanced lines, e.g. "Befintligt / bostads- och / affärshus". */
export function wrapName(name: string): string[] {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length <= 2) return words;
  const total = name.length;
  const count = total > 24 ? 3 : 2;
  const target = Math.max(...words.map((w) => w.length), Math.ceil(total / count) + 2);
  const lines: string[] = [];
  for (const word of words) {
    const last = lines.at(-1);
    if (last !== undefined && last.length + 1 + word.length <= target) {
      lines[lines.length - 1] = `${last} ${word}`;
    } else {
      lines.push(word);
    }
  }
  return lines;
}

/** An integer with a space as thousands separator, e.g. 1800 → "1 800". */
function thousands(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
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
  const neighbourHouses: NamedRectangle[] = p.grannhus.map((g) =>
    Array.isArray(g) ? { rektangel: g } : g,
  );
  const monumentBox = (f: SituationsplanParams['fornlamningar'][number]): Box =>
    f.rektangel
      ? boxOf(f.rektangel)
      : [f.punkt![0] - mm(2), f.punkt![1] - mm(2), f.punkt![0] + mm(2), f.punkt![1] + mm(2)];
  // Named neighbouring houses and ancient monuments widen the drawn surroundings.
  const farFeatures: Box[] = [
    ...neighbourHouses.filter((g) => g.namn).map((g) => boxOf(g.rektangel)),
    ...p.fornlamningar.map(monumentBox),
  ];
  // How far the drawn surroundings reach beyond the boundary on each side.
  const reach = (s: Side) => {
    let base = margin + extra(s);
    if (shore?.sida === s) base = Math.max(base, shore.avstand + mm(16));
    const pad = mm(8);
    for (const b of farFeatures) {
      if (s === 'oster') base = Math.max(base, b[2] - W + pad);
      if (s === 'vaster') base = Math.max(base, -b[0] + pad);
      if (s === 'norr') base = Math.max(base, -b[1] + pad);
      if (s === 'soder') base = Math.max(base, b[3] - D + pad);
    }
    return base;
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
    avvikelse: `${id}-avvikelse`,
    pool: `${id}-pool`,
    fornlamning: `${id}-fornlamning`,
  };
  const defs = [
    el('clipPath', { id: ids.clip }, rect(0, 0, width, height)),
    hatchPattern(ids.prick, { angle: 45, spacing: 1.6, width: LINE.hair }),
    hatchPattern(ids.ny, { angle: -45, spacing: 0.9, width: LINE.hair }),
  ];
  if (p.utfart) defs.push(dotPattern(ids.utfart, { spacing: 1.2, radius: 0.12 }));
  if (shore) defs.push(hatchPattern(ids.vatten, { angle: 90, spacing: 1.4, width: LINE.hair }));
  if (p.avvikelse.length > 0) defs.push(crossHatchPattern(ids.avvikelse, { spacing: 1.3 }));
  if (p.pooler.length > 0) defs.push(hatchPattern(ids.pool, { angle: 90, spacing: 0.8 }));
  if (p.fornlamningar.length > 0)
    defs.push(hatchPattern(ids.fornlamning, { angle: 20, spacing: 1.8, width: LINE.hair }));

  // The main building is the existing house, or the new house on an empty plot.
  const main: Rectangle = p.hus ?? (p.nybyggnad as Rectangle);

  const buildings: Building[] = [
    ...p.ovriga_byggnader.map((b): Building => ({
      r: b.rektangel,
      lines: b.namn ? b.namn.split(/\s+(?=\S)/).slice(0, 3) : [],
      kind: 'ovrig',
    })),
  ];
  const mainLines = p.huvudbyggnad_namn ? wrapName(p.huvudbyggnad_namn) : undefined;
  if (p.hus)
    buildings.push({
      r: p.hus,
      lines: (!p.nybyggnad && mainLines) || ['Befintligt', 'bostadshus'],
      kind: 'befintlig',
    });
  if (p.nybyggnad)
    buildings.push({ r: p.nybyggnad, lines: mainLines ?? ['Nytt', 'bostadshus'], kind: 'ny' });
  for (const b of p.nybyggnader) {
    buildings.push({
      r: b.rektangel,
      lines: b.namn ? wrapName(b.namn) : ['Nytt', 'bostadshus'],
      kind: 'ny',
    });
  }
  if (p.tillbyggnad) buildings.push({ r: p.tillbyggnad, lines: ['Ny', 'tillbyggnad'], kind: 'ny' });
  if (p.komplementbyggnad)
    buildings.push({
      r: p.komplementbyggnad,
      lines: (p.komplementbyggnad_namn && wrapName(p.komplementbyggnad_namn)) || [
        'Ny komplement-',
        'byggnad',
      ],
      kind: 'ny',
    });
  for (const a of p.avvikelse) {
    buildings.push({
      r: a.rektangel,
      lines: a.namn ? wrapName(a.namn) : [],
      kind: 'avvikelse',
    });
  }

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
  for (const {
    rektangel: [x, y, w, d],
  } of neighbourHouses) {
    clipped.push(
      rect(X(x), Y(y), w * k, d * k, {
        fill: NEIGHBOUR_FILL,
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

  // Pools: the coping and the water surface inside it.
  for (const pool of p.pooler) {
    const [x, y, w, d] = pool.rektangel;
    const c = Math.min(0.3, w / 6, d / 6);
    parts.push(
      rect(X(x), Y(y), w * k, d * k, { fill: PAPER, stroke: INK, 'stroke-width': LINE.medium }),
      rect(X(x + c), Y(y + c), (w - 2 * c) * k, (d - 2 * c) * k, {
        fill: `url(#${ids.pool})`,
        stroke: INK,
        'stroke-width': LINE.thin,
      }),
    );
    occupied.push(boxOf(pool.rektangel, mm(1)));
  }

  // Parking: the area divided into spaces across its longer side.
  for (const park of p.parkering) {
    const [x, y, w, d] = park.rektangel;
    parts.push(
      rect(X(x), Y(y), w * k, d * k, { fill: PAPER, stroke: INK, 'stroke-width': LINE.normal }),
    );
    const along = w >= d;
    const total = along ? w : d;
    const ordinary = park.platser - park.tillgangliga;
    const wide =
      park.tillgangliga > 0 &&
      (ordinary === 0 ||
        (total - park.tillgangliga * ACCESSIBLE_SPACE_M) / ordinary >= MIN_SPACE_M);
    const accessibleWidth = wide
      ? ordinary === 0
        ? total / park.platser
        : ACCESSIBLE_SPACE_M
      : total / park.platser;
    const ordinaryWidth =
      ordinary === 0 ? 0 : (total - park.tillgangliga * accessibleWidth) / ordinary;
    let at = 0;
    for (let i = 0; i < park.platser; i += 1) {
      const size = i < park.tillgangliga ? accessibleWidth : ordinaryWidth;
      const mid = at + size / 2;
      if (i < park.tillgangliga) {
        const [cx, cy] = along ? [x + mid, y + d / 2] : [x + w / 2, y + mid];
        parts.push(
          label(X(cx), Y(cy), 'PRH', {
            anchor: 'middle',
            baseline: 'middle',
            size: Math.min(TEXT.small, size * k * 0.3),
            weight: 'bold',
          }),
        );
      }
      at += size;
      if (i < park.platser - 1) {
        parts.push(
          along
            ? line(X(x + at), Y(y), X(x + at), Y(y + d), LINE.thin)
            : line(X(x), Y(y + at), X(x + w), Y(y + at), LINE.thin),
        );
      }
    }
    occupied.push(boxOf(park.rektangel, mm(1)));
  }

  // Balconies and other projecting parts: dashed, above the ground.
  for (const b of p.balkonger) {
    occupied.push(boxOf(b, mm(0.5)));
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

  // New property boundaries inside the plot, each drawn once and not on the outer boundary.
  const drawnBoundaries = new Set<string>();
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  for (const t of p.tomter) {
    const [x, y, w, d] = t.rektangel;
    const segments: [number, number, number, number][] = [
      [x, y, x + w, y],
      [x, y + d, x + w, y + d],
      [x, y, x, y + d],
      [x + w, y, x + w, y + d],
    ];
    for (const [ax, ay, bx, by] of segments) {
      const onOuter = ay === by ? near(ay, 0) || near(ay, D) : near(ax, 0) || near(ax, W);
      const key = [ax, ay, bx, by].map((v) => v.toFixed(3)).join(' ');
      if (onOuter || drawnBoundaries.has(key)) continue;
      drawnBoundaries.add(key);
      parts.push(
        line(X(ax), Y(ay), X(bx), Y(by), LINE.heavy, { 'stroke-dasharray': NEW_BOUNDARY_DASH }),
      );
    }
  }

  // Ancient monuments: a hatched area with a dotted outline, or a small hatched circle.
  for (const f of p.fornlamningar) {
    const style = {
      fill: `url(#${ids.fornlamning})`,
      stroke: INK,
      'stroke-width': LINE.medium,
      'stroke-dasharray': MONUMENT_DASH,
    };
    if (f.rektangel) {
      const [x, y, w, d] = f.rektangel;
      parts.push(rect(X(x), Y(y), w * k, d * k, style));
    } else if (f.punkt) {
      parts.push(el('circle', { cx: X(f.punkt[0]), cy: Y(f.punkt[1]), r: 1.6, ...style }));
      occupied.push(monumentBox(f));
    }
  }

  // Buildings.
  for (const b of buildings) {
    const [x, y, w, d] = b.r;
    parts.push(rect(X(x), Y(y), w * k, d * k, { fill: PAPER }));
    if (b.kind === 'ny') parts.push(rect(X(x), Y(y), w * k, d * k, { fill: `url(#${ids.ny})` }));
    if (b.kind === 'avvikelse')
      parts.push(rect(X(x), Y(y), w * k, d * k, { fill: `url(#${ids.avvikelse})` }));
    parts.push(
      rect(X(x), Y(y), w * k, d * k, {
        fill: 'none',
        stroke: INK,
        'stroke-width':
          b.kind === 'ny' || b.kind === 'avvikelse'
            ? LINE.bold
            : b.kind === 'befintlig'
              ? LINE.heavy
              : LINE.medium,
      }),
    );
    occupied.push(boxOf(b.r, mm(1)));
  }

  // Balconies on top of the building outlines, dashed.
  for (const [x, y, w, d] of p.balkonger) {
    parts.push(
      rect(X(x), Y(y), w * k, d * k, {
        fill: 'none',
        stroke: INK,
        'stroke-width': LINE.medium,
        'stroke-dasharray': BALCONY_DASH,
      }),
    );
  }

  // What the permit allows, on top so the difference shows.
  // Drawn just inside the outline, so that it shows also where it coincides with a building.
  for (const g of p.lovgivet) {
    const [x, y, w, d] = g.rektangel;
    const inset = 0.8;
    parts.push(
      rect(X(x) + inset, Y(y) + inset, w * k - 2 * inset, d * k - 2 * inset, {
        fill: 'none',
        stroke: INK,
        'stroke-width': LINE.heavy,
        'stroke-dasharray': LOVGIVET_DASH,
      }),
    );
  }

  // Trees: the crown as a circle and the trunk as a dot. A tree to be felled gets a dashed
  // crown and a cross.
  for (const t of p.trad) {
    const [px, py] = t.punkt;
    const r = (t.krondiameter / 2) * k;
    const stem = Math.max(0.4, ((t.stamdiameter ?? 0.3) / 2) * k);
    const felled = t.status === 'falls';
    parts.push(
      el('circle', {
        cx: X(px),
        cy: Y(py),
        r,
        fill: 'none',
        stroke: INK,
        'stroke-width': LINE.normal,
        'stroke-dasharray': felled ? FELLED_CROWN_DASH : undefined,
      }),
      el('circle', { cx: X(px), cy: Y(py), r: stem, fill: INK }),
    );
    if (felled) {
      const c = Math.max(Math.min(r * 0.7, 4), stem + 1.2);
      parts.push(
        line(X(px) - c, Y(py) - c, X(px) + c, Y(py) + c, LINE.heavy),
        line(X(px) - c, Y(py) + c, X(px) + c, Y(py) - c, LINE.heavy),
      );
    }
    occupied.push([
      px - mm(stem + 0.6),
      py - mm(stem + 0.6),
      px + mm(stem + 0.6),
      py + mm(stem + 0.6),
    ]);
  }

  // Ground levels: a small cross at the point.
  for (const h of p.hojder) {
    const [px, py] = h.punkt;
    const c = 0.7;
    parts.push(
      line(X(px) - c, Y(py) - c, X(px) + c, Y(py) + c, LINE.normal),
      line(X(px) - c, Y(py) + c, X(px) + c, Y(py) - c, LINE.normal),
    );
    occupied.push([px - mm(1), py - mm(1), px + mm(1), py + mm(1)]);
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
      // The first spot from the west where the text keeps clear of what is drawn in the zone.
      const textBox = (tx: number): Box => [
        tx,
        zy + zh - mm(4),
        tx + textLength,
        zy + zh + mm(0.5),
      ];
      // Only the glyphs, for finding a free spot (the box above also covers the halo).
      const glyphs = (tx: number): Box => [
        tx,
        zy + zh - mm(3.8),
        tx + textLength,
        zy + zh - mm(1.1),
      ];
      const pointBoxes = p.punkter.map(({ punkt: [px, py], namn }): Box => [
        px - mm(1.6),
        py - mm(1.6),
        px + mm(2.6 + textWidth(namn, TEXT.small)),
        py + mm(1.6),
      ]);
      const blockers = [...occupied, ...pointBoxes];
      let tx = zx + mm(2);
      for (let candidate = tx; candidate + textLength <= zx + zw - mm(2); candidate += mm(1)) {
        if (!blockers.some((o) => overlaps(o, glyphs(candidate)))) {
          tx = candidate;
          break;
        }
      }
      parts.push(
        label(X(tx), Y(zy + zh) - 1.6, text, {
          size: TEXT.small,
          halo: true,
        }),
      );
      occupied.push(textBox(tx));
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
        halo: b.kind === 'ny' || b.kind === 'avvikelse',
        firstBold: false,
      }),
    );
  }

  // Labels of other features: inside when they fit, otherwise to the east.
  for (const a of p.anlaggningar) {
    const name = a.namn ?? '';
    if (!name) continue;
    const [x, y, w, d] = a.rektangel;
    const textEnd = x + w + mm(1.2 + textWidth(name, TEXT.small));
    const size = fitSize([name], w * k, 2, 1.6);
    if (textWidth(name, size) <= w * k - 1.2 && size * 1.3 <= d * k) {
      parts.push(
        label(X(x + w / 2), Y(y + d / 2), name, { anchor: 'middle', baseline: 'middle', size }),
      );
    } else if (
      textEnd > W &&
      neighbourHouses.some((g) =>
        overlaps(boxOf(g.rektangel), [x + w, y + d / 2 - mm(1.5), textEnd, y + d / 2 + mm(1.5)]),
      )
    ) {
      // The text would run into a neighbour's house: under the feature, inside the plot.
      const half = mm(textWidth(name, TEXT.small) / 2);
      const cx = Math.min(Math.max(x + w / 2, half + mm(1)), W - half - mm(1));
      const cy = y + d + mm(2.6);
      parts.push(label(X(cx), Y(cy), name, { anchor: 'middle', size: TEXT.small, halo: true }));
      occupied.push([cx - half, cy - mm(2), cx + half, cy + mm(0.6)]);
    } else {
      parts.push(
        label(X(x + w) + 1.2, Y(y + d / 2), name, {
          baseline: 'middle',
          size: TEXT.small,
          halo: true,
        }),
      );
      occupied.push([
        x + w,
        y + d / 2 - mm(1.5),
        x + w + mm(1.5 + textWidth(name, TEXT.small)),
        y + d / 2 + mm(1.5),
      ]);
    }
  }

  // Parking names across the spaces, with a halo.
  for (const park of p.parkering) {
    if (!park.namn) continue;
    const [x, y, w, d] = park.rektangel;
    const along = w >= d;
    parts.push(
      label(
        X(x + w / 2),
        along ? Y(y + d) - 1.2 : Y(y + d / 2),
        park.namn,
        along
          ? { anchor: 'middle', size: TEXT.small, halo: true }
          : { anchor: 'middle', baseline: 'middle', size: TEXT.small, halo: true, rotate: -90 },
      ),
    );
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

  // Labels of the features below, each at the first free spot among a few candidates.
  const viewBox: Box = [x0, y0, x1, y1];
  const isFree = (box: Box, extraBlockers: Box[] = []) =>
    box[0] >= viewBox[0] &&
    box[1] >= viewBox[1] &&
    box[2] <= viewBox[2] &&
    box[3] <= viewBox[3] &&
    ![...occupied, ...extraBlockers].some((o) => overlaps(o, box));
  /** Boxes (metres) of labels placed here, kept clear by the dimension chains. */
  const labelBoxes: Box[] = [];
  const claim = (box: Box) => {
    occupied.push(box);
    labelBoxes.push(box);
  };
  /** A one-line label east, west, south or north of a point, at `gap` mm from it. */
  const pointLabel = (px: number, py: number, text: string, gap: number, size = TEXT.small) => {
    const tw = mm(textWidth(text, size));
    const h = mm(size * 0.75);
    const g = mm(gap);
    const options: { box: Box; x: number; y: number; anchor: 'start' | 'end' | 'middle' }[] = [
      { box: [px + g, py - h, px + g + tw, py + h], x: px + g, y: py, anchor: 'start' },
      { box: [px - g - tw, py - h, px - g, py + h], x: px - g, y: py, anchor: 'end' },
      {
        box: [px - tw / 2, py + g, px + tw / 2, py + g + 2 * h],
        x: px,
        y: py + g + h,
        anchor: 'middle',
      },
      {
        box: [px - tw / 2, py - g - 2 * h, px + tw / 2, py - g],
        x: px,
        y: py - g - h,
        anchor: 'middle',
      },
    ];
    const chosen = options.find((o) => isFree(o.box)) ?? options[0]!;
    claim(chosen.box);
    return label(X(chosen.x), Y(chosen.y), text, {
      anchor: chosen.anchor,
      baseline: 'middle',
      size,
      halo: true,
    });
  };
  /** A label of several lines inside a rectangle if it fits, otherwise just below it. */
  const areaLabel = (r: Rectangle, lines: string[], preferred: number = TEXT.small) => {
    const [x, y, w, d] = r;
    const size = fitSize(lines, w * k, preferred, 1.6);
    const tw = mm(Math.max(...lines.map((l) => textWidth(l, size))));
    const th = mm(size * 1.25 * lines.length);
    if (tw <= w - mm(1) && th <= d - mm(1)) {
      return textBlock(X(x + w / 2), Y(y + d / 2), lines, { size, halo: true, firstBold: false });
    }
    const small = TEXT.small;
    const sw = mm(Math.max(...lines.map((l) => textWidth(l, small))));
    const sh = mm(small * 1.25 * lines.length);
    const below: Box = [
      x + w / 2 - sw / 2,
      y + d + mm(0.8),
      x + w / 2 + sw / 2,
      y + d + mm(0.8) + sh,
    ];
    const above: Box = [x + w / 2 - sw / 2, y - mm(0.8) - sh, x + w / 2 + sw / 2, y - mm(0.8)];
    const box = isFree(below) || !isFree(above) ? below : above;
    claim(box);
    return textBlock(X(x + w / 2), Y((box[1] + box[3]) / 2), lines, {
      size: small,
      halo: true,
      firstBold: false,
    });
  };

  for (const pool of p.pooler) {
    if (!pool.namn) continue;
    // One line when it fits, otherwise wrapped.
    const oneLine = textWidth(pool.namn, 1.8) <= pool.rektangel[2] * k - 2;
    parts.push(areaLabel(pool.rektangel, oneLine ? [pool.namn] : wrapName(pool.namn), 2));
  }
  for (const f of p.fornlamningar) {
    if (!f.namn) continue;
    if (f.rektangel) parts.push(areaLabel(f.rektangel, wrapName(f.namn)));
    else if (f.punkt) parts.push(pointLabel(f.punkt[0], f.punkt[1], f.namn, 2.4));
  }
  for (const g of neighbourHouses) {
    if (g.namn) parts.push(areaLabel(g.rektangel, wrapName(g.namn), 2));
  }
  for (const t of p.trad) {
    if (!t.namn) continue;
    const stem = Math.max(0.4, ((t.stamdiameter ?? 0.3) / 2) * k);
    const crossed = t.status === 'falls';
    const gap = crossed
      ? Math.max(Math.min((t.krondiameter / 2) * k * 0.7, 4), stem + 1.2) + 0.8
      : stem + 1;
    parts.push(pointLabel(t.punkt[0], t.punkt[1], t.namn, gap));
  }
  // Levels: the existing level as plain text, the new level framed below it.
  for (const h of p.hojder) {
    const [px, py] = h.punkt;
    const rows = [
      ...(h.befintlig !== undefined ? [{ text: level(h.befintlig), framed: false }] : []),
      ...(h.ny !== undefined ? [{ text: level(h.ny), framed: true }] : []),
    ];
    const size = TEXT.small;
    const rowH = size * 1.45;
    const blockW = Math.max(...rows.map((r) => textWidth(r.text, size) + (r.framed ? 1 : 0)));
    const blockH = rows.length * rowH;
    const topMm = Y(py) - blockH / 2;
    const candidates = [X(px) + 1.4, X(px) - 1.4 - blockW];
    const boxAt = (left: number): Box => [
      x0 + left / k,
      y0 + topMm / k,
      x0 + (left + blockW) / k,
      y0 + (topMm + blockH) / k,
    ];
    const left = candidates.find((c) => isFree(boxAt(c))) ?? candidates[0]!;
    claim(boxAt(left));
    rows.forEach((row, i) => {
      const top = topMm + i * rowH;
      const tx = left + (row.framed ? 0.5 : 0);
      if (row.framed) {
        parts.push(
          rect(left, top + 0.15, textWidth(row.text, size) + 1, rowH - 0.3, {
            fill: PAPER,
            stroke: INK,
            'stroke-width': LINE.thin,
          }),
        );
      }
      parts.push(
        label(tx, top + rowH / 2, row.text, { size, baseline: 'middle', halo: !row.framed }),
      );
    });
  }
  // The new plots: name and area at a free spot, preferably in the southern part.
  for (const t of p.tomter) {
    const lines = [t.namn, t.area !== undefined ? `${thousands(t.area)} m²` : undefined].filter(
      (l): l is string => l !== undefined,
    );
    if (lines.length === 0) continue;
    const [x, y, w, d] = t.rektangel;
    const size = TEXT.label;
    const bw = mm(Math.max(...lines.map((l) => textWidth(l, size, true))) + 1);
    const bh = mm(size * 1.3 * lines.length);
    const preferred: [number, number] = [x + w / 2, y + d * 0.72];
    const options: [number, number][] = [];
    for (const fx of [0.5, 0.3, 0.7]) {
      for (let cy = y + bh / 2 + mm(1); cy <= y + d - bh / 2 - mm(1); cy += mm(1)) {
        options.push([x + w * fx, cy]);
      }
    }
    const boxAt = ([cx, cy]: [number, number]): Box => [
      cx - bw / 2,
      cy - bh / 2,
      cx + bw / 2,
      cy + bh / 2,
    ];
    const found =
      options
        .filter((o) => {
          const b = boxAt(o);
          return b[0] >= x && b[2] <= x + w && isFree(b);
        })
        .sort(
          (a, b) =>
            Math.abs(a[1] - preferred[1]) +
            Math.abs(a[0] - preferred[0]) * 2 -
            (Math.abs(b[1] - preferred[1]) + Math.abs(b[0] - preferred[0]) * 2),
        )[0] ?? preferred;
    claim(boxAt(found));
    parts.push(textBlock(X(found[0]), Y(found[1]), lines, { size, halo: true, firstBold: true }));
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
  // A building on one of the new plots is measured to that plot's boundaries.
  const plotOf = (r: Rectangle): [number, number] => {
    const t = p.tomter.find(
      ({ rektangel: [tx, ty, tw, td] }) =>
        r[0] >= tx - 1e-9 &&
        r[0] + r[2] <= tx + tw + 1e-9 &&
        r[1] >= ty - 1e-9 &&
        r[1] + r[3] <= ty + td + 1e-9,
    );
    return t ? [t.rektangel[0], t.rektangel[0] + t.rektangel[2]] : [0, W];
  };
  const horizontalChain = (y: number, r: Rectangle, fromY: number) => {
    const [west, east] = plotOf(r);
    horizontalTexts.push(...chainTexts('x', y, [west, r[0], r[0] + r[2], east]));
    return dimensionChain({
      axis: 'x',
      at: Y(y),
      points: [
        { at: X(west) },
        { at: X(r[0]), from: Y(fromY) },
        { at: X(r[0] + r[2]), from: Y(fromY) },
        { at: X(east) },
      ],
      format: metres,
    });
  };
  // Horizontal chains claim a band across the plot (text above the line).
  const chainBand = (y: number): Box => [0, y - mm(3.5), W, y + mm(1)];
  const features: Box[] = [
    ...p.anlaggningar.map((a) => boxOf(a.rektangel, mm(1))),
    ...p.parkering.map((a) => boxOf(a.rektangel, mm(1))),
    ...p.balkonger.map((b) => boxOf(b, mm(1))),
  ];
  if (driveway) features.push(boxOf(driveway, mm(1)));
  features.push(...p.pooler.map((a) => boxOf(a.rektangel, mm(1))), ...labelBoxes);
  for (const f of p.fornlamningar) {
    const box = monumentBox(f);
    if (overlaps(box, [0, 0, W, D])) features.push(box);
  }
  for (const t of p.trad) features.push(boxOf([...t.punkt, 0, 0], mm(1.5)));
  for (const h of p.hojder) features.push(boxOf([...h.punkt, 0, 0], mm(1.5)));
  for (const pt of p.punkter) {
    const [px, py] = pt.punkt;
    features.push([
      px - mm(1.6),
      py - mm(1.6),
      px + mm(2.6 + textWidth(pt.namn, TEXT.small)),
      py + mm(1.6),
    ]);
  }
  const anchors =
    p.anlaggningar.length +
    p.parkering.length +
    p.balkonger.length +
    p.punkter.length +
    p.pooler.length +
    p.trad.length +
    p.hojder.length +
    labelBoxes.length +
    p.fornlamningar.length +
    (driveway ? 1 : 0);
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
  // Features that run alongside the main building (a long driveway) do not push the chain away.
  const aboveHits = inBand(mainTop - mm(9), mainTop).filter((f) => f[3] <= mainTop + mm(1.5));
  const belowHits = inBand(mainBottom, mainBottom + mm(9)).filter(
    (f) => f[1] >= mainBottom - mm(1.5),
  );
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
  // The driveway's chain along a northern or southern boundary, where it will be drawn below.
  const drivewayChainY = (() => {
    const u = p.utfart;
    if (!u || !driveway || !isHorizontalSide(u.sida)) return undefined;
    const at = u.sida === 'norr' ? u.langd + mm(5) : D - u.langd - mm(3);
    const band: Box = [0, at - mm(3.5), u.lage + u.bredd, at + mm(1)];
    const long = u.langd * k > 40 && street?.sida === u.sida;
    return long || buildings.some((b) => overlaps(boxOf(b.r), band)) ? undefined : at;
  })();
  // A building chain that would run close to the driveway chain (less than 4 mm apart, where
  // both have values) moves to the other side of the building, if there is room there.
  const hitsDriveway = (y: number, r: Rectangle) => {
    if (drivewayChainY === undefined || !p.utfart) return false;
    const u = p.utfart;
    const [west] = plotOf(r);
    return Math.abs(y - drivewayChainY) < mm(4) && west < u.lage + u.bredd;
  };
  if (mainChainY < mainTop && belowOk && hitsDriveway(mainChainY, main)) {
    mainChainY = belowY;
    mainChainFrom = mainBottom;
  }
  chains.push(horizontalChain(mainChainY, main, mainChainFrom));
  occupied.push(chainBand(mainChainY));
  const mainCenter = main[1] + main[3] / 2;
  for (const b of buildings.filter(
    (x) => (x.kind === 'ny' || x.kind === 'avvikelse') && x.r !== main,
  )) {
    const [, y, , d] = b.r;
    // Below when the building lies south of the main building, unless that is on the boundary.
    const roomBelow = y + d + mm(4) <= D - mm(3);
    const below =
      (y + d / 2 > mainCenter && (roomBelow || y - mm(8) < 0)) ||
      (roomBelow && hitsDriveway(y - mm(4), b.r));
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
      let at = u.sida === 'norr' ? u.langd + mm(5) : D - u.langd - mm(3);
      // A chain that would cross a building moves out to the street side of the boundary.
      const band: Box = [0, at - mm(3.5), u.lage + u.bredd, at + mm(1)];
      const long = u.langd * k > 40 && street?.sida === u.sida;
      if (long || buildings.some((b) => overlaps(boxOf(b.r), band))) {
        at = u.sida === 'norr' ? -mm(5) : D + mm(6);
      }
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
    // A long driveway carries its name inside, along it.
    const inside = u.langd * k >= textWidth('Utfart', TEXT.small) + 20;
    parts.push(
      inside
        ? label(X(driveway[0] + driveway[2] / 2), Y(driveway[1] + driveway[3] / 2), 'Utfart', {
            anchor: 'middle',
            baseline: 'middle',
            size: TEXT.small,
            halo: true,
            rotate: horizontal ? -90 : 0,
          })
        : label(X(textAt[0]), Y(textAt[1]), 'Utfart', {
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
  let narrowStrips = false;
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
    // No strip wide enough for a chain with its values: outside the plot instead.
    if (
      (!best || best.to - best.from < mm(4)) &&
      p.balkonger.length + p.parkering.length + p.fornlamningar.length > 0
    ) {
      narrowStrips = true;
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
  // A building from boundary to boundary leaves no room inside the plot.
  const fullWidth = left <= 1e-9 && right >= W - 1e-9;
  if ((clash || narrowStrips || fullWidth) && outsideFree) {
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
    const plotEdges = p.tomter
      .flatMap(({ rektangel: [x, y, w, d] }) => (axis === 'x' ? [x, x + w] : [y, y + d]))
      .filter((v) => v > 1e-9 && v < size - 1e-9);
    const breaks = [
      ...new Set([
        ...p.prickmark
          .filter((z) => (axis === 'x' ? !isHorizontalSide(z.sida) : isHorizontalSide(z.sida)))
          .map((z) => (z.sida === 'norr' || z.sida === 'vaster' ? z.djup : size - z.djup)),
        ...plotEdges,
      ]),
    ].sort((a, b) => a - b);
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

  // Distance from the plot to an ancient monument area outside it.
  for (const f of p.fornlamningar) {
    if (!f.rektangel) continue;
    const [x, y, w, d] = f.rektangel;
    const top = Math.max(0, y);
    const bottom = Math.min(D, y + d);
    const westEnd = Math.max(0, x);
    const eastEnd = Math.min(W, x + w);
    if (bottom > top && (x >= W || x + w <= 0)) {
      const at = (top + bottom) / 2;
      const [a, b] = x >= W ? [W, x] : [x + w, 0];
      chains.push(
        dimensionChain({
          axis: 'x',
          at: Y(at),
          points: [{ at: X(Math.min(a, b)) }, { at: X(Math.max(a, b)) }],
          format: metres,
        }),
      );
    } else if (eastEnd > westEnd && (y >= D || y + d <= 0)) {
      const at = (westEnd + eastEnd) / 2;
      const [a, b] = y >= D ? [D, y] : [y + d, 0];
      chains.push(
        dimensionChain({
          axis: 'y',
          at: X(at),
          points: [{ at: Y(Math.min(a, b)) }, { at: Y(Math.max(a, b)) }],
          format: metres,
        }),
      );
    }
  }
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
  // With features outside the plot, the labels move along their side to a free spot.
  const avoid = farFeatures.length > 0 || p.trad.length + p.hojder.length > 0;
  for (const s of ['norr', 'oster', 'soder', 'vaster'] as const) {
    const name = p.grannar[s];
    if (!name) continue;
    let [nx, ny] = neighbourAt[s];
    // Make room for a vertical chain outside the plot on the east side.
    if (avoid && outside && s === 'oster') nx += mm(5);
    if (avoid) {
      const hw = mm(textWidth(name, TEXT.label) / 2 + 1);
      const hh = mm(TEXT.label * 0.8);
      const along = isHorizontalSide(s)
        ? [nx, W * 0.25, W * 0.75, W * 0.1, W * 0.9].map((v): [number, number] => [v, ny])
        : [ny, D * 0.3, D * 0.7, D * 0.15, D * 0.85].map((v): [number, number] => [nx, v]);
      const ok = along.find(
        ([cx, cy]) =>
          ![...occupied, ...farFeatures].some((o) =>
            overlaps(o, [cx - hw, cy - hh, cx + hw, cy + hh]),
          ),
      );
      if (ok) [nx, ny] = ok;
    }
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

  const treeSwatch =
    (felled: boolean) =>
    (x: number, y: number, w: number, h: number): string => {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const r = h / 2;
      return [
        el('circle', {
          cx,
          cy,
          r,
          fill: 'none',
          stroke: INK,
          'stroke-width': LINE.normal,
          'stroke-dasharray': felled ? FELLED_CROWN_DASH : undefined,
        }),
        el('circle', { cx, cy, r: 0.4, fill: INK }),
        felled ? line(cx - r * 0.55, cy - r * 0.55, cx + r * 0.55, cy + r * 0.55, LINE.medium) : '',
        felled ? line(cx - r * 0.55, cy + r * 0.55, cx + r * 0.55, cy - r * 0.55, LINE.medium) : '',
      ].join('');
    };
  const treeEntries: LegendEntry[] = [
    ...(p.trad.some((t) => t.status === 'bevaras')
      ? [{ swatch: { type: 'custom' as const, draw: treeSwatch(false) }, text: 'Träd som bevaras' }]
      : []),
    ...(p.trad.some((t) => t.status === 'falls')
      ? [{ swatch: { type: 'custom' as const, draw: treeSwatch(true) }, text: 'Träd som fälls' }]
      : []),
  ];
  const levelEntries: LegendEntry[] = [
    ...(p.hojder.some((h) => h.befintlig !== undefined)
      ? [
          {
            swatch: {
              type: 'custom' as const,
              draw: (x: number, y: number, w: number, h: number) =>
                label(x + w / 2, y + h / 2, '+0,00', {
                  anchor: 'middle',
                  baseline: 'middle',
                  size: TEXT.small,
                }),
            },
            text: 'Befintlig marknivå (m)',
          },
        ]
      : []),
    ...(p.hojder.some((h) => h.ny !== undefined)
      ? [
          {
            swatch: {
              type: 'custom' as const,
              draw: (x: number, y: number, w: number, h: number) =>
                rect(x + 0.6, y, w - 1.2, h, {
                  fill: PAPER,
                  stroke: INK,
                  'stroke-width': LINE.thin,
                }) +
                label(x + w / 2, y + h / 2, '+0,00', {
                  anchor: 'middle',
                  baseline: 'middle',
                  size: TEXT.small,
                }),
            },
            text: 'Ny marknivå (m)',
          },
        ]
      : []),
  ];
  const entries: LegendEntry[] = [
    ...(p.hus || p.ovriga_byggnader.length > 0
      ? [
          {
            swatch: { type: 'fill' as const, fill: PAPER, strokeWidth: LINE.heavy },
            text: 'Befintlig byggnad',
          },
        ]
      : []),
    ...(buildings.some((b) => b.kind === 'ny')
      ? [
          {
            swatch: { type: 'fill' as const, fill: `url(#${ids.ny})`, strokeWidth: LINE.bold },
            text: 'Ny byggnad eller tillbyggnad',
          },
        ]
      : []),
    ...(p.avvikelse.length > 0
      ? [
          {
            swatch: {
              type: 'fill' as const,
              fill: `url(#${ids.avvikelse})`,
              strokeWidth: LINE.bold,
            },
            text: 'Utfört utan lov eller i strid med lovet',
          },
        ]
      : []),
    ...(p.lovgivet.length > 0
      ? [
          {
            swatch: { type: 'line' as const, width: LINE.heavy, dash: LOVGIVET_DASH },
            text: p.lovgivet[0]?.namn ?? 'Enligt beviljat lov',
          },
        ]
      : []),
    ...(p.balkonger.length > 0
      ? [
          {
            swatch: {
              type: 'fill' as const,
              fill: 'none',
              strokeWidth: LINE.medium,
              dash: BALCONY_DASH,
            },
            text: 'Balkong, ovan mark',
          },
        ]
      : []),
    ...(p.parkering.length > 0
      ? [
          {
            swatch: { type: 'fill' as const, fill: PAPER, strokeWidth: LINE.normal },
            text: p.parkering.some((x) => x.tillgangliga > 0)
              ? 'Parkering, PRH = plats för rörelsehindrade'
              : 'Parkering',
          },
        ]
      : []),
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
    ...(p.pooler.length > 0
      ? [
          {
            swatch: { type: 'fill' as const, fill: `url(#${ids.pool})`, strokeWidth: LINE.medium },
            text: 'Pool',
          },
        ]
      : []),
    ...treeEntries,
    ...levelEntries,
    ...(p.fornlamningar.length > 0
      ? [
          {
            swatch: {
              type: 'fill' as const,
              fill: `url(#${ids.fornlamning})`,
              strokeWidth: LINE.medium,
              dash: MONUMENT_DASH,
            },
            text: 'Fornlämning',
          },
        ]
      : []),
    {
      swatch: { type: 'line' as const, width: LINE.bold, dash: '7 1.2 1.2 1.2' },
      text: p.tomter.length > 0 ? 'Gräns för området som ska styckas av' : 'Tomtgräns',
    },
    ...(p.tomter.length > 0
      ? [
          {
            swatch: { type: 'line' as const, width: LINE.heavy, dash: NEW_BOUNDARY_DASH },
            text: 'Ny tomtgräns',
          },
        ]
      : []),
    { swatch: { type: 'line' as const, width: LINE.thin }, text: 'Fastighetsgräns, grannar' },
    ...(p.grannhus.length > 0
      ? [
          {
            swatch: { type: 'fill' as const, fill: NEIGHBOUR_FILL, strokeWidth: LINE.normal },
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
  // Above ten rows the bottom row would touch the frame, so they get a little tighter still.
  const rowHeight =
    entries.length > 10
      ? 33 / entries.length
      : entries.length > 7
        ? Math.min(5, 34.5 / entries.length)
        : 5;
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
    scale: p.skala,
    origin: [X(0), Y(0)],
  });
}
