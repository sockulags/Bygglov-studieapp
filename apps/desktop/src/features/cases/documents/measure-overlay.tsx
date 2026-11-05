import { X } from 'lucide-react';
import {
  distance,
  describeMeasurement,
  formatMeasurement,
  polygonCentroid,
  type MeasureKind,
  type Measurement,
  type Point,
  type Snap,
} from './measure-geometry';

const BRICK = 'var(--brick)';
const HALO = '#ffffff';

/** A text label in the brick colour with a white halo, centred on (x, y). */
function ValueLabel({ at, text }: { at: Point; text: string }) {
  return (
    <text
      x={at.x}
      y={at.y}
      textAnchor="middle"
      dominantBaseline="middle"
      fontSize={13}
      fontWeight={700}
      fill={BRICK}
      stroke={HALO}
      strokeWidth={4}
      strokeLinejoin="round"
      paintOrder="stroke"
      className="font-sans tabular-nums"
    >
      {text}
    </text>
  );
}

function Ends({ points }: { points: Point[] }) {
  return (
    <>
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill={BRICK} stroke={HALO} strokeWidth={1.5} />
      ))}
    </>
  );
}

function pointsAttr(points: Point[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

/** A distance label beside the middle of the line, so it does not cover the line itself. */
function distanceLabelAt(a: Point, b: Point): Point {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const length = distance(a, b) || 1;
  // Unit normal pointing up (or left for vertical lines).
  let nx = -(b.y - a.y) / length;
  let ny = (b.x - a.x) / length;
  if (ny > 0 || (ny === 0 && nx > 0)) {
    nx = -nx;
    ny = -ny;
  }
  return { x: mid.x + nx * 12, y: mid.y + ny * 12 };
}

/** Where a measurement's value goes, in frame pixels. */
function labelPosition(kind: MeasureKind, points: Point[]): Point {
  return kind === 'distance' && points.length === 2
    ? distanceLabelAt(points[0]!, points[1]!)
    : polygonCentroid(points);
}

function Shape({
  kind,
  points,
  draft = false,
}: {
  kind: MeasureKind;
  points: Point[];
  draft?: boolean;
}) {
  const dash = draft ? '6 4' : undefined;
  const closed = kind === 'area' && !draft;
  const outline = closed ? (
    <polygon points={pointsAttr(points)} />
  ) : (
    <polyline points={pointsAttr(points)} />
  );
  return (
    <g>
      <g fill="none" stroke={HALO} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round">
        {outline}
      </g>
      <g
        fill={closed ? BRICK : 'none'}
        fillOpacity={closed ? 0.12 : undefined}
        stroke={BRICK}
        strokeWidth={2}
        strokeDasharray={dash}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {outline}
      </g>
      <Ends points={points} />
    </g>
  );
}

/**
 * The measurements drawn on top of the drawing, in frame pixels so lines and text keep their
 * size at every zoom. Hidden from screen readers; the list beside the drawing has the values.
 */
export function MeasureOverlay({
  measurements,
  draft,
  pointer,
  snap,
  metersPerUnit,
  toFrame,
}: {
  measurements: Measurement[];
  draft: { kind: MeasureKind; points: Point[] } | null;
  /** Where the next point would go (sheet units), for the rubber band. */
  pointer: Point | null;
  snap: Snap | null;
  metersPerUnit: number;
  toFrame: (p: Point) => Point;
}) {
  const draftPoints = draft ? [...draft.points, ...(pointer ? [pointer] : [])] : [];
  const draftLabel =
    draft && draftPoints.length >= 2
      ? draft.kind === 'distance'
        ? formatMeasurement({ kind: 'distance', points: draftPoints }, metersPerUnit)
        : draftPoints.length >= 3
          ? formatMeasurement({ kind: 'area', points: draftPoints }, metersPerUnit)
          : undefined
      : undefined;
  const snapAt = snap ? toFrame(snap.point) : null;
  return (
    <svg
      className="pointer-events-none absolute inset-0 size-full overflow-visible"
      aria-hidden="true"
      data-testid="measure-overlay"
    >
      {measurements.map((m) => (
        <Shape key={m.id} kind={m.kind} points={m.points.map(toFrame)} />
      ))}
      {draft && draftPoints.length > 0 && (
        <Shape
          kind={draft.kind}
          points={(draft.kind === 'area' && draftPoints.length >= 3
            ? [...draftPoints, draftPoints[0]!]
            : draftPoints
          ).map(toFrame)}
          draft
        />
      )}
      {/* Values on top of every line, so one measurement never hides another's value. */}
      {measurements.map((m) => (
        <ValueLabel
          key={m.id}
          at={labelPosition(m.kind, m.points.map(toFrame))}
          text={formatMeasurement(m, metersPerUnit)}
        />
      ))}
      {draft && draftLabel && (
        <ValueLabel at={labelPosition(draft.kind, draftPoints.map(toFrame))} text={draftLabel} />
      )}
      {snapAt &&
        (snap?.kind === 'endpoint' ? (
          <circle cx={snapAt.x} cy={snapAt.y} r={7} fill="none" stroke={BRICK} strokeWidth={2} />
        ) : (
          <rect
            x={snapAt.x - 5}
            y={snapAt.y - 5}
            width={10}
            height={10}
            fill="none"
            stroke={BRICK}
            strokeWidth={2}
            transform={`rotate(45 ${snapAt.x} ${snapAt.y})`}
          />
        ))}
    </svg>
  );
}

/** The measurements as a list with values and a remove button each. */
export function MeasureList({
  measurements,
  metersPerUnit,
  onRemove,
}: {
  measurements: Measurement[];
  metersPerUnit: number;
  onRemove: (id: number) => void;
}) {
  if (measurements.length === 0) return null;
  return (
    <ol aria-label="Mått" className="flex flex-wrap gap-1.5 text-sm">
      {measurements.map((m, i) => (
        <li
          key={m.id}
          className="inline-flex items-center gap-1 rounded-sm border border-brick/40 bg-brick-soft py-0.5 pr-0.5 pl-2 text-ink"
        >
          <span className="sr-only">{`Mått ${i + 1}: ${describeMeasurement(m, metersPerUnit)}`}</span>
          <span aria-hidden="true" className="tabular-nums">
            {m.kind === 'distance' ? 'Avstånd' : 'Yta'}{' '}
            <strong>{formatMeasurement(m, metersPerUnit)}</strong>
          </span>
          <button
            type="button"
            onClick={() => onRemove(m.id)}
            className="inline-flex size-6 items-center justify-center rounded-sm text-muted hover:bg-paper hover:text-ink"
            aria-label={`Ta bort mått ${i + 1}`}
            title="Ta bort måttet"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ol>
  );
}
