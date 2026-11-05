import { layoutProcessGraph, type Process } from '@bygglov/content-schema';

/**
 * Geometry of a process map: boxes on a grid of rows (from the arrows) and lanes (the steps'
 * `spar`), and orthogonal arrows routed through the gaps between boxes so they never cross a
 * box. Units are CSS pixels at a 16 px root font size; the map is drawn in rem so it grows
 * with the text size setting.
 */

export const NODE_WIDTH = 232;
export const NODE_HEIGHT = 84;
export const LANE_GAP = 64;
export const ROW_GAP = 52;
export const PADDING = 16;
/** Room left of lane 0 for arrows that loop back. */
export const LEFT_GUTTER = 36;

export interface Point {
  x: number;
  y: number;
}

export interface NodeBox {
  id: string;
  index: number;
  rank: number;
  lane: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EdgePath {
  id: string;
  from: string;
  to: string;
  label?: string;
  back: boolean;
  points: Point[];
  /** Where to put the label, if any. */
  labelAt?: Point;
}

export interface ProcessLayout {
  width: number;
  height: number;
  nodes: NodeBox[];
  edges: EdgePath[];
}

const laneX = (lane: number) => PADDING + LEFT_GUTTER + lane * (NODE_WIDTH + LANE_GAP);
const rankY = (rank: number) => PADDING + rank * (NODE_HEIGHT + ROW_GAP);

/** Removes points that repeat or lie on a straight line between their neighbours. */
function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    const before = out[out.length - 2];
    if (before && last && ((before.x === last.x && last.x === p.x) || (before.y === last.y && last.y === p.y))) {
      out[out.length - 1] = p;
      continue;
    }
    out.push(p);
  }
  return out;
}

export function layoutProcess(process: Pick<Process, 'steg'>): ProcessLayout {
  const graph = layoutProcessGraph(process);
  const index = new Map(process.steg.map((s, i) => [s.id, i]));
  const nodes: NodeBox[] = graph.nodes.map((n) => ({
    id: n.id,
    index: index.get(n.id) ?? 0,
    rank: n.rank,
    lane: n.lane,
    x: laneX(n.lane),
    y: rankY(n.rank),
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const occupied = new Set(nodes.map((n) => `${n.rank}:${n.lane}`));
  const laneCount = Math.max(1, ...nodes.map((n) => n.lane + 1));
  const width = laneX(laneCount - 1) + NODE_WIDTH + LANE_GAP / 2 + PADDING;
  const height = rankY(Math.max(graph.rows, 1) - 1) + NODE_HEIGHT + PADDING;

  /** Lane is free on all rows strictly between two ranks. */
  const laneClear = (lane: number, fromRank: number, toRank: number) => {
    for (let r = fromRank + 1; r < toRank; r++) if (occupied.has(`${r}:${lane}`)) return false;
    return true;
  };

  // Spread the exits of a box along its bottom edge, ordered by where the arrows go (loops
  // back to an earlier step leave furthest to the left, since they turn left).
  const outgoing = new Map<string, { key: string; lane: number; rank: number }[]>();
  graph.edges.forEach((edge, i) => {
    const target = byId.get(edge.to);
    if (!target) return;
    outgoing.set(edge.from, [
      ...(outgoing.get(edge.from) ?? []),
      { key: `${edge.to}-${i}`, lane: edge.back ? -1 : target.lane, rank: target.rank },
    ]);
  });
  for (const list of outgoing.values()) list.sort((a, b) => a.lane - b.lane || a.rank - b.rank);

  const gutterUse = new Map<string, number>();
  const nextOffset = (gutter: string) => {
    const used = gutterUse.get(gutter) ?? 0;
    gutterUse.set(gutter, used + 1);
    return used * 10;
  };

  const edges: EdgePath[] = graph.edges.flatMap((edge, i): EdgePath[] => {
    const src = byId.get(edge.from);
    const tgt = byId.get(edge.to);
    if (!src || !tgt) return [];
    const id = `${edge.from}->${edge.to}-${i}`;
    const base = { id, from: edge.from, to: edge.to, back: edge.back, ...(edge.label ? { label: edge.label } : {}) };
    const tx = tgt.x + tgt.width / 2;

    const exits = outgoing.get(edge.from) ?? [];
    const slot = exits.findIndex((e) => e.key === `${edge.to}-${i}`);
    const sx = src.x + (src.width * (slot + 1)) / (exits.length + 1);
    const sb = src.y + src.height;
    const tt = tgt.y;
    const gapBelowSource = sb + ROW_GAP / 2;
    const gapAboveTarget = tt - ROW_GAP / 2;
    const labelAt = { x: sx + 6, y: sb + 15 };

    if (edge.back) {
      // A loop: down into the gap, left to the gutter beside lane 0, up to the gap above the
      // target and in from above, beside the arrows that come in from the front.
      const gx = laneX(0) - LEFT_GUTTER / 2 - nextOffset('left');
      const ex = tgt.x + tgt.width / 2 - 28;
      const points = simplify([
        { x: sx, y: sb },
        { x: sx, y: gapBelowSource },
        { x: gx, y: gapBelowSource },
        { x: gx, y: gapAboveTarget },
        { x: ex, y: gapAboveTarget },
        { x: ex, y: tt },
      ]);
      return [{ ...base, points, labelAt }];
    }

    let points: Point[];
    if (tgt.lane === src.lane && laneClear(src.lane, src.rank, tgt.rank)) {
      points = [
        { x: sx, y: sb },
        { x: sx, y: gapAboveTarget },
        { x: tx, y: gapAboveTarget },
        { x: tx, y: tt },
      ];
    } else if (tgt.lane !== src.lane && laneClear(tgt.lane, src.rank, tgt.rank)) {
      points = [
        { x: sx, y: sb },
        { x: sx, y: gapBelowSource },
        { x: tx, y: gapBelowSource },
        { x: tx, y: tt },
      ];
    } else {
      // Blocked: go round through the gutter right of the rightmost lane involved.
      const lane = Math.max(src.lane, tgt.lane);
      const gx = laneX(lane) + NODE_WIDTH + LANE_GAP / 2 - 8 + nextOffset(`right:${lane}`);
      points = [
        { x: sx, y: sb },
        { x: sx, y: gapBelowSource },
        { x: gx, y: gapBelowSource },
        { x: gx, y: gapAboveTarget },
        { x: tx, y: gapAboveTarget },
        { x: tx, y: tt },
      ];
    }
    return [{ ...base, points: simplify(points), labelAt }];
  });

  nodes.sort((a, b) => a.index - b.index);
  return { width, height, nodes, edges };
}

/** SVG path data for a polyline with slightly rounded corners. */
export function pathData(points: readonly Point[], radius = 6): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  if (!first) return '';
  let d = `M ${first.x} ${first.y}`;
  for (let i = 0; i < rest.length; i++) {
    const p = rest[i] as Point;
    const prev = (i === 0 ? first : rest[i - 1]) as Point;
    const next = rest[i + 1];
    if (!next) {
      d += ` L ${p.x} ${p.y}`;
      continue;
    }
    const inLen = Math.hypot(p.x - prev.x, p.y - prev.y);
    const outLen = Math.hypot(next.x - p.x, next.y - p.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const ax = p.x - (Math.sign(p.x - prev.x) * r);
    const ay = p.y - (Math.sign(p.y - prev.y) * r);
    const bx = p.x + (Math.sign(next.x - p.x) * r);
    const by = p.y + (Math.sign(next.y - p.y) * r);
    d += ` L ${ax} ${ay} Q ${p.x} ${p.y} ${bx} ${by}`;
  }
  return d;
}
