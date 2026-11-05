import { idSafe, shortProperty, titleData, type DrawingContext } from './context';
import { levelColumn, levelLabelWidth, type LevelMark } from './fasadritning';
import type {
  PlanDoor,
  PlanInstallation,
  PlanritningParams,
  PlanSection,
  PlanWindow,
  Side,
} from './schema';
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
  level,
  line,
  millimetres,
  northArrow,
  polygon,
  rect,
  sheetIndex,
  sv,
  textWidth,
  viewHeading,
  type ChainPoint,
} from './svg';

const EXISTING_WALL = '#8c8c8c';
const NEW_WALL = '#111';
const CHAIN_MARGIN_MM = 24;

interface View {
  width: number;
  height: number;
  svg: string;
}

const sign = (s: Side) => (s === 'soder' || s === 'oster' ? 1 : -1);

/** The letter of a section, e.g. "Sektion B-B" → "B". */
function sectionLetter(title: string): string {
  return /\b([A-Z])-\1\b/.exec(title)?.[1] ?? 'A';
}

function renderPlan(p: PlanritningParams, k: number): View {
  const rects = p.byggnader.map((b) => b.rektangel);
  const minX = Math.min(...rects.map((r) => r[0]));
  const minY = Math.min(...rects.map((r) => r[1]));
  const maxX = Math.max(...rects.map((r) => r[0] + r[2]));
  const maxY = Math.max(...rects.map((r) => r[1] + r[3]));
  // Balconies outside the walls push the dimension chains out on their side.
  const outset: Record<Side, number> = { norr: 0, soder: 0, vaster: 0, oster: 0 };
  for (const {
    rektangel: [x, y, w, d],
  } of p.balkonger) {
    outset.norr = Math.max(outset.norr, (minY - y) * k);
    outset.soder = Math.max(outset.soder, (y + d - maxY) * k);
    outset.vaster = Math.max(outset.vaster, (minX - x) * k);
    outset.oster = Math.max(outset.oster, (x + w - maxX) * k);
  }
  const m = CHAIN_MARGIN_MM + Math.max(...Object.values(outset));
  const X = (x: number) => m + (x - minX) * k;
  const Y = (y: number) => m + (y - minY) * k;
  const planW = (maxX - minX) * k;
  const parts: string[] = [];

  // Walls appear between the white rooms on top of the filled building bodies.
  for (const b of p.byggnader) {
    const [x, y, w, d] = b.rektangel;
    parts.push(rect(X(x), Y(y), w * k, d * k, { fill: b.ny ? NEW_WALL : EXISTING_WALL }));
  }
  for (const room of p.rum) {
    const [x, y, w, d] = room.rektangel;
    parts.push(
      rect(X(x), Y(y), w * k, d * k, { fill: PAPER, stroke: INK, 'stroke-width': LINE.thin }),
    );
  }
  for (const b of p.byggnader) {
    const [x, y, w, d] = b.rektangel;
    parts.push(
      rect(X(x), Y(y), w * k, d * k, { fill: 'none', stroke: INK, 'stroke-width': LINE.medium }),
    );
  }
  // Balconies: slab outline and the railing just inside it.
  for (const balcony of p.balkonger) {
    const [x, y, w, d] = balcony.rektangel;
    const r = 0.05;
    parts.push(
      rect(X(x), Y(y), w * k, d * k, { fill: PAPER, stroke: INK, 'stroke-width': LINE.medium }),
      rect(X(x + r), Y(y + r), (w - 2 * r) * k, (d - 2 * r) * k, {
        fill: 'none',
        stroke: INK,
        'stroke-width': LINE.hair,
      }),
    );
    const name = balcony.namn ?? 'Balkong';
    const size = Math.min(TEXT.small, ((w * k - 2) / textWidth(name, 1)) * 1);
    if (size >= 1.2 && d * k > size * 1.6) {
      parts.push(
        label(X(x + w / 2), Y(y + d / 2), name, { anchor: 'middle', baseline: 'middle', size }),
      );
    }
  }

  // Openings: white gap across the wall, jamb lines, then the symbol.
  const gap = (o: PlanDoor | PlanWindow) => {
    const t = o.tjocklek ?? p.vaggtjocklek;
    const [x, y] = o.position;
    const e = 0.03;
    return o.vagg === 'horisontell'
      ? {
          t,
          white: rect(X(x), Y(y - e), o.bredd * k, (t + 2 * e) * k, { fill: PAPER }),
          jambs:
            line(X(x), Y(y), X(x), Y(y + t), LINE.thin) +
            line(X(x + o.bredd), Y(y), X(x + o.bredd), Y(y + t), LINE.thin),
        }
      : {
          t,
          white: rect(X(x - e), Y(y), (t + 2 * e) * k, o.bredd * k, { fill: PAPER }),
          jambs:
            line(X(x), Y(y), X(x + t), Y(y), LINE.thin) +
            line(X(x), Y(y + o.bredd), X(x + t), Y(y + o.bredd), LINE.thin),
        };
  };
  for (const w of p.fonster) {
    const g = gap(w);
    const [x, y] = w.position;
    parts.push(g.white, g.jambs);
    for (const f of [0, 0.5, 1]) {
      parts.push(
        w.vagg === 'horisontell'
          ? line(X(x), Y(y + g.t * f), X(x + w.bredd), Y(y + g.t * f), LINE.hair)
          : line(X(x + g.t * f), Y(y), X(x + g.t * f), Y(y + w.bredd), LINE.hair),
      );
    }
  }
  for (const d of p.dorrar) {
    const g = gap(d);
    parts.push(g.white, g.jambs);
    if (d.typ !== 'dorr' || !d.oppnas_mot) continue;
    const [x, y] = d.position;
    const s = sign(d.oppnas_mot);
    const b = d.bredd;
    const dir = d.gangjarn === 'start' ? 1 : -1;
    if (d.vagg === 'horisontell') {
      const face = s > 0 ? y + g.t : y;
      const hx = d.gangjarn === 'start' ? x : x + b;
      const leafEnd: [number, number] = [hx, face + s * b];
      const other: [number, number] = [hx + dir * b, face];
      parts.push(line(X(hx), Y(face), X(leafEnd[0]), Y(leafEnd[1]), LINE.medium));
      const sweep = -s * dir > 0 ? 1 : 0;
      parts.push(
        el('path', {
          d: `M ${X(leafEnd[0]).toFixed(2)} ${Y(leafEnd[1]).toFixed(2)} A ${(b * k).toFixed(2)} ${(b * k).toFixed(2)} 0 0 ${sweep} ${X(other[0]).toFixed(2)} ${Y(other[1]).toFixed(2)}`,
          fill: 'none',
          stroke: INK,
          'stroke-width': LINE.hair,
        }),
      );
    } else {
      const face = s > 0 ? x + g.t : x;
      const hy = d.gangjarn === 'start' ? y : y + b;
      const leafEnd: [number, number] = [face + s * b, hy];
      const other: [number, number] = [face, hy + dir * b];
      parts.push(line(X(face), Y(hy), X(leafEnd[0]), Y(leafEnd[1]), LINE.medium));
      const sweep = s * dir > 0 ? 1 : 0;
      parts.push(
        el('path', {
          d: `M ${X(leafEnd[0]).toFixed(2)} ${Y(leafEnd[1]).toFixed(2)} A ${(b * k).toFixed(2)} ${(b * k).toFixed(2)} 0 0 ${sweep} ${X(other[0]).toFixed(2)} ${Y(other[1]).toFixed(2)}`,
          fill: 'none',
          stroke: INK,
          'stroke-width': LINE.hair,
        }),
      );
    }
  }

  // Room names and net areas.
  for (const room of p.rum) {
    const [x, y, w, d] = room.rektangel;
    const area = `${sv(w * d, 1)} m²`;
    const lines = room.visa_area ? [room.namn, area] : [room.namn];
    const widest = Math.max(...lines.map((l) => textWidth(l, 1)));
    const size = Math.max(1.6, Math.min(TEXT.label, (w * k - 2) / widest));
    const cx = X(x + w / 2);
    const cy = Y(y + d / 2);
    parts.push(
      label(cx, cy - (lines.length > 1 ? size * 0.2 : -size * 0.35), room.namn, {
        anchor: 'middle',
        size,
      }),
    );
    if (room.visa_area) {
      parts.push(label(cx, cy + size * 1.1, area, { anchor: 'middle', size: size * 0.85 }));
    }
  }

  // Installations: symbol, and the name beside it inside the room.
  const taken: [number, number, number, number][] = p.installationer.map(
    ({ rektangel: [x, y, w, d] }) => [x, y, x + w, y + d],
  );
  for (const inst of p.installationer) {
    parts.push(installationSymbol(inst, X, Y, k));
    if (!inst.namn) continue;
    const [x, y, w, d] = inst.rektangel;
    const size = TEXT.small;
    const tw = textWidth(inst.namn, size) / k;
    const th = (size * 1.4) / k;
    const gap = 1.2 / k;
    const room = p.rum.find(
      ({ rektangel: [rx, ry, rw, rd] }) =>
        x >= rx - 1e-9 && y >= ry - 1e-9 && x + w <= rx + rw + 1e-9 && y + d <= ry + rd + 1e-9,
    )?.rektangel;
    const options: {
      box: [number, number, number, number];
      tx: number;
      anchor: 'start' | 'end';
    }[] = [
      {
        box: [x + w + gap, y + d / 2 - th / 2, x + w + gap + tw, y + d / 2 + th / 2],
        tx: x + w + gap,
        anchor: 'start',
      },
      {
        box: [x - gap - tw, y + d / 2 - th / 2, x - gap, y + d / 2 + th / 2],
        tx: x - gap,
        anchor: 'end',
      },
    ];
    const fitsRoom = (b: [number, number, number, number]) =>
      !room ||
      (b[0] >= room[0] &&
        b[2] <= room[0] + room[2] &&
        b[1] >= room[1] &&
        b[3] <= room[1] + room[3]);
    const free = (b: [number, number, number, number]) =>
      !taken.some((t) => t[0] < b[2] && b[0] < t[2] && t[1] < b[3] && b[1] < t[3]);
    const chosen = options.find((o) => fitsRoom(o.box) && free(o.box));
    if (chosen) {
      taken.push(chosen.box);
      parts.push(
        label(X(chosen.tx), Y(y + d / 2), inst.namn, {
          anchor: chosen.anchor,
          baseline: 'middle',
          size,
          halo: true,
        }),
      );
    } else {
      // No room beside it: under the symbol, centred.
      parts.push(
        label(X(x + w / 2), Y(y + d) + 1.2 + size, inst.namn, {
          anchor: 'middle',
          size,
          halo: true,
        }),
      );
    }
  }

  // Dimension chains per side, from corners whose extension line is not blocked.
  const blocked = (side: Side, px: number, py: number) =>
    rects.some(([x, y, w, d]) => {
      const e = 1e-6;
      if (side === 'norr') return px > x + e && px < x + w - e && y + e < py;
      if (side === 'soder') return px > x + e && px < x + w - e && y + d - e > py;
      if (side === 'vaster') return py > y + e && py < y + d - e && x + e < px;
      return py > y + e && py < y + d - e && x + w - e > px;
    });
  const mmFormat = (lengthMm: number) => millimetres(lengthMm / k);
  const chains: string[] = [];
  for (const side of ['norr', 'soder', 'vaster', 'oster'] as const) {
    const horizontal = side === 'norr' || side === 'soder';
    const points: ChainPoint[] = [];
    for (const [x, y, w, d] of rects) {
      const corners: [number, number][] = horizontal
        ? [
            [x, side === 'norr' ? y : y + d],
            [x + w, side === 'norr' ? y : y + d],
          ]
        : [
            [side === 'vaster' ? x : x + w, y],
            [side === 'vaster' ? x : x + w, y + d],
          ];
      for (const [cx, cy] of corners) {
        if (blocked(side, cx, cy)) continue;
        points.push(horizontal ? { at: X(cx), from: Y(cy) } : { at: Y(cy), from: X(cx) });
      }
    }
    // Keep the corner closest to the chain for each position.
    const best = new Map<number, ChainPoint>();
    for (const pt of points) {
      const key = Math.round(pt.at * 100);
      const current = best.get(key);
      const closer =
        current === undefined ||
        (side === 'norr' || side === 'vaster'
          ? (pt.from ?? 0) < (current.from ?? 0)
          : (pt.from ?? 0) > (current.from ?? 0));
      if (closer) best.set(key, pt);
    }
    const unique = [...best.values()];
    if (unique.length < 2) continue;
    const at = (base: number) => {
      const offset = base + outset[side];
      return side === 'norr'
        ? Y(minY) - offset
        : side === 'soder'
          ? Y(maxY) + offset
          : side === 'vaster'
            ? X(minX) - offset
            : X(maxX) + offset;
    };
    const textSide = side === 'norr' || side === 'vaster' ? 'before' : 'after';
    chains.push(
      dimensionChain({
        axis: horizontal ? 'x' : 'y',
        at: at(9),
        points: unique,
        format: mmFormat,
        textSide,
      }),
    );
    if (unique.length > 2 && (side === 'norr' || side === 'vaster')) {
      const all = unique.map((u) => u.at);
      chains.push(
        dimensionChain({
          axis: horizontal ? 'x' : 'y',
          at: at(17),
          points: [{ at: Math.min(...all) }, { at: Math.max(...all) }],
          format: mmFormat,
          textSide,
        }),
      );
    }
  }
  parts.push(group(chains, { class: 'matt' }));

  // Section line with view arrows.
  if (p.sektion) {
    const { fran, till, sikt } = p.sektion.snitt;
    const letter = sectionLetter(p.sektion.rubrik);
    const dx = till[0] - fran[0];
    const dy = till[1] - fran[1];
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const ext = 0.8;
    const a: [number, number] = [fran[0] - ux * ext, fran[1] - uy * ext];
    const b: [number, number] = [till[0] + ux * ext, till[1] + uy * ext];
    parts.push(
      line(X(a[0]), Y(a[1]), X(b[0]), Y(b[1]), LINE.thin, { 'stroke-dasharray': '6 1.2 1 1.2' }),
    );
    const view: [number, number] =
      sikt === 'norr' ? [0, -1] : sikt === 'soder' ? [0, 1] : sikt === 'oster' ? [1, 0] : [-1, 0];
    for (const end of [a, b]) {
      const ex = X(end[0]);
      const ey = Y(end[1]);
      const tip: [number, number] = [ex + view[0] * 4, ey + view[1] * 4];
      parts.push(line(ex - ux * 3, ey - uy * 3, ex, ey, LINE.bold));
      parts.push(line(ex, ey, tip[0], tip[1], LINE.medium));
      parts.push(
        polygon(
          [
            [tip[0] + view[0] * 1.6, tip[1] + view[1] * 1.6],
            [tip[0] - view[1] * 1, tip[1] + view[0] * 1],
            [tip[0] + view[1] * 1, tip[1] - view[0] * 1],
          ],
          { fill: INK },
        ),
      );
      parts.push(
        label(ex - view[0] * 2.6 - ux * 1.5, ey - view[1] * 2.6 - uy * 1.5, letter, {
          anchor: 'middle',
          baseline: 'middle',
          size: TEXT.heading,
          weight: 'bold',
          halo: true,
        }),
      );
    }
  }

  parts.push(northArrow(X(maxX) + m - 6, 8, p.norr_vinkel, 4.5));
  const headingY = Y(maxY) + m + 6;
  parts.push(viewHeading(X((minX + maxX) / 2), headingY, p.rubrik));
  return { width: planW + 2 * m, height: headingY + 3, svg: group(parts, { class: 'plan' }) };
}

/** A stove, chimney, service connection or other installation, in paper coordinates. */
function installationSymbol(
  inst: PlanInstallation,
  X: (x: number) => number,
  Y: (y: number) => number,
  k: number,
): string {
  const [x, y, w, d] = inst.rektangel;
  const weight = inst.ny ? LINE.heavy : LINE.normal;
  const box = rect(X(x), Y(y), w * k, d * k, { fill: PAPER, stroke: INK, 'stroke-width': weight });
  const cx = X(x + w / 2);
  const cy = Y(y + d / 2);
  const small = Math.min(w, d) * k;
  switch (inst.typ) {
    case 'kamin': {
      // The stove body, the firebox inside it and the flue as a circle with a cross.
      const inset = small * 0.18;
      const r = small * 0.2;
      return [
        box,
        rect(X(x) + inset, Y(y) + inset, w * k - 2 * inset, d * k - 2 * inset, {
          fill: 'none',
          stroke: INK,
          'stroke-width': LINE.thin,
        }),
        el('circle', { cx, cy, r, fill: PAPER, stroke: INK, 'stroke-width': LINE.normal }),
        line(cx - r * 0.7, cy - r * 0.7, cx + r * 0.7, cy + r * 0.7, LINE.thin),
        line(cx - r * 0.7, cy + r * 0.7, cx + r * 0.7, cy - r * 0.7, LINE.thin),
      ].join('');
    }
    case 'skorsten':
      // A chimney cut through: filled with diagonals.
      return [
        box,
        line(X(x), Y(y), X(x + w), Y(y + d), LINE.thin),
        line(X(x), Y(y + d), X(x + w), Y(y), LINE.thin),
      ].join('');
    case 'servis': {
      // Water and drainage lines entering through the wall: two circles marked V and S.
      const r = Math.min(small * 0.22, 2);
      const vertical = d >= w;
      const a: [number, number] = vertical ? [cx, cy - d * k * 0.22] : [cx - w * k * 0.22, cy];
      const b: [number, number] = vertical ? [cx, cy + d * k * 0.22] : [cx + w * k * 0.22, cy];
      const mark = ([px, py]: [number, number], letter: string) =>
        el('circle', { cx: px, cy: py, r, fill: PAPER, stroke: INK, 'stroke-width': LINE.normal }) +
        label(px, py, letter, {
          anchor: 'middle',
          baseline: 'middle',
          size: Math.min(TEXT.small, r * 1.3),
          weight: 'bold',
        });
      return [
        rect(X(x), Y(y), w * k, d * k, {
          fill: PAPER,
          stroke: INK,
          'stroke-width': weight,
          'stroke-dasharray': '1.2 0.6',
        }),
        mark(a, 'V'),
        mark(b, 'S'),
      ].join('');
    }
    default:
      return box;
  }
}

function renderSection(s: PlanSection, k: number, wall: number, cutId: string): View {
  const b = s.bredd;
  const tan = Math.tan((s.takvinkel * Math.PI) / 180);
  const cos = Math.cos((s.takvinkel * Math.PI) / 180);
  const tr = s.taktjocklek / cos;
  const bh = s.byggnadshojd;
  const mid = b / 2;
  const nock = bh + mid * tan;
  const o = s.takutsprang;
  const g = s.golv_over_mark;
  const topZ = nock;
  const marks: LevelMark[] = [
    { z: 0, featureX: b, text: level(0), note: 'mark' },
    { z: g, featureX: b - wall, text: `${level(g)} FG` },
    { z: bh, featureX: b, text: `${level(bh)} BH` },
    { z: nock, featureX: mid, text: `${level(nock)} NH` },
  ];
  const left = 10;
  const top = 10;
  const X = (x: number) => left + (x + o) * k;
  const Z = (z: number) => top + (topZ - z) * k;
  const groundY = Z(0);
  const levelX = X(b + o) + 10;
  const width = levelX + 5 + levelLabelWidth(marks) + 2;
  const cut = {
    fill: `url(#${cutId})`,
    stroke: INK,
    'stroke-width': LINE.heavy,
    'stroke-linejoin': 'miter',
  };
  const pt = (x: number, z: number): [number, number] => [X(x), Z(z)];
  const parts: string[] = [
    rect(X(-o) - 8, groundY, (b + 2 * o) * k + 16, 2, { fill: `url(#${cutId}-mark)` }),
    rect(X(0) - 0.1 * k, Z(0), (b + 0.2) * k, 0.4 * k, cut),
    polygon([pt(0, 0), pt(0, bh), pt(mid, nock), pt(b, bh), pt(b, 0)], cut),
    polygon(
      [
        pt(wall, g),
        pt(wall, bh + wall * tan - tr),
        pt(mid, nock - tr),
        pt(b - wall, bh + wall * tan - tr),
        pt(b - wall, g),
      ],
      { fill: PAPER, stroke: INK, 'stroke-width': LINE.medium },
    ),
    polygon([pt(0, bh), pt(-o, bh - o * tan), pt(-o, bh - o * tan - tr), pt(0, bh - tr)], cut),
    polygon(
      [pt(b, bh), pt(b + o, bh - o * tan), pt(b + o, bh - o * tan - tr), pt(b, bh - tr)],
      cut,
    ),
    line(X(-o) - 8, groundY, X(b + o) + 8, groundY, LINE.bold),
  ];
  if (s.rum) {
    parts.push(
      label(X(mid), Z(g + 1.4), s.rum, { anchor: 'middle', size: TEXT.label }),
      label(X(mid), Z(g + 1.4) + 4, 'öppet till nock', {
        anchor: 'middle',
        size: TEXT.small,
        italic: true,
      }),
    );
  }
  parts.push(levelColumn(marks, { levelX, X, Z, topY: Z(topZ) - 2, groundY }));
  const chainY = groundY + 10;
  parts.push(
    dimensionChain({
      axis: 'x',
      at: chainY,
      points: [
        { at: X(0), from: groundY + 2.5 },
        { at: X(b), from: groundY + 2.5 },
      ],
      format: (lengthMm) => millimetres(lengthMm / k),
    }),
  );
  const headingY = chainY + 10;
  parts.push(viewHeading(X(mid), headingY, s.rubrik));
  return { width, height: headingY + 3, svg: group(parts, { class: 'sektion' }) };
}

const INSTALLATION_LEGEND: Record<PlanInstallation['typ'], string> = {
  kamin: 'eldstad (kamin) med anslutning till rökkanal',
  skorsten: 'skorsten eller rökkanal',
  servis: 'VA-servis, V = vatten, S = spillvatten',
  annan: 'installation',
};

/** One legend row per kind of installation on the plan, drawn with the plan's own symbol. */
function installationLegend(list: PlanInstallation[]) {
  const kinds = [...new Set(list.map((i) => i.typ))];
  return kinds.map((typ) => {
    const ny = list.some((i) => i.typ === typ && i.ny);
    return {
      swatch: {
        type: 'custom' as const,
        draw: (x: number, y: number, w: number, h: number) => {
          // A square symbol 1 m wide (any scale) centred in the swatch.
          const size = h;
          const k = size;
          const left = x + (w - size) / 2;
          return installationSymbol(
            { typ, ny, rektangel: [0, 0, 1, 1] },
            (v) => left + v * k,
            (v) => y + v * k,
            k,
          );
        },
      },
      text: ny ? `Ny ${INSTALLATION_LEGEND[typ]}` : `Befintlig ${INSTALLATION_LEGEND[typ]}`,
    };
  });
}

export function renderPlanritning(p: PlanritningParams, context: DrawingContext): string {
  const k = 1000 / p.skala;
  const id = idSafe(context.idPrefix);
  const cutId = `${id}-snitt`;
  const defs = [
    hatchPattern(cutId, { angle: 45, spacing: 0.8, width: LINE.hair }),
    hatchPattern(`${cutId}-mark`, { angle: 45, spacing: 1.1, width: LINE.hair }),
  ];
  const plan = renderPlan(p, k);
  const section = p.sektion ? renderSection(p.sektion, k, p.vaggtjocklek, cutId) : undefined;

  const hasNew = p.byggnader.some((b) => b.ny);
  const hasExisting = p.byggnader.some((b) => !b.ny);
  const entries = [
    ...(hasExisting
      ? [{ swatch: { type: 'fill' as const, fill: EXISTING_WALL }, text: 'Befintlig vägg' }]
      : []),
    ...(hasNew ? [{ swatch: { type: 'fill' as const, fill: NEW_WALL }, text: 'Ny vägg' }] : []),
    ...(section
      ? [
          {
            swatch: { type: 'fill' as const, fill: `url(#${cutId})` },
            text: 'Snittad konstruktion',
          },
        ]
      : []),
    ...installationLegend(p.installationer),
  ];
  const notes = ['Mått i millimeter. Rumsareor är nettoareor.'];
  if (section) notes.push('FG = färdigt golv, BH = byggnadshöjd, NH = nockhöjd.');
  const leg = legend(0, 0, 'Teckenförklaring', entries);
  const notesSvg = notes.map((n, i) =>
    label(0, leg.height + 3.5 + i * 3.2, n, { size: TEXT.small }),
  );
  const footer = {
    width: Math.max(leg.width, ...notes.map((n) => textWidth(n, TEXT.small))),
    height: leg.height + 2 + notes.length * 3.2,
    svg: group([leg.svg, ...notesSvg]),
  };

  let content: View = plan;
  if (section) {
    const gap = 16;
    const side: View = {
      width: plan.width + gap + section.width,
      height: Math.max(plan.height, section.height),
      svg: group([
        plan.svg,
        group([section.svg], {
          transform: `translate(${(plan.width + gap).toFixed(2)} ${Math.max(0, plan.height - section.height).toFixed(2)})`,
        }),
      ]),
    };
    const stackedWidth = Math.max(plan.width, section.width);
    const stacked: View = {
      width: stackedWidth,
      height: plan.height + gap + section.height,
      svg: group([
        group([plan.svg], {
          transform: `translate(${((stackedWidth - plan.width) / 2).toFixed(2)} 0)`,
        }),
        group([section.svg], {
          transform: `translate(${((stackedWidth - section.width) / 2).toFixed(2)} ${(plan.height + gap).toFixed(2)})`,
        }),
      ]),
    };
    const si = sheetIndex({ ...side, footer });
    const st = sheetIndex({ ...stacked, footer });
    content = st !== -1 && (si === -1 || st < si) ? stacked : side;
  }

  return composeSheet({
    content: { ...content, footer },
    defs,
    title: titleData(context, p.ritningshuvud, {
      ritningstyp: section ? 'Planritning och sektion' : 'Planritning',
      skala: p.skala,
    }),
    description: `${context.titel}, ${shortProperty(context.fastighet)}`,
    scale: p.skala,
  });
}
