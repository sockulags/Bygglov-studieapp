import { CASE_LIST_STATUS_LABELS, type CaseListStatus } from '@/features/cases';
import { formatWhen } from '@/lib/format';
import type { DecisionChecks } from './aggregate';
import { ChartCard, DataTable, Legend } from './chart-kit';
import { useElementWidth } from './chart-utils';

const STATUS_FILL: Record<CaseListStatus, { fill: string; ink: string }> = {
  ny: { fill: 'var(--chart-status-1)', ink: 'var(--chart-status-ink-1)' },
  pagar: { fill: 'var(--chart-status-2)', ink: 'var(--chart-status-ink-2)' },
  inlamnat: { fill: 'var(--chart-status-3)', ink: 'var(--chart-status-ink-3)' },
  bedomt: { fill: 'var(--chart-status-4)', ink: 'var(--chart-status-ink-4)' },
};

const BAR_HEIGHT = 28;
const GAP = 2;

function casesLabel(n: number): string {
  return `${n} ${n === 1 ? 'ärende' : 'ärenden'}`;
}

/**
 * Cases per status as one tall segmented bar (ny → bedömt is an order, so one hue from
 * light to dark). Each block prints its count when it fits; the legend names the blocks.
 */
export function CaseStatusChart({
  counts,
}: {
  counts: readonly { status: CaseListStatus; count: number }[];
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const total = counts.reduce((sum, c) => sum + c.count, 0);
  const parts = counts.filter((c) => c.count > 0);
  const usable = Math.max(0, width - GAP * Math.max(0, parts.length - 1));
  const blocks = parts.map((c, i) => {
    const w = total === 0 ? 0 : (c.count / total) * usable;
    const before = parts.slice(0, i).reduce((sum, p) => sum + p.count, 0);
    const x = total === 0 ? 0 : (before / total) * usable + i * GAP;
    return { ...c, x, w };
  });
  const summary = counts.map((c) => `${CASE_LIST_STATUS_LABELS[c.status]} ${c.count}`).join(', ');

  return (
    <ChartCard
      title="Ärenden per status"
      description={`${casesLabel(total)} i appen.`}
      legend={
        <Legend
          items={counts.map((c) => ({
            key: c.status,
            label: CASE_LIST_STATUS_LABELS[c.status],
            color: STATUS_FILL[c.status].fill,
            kind: 'swatch' as const,
          }))}
        />
      }
      table={
        <DataTable
          caption="Ärenden per status"
          columns={[
            { key: 'status', label: 'Status' },
            { key: 'count', label: 'Ärenden', numeric: true },
          ]}
          rows={counts.map((c) => ({
            key: c.status,
            cells: [CASE_LIST_STATUS_LABELS[c.status], c.count],
          }))}
        />
      }
    >
      <div ref={ref} className="min-w-0 overflow-x-clip">
        {total === 0 ? (
          <p className="text-sm text-muted">Det finns inga ärenden i appen än.</p>
        ) : (
          <svg
            width={width}
            height={BAR_HEIGHT}
            role="img"
            aria-label={`Ärenden per status: ${summary}.`}
            className="block"
          >
            {blocks.map((b) => (
              <g key={b.status}>
                <title>{`${CASE_LIST_STATUS_LABELS[b.status]}: ${casesLabel(b.count)}`}</title>
                <rect
                  data-mark="bar"
                  className="chart-bar"
                  x={b.x}
                  y={0}
                  width={Math.max(1, b.w)}
                  height={BAR_HEIGHT}
                  rx={4}
                  fill={STATUS_FILL[b.status].fill}
                />
                {b.w >= 28 && (
                  <text
                    x={b.x + 10}
                    y={BAR_HEIGHT / 2}
                    dy="0.35em"
                    className="text-sm font-semibold"
                    style={{ fill: STATUS_FILL[b.status].ink }}
                  >
                    {b.count}
                  </text>
                )}
              </g>
            ))}
          </svg>
        )}
      </div>
    </ChartCard>
  );
}

/**
 * Automatic checks passed per submitted decision, oldest first: one meter per decision,
 * the fill is the share passed and the track the checks in total. "7 av 9" at the tip.
 */
export function DecisionChecksChart({ rows, now }: { rows: readonly DecisionChecks[]; now: Date }) {
  return (
    <ChartCard
      title="Kontroller godkända per inlämnat beslut"
      description="De automatiska kontrollerna i beslutsmallen (tips räknas inte), i den ordning du lämnade in besluten."
      table={
        <DataTable
          caption="Kontroller godkända per inlämnat beslut"
          columns={[
            { key: 'case', label: 'Ärende' },
            { key: 'when', label: 'Inlämnat' },
            { key: 'passed', label: 'Godkända', numeric: true },
            { key: 'total', label: 'Kontroller', numeric: true },
            { key: 'share', label: 'Andel', numeric: true },
          ]}
          rows={rows.map((r) => ({
            key: r.key,
            cells: [
              r.title,
              r.submittedAt ? formatWhen(r.submittedAt, now) : r.decisionDate,
              r.passed,
              r.total,
              r.total === 0 ? '–' : `${Math.round((100 * r.passed) / r.total)} %`,
            ],
          }))}
        />
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Inga inlämnade beslut i perioden.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((r) => {
            const share = r.total === 0 ? 0 : r.passed / r.total;
            return (
              <li key={r.key} className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="min-w-0 truncate text-sm font-medium">{r.title}</span>
                  <span className="text-sm">
                    <span className="font-semibold">
                      {r.passed} av {r.total}
                    </span>
                    <span className="text-muted">
                      {' '}
                      · {r.submittedAt ? formatWhen(r.submittedAt, now) : r.decisionDate}
                    </span>
                  </span>
                </div>
                <div
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={r.total}
                  aria-valuenow={r.passed}
                  aria-label={`${r.title}: ${r.passed} av ${r.total} kontroller godkända`}
                  className="h-2 overflow-hidden rounded-full bg-[var(--chart-track)]"
                >
                  <div
                    data-mark="bar"
                    className="chart-meter h-full rounded-full bg-[var(--chart-single)]"
                    style={{ width: `${share * 100}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </ChartCard>
  );
}
