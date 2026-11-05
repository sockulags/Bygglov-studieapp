import { BookOpen, Workflow } from 'lucide-react';
import { useMemo } from 'react';
import { EmptyState } from '@/components/layout/page-header';
import { LawRefChip } from '@/components/ui/law-ref-chip';
import type { GlossaryTerm, LookupContent, Module } from '@/content';
import { termElementId, useLookupNav } from './lookup-nav';

/** First letter for the alphabetical index ("Å", "Ä", "Ö" are letters of their own). */
function initial(term: string): string {
  return term.trim().charAt(0).toLocaleUpperCase('sv');
}

const letterId = (letter: string) => `bokstav-${letter.charCodeAt(0)}`;

export function GlossaryTab({ lookup, modules }: { lookup: LookupContent; modules: readonly Module[] }) {
  const nav = useLookupNav();
  const byLetter = useMemo(() => {
    const groups = new Map<string, GlossaryTerm[]>();
    for (const term of lookup.glossary) {
      const letter = initial(term.term);
      groups.set(letter, [...(groups.get(letter) ?? []), term]);
    }
    return [...groups.entries()];
  }, [lookup.glossary]);
  const terms = new Map(lookup.glossary.map((t) => [t.id, t]));
  const moduleTitles = new Map(modules.map((m) => [m.id, m.titel]));
  const usedInSteps = useMemo(() => {
    const map = new Map<string, { processId: string; stepId: string; label: string }[]>();
    for (const process of lookup.processes) {
      for (const step of process.steg) {
        for (const id of step.begrepp ?? []) {
          map.set(id, [
            ...(map.get(id) ?? []),
            { processId: process.id, stepId: step.id, label: `${process.titel}: ${step.titel}` },
          ]);
        }
      }
    }
    return map;
  }, [lookup.processes]);

  if (lookup.glossary.length === 0) {
    return (
      <EmptyState
        icon={<BookOpen />}
        title="Ordlistan är tom"
        description="Kör pnpm content:build så att begreppen i content/uppslag/begrepp.yaml kommer med."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <p className="max-w-2xl text-[0.9375rem] text-muted">
          {lookup.glossary.length} begrepp som du möter som bygglovshandläggare, med lagrum och
          kopplingar till andra begrepp. Alla är utkast tills handledaren har granskat dem.
        </p>
        <nav aria-label="Bokstäver" className="flex flex-wrap gap-1">
          {byLetter.map(([letter]) => (
            <a
              key={letter}
              href={`#${letterId(letter)}`}
              onClick={(event) => {
                event.preventDefault();
                document
                  .getElementById(letterId(letter))
                  ?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
              }}
              className="inline-flex size-8 items-center justify-center rounded-sm border border-line bg-paper text-sm font-medium hover:border-accent/50 hover:bg-accent-soft"
            >
              {letter}
            </a>
          ))}
        </nav>
      </div>

      {byLetter.map(([letter, list]) => (
        <section key={letter} aria-labelledby={letterId(letter)}>
          <h3
            id={letterId(letter)}
            className="mb-2 scroll-mt-4 border-b border-line pb-1 font-serif text-xl text-muted"
          >
            {letter}
          </h3>
          <ul className="grid gap-3 lg:grid-cols-2">
            {list.map((term) => {
              const steps = usedInSteps.get(term.id) ?? [];
              return (
                <li key={term.id}>
                  <article
                    id={termElementId(term.id)}
                    tabIndex={-1}
                    aria-labelledby={`${termElementId(term.id)}-term`}
                    className="flex h-full scroll-mt-24 flex-col gap-2 rounded-md border border-line bg-paper p-4 outline-none transition-colors duration-500 focus-visible:border-accent data-[flash=true]:border-plan-yellow data-[flash=true]:bg-plan-yellow-soft"
                  >
                    <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <h4 id={`${termElementId(term.id)}-term`} className="text-base font-semibold">
                        {term.term}
                      </h4>
                      <span className="text-xs text-muted">
                        {moduleTitles.get(term.modul) ?? term.modul}
                      </span>
                    </header>
                    {term.synonymer && term.synonymer.length > 0 && (
                      <p className="-mt-1 text-xs text-muted">Även: {term.synonymer.join(', ')}</p>
                    )}
                    <p className="font-serif text-[0.9375rem] leading-relaxed">{term.definition}</p>
                    {term.lagrum.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {term.lagrum.map((reference) => (
                          <LawRefChip
                            key={reference}
                            reference={reference}
                            uncertain={term.lagrum_osaker === true}
                            onClick={() => nav.open({ kind: 'reference', reference })}
                            aria-label={`${reference}, visa i lagrumsregistret`}
                          />
                        ))}
                      </div>
                    )}
                    {(term.relaterade?.length ?? 0) > 0 && (
                      <p className="flex flex-wrap items-center gap-1.5 text-sm">
                        <span className="text-muted">Se även</span>
                        {term.relaterade?.map((id) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => nav.open({ kind: 'term', id })}
                            className="rounded-sm px-1 text-accent underline-offset-2 hover:underline"
                          >
                            {terms.get(id)?.term ?? id}
                          </button>
                        ))}
                      </p>
                    )}
                    {steps.length > 0 && (
                      <p className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 text-xs text-muted">
                        <Workflow className="size-3.5" aria-hidden="true" />
                        {steps.map((s) => (
                          <button
                            key={`${s.processId}-${s.stepId}`}
                            type="button"
                            onClick={() => nav.open({ kind: 'process', processId: s.processId, stepId: s.stepId })}
                            className="rounded-sm underline-offset-2 hover:text-ink hover:underline"
                          >
                            {s.label}
                          </button>
                        ))}
                      </p>
                    )}
                  </article>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
