import { useId } from 'react';
import { cn } from '@/lib/cn';
import { RANGE_OPTIONS, type RangeKey, type ResultsFilter, type ResultsModule } from './aggregate';

/**
 * The one filter row above the charts: time range first (segmented), then module. Every
 * chart and table below re-renders against the same slice.
 */
export function ResultsFilters({
  value,
  modules,
  studied,
  onChange,
}: {
  value: ResultsFilter;
  modules: readonly ResultsModule[];
  /** Ids of modules with answers; the others are listed but marked. */
  studied: ReadonlySet<string>;
  onChange: (value: ResultsFilter) => void;
}) {
  const id = useId();
  return (
    <div
      role="group"
      aria-label="Filter för diagrammen"
      className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3"
    >
      <div
        role="radiogroup"
        aria-label="Tidsintervall"
        className="inline-flex h-10 items-center gap-1 rounded-md border border-line bg-bg p-1"
      >
        {RANGE_OPTIONS.map((option) => {
          const checked = option.value === value.range;
          return (
            <label
              key={option.value}
              className={cn(
                'relative inline-flex h-8 cursor-pointer items-center rounded-sm px-3 text-sm font-medium text-muted',
                'transition-colors duration-[var(--duration-fast)] hover:text-ink',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
                checked && 'bg-paper text-ink shadow-[inset_0_0_0_1px_var(--line)]',
              )}
            >
              <input
                type="radio"
                name={`${id}-range`}
                value={option.value}
                checked={checked}
                onChange={() => onChange({ ...value, range: option.value as RangeKey })}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor={`${id}-module`} className="text-sm text-muted">
          Modul
        </label>
        <select
          id={`${id}-module`}
          value={value.moduleId ?? ''}
          onChange={(event) =>
            onChange({ ...value, moduleId: event.target.value === '' ? null : event.target.value })
          }
          className="h-10 rounded-md border border-line-strong bg-paper px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-ring"
        >
          <option value="">Alla moduler</option>
          {modules.map((m) => (
            <option key={m.id} value={m.id}>
              {m.ordning}. {m.title}
              {studied.has(m.id) ? '' : ' (inte påbörjad)'}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
