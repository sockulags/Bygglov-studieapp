import { BarChart3, Table2 } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/cn';

/**
 * Components shared by the hand-drawn SVG charts on Mina resultat: the chart card with its
 * table view, legend keys and the tooltip. No chart library: every chart draws plain SVG
 * in pixel coordinates (helpers in chart-utils.ts).
 */

/* ----------------------------------------------------------------------- legend */

export function LineKey({ color }: { color: string }) {
  return (
    <svg width="16" height="8" aria-hidden="true" className="shrink-0">
      <line x1="1" y1="4" x2="15" y2="4" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function SwatchKey({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-2.5 shrink-0 rounded-[3px]"
      style={{ background: color }}
    />
  );
}

export interface LegendItem {
  key: string;
  label: string;
  color: string;
  kind: 'line' | 'swatch';
}

export function Legend({ items, className }: { items: readonly LegendItem[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted', className)}>
      {items.map((item) => (
        <li key={item.key} className="inline-flex items-center gap-1.5">
          {item.kind === 'line' ? <LineKey color={item.color} /> : <SwatchKey color={item.color} />}
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------------- tooltip */

export interface TooltipRow {
  key: string;
  label: string;
  value: string;
  color?: string;
  kind?: 'line' | 'swatch';
}

/**
 * The hover readout: value first and strong, the series name secondary, keyed with a short
 * line (or swatch for bars). Positioned inside the chart's relative wrapper and kept within it.
 */
export function ChartTooltip({
  title,
  rows,
  x,
  y,
  containerWidth,
}: {
  title: string;
  rows: readonly TooltipRow[];
  x: number;
  y: number;
  containerWidth: number;
}) {
  const width = 240;
  const left = x + 12 + width > containerWidth ? Math.max(0, x - 12 - width) : x + 12;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-10 rounded-md border border-line bg-paper px-3 py-2 text-sm shadow-[var(--shadow-paper)]"
      style={{ left, top: Math.max(0, y), width }}
    >
      <p className="mb-1 text-xs text-muted">{title}</p>
      <ul className="flex flex-col gap-0.5">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2">
            {row.color &&
              (row.kind === 'swatch' ? (
                <SwatchKey color={row.color} />
              ) : (
                <LineKey color={row.color} />
              ))}
            <span className="shrink-0 font-semibold whitespace-nowrap tabular-nums">
              {row.value}
            </span>
            <span className="min-w-0 truncate text-muted">{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
/* --------------------------------------------------------------------- chart card */

/**
 * A chart in a card with a button that swaps the chart for its table (and back). The
 * table is the accessible twin: every value in the chart is in it.
 */
export function ChartCard({
  title,
  description,
  legend,
  table,
  children,
  className,
  headingLevel = 'h3',
}: {
  title: string;
  description?: ReactNode;
  legend?: ReactNode;
  table: ReactNode;
  children: ReactNode;
  className?: string;
  headingLevel?: 'h3' | 'h4';
}) {
  const [showTable, setShowTable] = useState(false);
  const id = useId();
  const Heading = headingLevel;
  return (
    <Card className={cn('min-w-0', className)} role="group" aria-labelledby={`${id}-title`}>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Heading id={`${id}-title`} className="font-semibold leading-snug">
              {title}
            </Heading>
            {description && <p className="text-sm text-muted">{description}</p>}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            aria-controls={`${id}-body`}
            onClick={() => setShowTable((v) => !v)}
          >
            {showTable ? <BarChart3 aria-hidden="true" /> : <Table2 aria-hidden="true" />}
            {showTable ? 'Visa diagram' : 'Visa tabell'}
          </Button>
        </div>
        {!showTable && legend}
        <div id={`${id}-body`}>{showTable ? table : children}</div>
      </CardContent>
    </Card>
  );
}

/** A plain data table in the app's style, scrolling inside a bounded height when long. */
export function DataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: readonly { key: string; label: string; numeric?: boolean }[];
  rows: readonly { key: string; cells: readonly ReactNode[] }[];
}) {
  return (
    <div className="max-h-80 overflow-auto rounded-md border border-line">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-bg">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  'border-b border-line px-3 py-2 font-medium text-muted',
                  c.numeric ? 'text-right' : 'text-left',
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-3 text-muted">
                Inga värden i det valda intervallet.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.key} className="border-b border-line last:border-b-0">
                {row.cells.map((cell, i) => {
                  const column = columns[i];
                  const Cell = i === 0 ? 'th' : 'td';
                  return (
                    <Cell
                      key={column?.key ?? i}
                      {...(i === 0 ? { scope: 'row' } : {})}
                      className={cn(
                        'px-3 py-1.5',
                        i === 0 && 'text-left font-normal',
                        column?.numeric && 'text-right tabular-nums',
                      )}
                    >
                      {cell}
                    </Cell>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
