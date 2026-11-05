import { describe, expect, it } from 'vitest';
import { loadLookup, type Process } from '@/content';
import { layoutProcess, pathData, type NodeBox, type Point } from './process-layout';
import { sampleProcess } from './test-fixtures';

/** True when the segment a–b (horizontal or vertical) passes through the inside of a box. */
function crosses(a: Point, b: Point, box: NodeBox): boolean {
  const inset = 1;
  const [x1, x2] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
  const [y1, y2] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
  return (
    x2 > box.x + inset &&
    x1 < box.x + box.width - inset &&
    y2 > box.y + inset &&
    y1 < box.y + box.height - inset
  );
}

function checkGeometry(process: Process) {
  const layout = layoutProcess(process);
  expect(layout.nodes).toHaveLength(process.steg.length);
  for (const edge of layout.edges) {
    for (let i = 1; i < edge.points.length; i++) {
      const a = edge.points[i - 1] as Point;
      const b = edge.points[i] as Point;
      expect(a.x === b.x || a.y === b.y, `${process.id} ${edge.id} is orthogonal`).toBe(true);
      for (const box of layout.nodes) {
        expect(crosses(a, b, box), `${process.id} ${edge.id} crosses ${box.id}`).toBe(false);
      }
      for (const p of [a, b]) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(layout.width);
        expect(p.y).toBeLessThanOrEqual(layout.height);
      }
    }
    const target = layout.nodes.find((n) => n.id === edge.to);
    const end = edge.points[edge.points.length - 1];
    expect(end?.y, `${edge.id} ends on top of its target`).toBe(target?.y);
  }
}

describe('layoutProcess', () => {
  it('routes the sample process without crossing a box', () => {
    checkGeometry(sampleProcess());
  });

  it('routes every bundled process without crossing a box', () => {
    for (const process of loadLookup().processes) checkGeometry(process);
  });

  it('draws rounded corners as quadratic curves', () => {
    const d = pathData([
      { x: 0, y: 0 },
      { x: 0, y: 40 },
      { x: 40, y: 40 },
    ]);
    expect(d).toBe('M 0 0 L 0 34 Q 0 40 6 40 L 40 40');
  });
});
