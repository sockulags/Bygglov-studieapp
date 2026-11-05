import { ArrowRight, CircleHelp, Clock, CornerDownRight, Flag } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { Process, ProcessStep } from '@/content';
import { cn } from '@/lib/cn';
import { processEdges } from '@bygglov/content-schema';
import { layoutProcess, pathData, type ProcessLayout } from './process-layout';

/**
 * A process map: a flowchart of boxes and arrows (wide windows) or a numbered list (narrow
 * windows). Every step is a button; `onSelectStep` opens it.
 */

export type ProcessMapLayout = 'auto' | 'diagram' | 'list';

export interface ProcessMapProps {
  process: Process;
  onSelectStep: (stepId: string) => void;
  /** The step whose details are open, highlighted in the map. */
  selectedStepId?: string;
  /** `auto` draws the diagram when it fits the available width, else the list. */
  layout?: ProcessMapLayout;
  className?: string;
}

const rem = (px: number) => `${px / 16}rem`;

/** Width of the element, following resizes; undefined where ResizeObserver is missing. */
function useElementWidth(): [RefObject<HTMLDivElement | null>, number | undefined] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number | undefined>(undefined);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function rootFontSize(): number {
  if (typeof window === 'undefined') return 16;
  const size = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(size) && size > 0 ? size : 16;
}

export function ProcessMap({
  process,
  onSelectStep,
  selectedStepId,
  layout = 'auto',
  className,
}: ProcessMapProps) {
  const geometry = useMemo(() => layoutProcess(process), [process]);
  const [ref, width] = useElementWidth();
  const needed = (geometry.width * rootFontSize()) / 16;
  const mode: 'diagram' | 'list' =
    layout === 'auto' ? (width === undefined || width >= needed ? 'diagram' : 'list') : layout;

  return (
    <div ref={ref} className={cn('w-full', className)} data-mode={mode}>
      {mode === 'diagram' ? (
        <ProcessDiagram
          process={process}
          geometry={geometry}
          onSelectStep={onSelectStep}
          selectedStepId={selectedStepId}
        />
      ) : (
        <ProcessList process={process} onSelectStep={onSelectStep} selectedStepId={selectedStepId} />
      )}
    </div>
  );
}

function stepKind(step: ProcessStep, index: number, total: number): 'start' | 'question' | 'end' | 'step' {
  if (index === 0) return 'start';
  if (step.fraga) return 'question';
  if (step.slut || (index === total - 1 && !step.nasta)) return 'end';
  return 'step';
}

const KIND_LABEL: Record<ReturnType<typeof stepKind>, string> = {
  start: 'Start',
  question: 'Förgrening',
  end: 'Slut',
  step: 'Steg',
};

function ProcessDiagram({
  process,
  geometry,
  onSelectStep,
  selectedStepId,
}: {
  process: Process;
  geometry: ProcessLayout;
  onSelectStep: (stepId: string) => void;
  selectedStepId?: string;
}) {
  const { width, height } = geometry;
  const markerId = `arrow-${process.id}`;
  const steps = new Map(process.steg.map((s, i) => [s.id, { step: s, index: i }]));
  const pct = (value: number, of: number) => `${(value / of) * 100}%`;

  return (
    <div className="overflow-x-auto pb-2">
      <figure
        className="relative mx-auto"
        style={{ width: rem(width), height: rem(height) }}
        aria-label={`Processkarta: ${process.titel}`}
        data-testid="process-diagram"
      >
        <svg
          className="absolute inset-0 h-full w-full overflow-visible"
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <marker
              id={markerId}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9 5 L 0 9 z" style={{ fill: 'var(--muted)' }} />
            </marker>
          </defs>
          {geometry.edges.map((edge) => (
            <g key={edge.id} data-edge={`${edge.from}->${edge.to}`}>
              <path
                d={pathData(edge.points)}
                fill="none"
                style={{ stroke: edge.back ? 'var(--brick)' : 'var(--muted)' }}
                strokeWidth={1.5}
                strokeDasharray={edge.back ? '5 4' : undefined}
                markerEnd={`url(#${markerId})`}
              />
              {edge.label && edge.labelAt && (
                <text
                  x={edge.labelAt.x}
                  y={edge.labelAt.y}
                  className="text-[11px] font-semibold"
                  style={{ fill: 'var(--ink)', stroke: 'var(--bg)' }}
                  paintOrder="stroke"
                  strokeWidth={4}
                  strokeLinejoin="round"
                >
                  {edge.label}
                </text>
              )}
            </g>
          ))}
        </svg>
        <ol className="contents">
          {geometry.nodes.map((node) => {
            const entry = steps.get(node.id);
            if (!entry) return null;
            const { step, index } = entry;
            const kind = stepKind(step, index, process.steg.length);
            const style: CSSProperties = {
              left: pct(node.x, width),
              top: pct(node.y, height),
              width: pct(node.width, width),
              height: pct(node.height, height),
            };
            return (
              <li key={node.id} className="contents">
                <button
                  type="button"
                  onClick={() => onSelectStep(step.id)}
                  style={style}
                  data-step={step.id}
                  data-kind={kind}
                  aria-current={selectedStepId === step.id ? 'step' : undefined}
                  aria-label={`${index + 1}. ${step.titel}${step.fraga ? `. ${step.fraga}` : ''}`}
                  className={cn(
                    'absolute flex flex-col justify-center gap-1 overflow-hidden rounded-md border bg-paper px-3 py-2 text-left shadow-paper',
                    'transition-colors duration-[var(--duration-fast)] hover:border-accent hover:bg-accent-soft/50',
                    kind === 'question' && 'border-l-4 border-line-strong border-l-plan-yellow',
                    kind === 'start' && 'border-accent/60',
                    kind === 'end' && 'border-line-strong bg-bg',
                    kind === 'step' && 'border-line-strong',
                    selectedStepId === step.id && 'border-accent ring-2 ring-accent/40',
                  )}
                >
                  <span className="line-clamp-2 text-[0.8125rem] leading-snug font-semibold">
                    {step.titel}
                  </span>
                  <StepMeta step={step} kind={kind} />
                </button>
              </li>
            );
          })}
        </ol>
      </figure>
    </div>
  );
}

function StepMeta({ step, kind }: { step: ProcessStep; kind: ReturnType<typeof stepKind> }) {
  if (step.fraga) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1 text-[0.75rem] text-brick">
        <CircleHelp className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{step.fraga}</span>
      </span>
    );
  }
  if (step.frist) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1 text-[0.75rem] text-muted">
        <Clock className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{step.frist}</span>
      </span>
    );
  }
  if (kind === 'end' || step.se_process) {
    return (
      <span className="inline-flex items-center gap-1 text-[0.75rem] text-muted">
        <Flag className="size-3.5 shrink-0" aria-hidden="true" />
        {step.se_process ? 'Fortsätter i en annan karta' : 'Slut'}
      </span>
    );
  }
  return null;
}

function ProcessList({
  process,
  onSelectStep,
  selectedStepId,
}: {
  process: Process;
  onSelectStep: (stepId: string) => void;
  selectedStepId?: string;
}) {
  const edges = processEdges(process);
  const titles = new Map(process.steg.map((s) => [s.id, s.titel]));
  return (
    <ol className="flex flex-col gap-2" aria-label={`Processkarta: ${process.titel}`} data-testid="process-list">
      {process.steg.map((step, index) => {
        const kind = stepKind(step, index, process.steg.length);
        const out = edges.filter((e) => e.from === step.id);
        const branches = out.length > 1 || out.some((e) => e.label || e.back);
        return (
          <li
            key={step.id}
            className={cn(
              'rounded-md border bg-paper',
              kind === 'question' ? 'border-l-4 border-line-strong border-l-plan-yellow' : 'border-line',
              selectedStepId === step.id && 'border-accent',
            )}
          >
            <button
              type="button"
              onClick={() => onSelectStep(step.id)}
              data-step={step.id}
              aria-current={selectedStepId === step.id ? 'step' : undefined}
              className="flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left hover:bg-accent-soft/50"
            >
              <span
                className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong text-xs font-semibold text-muted"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">{step.titel}</span>
                <StepMeta step={step} kind={kind} />
              </span>
            </button>
            {branches && (
              <ul className="flex flex-wrap gap-1.5 px-3 pb-2.5 pl-12" aria-label="Vägar vidare">
                {out.map((edge) => (
                  <li key={`${edge.from}-${edge.to}`}>
                    <button
                      type="button"
                      onClick={() => onSelectStep(edge.to)}
                      className="inline-flex items-center gap-1 rounded-sm border border-line px-2 py-0.5 text-xs text-muted hover:border-accent/50 hover:text-ink"
                    >
                      {edge.back ? (
                        <CornerDownRight className="size-3.5 -scale-y-100" aria-hidden="true" />
                      ) : (
                        <ArrowRight className="size-3.5" aria-hidden="true" />
                      )}
                      {edge.label ? `${edge.label}: ` : ''}
                      {titles.get(edge.to)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
