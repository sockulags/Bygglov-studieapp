import { processEdges } from '@bygglov/content-schema';
import { ArrowRight, BookOpen, CircleHelp, Clock, CornerDownRight, Workflow } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { EmptyState } from '@/components/layout/page-header';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LawRefChip } from '@/components/ui/law-ref-chip';
import type { LookupContent, Module, Process, ProcessStep } from '@/content';
import { cn } from '@/lib/cn';
import { useLookupNav } from './lookup-nav';
import { ProcessMap } from './process-map';

/**
 * Processkartor: one process at a time as a clickable flowchart. A step opens a box with its
 * description, deadline, lagrum (chips that open the law register), terms and the ways on.
 */

export interface ProcessSelection {
  processId: string;
  /** The step whose box is open. */
  stepId?: string;
}

export function ProcessTab({
  lookup,
  modules,
  selection,
  onSelect,
}: {
  lookup: LookupContent;
  modules: readonly Module[];
  selection: ProcessSelection | undefined;
  onSelect: (selection: ProcessSelection) => void;
}) {
  const processes = lookup.processes;
  const process = processes.find((p) => p.id === selection?.processId) ?? processes[0];
  const moduleTitles = useMemo(() => new Map(modules.map((m) => [m.id, m.titel])), [modules]);

  if (!process) {
    return (
      <EmptyState
        icon={<Workflow />}
        title="Inga processkartor ännu"
        description="Kör pnpm content:build så att processerna i content/uppslag/processer.yaml kommer med."
      />
    );
  }

  const step = selection?.stepId ? process.steg.find((s) => s.id === selection.stepId) : undefined;

  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-2xl text-[0.9375rem] text-muted">
        Fyra processer som du följer som handläggare. Klicka på ett steg för att läsa vad som
        händer, vilka frister som gäller och vilka lagrum steget bygger på.
      </p>

      <div role="radiogroup" aria-label="Välj process" className="flex flex-wrap gap-2">
        {processes.map((p) => {
          const active = p.id === process.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect({ processId: p.id })}
              className={cn(
                'inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium transition-colors duration-[var(--duration-fast)]',
                active
                  ? 'border-accent bg-accent text-accent-ink'
                  : 'border-line-strong bg-paper hover:border-accent/50 hover:bg-accent-soft',
              )}
            >
              {p.titel}
            </button>
          );
        })}
      </div>

      <section
        aria-labelledby={`process-${process.id}`}
        className="flex flex-col gap-4 rounded-lg border border-line bg-paper p-5"
      >
        <header className="flex flex-col gap-1">
          <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
            {moduleTitles.get(process.modul) ?? process.modul} · {process.steg.length} steg
          </p>
          <h3 id={`process-${process.id}`} className="text-xl">
            {process.titel}
          </h3>
          <p className="max-w-3xl font-serif text-[0.9375rem] leading-relaxed">
            {process.beskrivning}
          </p>
        </header>
        <Legend />
        <ProcessMap
          process={process}
          selectedStepId={step?.id}
          onSelectStep={(stepId) => onSelect({ processId: process.id, stepId })}
        />
      </section>

      <StepDialog
        process={process}
        step={step}
        lookup={lookup}
        onSelectStep={(stepId) =>
          onSelect({ processId: process.id, ...(stepId ? { stepId } : {}) })
        }
        onOpenProcess={(processId) => onSelect({ processId })}
      />
    </div>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted" aria-label="Teckenförklaring">
      <li className="inline-flex items-center gap-1.5">
        <span
          className="h-3 w-4 rounded-[3px] border border-line-strong bg-paper"
          aria-hidden="true"
        />
        Steg
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span
          className="h-3 w-4 rounded-[3px] border border-l-4 border-line-strong border-l-plan-yellow bg-paper"
          aria-hidden="true"
        />
        Förgrening med en fråga
      </li>
      <li className="inline-flex items-center gap-1.5">
        <svg width="22" height="8" aria-hidden="true" className="overflow-visible">
          <line
            x1="0"
            y1="4"
            x2="22"
            y2="4"
            strokeWidth="1.5"
            strokeDasharray="5 4"
            style={{ stroke: 'var(--brick)' }}
          />
        </svg>
        Tillbaka till ett tidigare steg
      </li>
    </ul>
  );
}

function StepDialog({
  process,
  step,
  lookup,
  onSelectStep,
  onOpenProcess,
}: {
  process: Process;
  step: ProcessStep | undefined;
  lookup: LookupContent;
  onSelectStep: (stepId: string | undefined) => void;
  onOpenProcess: (processId: string) => void;
}) {
  const lookupNav = useLookupNav();
  // Set when a link in the box leads elsewhere in Uppslag, so closing the box does not move
  // focus back to the step button (the target of the link takes focus instead).
  const leaving = useRef(false);
  const nav = {
    open: (target: Parameters<typeof lookupNav.open>[0]) => {
      leaving.current = true;
      lookupNav.open(target);
    },
  };
  const edges = useMemo(() => processEdges(process), [process]);
  const index = step ? process.steg.indexOf(step) : -1;
  const titles = new Map(process.steg.map((s) => [s.id, s.titel]));
  const terms = new Map(lookup.glossary.map((t) => [t.id, t]));
  const out = step ? edges.filter((e) => e.from === step.id) : [];
  const into = step ? edges.filter((e) => e.to === step.id) : [];
  const linked = step?.se_process
    ? lookup.processes.find((p) => p.id === step.se_process)
    : undefined;

  return (
    <Dialog open={step !== undefined} onOpenChange={(open) => !open && onSelectStep(undefined)}>
      <DialogContent
        className="max-h-[calc(100vh-4rem)] max-w-xl overflow-y-auto"
        onCloseAutoFocus={(event) => {
          if (leaving.current) event.preventDefault();
          leaving.current = false;
        }}
      >
        {step && (
          <>
            <DialogHeader>
              <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                {process.titel} · steg {index + 1} av {process.steg.length}
              </p>
              <DialogTitle>{step.titel}</DialogTitle>
              {step.fraga && (
                <p className="inline-flex items-center gap-1.5 text-[0.9375rem] font-medium text-brick">
                  <CircleHelp className="size-4 shrink-0" aria-hidden="true" />
                  {step.fraga}
                </p>
              )}
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <DialogDescription className="font-serif text-base leading-relaxed text-ink">
                {step.beskrivning}
              </DialogDescription>

              {step.frist && (
                <p className="flex items-start gap-2 rounded-md border border-plan-yellow/60 bg-plan-yellow-soft px-3 py-2 text-sm">
                  <Clock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>
                    <span className="font-semibold">Frist: </span>
                    {step.frist}
                  </span>
                </p>
              )}

              {step.lagrum.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <h4 className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                    Lagrum
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {step.lagrum.map((reference) => (
                      <LawRefChip
                        key={reference}
                        reference={reference}
                        onClick={() => nav.open({ kind: 'reference', reference })}
                        aria-label={`${reference}, visa i lagrumsregistret`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {(step.begrepp?.length ?? 0) > 0 && (
                <div className="flex flex-col gap-1.5">
                  <h4 className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                    Begrepp
                  </h4>
                  <ul className="flex flex-wrap gap-1.5">
                    {step.begrepp?.map((id) => (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => nav.open({ kind: 'term', id })}
                          className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-line-strong px-2 text-xs font-medium hover:border-accent/50 hover:bg-accent-soft"
                        >
                          <BookOpen className="size-3.5" aria-hidden="true" />
                          {terms.get(id)?.term ?? id}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(out.length > 0 || linked) && (
                <div className="flex flex-col gap-1.5">
                  <h4 className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                    {out.length > 1 ? 'Vägar vidare' : 'Nästa steg'}
                  </h4>
                  <ul className="flex flex-col gap-1.5">
                    {out.map((edge) => (
                      <li key={`${edge.from}-${edge.to}`}>
                        <button
                          type="button"
                          onClick={() => onSelectStep(edge.to)}
                          className="inline-flex w-full items-center gap-2 rounded-md border border-line px-3 py-2 text-left text-sm hover:border-accent/50 hover:bg-accent-soft"
                        >
                          {edge.back ? (
                            <CornerDownRight
                              className="size-4 shrink-0 -scale-y-100 text-brick"
                              aria-hidden="true"
                            />
                          ) : (
                            <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
                          )}
                          <span>
                            {edge.label && <span className="font-semibold">{edge.label}:</span>}
                            {edge.label && ' '}
                            {titles.get(edge.to)}
                          </span>
                        </button>
                      </li>
                    ))}
                    {linked && (
                      <li>
                        <button
                          type="button"
                          onClick={() => {
                            leaving.current = true;
                            onOpenProcess(linked.id);
                          }}
                          className="inline-flex w-full items-center gap-2 rounded-md border border-accent/40 bg-accent-soft px-3 py-2 text-left text-sm text-accent hover:border-accent"
                        >
                          <Workflow className="size-4 shrink-0" aria-hidden="true" />
                          Fortsätter i processkartan {linked.titel}
                        </button>
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {into.length > 0 && (
                <p className="text-xs text-muted">
                  Hit kommer du från{' '}
                  {into.map((edge, i) => (
                    <span key={`${edge.from}-${edge.to}`}>
                      {i > 0 && (i === into.length - 1 ? ' och ' : ', ')}
                      <button
                        type="button"
                        onClick={() => onSelectStep(edge.from)}
                        className="underline-offset-2 hover:text-ink hover:underline"
                      >
                        {titles.get(edge.from)}
                      </button>
                    </span>
                  ))}
                  .
                </p>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
