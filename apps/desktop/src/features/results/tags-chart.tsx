import type { TagStat } from '@/features/progress/progress';
import { tagName } from './tag-labels';
import { ChartCard, DataTable } from './chart-kit';

function percent(value: number): number {
  return Math.round(value * 100);
}

function answeredLabel(n: number): string {
  return `${n} ${n === 1 ? 'fråga' : 'frågor'}`;
}

/**
 * Weak tags as horizontal bars of the share right, worst first, one hue. Each bar carries
 * its value at the tip and the number of questions behind it, so nothing hides in a tooltip.
 */
export function TagsChart({ tags, hasAnswers }: { tags: readonly TagStat[]; hasAnswers: boolean }) {
  return (
    <ChartCard
      title="Svaga taggar"
      description="Andel rätt per ämne, räknat på ditt senaste svar per fråga i perioden. Ämnen under 80 % med minst två frågor."
      table={
        <DataTable
          caption="Svaga taggar"
          columns={[
            { key: 'tag', label: 'Tagg' },
            { key: 'share', label: 'Andel rätt', numeric: true },
            { key: 'answered', label: 'Frågor', numeric: true },
          ]}
          rows={tags.map((t) => ({
            key: t.tag,
            cells: [tagName(t.tag), `${percent(t.accuracy)} %`, t.answered],
          }))}
        />
      }
    >
      {tags.length === 0 ? (
        <p className="text-sm text-muted">
          {hasAnswers
            ? 'Inga tydligt svaga ämnen i perioden. Fortsätt så!'
            : 'När du svarat på några frågor visas här de ämnen du oftast missar.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Andel rätt per tagg">
          {tags.map((t) => {
            const pct = percent(t.accuracy);
            return (
              <li
                key={t.tag}
                className="grid grid-cols-[minmax(6rem,10rem)_1fr] items-center gap-3"
              >
                <span className="sr-only">
                  {`${tagName(t.tag)}: ${pct} % rätt av ${answeredLabel(t.answered)}`}
                </span>
                <span className="flex min-w-0 flex-col" aria-hidden="true">
                  <span className="truncate text-sm">{tagName(t.tag)}</span>
                  <span className="text-xs text-muted">{answeredLabel(t.answered)}</span>
                </span>
                <div className="mr-12 border-l border-[var(--chart-axis)]" aria-hidden="true">
                  <div className="relative h-3">
                    <div
                      data-mark="bar"
                      className="chart-meter absolute inset-y-0 left-0 rounded-r-[4px] bg-[var(--chart-single)]"
                      style={{ width: `${Math.max(pct, 0.5)}%` }}
                    />
                    <span
                      className="absolute top-1/2 -translate-y-1/2 text-sm font-semibold whitespace-nowrap"
                      style={{ left: `calc(${pct}% + 8px)` }}
                    >
                      {pct} %
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </ChartCard>
  );
}
