import type { PointerEvent } from 'react';
import type { AnswerBucket } from './aggregate';
import { ChartCard, ChartTooltip, DataTable, Legend } from './chart-kit';
import {
  formatDay,
  formatDayLong,
  formatSpan,
  niceTicks,
  roundedTopBar,
  tickIndices,
  useChartCursor,
  useElementWidth,
} from './chart-utils';

const HEIGHT = 220;
const MARGIN = { top: 12, right: 8, bottom: 28, left: 36 };
const GAP = 2;
const MAX_BAR = 24;

function bucketTitle(bucket: AnswerBucket, unit: 'day' | 'week'): string {
  return unit === 'day'
    ? formatDayLong(bucket.start)
    : `Vecka ${formatSpan(bucket.start, bucket.end)}`;
}

/** Answers per day (or week): right at the base, wrong on top, a 2 px gap between. */
export function AnswersChart({
  buckets,
  unit,
}: {
  buckets: readonly AnswerBucket[];
  unit: 'day' | 'week';
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const cursor = useChartCursor(buckets.length);
  const total = buckets.reduce((sum, b) => sum + b.correct + b.wrong, 0);
  const max = Math.max(1, ...buckets.map((b) => b.correct + b.wrong));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] ?? max;
  const plotLeft = MARGIN.left;
  const plotRight = width - MARGIN.right;
  const plotWidth = Math.max(0, plotRight - plotLeft);
  const plotBottom = HEIGHT - MARGIN.bottom;
  const plotHeight = plotBottom - MARGIN.top;
  const band = buckets.length > 0 ? plotWidth / buckets.length : 0;
  const barWidth = Math.max(1, Math.min(MAX_BAR, band - GAP));
  const yScale = (v: number) => (v / top) * plotHeight;
  const xOf = (i: number) => plotLeft + i * band + (band - barWidth) / 2;
  const labelIdx = tickIndices(buckets.length, plotWidth, unit === 'week' ? 84 : 64);

  const onPointerMove = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!box || band === 0) return;
    const index = Math.floor((event.clientX - box.left - plotLeft) / band);
    cursor.setFromPointer(Math.max(0, Math.min(buckets.length - 1, index)));
  };

  const active = cursor.active;
  const activeBucket = active !== null ? buckets[active] : undefined;
  const readout = activeBucket
    ? [
        {
          key: 'correct',
          label: 'rätt',
          value: String(activeBucket.correct),
          color: 'var(--chart-correct)',
          kind: 'swatch' as const,
        },
        {
          key: 'wrong',
          label: 'fel',
          value: String(activeBucket.wrong),
          color: 'var(--chart-wrong)',
          kind: 'swatch' as const,
        },
        {
          key: 'total',
          label: 'totalt',
          value: String(activeBucket.correct + activeBucket.wrong),
        },
      ]
    : [];

  return (
    <ChartCard
      title={unit === 'day' ? 'Svar per dag' : 'Svar per vecka'}
      description={`${total} svar i perioden. Delvis rätt räknas som fel.`}
      legend={
        <Legend
          items={[
            { key: 'correct', label: 'Rätt', color: 'var(--chart-correct)', kind: 'swatch' },
            { key: 'wrong', label: 'Fel', color: 'var(--chart-wrong)', kind: 'swatch' },
          ]}
        />
      }
      table={
        <DataTable
          caption={unit === 'day' ? 'Svar per dag' : 'Svar per vecka'}
          columns={[
            { key: 'when', label: unit === 'day' ? 'Dag' : 'Vecka' },
            { key: 'correct', label: 'Rätt', numeric: true },
            { key: 'wrong', label: 'Fel', numeric: true },
            { key: 'total', label: 'Totalt', numeric: true },
          ]}
          rows={[...buckets]
            .reverse()
            .filter((b) => b.correct + b.wrong > 0)
            .map((b) => ({
              key: b.start,
              cells: [bucketTitle(b, unit), b.correct, b.wrong, b.correct + b.wrong],
            }))}
        />
      }
    >
      <div ref={ref} className="relative min-w-0 overflow-x-clip">
        {total === 0 ? (
          <p className="text-sm text-muted">Inga svar i den valda perioden.</p>
        ) : (
          <div
            className="chart-frame"
            tabIndex={0}
            role="img"
            aria-label={`Stapeldiagram över rätt och fel svar per ${unit === 'day' ? 'dag' : 'vecka'}. Använd piltangenterna för att läsa av en stapel.`}
            onKeyDown={cursor.onKeyDown}
            onBlur={cursor.onBlur}
          >
            <svg width={width} height={HEIGHT} className="block">
              {ticks.map((t) => {
                const y = plotBottom - yScale(t);
                return (
                  <g key={t}>
                    <line
                      x1={plotLeft}
                      x2={plotRight}
                      y1={y}
                      y2={y}
                      stroke={t === 0 ? 'var(--chart-axis)' : 'var(--chart-grid)'}
                      strokeWidth="1"
                      shapeRendering="crispEdges"
                    />
                    <text
                      x={plotLeft - 8}
                      y={y}
                      dy="0.32em"
                      textAnchor="end"
                      className="fill-muted text-xs tabular-nums"
                    >
                      {t}
                    </text>
                  </g>
                );
              })}
              {buckets.map((b, i) => {
                const x = xOf(i);
                const hCorrect = yScale(b.correct);
                const hWrong = yScale(b.wrong);
                const gap = b.correct > 0 && b.wrong > 0 ? GAP : 0;
                const dim = active !== null && active !== i;
                return (
                  <g key={b.start} className={dim ? 'chart-dim' : undefined}>
                    {b.correct > 0 && (
                      <path
                        data-mark="bar"
                        className="chart-bar"
                        d={
                          b.wrong > 0
                            ? `M${x},${plotBottom} V${plotBottom - hCorrect} H${x + barWidth} V${plotBottom} Z`
                            : roundedTopBar(x, plotBottom - hCorrect, barWidth, hCorrect)
                        }
                        fill="var(--chart-correct)"
                      />
                    )}
                    {b.wrong > 0 && (
                      <path
                        data-mark="bar"
                        className="chart-bar"
                        d={roundedTopBar(
                          x,
                          plotBottom - hCorrect - gap - hWrong,
                          barWidth,
                          Math.max(1, hWrong),
                        )}
                        fill="var(--chart-wrong)"
                      />
                    )}
                  </g>
                );
              })}
              {labelIdx.map((i) => {
                const b = buckets[i];
                if (!b) return null;
                const x = xOf(i) + barWidth / 2;
                return (
                  <text
                    key={b.start}
                    x={x}
                    y={plotBottom + 18}
                    textAnchor={i === buckets.length - 1 ? 'end' : 'middle'}
                    className="fill-muted text-xs"
                  >
                    {i === buckets.length - 1 && unit === 'day' ? 'i dag' : formatDay(b.start)}
                  </text>
                );
              })}
              <rect
                x={plotLeft}
                y={0}
                width={plotWidth}
                height={HEIGHT}
                fill="transparent"
                onPointerMove={onPointerMove}
                onPointerLeave={() => cursor.setFromPointer(null)}
              />
            </svg>
          </div>
        )}
        {activeBucket && active !== null && (
          <ChartTooltip
            title={bucketTitle(activeBucket, unit)}
            rows={readout}
            x={xOf(active) + barWidth / 2}
            y={MARGIN.top}
            containerWidth={width}
          />
        )}
        <p className="sr-only" aria-live="polite">
          {cursor.fromKeyboard && activeBucket
            ? `${bucketTitle(activeBucket, unit)}: ${activeBucket.correct} rätt, ${activeBucket.wrong} fel`
            : ''}
        </p>
      </div>
    </ChartCard>
  );
}
