import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  apply,
  closestPointOnSegment,
  describeMeasurement,
  findSnap,
  formatMeasurement,
  formatMeters,
  formatSquareMeters,
  framePixelsToMeters,
  frameToSheet,
  parseMeasurableSvg,
  parseTransform,
  polygonArea,
  polygonCentroid,
  sheetPlacement,
  sheetToFrame,
  squareUnitsToSquareMeters,
  unitsToMeters,
  type Point,
} from './measure-geometry';

// Vitest runs in apps/desktop; jsdom (needed for DOMParser) has no file: import.meta.url.
const a001Site = readFileSync(
  resolve(
    process.cwd(),
    '../../content/arenden/A001-komplementbyggnad-larken-4/handlingar/situationsplan.svg',
  ),
  'utf8',
);

const square = (x: number, y: number, size: number): Point[] => [
  { x, y },
  { x: x + size, y },
  { x: x + size, y: y + size },
  { x, y: y + size },
];

describe('polygon area (shoelace)', () => {
  it('measures squares, triangles and either winding', () => {
    expect(polygonArea(square(2, 3, 4))).toBe(16);
    expect(polygonArea([...square(2, 3, 4)].reverse())).toBe(16);
    expect(
      polygonArea([
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 0, y: 4 },
      ]),
    ).toBe(12);
  });

  it('handles concave polygons and degenerate input', () => {
    // An L: 4 × 4 with a 2 × 2 corner cut away.
    const l: Point[] = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 4 },
      { x: 0, y: 4 },
    ];
    expect(polygonArea(l)).toBe(12);
    expect(polygonArea(l.slice(0, 2))).toBe(0);
    expect(polygonCentroid(square(0, 0, 2))).toEqual({ x: 1, y: 1 });
  });
});

describe('pixels to metres', () => {
  // An A4 sheet (210 × 297 mm) shown as a 794 × 1123 px image.
  const viewBox = { x: 0, y: 0, width: 210, height: 297 };
  const placement = sheetPlacement(viewBox, { width: 794, height: 1123 });

  it('places the viewBox uniformly on the image', () => {
    expect(placement.pxPerUnit).toBeCloseTo(Math.min(794 / 210, 1123 / 297), 9);
    expect(placement.offsetX).toBeCloseTo(0, 9);
    // The rounding of the image height is split above and below.
    expect(placement.offsetY).toBeCloseTo((1123 - 297 * placement.pxPerUnit) / 2, 9);
  });

  it('round-trips through zoom and panning', () => {
    const view = { scale: 2.5, x: -140, y: 37 };
    const sheet = { x: 85, y: 98.5 };
    const onScreen = sheetToFrame(sheet, view, placement);
    const back = frameToSheet(onScreen, view, placement);
    expect(back.x).toBeCloseTo(sheet.x, 9);
    expect(back.y).toBeCloseTo(sheet.y, 9);
  });

  it('turns sheet millimetres into metres with the scale', () => {
    // 1:500 → 0.5 m per mm on paper.
    expect(unitsToMeters(6, 0.5)).toBe(3);
    expect(squareUnitsToSquareMeters(8 * 14, 0.5)).toBe(28);
    // 6 mm on paper at zoom 2: 6 × pxPerUnit × 2 px on screen.
    const px = 6 * placement.pxPerUnit * 2;
    expect(framePixelsToMeters(px, { scale: 2, x: 0, y: 0 }, placement, 0.5)).toBeCloseTo(3, 9);
  });

  it('formats values with one decimal and a decimal comma', () => {
    expect(formatMeters(3)).toBe('3,0 m');
    expect(formatMeters(2.96)).toBe('3,0 m');
    expect(formatSquareMeters(28.04)).toBe('28,0 kvm');
    const line = {
      kind: 'distance' as const,
      points: [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
      ],
    };
    expect(formatMeasurement(line, 0.5)).toBe('3,0 m');
    expect(describeMeasurement(line, 0.5)).toBe('Avstånd 3,0 meter');
    expect(describeMeasurement({ kind: 'area', points: square(0, 0, 2) }, 0.5)).toBe(
      'Yta 1,0 kvadratmeter',
    );
  });
});

describe('snapping', () => {
  const targets = {
    points: [{ x: 10, y: 10 }],
    segments: [{ a: { x: 0, y: 50 }, b: { x: 100, y: 50 } }],
  };
  const identity = (p: Point) => p;

  it('prefers an endpoint within the radius', () => {
    expect(findSnap({ x: 15, y: 14 }, targets, identity)).toEqual({
      point: { x: 10, y: 10 },
      kind: 'endpoint',
    });
  });

  it('falls back on the closest point of a line, and nothing further away', () => {
    expect(findSnap({ x: 40, y: 56 }, targets, identity)).toEqual({
      point: { x: 40, y: 50 },
      kind: 'edge',
    });
    expect(findSnap({ x: 40, y: 59 }, targets, identity)).toBeNull();
    expect(closestPointOnSegment({ x: -5, y: 0 }, targets.segments[0]!)).toEqual({ x: 0, y: 50 });
  });

  it('measures the radius on screen, so zooming in makes it smaller on paper', () => {
    const zoomed = (p: Point) => ({ x: p.x * 4, y: p.y * 4 });
    expect(findSnap({ x: 48, y: 40 }, targets, zoomed)?.kind).toBe('endpoint');
    expect(findSnap({ x: 52, y: 52 }, targets, zoomed)).toBeNull();
  });
});

describe('reading the generated SVG', () => {
  it('parses transforms', () => {
    expect(apply(parseTransform('translate(51 48.5)'), { x: 1, y: 2 })).toEqual({ x: 52, y: 50.5 });
    const turned = apply(parseTransform('translate(10,0) rotate(90)'), { x: 1, y: 0 });
    expect(turned.x).toBeCloseTo(10, 9);
    expect(turned.y).toBeCloseTo(1, 9);
    const around = apply(parseTransform('rotate(180 5 5)'), { x: 0, y: 0 });
    expect(around.x).toBeCloseTo(10, 9);
    expect(around.y).toBeCloseTo(10, 9);
  });

  it('reads the scale and the snap targets of A001:s situationsplan', () => {
    const parsed = parseMeasurableSvg(a001Site);
    expect(parsed).not.toBeNull();
    const { metadata, targets } = parsed!;
    expect(metadata.scaleLabel).toBe('1:500');
    expect(metadata.metersPerUnit).toBe(0.5);
    expect(metadata.viewBox).toEqual({ x: 0, y: 0, width: 210, height: 297 });

    // The model origin is the plot's north-west corner; 1 m is 2 mm at 1:500.
    const [ox, oy] = /data-origin="([\d.]+) ([\d.]+)"/.exec(a001Site)!.slice(1).map(Number) as [
      number,
      number,
    ];
    const model = (x: number, y: number) => ({ x: ox + x * 2, y: oy + y * 2 });
    const has = (p: Point) =>
      targets.points.some((q) => Math.abs(q.x - p.x) < 0.01 && Math.abs(q.y - p.y) < 0.01);
    // The corners of the shed [18, 24, 4, 7] and of the plot 25 × 36 are snap points.
    for (const corner of [model(18, 24), model(22, 24), model(22, 31), model(18, 31)]) {
      expect(has(corner)).toBe(true);
    }
    expect(has(model(25, 0))).toBe(true);
    expect(has(model(25, 36))).toBe(true);
    // The title block and the frame are not.
    expect(has({ x: 20, y: 10 })).toBe(false);

    // Shed to the eastern boundary: 3,0 m. The shed's area: 28,0 kvm.
    const from = model(22, 27);
    const east = targets.segments.find(
      (seg) =>
        Math.abs(seg.a.x - model(25, 0).x) < 0.01 &&
        Math.abs(seg.b.x - seg.a.x) < 0.01 &&
        Math.min(seg.a.y, seg.b.y) <= from.y &&
        Math.max(seg.a.y, seg.b.y) >= from.y,
    );
    expect(east).toBeDefined();
    const onBoundary = closestPointOnSegment(from, east!);
    expect(formatMeasurement({ kind: 'distance', points: [from, onBoundary] }, 0.5)).toBe('3,0 m');
    expect(
      formatMeasurement(
        { kind: 'area', points: [model(18, 24), model(22, 24), model(22, 31), model(18, 31)] },
        0.5,
      ),
    ).toBe('28,0 kvm');
  });

  it('gives up on drawings without a scale', () => {
    expect(
      parseMeasurableSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>'),
    ).toBe(null);
    expect(parseMeasurableSvg('not svg')).toBeNull();
  });
});
