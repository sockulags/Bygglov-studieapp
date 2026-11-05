// Small, deterministic SVG toolkit shared by the drawing generators. All sheet coordinates
// are millimetres on paper; the generators convert metres with `1000 / skala`.

export const FONT_FAMILY = "Arial, Helvetica, 'Liberation Sans', 'DejaVu Sans', sans-serif";

/** Line weights in mm. */
export const LINE = {
  hair: 0.13,
  thin: 0.18,
  normal: 0.25,
  medium: 0.35,
  heavy: 0.5,
  bold: 0.7,
} as const;

/** Text heights in mm. */
export const TEXT = {
  small: 1.8,
  normal: 2.5,
  label: 3,
  heading: 3.5,
  title: 5,
} as const;

export const INK = '#000';
export const PAPER = '#fff';

/** Numbers in attributes: two decimals at most, no trailing zeros, never `-0`. */
export function n(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) || rounded === 0 ? '0' : String(rounded);
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type Attrs = Record<string, string | number | undefined>;

function attrs(values: Attrs): string {
  let out = '';
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    out += ` ${key}="${typeof value === 'number' ? n(value) : escapeXml(value)}"`;
  }
  return out;
}

/** An element. `children` is already serialised markup; text must be escaped by the caller. */
export function el(tag: string, attributes: Attrs = {}, children?: string | string[]): string {
  const inner = Array.isArray(children) ? children.join('') : children;
  return inner === undefined || inner === ''
    ? `<${tag}${attrs(attributes)}/>`
    : `<${tag}${attrs(attributes)}>${inner}</${tag}>`;
}

export const group = (children: string[], attributes: Attrs = {}) => el('g', attributes, children);

/** Swedish decimal format, e.g. `sv(4.9, 1)` → "4,9". */
export function sv(value: number, decimals: number): string {
  const fixed = value.toFixed(decimals);
  return (fixed === `-${(0).toFixed(decimals)}` ? fixed.slice(1) : fixed).replace('.', ',');
}

/** Metres as millimetres with a space as thousands separator, e.g. 12.5 → "12 500". */
export function millimetres(metres: number): string {
  const mm = Math.round(metres * 1000);
  return String(mm).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** A level relative to ground, e.g. 4.9 → "+4,90", 0 → "±0,00". */
export function level(metres: number): string {
  if (Math.abs(metres) < 0.005) return '±0,00';
  return `${metres > 0 ? '+' : '−'}${sv(Math.abs(metres), 2)}`;
}

/** Rough text width for layout (Arial-like proportions). */
export function textWidth(value: string, size: number, bold = false): number {
  let units = 0;
  for (const ch of value) {
    if (ch === ' ') units += 0.28;
    else if ("il.,:;|!'’".includes(ch)) units += 0.26;
    else if ('ftjrI()-'.includes(ch)) units += 0.36;
    else if ('mwMW'.includes(ch)) units += 0.86;
    else if (ch >= 'A' && ch <= 'Z') units += 0.68;
    else if ('ÅÄÖ'.includes(ch)) units += 0.7;
    else if (ch >= '0' && ch <= '9') units += 0.56;
    else units += 0.54;
  }
  return units * size * (bold ? 1.06 : 1);
}

export interface TextOptions {
  size?: number;
  anchor?: 'start' | 'middle' | 'end';
  weight?: 'normal' | 'bold';
  italic?: boolean;
  rotate?: number;
  /** White outline so the text stays readable on top of hatching. */
  halo?: boolean;
  fill?: string;
  letterSpacing?: number;
  /** Vertical alignment of the given y: the baseline (default) or the middle of the text. */
  baseline?: 'alphabetic' | 'middle';
}

/** A single line of text. y is the baseline unless `baseline: 'middle'`. */
export function label(x: number, y: number, value: string, options: TextOptions = {}): string {
  const size = options.size ?? TEXT.normal;
  const yy = options.baseline === 'middle' ? y + size * 0.35 : y;
  return el(
    'text',
    {
      x,
      y: yy,
      'font-size': size,
      'text-anchor': options.anchor ?? 'start',
      'font-weight': options.weight === 'bold' ? 'bold' : undefined,
      'font-style': options.italic ? 'italic' : undefined,
      'letter-spacing': options.letterSpacing,
      fill: options.fill ?? INK,
      transform: options.rotate ? `rotate(${n(options.rotate)} ${n(x)} ${n(y)})` : undefined,
      stroke: options.halo ? PAPER : undefined,
      'stroke-width': options.halo ? size * 0.35 : undefined,
      'stroke-linejoin': options.halo ? 'round' : undefined,
      'paint-order': options.halo ? 'stroke' : undefined,
    },
    escapeXml(value),
  );
}

/** Several centred lines around (x, y). The first line may be bold. */
export function textBlock(
  x: number,
  y: number,
  lines: string[],
  options: TextOptions & { lineHeight?: number; firstBold?: boolean } = {},
): string {
  const size = options.size ?? TEXT.normal;
  const lineHeight = options.lineHeight ?? size * 1.25;
  const top = y - ((lines.length - 1) * lineHeight) / 2;
  return lines
    .map((value, i) =>
      label(x, top + i * lineHeight, value, {
        anchor: 'middle',
        baseline: 'middle',
        ...options,
        weight: options.firstBold && i === 0 ? 'bold' : options.weight,
      }),
    )
    .join('');
}

export function line(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number = LINE.thin,
  extra: Attrs = {},
): string {
  return el('line', {
    x1,
    y1,
    x2,
    y2,
    stroke: INK,
    'stroke-width': width,
    'stroke-linecap': 'butt',
    ...extra,
  });
}

export function rect(
  x: number,
  y: number,
  width: number,
  height: number,
  extra: Attrs = {},
): string {
  return el('rect', { x, y, width, height, ...extra });
}

export function polygon(points: [number, number][], extra: Attrs = {}): string {
  return el('polygon', { points: points.map(([x, y]) => `${n(x)},${n(y)}`).join(' '), ...extra });
}

export function polyline(points: [number, number][], extra: Attrs = {}): string {
  return el('polyline', {
    points: points.map(([x, y]) => `${n(x)},${n(y)}`).join(' '),
    fill: 'none',
    ...extra,
  });
}

/** Parallel lines at `angle` degrees (0 = vertical lines), as a fill pattern. */
export function hatchPattern(
  id: string,
  options: { angle: number; spacing: number; width?: number; color?: string },
): string {
  const s = options.spacing;
  return el(
    'pattern',
    {
      id,
      patternUnits: 'userSpaceOnUse',
      width: s,
      height: s,
      patternTransform: `rotate(${n(options.angle)})`,
    },
    line(0, 0, 0, s, options.width ?? LINE.hair, { stroke: options.color ?? INK }),
  );
}

/** Diagonal cross-hatching, as a fill pattern (built without or in breach of a permit). */
export function crossHatchPattern(
  id: string,
  options: { spacing: number; width?: number },
): string {
  const s = options.spacing;
  const w = options.width ?? LINE.hair;
  return el('pattern', { id, patternUnits: 'userSpaceOnUse', width: s, height: s }, [
    line(0, 0, s, s, w),
    line(0, s, s, 0, w),
  ]);
}

/** Regular dots, as a fill pattern (prickmark on a plan map). */
export function dotPattern(id: string, options: { spacing: number; radius: number }): string {
  const s = options.spacing;
  return el('pattern', { id, patternUnits: 'userSpaceOnUse', width: s, height: s }, [
    el('circle', { cx: s / 4, cy: s / 4, r: options.radius, fill: INK }),
    el('circle', { cx: (3 * s) / 4, cy: (3 * s) / 4, r: options.radius, fill: INK }),
  ]);
}

// ---------------------------------------------------------------------------------------------
// Dimensions

export interface ChainPoint {
  /** Position along the measured axis (mm). */
  at: number;
  /** Perpendicular position of the measured feature; draws an extension line from it. */
  from?: number;
}

export interface ChainOptions {
  /** `x`: a horizontal chain measuring along x. `y`: a vertical chain measuring along y. */
  axis: 'x' | 'y';
  /** Perpendicular position of the dimension line (mm). */
  at: number;
  points: ChainPoint[];
  /** Text for each segment; return '' to leave a segment unlabelled. */
  format: (lengthMm: number, index: number) => string;
  /** Text above (horizontal) or to the left (vertical) of the line, or the other side. */
  textSide?: 'before' | 'after';
  size?: number;
}

/** A dimension chain with extension lines, 45° ticks and centred values. */
export function dimensionChain(options: ChainOptions): string {
  const points = [...options.points].sort((a, b) => a.at - b.at);
  const deduped: ChainPoint[] = [];
  for (const p of points) {
    const last = deduped.at(-1);
    if (last && Math.abs(last.at - p.at) < 0.01) {
      if (last.from === undefined) last.from = p.from;
      continue;
    }
    deduped.push({ ...p });
  }
  if (deduped.length < 2) return '';
  const size = options.size ?? TEXT.normal;
  const first = deduped[0]!.at;
  const last = deduped.at(-1)!.at;
  const horizontal = options.axis === 'x';
  const parts: string[] = [];
  const gap = 1;
  const overshoot = 1.5;

  // Dimension line, slightly past the end points.
  parts.push(
    horizontal
      ? line(first - overshoot, options.at, last + overshoot, options.at, LINE.hair)
      : line(options.at, first - overshoot, options.at, last + overshoot, LINE.hair),
  );
  for (const p of deduped) {
    if (p.from !== undefined && Math.abs(p.from - options.at) > gap) {
      const dir = Math.sign(options.at - p.from);
      const start = p.from + dir * gap;
      const end = options.at + dir * overshoot;
      parts.push(
        horizontal
          ? line(p.at, start, p.at, end, LINE.hair)
          : line(start, p.at, end, p.at, LINE.hair),
      );
    }
    // Architectural tick.
    const t = 1;
    parts.push(
      horizontal
        ? line(p.at - t, options.at + t, p.at + t, options.at - t, LINE.medium)
        : line(options.at - t, p.at + t, options.at + t, p.at - t, LINE.medium),
    );
  }
  const before = (options.textSide ?? 'before') === 'before';
  for (let i = 0; i < deduped.length - 1; i += 1) {
    const a = deduped[i]!.at;
    const b = deduped[i + 1]!.at;
    const value = options.format(b - a, i);
    if (!value) continue;
    const mid = (a + b) / 2;
    const w = textWidth(value, size);
    // A value that does not fit between the ticks is moved past the end of the chain.
    const along = w + 1 < b - a ? mid : i === 0 ? a - w / 2 - 2 : b + w / 2 + 2;
    if (horizontal) {
      const y = before ? options.at - 0.9 : options.at + 0.9 + size * 0.75;
      parts.push(label(along, y, value, { anchor: 'middle', size, halo: true }));
    } else {
      const x = before ? options.at - 0.9 : options.at + 0.9 + size * 0.75;
      parts.push(label(x, along, value, { anchor: 'middle', size, rotate: -90, halo: true }));
    }
  }
  return group(parts, { class: 'matt' });
}

// ---------------------------------------------------------------------------------------------
// Symbols

/** North arrow centred on (x, y), rotated clockwise by `angle` degrees. */
export function northArrow(x: number, y: number, angle = 0, radius = 6): string {
  const r = radius;
  return group(
    [
      el('circle', { cx: 0, cy: 0, r, fill: 'none', stroke: INK, 'stroke-width': LINE.thin }),
      polygon(
        [
          [0, -r * 1.25],
          [r * 0.42, r * 0.75],
          [0, r * 0.35],
        ],
        { fill: INK, stroke: INK, 'stroke-width': LINE.hair, 'stroke-linejoin': 'round' },
      ),
      polygon(
        [
          [0, -r * 1.25],
          [-r * 0.42, r * 0.75],
          [0, r * 0.35],
        ],
        { fill: PAPER, stroke: INK, 'stroke-width': LINE.thin, 'stroke-linejoin': 'round' },
      ),
      label(0, -r * 1.25 - 1.2, 'N', { anchor: 'middle', size: TEXT.label, weight: 'bold' }),
    ],
    { transform: `translate(${n(x)} ${n(y)}) rotate(${n(angle)})`, class: 'norrpil' },
  );
}

const NICE_STEPS = [0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 500];

/** Scale bar starting at (x, y) with about `targetMm` total length. Returns markup and width. */
export function scaleBar(
  x: number,
  y: number,
  mmPerMetre: number,
  scaleDenominator: number,
  targetMm = 50,
): { svg: string; width: number; height: number } {
  const segments = 4;
  const step =
    NICE_STEPS.find((s) => s * segments * mmPerMetre >= targetMm * 0.7) ?? NICE_STEPS.at(-1)!;
  const segment = step * mmPerMetre;
  const h = 1.6;
  const parts: string[] = [];
  for (let i = 0; i < segments; i += 1) {
    parts.push(
      rect(x + i * segment, y, segment, h, {
        fill: i % 2 === 0 ? INK : PAPER,
        stroke: INK,
        'stroke-width': LINE.thin,
      }),
    );
  }
  for (let i = 0; i <= segments; i += 1) {
    const value = step * i;
    const text =
      i === segments
        ? `${sv(value, value % 1 === 0 ? 0 : 1)} m`
        : sv(value, value % 1 === 0 ? 0 : 1);
    parts.push(label(x + i * segment, y + h + 3, text, { anchor: 'middle', size: TEXT.small }));
  }
  parts.push(label(x, y - 1.5, `Skala 1:${scaleDenominator}`, { size: TEXT.small }));
  return {
    svg: group(parts, { class: 'skalstock' }),
    width: segment * segments + 4,
    height: h + 6,
  };
}

// ---------------------------------------------------------------------------------------------
// Legend

export type LegendSwatch =
  | { type: 'fill'; fill: string; stroke?: string; strokeWidth?: number; dash?: string }
  | { type: 'line'; width: number; dash?: string; color?: string }
  | { type: 'symbol'; text: string; weight?: 'normal' | 'bold'; italic?: boolean }
  /** Any markup inside the swatch box (x, y, width, height in mm). */
  | { type: 'custom'; draw: (x: number, y: number, width: number, height: number) => string };

export interface LegendEntry {
  swatch: LegendSwatch;
  text: string;
}

/** A legend block with a heading. Returns markup and its size. */
export function legend(
  x: number,
  y: number,
  heading: string,
  entries: LegendEntry[],
  options: { rowHeight?: number; size?: number } = {},
): { svg: string; width: number; height: number } {
  const row = options.rowHeight ?? 5;
  const size = options.size ?? TEXT.small;
  const sw = 9;
  // Tight rows get lower swatches, so that they do not run into each other.
  const sh = Math.min(3.4, row - 0.8);
  const parts: string[] = [
    label(x, y + TEXT.normal, heading, { size: TEXT.normal, weight: 'bold' }),
  ];
  let width = textWidth(heading, TEXT.normal, true);
  entries.forEach((entry, i) => {
    const top = y + 5 + i * row;
    const s = entry.swatch;
    if (s.type === 'fill') {
      parts.push(
        rect(x, top, sw, sh, {
          fill: s.fill,
          stroke: s.stroke ?? INK,
          'stroke-width': s.strokeWidth ?? LINE.thin,
          'stroke-dasharray': s.dash,
        }),
      );
    } else if (s.type === 'line') {
      parts.push(
        line(x, top + sh / 2, x + sw, top + sh / 2, s.width, {
          'stroke-dasharray': s.dash,
          stroke: s.color ?? INK,
        }),
      );
    } else if (s.type === 'custom') {
      parts.push(s.draw(x, top, sw, sh));
    } else {
      parts.push(
        label(x + sw / 2, top + sh / 2, s.text, {
          anchor: 'middle',
          baseline: 'middle',
          size: TEXT.normal,
          weight: s.weight,
          italic: s.italic,
        }),
      );
    }
    parts.push(label(x + sw + 2.5, top + sh / 2, entry.text, { size, baseline: 'middle' }));
    width = Math.max(width, sw + 2.5 + textWidth(entry.text, size));
  });
  return {
    svg: group(parts, { class: 'teckenforklaring' }),
    width,
    height: 5 + entries.length * row,
  };
}

// ---------------------------------------------------------------------------------------------
// Sheet

export interface TitleBlockData {
  fastighet: string;
  projekt: string;
  ritningstyp: string;
  skala: string;
  datum: string;
  ritningsnummer?: string;
  ritadAv?: string;
}

export interface SheetSize {
  name: string;
  width: number;
  height: number;
}

export const SHEETS: SheetSize[] = [
  { name: 'A4 stående', width: 210, height: 297 },
  { name: 'A4 liggande', width: 297, height: 210 },
  { name: 'A3 liggande', width: 420, height: 297 },
  { name: 'A3 stående', width: 297, height: 420 },
  { name: 'A2 liggande', width: 594, height: 420 },
];

const FRAME = { left: 20, top: 10, right: 10, bottom: 10 };
const TITLE_W = 110;
const TITLE_H = 40;
/** Space between the drawing area and the bottom strip with title block and legend. */
const STRIP_GAP = 4;

/** Fixed-size area for drawn content plus an optional footer left of the title block. */
export interface SheetContent {
  width: number;
  height: number;
  /** Content markup in its own coordinates, origin at its top-left corner. */
  svg: string;
  footer?: { width: number; height: number; svg: string };
}

export class DrawingDoesNotFitError extends Error {}

function titleBlock(x: number, y: number, data: TitleBlockData): string {
  const w = TITLE_W;
  const parts: string[] = [
    rect(x, y, w, TITLE_H, { fill: PAPER, stroke: INK, 'stroke-width': LINE.heavy }),
  ];
  const rows = [7, 8, 8, 8.5, 8.5];
  let top = y;
  const cell = (cx: number, cy: number, cw: number, ch: number, caption: string, value: string) => {
    const size = Math.min(TEXT.label, (cw - 3) / Math.max(1, textWidth(value, 1)));
    parts.push(label(cx + 1.5, cy + 2.6, caption, { size: 1.6 }));
    parts.push(label(cx + 1.5, cy + ch - 1.6, value, { size: Math.max(1.6, size) }));
  };
  // Row 1: the disclaimer.
  parts.push(
    label(x + w / 2, top + rows[0]! / 2, 'FIKTIV HANDLING FÖR UTBILDNING', {
      anchor: 'middle',
      baseline: 'middle',
      size: 3.4,
      weight: 'bold',
      letterSpacing: 0.15,
    }),
  );
  top += rows[0]!;
  parts.push(line(x, top, x + w, top, LINE.medium));
  cell(x, top, w, rows[1]!, 'Projekt', data.projekt);
  top += rows[1]!;
  parts.push(line(x, top, x + w, top, LINE.thin));
  cell(x, top, w, rows[2]!, 'Fastighet', data.fastighet);
  top += rows[2]!;
  parts.push(line(x, top, x + w, top, LINE.thin));
  const split = x + w * 0.66;
  cell(x, top, split - x, rows[3]!, 'Ritning', data.ritningstyp);
  cell(split, top, x + w - split, rows[3]!, 'Skala (A-format)', data.skala);
  parts.push(line(split, top, split, top + rows[3]!, LINE.thin));
  top += rows[3]!;
  parts.push(line(x, top, x + w, top, LINE.thin));
  const third = x + w / 3;
  cell(x, top, third - x, rows[4]!, 'Datum', data.datum);
  cell(third, top, split - third, rows[4]!, 'Ritad av', data.ritadAv ?? '–');
  cell(split, top, x + w - split, rows[4]!, 'Ritningsnummer', data.ritningsnummer ?? '–');
  parts.push(line(third, top, third, top + rows[4]!, LINE.thin));
  parts.push(line(split, top, split, top + rows[4]!, LINE.thin));
  return group(parts, { class: 'ritningshuvud', 'data-layer': 'ritningshuvud' });
}

/** Index in `SHEETS` of the smallest sheet that fits, or -1. */
export function sheetIndex(content: Pick<SheetContent, 'width' | 'height' | 'footer'>): number {
  return SHEETS.findIndex((sheet) => fits(sheet, content));
}

function fits(sheet: SheetSize, content: Pick<SheetContent, 'width' | 'height' | 'footer'>) {
  const areaW = sheet.width - FRAME.left - FRAME.right - 4;
  const areaH = sheet.height - FRAME.top - FRAME.bottom - TITLE_H - STRIP_GAP - 4;
  const footerW = sheet.width - FRAME.left - FRAME.right - TITLE_W - 6;
  const footerOk =
    !content.footer || (content.footer.width <= footerW && content.footer.height <= TITLE_H);
  return content.width <= areaW && content.height <= areaH && footerOk;
}

/** Picks the smallest sheet where the content and footer fit. */
export function chooseSheet(content: SheetContent): SheetSize {
  for (const sheet of SHEETS) {
    if (fits(sheet, content)) return sheet;
  }
  throw new DrawingDoesNotFitError(
    `Ritningen (${Math.ceil(content.width)} × ${Math.ceil(content.height)} mm) får inte plats ens på A2. Välj en mindre skala (större skaltal) eller färre delar.`,
  );
}

/**
 * Scale and coordinate system as data attributes on the SVG root, so a viewer can measure:
 * one user unit is one millimetre on paper, `data-meters-per-unit` converts it to metres in
 * reality, `data-drawing-area` is the drawn content (x y width height) and `data-origin` the
 * model's origin (x east, y south), both in user units.
 */
export function scaleMetadata(
  scale: number,
  area: { x: number; y: number; width: number; height: number },
  origin?: [number, number],
): Attrs {
  return {
    'data-scale': `1:${scale}`,
    'data-units': 'mm',
    // Not `n()`: 1:25 is 0.025 m per mm and must not be rounded to two decimals.
    'data-meters-per-unit': String(scale / 1000),
    'data-drawing-area': [area.x, area.y, area.width, area.height].map(n).join(' '),
    'data-origin': origin ? `${n(area.x + origin[0])} ${n(area.y + origin[1])}` : undefined,
  };
}

/** Wraps content in a sheet with frame and title block. Deterministic for equal input. */
export function composeSheet(options: {
  content: SheetContent;
  title: TitleBlockData;
  /** Text alternative for the drawing. */
  description: string;
  /** Prefix for ids in `defs`, unique per document. */
  defs?: string[];
  /** Scale denominator of the drawn content, e.g. 500 for 1:500. */
  scale: number;
  /**
   * Where the model's origin (x = 0, y = 0 in the parameters, x east and y south) lies in the
   * content's own coordinates (mm). Left out for drawings without one shared origin.
   */
  origin?: [number, number];
}): string {
  const { content } = options;
  const sheet = chooseSheet(content);
  const W = sheet.width;
  const H = sheet.height;
  const areaX = FRAME.left + 2;
  const areaY = FRAME.top + 2;
  const areaW = W - FRAME.left - FRAME.right - 4;
  const areaH = H - FRAME.top - FRAME.bottom - TITLE_H - STRIP_GAP - 4;
  const cx = areaX + (areaW - content.width) / 2;
  const cy = areaY + (areaH - content.height) / 2;
  const titleX = W - FRAME.right - TITLE_W;
  const titleY = H - FRAME.bottom - TITLE_H;

  const parts: string[] = [
    el('title', {}, escapeXml(options.description)),
    options.defs && options.defs.length > 0 ? el('defs', {}, options.defs) : '',
    group(
      [
        rect(0, 0, W, H, { fill: PAPER }),
        rect(FRAME.left, FRAME.top, W - FRAME.left - FRAME.right, H - FRAME.top - FRAME.bottom, {
          fill: 'none',
          stroke: INK,
          'stroke-width': LINE.heavy,
        }),
      ],
      { 'data-layer': 'ram' },
    ),
    group([content.svg], {
      transform: `translate(${n(cx)} ${n(cy)})`,
      class: 'ritning',
      'data-layer': 'ritning',
    }),
  ];
  if (content.footer) {
    parts.push(
      group([content.footer.svg], {
        transform: `translate(${n(FRAME.left + 3)} ${n(titleY + (TITLE_H - content.footer.height) / 2)})`,
        class: 'fot',
        'data-layer': 'fot',
      }),
    );
  }
  parts.push(titleBlock(titleX, titleY, options.title));

  return `${el(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      width: `${n(W)}mm`,
      height: `${n(H)}mm`,
      viewBox: `0 0 ${n(W)} ${n(H)}`,
      'font-family': FONT_FAMILY,
      role: 'img',
      'aria-label': options.description,
      'data-papper': sheet.name,
      ...scaleMetadata(
        options.scale,
        { x: cx, y: cy, width: content.width, height: content.height },
        options.origin,
      ),
    },
    parts,
  )}\n`;
}

/** Centred, underlined heading under a view, e.g. "FASAD MOT SÖDER". */
export function viewHeading(x: number, y: number, text: string): string {
  const value = text.toUpperCase();
  const w = textWidth(value, TEXT.heading, true);
  return (
    label(x, y, value, { anchor: 'middle', size: TEXT.heading, weight: 'bold' }) +
    line(x - w / 2, y + 1.2, x + w / 2, y + 1.2, LINE.medium)
  );
}
