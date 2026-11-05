import { useCallback, useLayoutEffect, useState, type KeyboardEvent } from 'react';
import { dayStart } from './aggregate';

/**
 * Non-visual helpers for the hand-drawn SVG charts on Mina resultat: measuring, formatting,
 * ticks, series colours, the keyboard cursor and bar paths.
 */

/**
 * Width of an element, updated on resize. Returns a callback ref so a remounted element
 * (after switching back from the table view) is measured again. Falls back to `fallback`
 * where there is no layout (jsdom).
 */
export function useElementWidth<T extends HTMLElement>(
  fallback = 640,
): [(element: T | null) => void, number] {
  const [element, setElement] = useState<T | null>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    if (!element) return;
    const measure = () => {
      const w = element.getBoundingClientRect().width;
      if (w > 0) setWidth(Math.floor(w));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [setElement, width];
}
/* ---------------------------------------------------------------------- formatting */

const dayMonth = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short' });
const weekdayDayMonth = new Intl.DateTimeFormat('sv-SE', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

/** "3 nov." */
export function formatDay(key: string): string {
  return dayMonth.format(dayStart(key));
}

/** "tis 3 nov." */
export function formatDayLong(key: string): string {
  return weekdayDayMonth.format(dayStart(key));
}

/** "3–9 nov." for a week, "3 nov." for a single day. */
export function formatSpan(start: string, end: string): string {
  if (start === end) return formatDay(start);
  const a = dayStart(start);
  const b = dayStart(end);
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${formatDay(end)}`;
  return `${formatDay(start)}–${formatDay(end)}`;
}

/** Round, readable y-axis ticks from 0 to at least `max`. */
export function niceTicks(max: number, target = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = 0; v < max + step; v += step) {
    ticks.push(Math.round(v * 1000) / 1000);
    if (v >= max) break;
  }
  return ticks;
}

/** Which x positions get a date label so that labels never overlap. */
export function tickIndices(count: number, plotWidth: number, labelWidth = 64): number[] {
  if (count <= 0) return [];
  const fit = Math.max(2, Math.floor(plotWidth / labelWidth));
  const every = Math.max(1, Math.ceil(count / fit));
  const indices: number[] = [];
  // Anchor on the last position (today) and step backwards.
  for (let i = count - 1; i >= 0; i -= every) indices.unshift(i);
  return indices;
}

/* ------------------------------------------------------------------- series colour */

export const SERIES_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
] as const;

export function seriesColor(slot: number | null): string {
  return slot === null ? 'var(--muted)' : (SERIES_COLORS[slot] ?? 'var(--muted)');
}
/* ---------------------------------------------------------------- keyboard cursor */

/**
 * The active x position of a chart, moved by the pointer or by the arrow keys when the
 * chart has focus. Null while nothing is hovered or focused.
 */
export function useChartCursor(count: number) {
  const [active, setActive] = useState<number | null>(null);
  const [fromKeyboard, setFromKeyboard] = useState(false);
  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (count === 0) return;
      const last = count - 1;
      let next: number | null = null;
      if (event.key === 'ArrowLeft') next = Math.max(0, (active ?? last + 1) - 1);
      else if (event.key === 'ArrowRight') next = Math.min(last, (active ?? -1) + 1);
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = last;
      else if (event.key === 'Escape') {
        setActive(null);
        return;
      }
      if (next === null) return;
      event.preventDefault();
      setFromKeyboard(true);
      setActive(next);
    },
    [active, count],
  );
  const setFromPointer = useCallback((index: number | null) => {
    setFromKeyboard(false);
    setActive(index);
  }, []);
  return {
    active: active !== null && active < count ? active : null,
    fromKeyboard,
    setFromPointer,
    onKeyDown,
    onBlur: () => setActive(null),
  };
}
/** Path for a bar with 4 px rounded top corners and a square base (vertical bars). */
export function roundedTopBar(x: number, y: number, w: number, h: number, r = 4): string {
  if (h <= 0 || w <= 0) return '';
  const radius = Math.min(r, w / 2, h);
  return [
    `M${x},${y + h}`,
    `V${y + radius}`,
    `Q${x},${y} ${x + radius},${y}`,
    `H${x + w - radius}`,
    `Q${x + w},${y} ${x + w},${y + radius}`,
    `V${y + h}`,
    'Z',
  ].join(' ');
}
