// Geometry for the measuring tool in the drawing viewer. Pure TypeScript, no React.
//
// Three coordinate systems meet here:
// - sheet units: the SVG's user units, millimetres on paper (`viewBox`);
// - image pixels: the <img> at its natural size, before zoom;
// - frame pixels: what the person sees inside the viewer, after zoom and panning.
// The generator writes the scale on the SVG root (`data-meters-per-unit`, see
// packages/content-build/src/drawings/svg.ts), which turns sheet units into metres.

export interface Point {
  x: number;
  y: number;
}

/** The viewer's zoom and pan: frame px = image px × scale + (x, y). */
export interface ViewTransform {
  scale: number;
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What a drawing says about its own scale. */
export interface DrawingMetadata {
  /** E.g. "1:500". */
  scaleLabel: string;
  /** Metres in reality per sheet unit. */
  metersPerUnit: number;
  viewBox: Box;
  /** The drawn content in sheet units, if the drawing says where it is. */
  drawingArea: Box | null;
}

/** A segment in sheet units, for snapping. */
export interface Segment {
  a: Point;
  b: Point;
}

/** Endpoints and edges of the drawn geometry, in sheet units. */
export interface SnapTargets {
  points: Point[];
  segments: Segment[];
}

// ---------------------------------------------------------------------------------------------
// Basic geometry

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Area of a simple polygon with the shoelace formula, always positive. */
export function polygonArea(points: readonly Point[]): number {
  if (points.length < 3) return 0;
  let twice = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    twice += p.x * q.y - q.x * p.y;
  }
  return Math.abs(twice) / 2;
}

/** The centre of mass of a polygon (for placing its label), or the mean for degenerate ones. */
export function polygonCentroid(points: readonly Point[]): Point {
  let twice = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    const cross = p.x * q.y - q.x * p.y;
    twice += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(twice) < 1e-9) {
    const n = Math.max(1, points.length);
    return {
      x: points.reduce((s, p) => s + p.x, 0) / n,
      y: points.reduce((s, p) => s + p.y, 0) / n,
    };
  }
  return { x: cx / (3 * twice), y: cy / (3 * twice) };
}

/** The point on segment `s` closest to `p`. */
export function closestPointOnSegment(p: Point, s: Segment): Point {
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return s.a;
  const t = Math.min(1, Math.max(0, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / lengthSquared));
  return { x: s.a.x + t * dx, y: s.a.y + t * dy };
}

// ---------------------------------------------------------------------------------------------
// Coordinate conversions

/**
 * How the SVG's viewBox lands on the image: uniform scale and centring, as the browser does
 * with the default `preserveAspectRatio` (xMidYMid meet).
 */
export function sheetPlacement(
  viewBox: Box,
  image: { width: number; height: number },
): { pxPerUnit: number; offsetX: number; offsetY: number } {
  const pxPerUnit = Math.min(image.width / viewBox.width, image.height / viewBox.height);
  return {
    pxPerUnit,
    offsetX: (image.width - viewBox.width * pxPerUnit) / 2 - viewBox.x * pxPerUnit,
    offsetY: (image.height - viewBox.height * pxPerUnit) / 2 - viewBox.y * pxPerUnit,
  };
}

/** A point inside the viewer frame (px) → sheet units. */
export function frameToSheet(
  p: Point,
  view: ViewTransform,
  placement: ReturnType<typeof sheetPlacement>,
): Point {
  return {
    x: ((p.x - view.x) / view.scale - placement.offsetX) / placement.pxPerUnit,
    y: ((p.y - view.y) / view.scale - placement.offsetY) / placement.pxPerUnit,
  };
}

/** Sheet units → a point inside the viewer frame (px). */
export function sheetToFrame(
  p: Point,
  view: ViewTransform,
  placement: ReturnType<typeof sheetPlacement>,
): Point {
  return {
    x: (p.x * placement.pxPerUnit + placement.offsetX) * view.scale + view.x,
    y: (p.y * placement.pxPerUnit + placement.offsetY) * view.scale + view.y,
  };
}

/** A distance on screen in frame pixels → metres in reality. */
export function framePixelsToMeters(
  pixels: number,
  view: ViewTransform,
  placement: ReturnType<typeof sheetPlacement>,
  metersPerUnit: number,
): number {
  return (pixels / (view.scale * placement.pxPerUnit)) * metersPerUnit;
}

export function unitsToMeters(units: number, metersPerUnit: number): number {
  return units * metersPerUnit;
}

export function squareUnitsToSquareMeters(area: number, metersPerUnit: number): number {
  return area * metersPerUnit * metersPerUnit;
}

// ---------------------------------------------------------------------------------------------
// Snapping

export interface Snap {
  point: Point;
  kind: 'endpoint' | 'edge';
}

/**
 * The snap target for a pointer at `pointer` (frame px): the nearest endpoint within `radius`
 * px, otherwise the nearest point on an edge within `radius` px, otherwise none.
 */
export function findSnap(
  pointer: Point,
  targets: SnapTargets,
  toFrame: (p: Point) => Point,
  radius = 8,
): Snap | null {
  let best: Snap | null = null;
  let bestDistance = radius;
  for (const p of targets.points) {
    const d = distance(pointer, toFrame(p));
    if (d <= bestDistance) {
      best = { point: p, kind: 'endpoint' };
      bestDistance = d;
    }
  }
  if (best) return best;
  for (const s of targets.segments) {
    const a = toFrame(s.a);
    const b = toFrame(s.b);
    const onScreen = closestPointOnSegment(pointer, { a, b });
    const d = distance(pointer, onScreen);
    if (d <= bestDistance) {
      // Back to sheet units along the same segment.
      const length = distance(a, b);
      const t = length === 0 ? 0 : distance(a, onScreen) / length;
      best = {
        point: { x: s.a.x + t * (s.b.x - s.a.x), y: s.a.y + t * (s.b.y - s.a.y) },
        kind: 'edge',
      };
      bestDistance = d;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// Formatting

const one = new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "3,0 m". */
export function formatMeters(meters: number): string {
  return `${one.format(meters)} m`;
}

/** "28,0 kvm". */
export function formatSquareMeters(squareMeters: number): string {
  return `${one.format(squareMeters)} kvm`;
}

// ---------------------------------------------------------------------------------------------
// Measurements

export type MeasureKind = 'distance' | 'area';

/** A finished measurement, points in sheet units. */
export interface Measurement {
  id: number;
  kind: MeasureKind;
  points: Point[];
}

/** The value of a measurement in metres or square metres. */
export function measurementValue(m: Pick<Measurement, 'kind' | 'points'>, metersPerUnit: number) {
  if (m.kind === 'distance') {
    const [a, b] = m.points;
    return a && b ? unitsToMeters(distance(a, b), metersPerUnit) : 0;
  }
  return squareUnitsToSquareMeters(polygonArea(m.points), metersPerUnit);
}

/** "3,0 m" or "28,0 kvm". */
export function formatMeasurement(
  m: Pick<Measurement, 'kind' | 'points'>,
  metersPerUnit: number,
): string {
  const value = measurementValue(m, metersPerUnit);
  return m.kind === 'distance' ? formatMeters(value) : formatSquareMeters(value);
}

/** The same in words, for screen readers: "Avstånd 3,0 meter". */
export function describeMeasurement(
  m: Pick<Measurement, 'kind' | 'points'>,
  metersPerUnit: number,
): string {
  const text = formatMeasurement(m, metersPerUnit);
  return m.kind === 'distance'
    ? `Avstånd ${text.replace(/ m$/, ' meter')}`
    : `Yta ${text.replace(/ kvm$/, ' kvadratmeter')}`;
}

// ---------------------------------------------------------------------------------------------
// Reading the SVG

/** A 2D affine matrix [a b c d e f] as in SVG: x' = a x + c y + e, y' = b x + d y + f. */
export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function apply(m: Matrix, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

/** Parses an SVG `transform` attribute (translate, scale, rotate, skewX/Y, matrix). */
export function parseTransform(value: string | null): Matrix {
  if (!value) return IDENTITY;
  let result = IDENTITY;
  for (const match of value.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const name = match[1]!;
    const args = (match[2] ?? '')
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    const [a = 0, b, c] = args;
    let m: Matrix = IDENTITY;
    if (name === 'translate') m = [1, 0, 0, 1, a, b ?? 0];
    else if (name === 'scale') m = [a, 0, 0, b ?? a, 0, 0];
    else if (name === 'rotate') {
      const r = (a * Math.PI) / 180;
      const cos = Math.cos(r);
      const sin = Math.sin(r);
      const rotation: Matrix = [cos, sin, -sin, cos, 0, 0];
      m =
        b !== undefined && c !== undefined
          ? multiply(multiply([1, 0, 0, 1, b, c], rotation), [1, 0, 0, 1, -b, -c])
          : rotation;
    } else if (name === 'skewX') m = [1, 0, Math.tan((a * Math.PI) / 180), 1, 0, 0];
    else if (name === 'skewY') m = [1, Math.tan((a * Math.PI) / 180), 0, 1, 0, 0];
    else if (name === 'matrix' && args.length === 6) m = args as Matrix;
    result = multiply(result, m);
  }
  return result;
}

function numberList(value: string | null): number[] {
  return (value ?? '')
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite);
}

function box(value: string | null): Box | null {
  const [x, y, width, height] = numberList(value);
  if (x === undefined || y === undefined || !width || !height) return null;
  return { x, y, width, height };
}

/** The scale written by the generator, or null for drawings without one (e.g. a PNG). */
export function readDrawingMetadata(svg: Element): DrawingMetadata | null {
  const metersPerUnit = Number(svg.getAttribute('data-meters-per-unit'));
  const viewBox = box(svg.getAttribute('viewBox'));
  if (!Number.isFinite(metersPerUnit) || metersPerUnit <= 0 || !viewBox) return null;
  return {
    scaleLabel: svg.getAttribute('data-scale') ?? '',
    metersPerUnit,
    viewBox,
    drawingArea: box(svg.getAttribute('data-drawing-area')),
  };
}

/** Groups whose lines are annotations, not geometry: dimension chains, symbols, legend. */
const NOT_GEOMETRY = new Set(['matt', 'skalstock', 'norrpil', 'teckenforklaring']);
const SKIPPED_TAGS = new Set(['defs', 'clipPath', 'pattern', 'mask', 'marker', 'symbol', 'title']);

/**
 * Endpoints and edges of the drawn geometry (lines, rectangles, polygons, polylines) in sheet
 * units. Only the drawing layer counts when the SVG has layers, so the frame and title block
 * do not catch the pointer.
 */
export function collectSnapTargets(svg: Element): SnapTargets {
  const points: Point[] = [];
  const segments: Segment[] = [];
  const seen = new Set<string>();
  const addPoint = (p: Point) => {
    const key = `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;
    if (seen.has(key)) return;
    seen.add(key);
    points.push(p);
  };
  const addPath = (m: Matrix, path: Point[], closed: boolean) => {
    const mapped = path.map((p) => apply(m, p));
    mapped.forEach(addPoint);
    for (let i = 0; i < mapped.length - (closed ? 0 : 1); i += 1) {
      segments.push({ a: mapped[i]!, b: mapped[(i + 1) % mapped.length]! });
    }
  };
  const num = (el: Element, name: string) => Number(el.getAttribute(name) ?? 0) || 0;

  const visit = (el: Element, parent: Matrix) => {
    if (SKIPPED_TAGS.has(el.tagName)) return;
    const classes = (el.getAttribute('class') ?? '').split(/\s+/);
    if (classes.some((c) => NOT_GEOMETRY.has(c))) return;
    const m = multiply(parent, parseTransform(el.getAttribute('transform')));
    switch (el.tagName) {
      case 'line':
        addPath(
          m,
          [
            { x: num(el, 'x1'), y: num(el, 'y1') },
            { x: num(el, 'x2'), y: num(el, 'y2') },
          ],
          false,
        );
        return;
      case 'rect': {
        const x = num(el, 'x');
        const y = num(el, 'y');
        const w = num(el, 'width');
        const h = num(el, 'height');
        if (w <= 0 || h <= 0) return;
        addPath(
          m,
          [
            { x, y },
            { x: x + w, y },
            { x: x + w, y: y + h },
            { x, y: y + h },
          ],
          true,
        );
        return;
      }
      case 'polygon':
      case 'polyline': {
        const values = numberList(el.getAttribute('points'));
        const path: Point[] = [];
        for (let i = 0; i + 1 < values.length; i += 2)
          path.push({ x: values[i]!, y: values[i + 1]! });
        addPath(m, path, el.tagName === 'polygon');
        return;
      }
      case 'text':
        return;
    }
    for (const child of Array.from(el.children)) visit(child, m);
  };

  const layer = svg.querySelector('[data-layer="ritning"]');
  if (layer) {
    // The layer's ancestors may carry transforms too.
    let m = IDENTITY;
    for (let p = layer.parentElement; p && p !== svg; p = p.parentElement) {
      m = multiply(parseTransform(p.getAttribute('transform')), m);
    }
    visit(layer, m);
  } else {
    for (const child of Array.from(svg.children)) visit(child, IDENTITY);
  }
  return { points, segments };
}

/** Parses SVG source into its scale and snap targets. Null when it has no usable scale. */
export function parseMeasurableSvg(
  source: string,
): { metadata: DrawingMetadata; targets: SnapTargets } | null {
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  const svg = doc.documentElement;
  if (svg.tagName !== 'svg' || doc.querySelector('parsererror')) return null;
  const metadata = readDrawingMetadata(svg);
  if (!metadata) return null;
  return { metadata, targets: collectSnapTargets(svg) };
}
