import type { PointerEvent } from 'react';
import type { MasterySeries } from './aggregate';
import { ChartCard, ChartTooltip, DataTable, Legend } from './chart-kit';
import {
  formatDay,
  formatDayLong,
  seriesColor,
  tickIndices,
  useChartCursor,
  useElementWidth,
} from './chart-utils';

const HEIGHT = 240;
const MARGIN = { top: 12, bottom: 28, left: 48 };
const Y_TICKS = [0, 25, 50, 75, 100];
const LABEL_GAP = 16;

interface EndLabel {
  moduleId: string;
  text: string;
  y: number;
}

/**
 * Direct labels at the line ends, placed greedily from the top: a label that would collide
 * with one already placed is left out (the legend and the tooltip still name it), so labels
 * are never nudged away from their lines.
 */
function placeEndLabels(items: readonly EndLabel[]): EndLabel[] {
  const placed: EndLabel[] = [];
  for (const item of [...items].sort((a, b) => a.y - b.y)) {
    if (placed.every((p) => Math.abs(p.y - item.y) >= LABEL_GAP)) placed.push(item);
  }
  return placed;
}

/** Short name for an end label: "Lovplikt" rather than the full module title. */
function shortTitle(title: string): string {
  return title.length > 15 ? `${title.slice(0, 14)}…` : title;
}

/** Mastery per module over time: one 2 px line per studied module, y fixed at 0–100 %. */
export function MasteryChart({
  days,
  series,
  hiddenModules,
}: {
  days: readonly string[];
  series: readonly MasterySeries[];
  /** Studied modules beyond the six with a line. */
  hiddenModules: number;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const cursor = useChartCursor(days.length);
  const labelSpace = series.length > 0 ? 156 : 16;
  const plotLeft = MARGIN.left;
  const plotRight = Math.max(plotLeft + 40, width - labelSpace);
  const plotWidth = plotRight - plotLeft;
  const plotBottom = HEIGHT - MARGIN.bottom;
  const plotHeight = plotBottom - MARGIN.top;
  const step = days.length > 1 ? plotWidth / (days.length - 1) : 0;
  const xAt = (i: number) => plotLeft + i * step;
  const yAt = (v: number) => plotBottom - (v / 100) * plotHeight;
  const ticks = tickIndices(days.length, plotWidth, 72);

  const paths = series.map((s) => ({
    ...s,
    d: s.points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(p.mastery).toFixed(1)}`)
      .join(' '),
  }));

  const endLabels = placeEndLabels(
    series.map((s) => {
      const last = s.points[s.points.length - 1];
      return {
        moduleId: s.moduleId,
        text: `${shortTitle(s.title)} ${last?.mastery ?? 0} %`,
        y: yAt(last?.mastery ?? 0),
      };
    }),
  );

  const onPointerMove = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!box || days.length === 0) return;
    const x = event.clientX - box.left;
    const index = step === 0 ? 0 : Math.round((x - plotLeft) / step);
    cursor.setFromPointer(Math.max(0, Math.min(days.length - 1, index)));
  };

  const active = cursor.active;
  const activeDay = active !== null ? days[active] : undefined;
  const readout =
    active !== null && activeDay
      ? series.map((s) => ({
          key: s.moduleId,
          label: s.title,
          value: `${s.points[active]?.mastery ?? 0} %`,
          color: seriesColor(s.slot),
        }))
      : [];
  const readoutText = activeDay
    ? `${formatDayLong(activeDay)}: ${readout.map((r) => `${r.label} ${r.value}`).join(', ')}`
    : '';

  const legend =
    series.length >= 2 ? (
      <Legend
        items={series.map((s) => ({
          key: s.moduleId,
          label: s.title,
          color: seriesColor(s.slot),
          kind: 'line' as const,
        }))}
      />
    ) : null;

  // Table: one row per week (the last day of each week) plus today, newest first.
  const tableRows = days
    .map((day, i) => ({ day, i }))
    .filter(({ i }) => (days.length - 1 - i) % 7 === 0)
    .reverse()
    .map(({ day, i }) => ({
      key: day,
      cells: [formatDayLong(day), ...series.map((s) => `${s.points[i]?.mastery ?? 0} %`)],
    }));

  const single = series.length === 1 ? series[0] : undefined;
  return (
    <ChartCard
      title="Behärskning per modul över tid"
      description={
        single
          ? `${single.title}: hur stor del av modulens frågor du kan, dag för dag.`
          : 'Hur stor del av varje moduls frågor du kan, dag för dag. En fråga räknas som kunnig när du minns den i tre veckor.'
      }
      legend={legend}
      table={
        <DataTable
          caption="Behärskning per modul, en rad per vecka"
          columns={[
            { key: 'day', label: 'Datum' },
            ...series.map((s) => ({ key: s.moduleId, label: s.title, numeric: true })),
          ]}
          rows={tableRows}
        />
      }
    >
      {series.length === 0 ? (
        <p className="text-sm text-muted">
          När du svarat på frågor i en modul visas här hur behärskningen växer.
        </p>
      ) : (
        <div ref={ref} className="relative min-w-0 overflow-x-clip">
          <div
            className="chart-frame"
            tabIndex={0}
            role="img"
            aria-label={`Linjediagram över behärskning per modul, ${formatDay(days[0] ?? '')} till ${formatDay(days[days.length - 1] ?? '')} – använd piltangenterna för att läsa av en dag.`}
            onKeyDown={cursor.onKeyDown}
            onBlur={cursor.onBlur}
          >
            <svg width={width} height={HEIGHT} className="block overflow-visible">
              {Y_TICKS.map((t) => (
                <g key={t}>
                  <line
                    x1={plotLeft}
                    x2={plotRight}
                    y1={yAt(t)}
                    y2={yAt(t)}
                    stroke={t === 0 ? 'var(--chart-axis)' : 'var(--chart-grid)'}
                    strokeWidth="1"
                    shapeRendering="crispEdges"
                  />
                  <text
                    x={plotLeft - 8}
                    y={yAt(t)}
                    dy="0.32em"
                    textAnchor="end"
                    className="fill-muted text-xs tabular-nums"
                  >
                    {t} %
                  </text>
                </g>
              ))}
              {ticks.map((i) => (
                <text
                  key={i}
                  x={xAt(i)}
                  y={plotBottom + 18}
                  textAnchor={i === days.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'}
                  className="fill-muted text-xs"
                >
                  {i === days.length - 1 ? 'i dag' : formatDay(days[i] ?? '')}
                </text>
              ))}
              {paths.map((s) => (
                <path
                  key={s.moduleId}
                  data-mark="line"
                  className="chart-line"
                  d={s.d}
                  fill="none"
                  stroke={seriesColor(s.slot)}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
              {series.map((s) => {
                const last = s.points[s.points.length - 1];
                return (
                  <circle
                    key={s.moduleId}
                    data-mark="dot"
                    cx={xAt(s.points.length - 1)}
                    cy={yAt(last?.mastery ?? 0)}
                    r="4"
                    fill={seriesColor(s.slot)}
                    stroke="var(--paper)"
                    strokeWidth="2"
                  />
                );
              })}
              {endLabels.map((label) => (
                <text
                  key={label.moduleId}
                  x={plotRight + 10}
                  y={label.y}
                  dy="0.32em"
                  className="fill-ink text-xs font-medium"
                >
                  {label.text}
                </text>
              ))}
              {active !== null && (
                <g aria-hidden="true">
                  <line
                    x1={xAt(active)}
                    x2={xAt(active)}
                    y1={MARGIN.top}
                    y2={plotBottom}
                    stroke="var(--muted)"
                    strokeWidth="1"
                    shapeRendering="crispEdges"
                  />
                  {series.map((s) => (
                    <circle
                      key={s.moduleId}
                      cx={xAt(active)}
                      cy={yAt(s.points[active]?.mastery ?? 0)}
                      r="4"
                      fill={seriesColor(s.slot)}
                      stroke="var(--paper)"
                      strokeWidth="2"
                    />
                  ))}
                </g>
              )}
              <rect
                x={plotLeft - step / 2}
                y={0}
                width={plotWidth + step}
                height={HEIGHT}
                fill="transparent"
                onPointerMove={onPointerMove}
                onPointerLeave={() => cursor.setFromPointer(null)}
              />
            </svg>
          </div>
          {active !== null && activeDay && (
            <ChartTooltip
              title={formatDayLong(activeDay)}
              rows={readout}
              x={xAt(active)}
              y={MARGIN.top}
              containerWidth={width}
            />
          )}
          <p className="sr-only" aria-live="polite">
            {cursor.fromKeyboard ? readoutText : ''}
          </p>
        </div>
      )}
      {hiddenModules > 0 && (
        <p className="mt-2 text-xs text-muted">
          Visar de sex moduler du övat mest. Välj en modul i filtret för att se någon av de{' '}
          {hiddenModules} andra.
        </p>
      )}
    </ChartCard>
  );
}
