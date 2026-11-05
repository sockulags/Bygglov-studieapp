import type { CaseFile } from '@bygglov/content-schema';
import { currentStep, visibleDocuments } from '@/engine';
import { cn } from '@/lib/cn';
import { factLabel, factValue } from './case-model';
import type { ActiveCase } from './case-store';

function FactList({ facts }: { facts: Record<string, unknown> }) {
  return (
    <dl className="divide-y divide-line text-sm">
      {Object.entries(facts).map(([key, value]) => (
        <div key={key} className="flex flex-wrap items-baseline justify-between gap-x-4 py-1.5">
          <dt className="text-muted">{factLabel(key)}</dt>
          <dd className="ml-auto text-right font-medium tabular-nums">{factValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The middle of the case view when no document is open: what the case is about, what to do
 * now, and the planning provisions and facts from the documents in the diary.
 */
export function CaseOverview({ caseFile, active }: { caseFile: CaseFile; active: ActiveCase }) {
  const { state } = active;
  const step = currentStep(caseFile, state);
  const documents = visibleDocuments(caseFile, state).filter(
    ({ document }) => document.fakta && Object.keys(document.fakta).length > 0,
  );
  const changed = state.facts;
  const hasChanged = Object.keys(changed).length > 0;

  return (
    <div className="@container mx-auto flex w-full max-w-4xl flex-col gap-6">
      <section aria-labelledby="case-overview-title" className="flex flex-col gap-2">
        <h2 id="case-overview-title" className="text-xl">
          Ärendeöversikt
        </h2>
        <p className="max-w-prose text-[1.0625rem] leading-relaxed">{caseFile.sammanfattning}</p>
        {step && (
          <p className="text-sm text-muted">
            Att göra nu: <span className="font-medium text-ink">{step.rubrik}</span> (i arbetsytan
            till höger)
          </p>
        )}
      </section>

      <section aria-labelledby="case-facts-title" className="flex flex-col gap-3">
        <div>
          <h2 id="case-facts-title" className="text-lg">
            Planbestämmelser och fakta
          </h2>
          <p className="text-sm text-muted">
            Uppgifter ur handlingarna i diariet: planbestämmelser, mått och annat som ärendet bygger
            på. Öppna en handling i diariet för att läsa den.
          </p>
        </div>
        {documents.length === 0 && !hasChanged && <p className="text-sm">Inga uppgifter ännu.</p>}
        <div className="grid gap-4 @2xl:grid-cols-2">
          {documents.map(({ document }) => (
            <section
              key={document.id}
              aria-label={document.titel}
              className={cn(
                'rounded-lg border bg-paper p-4',
                document.typ === 'planbestammelser' ? 'border-plan-yellow' : 'border-line',
              )}
            >
              <h3 className="mb-1 font-semibold">
                {document.titel}
                <span className="ml-1.5 text-xs font-normal text-muted">{document.id}</span>
              </h3>
              <FactList facts={document.fakta ?? {}} />
            </section>
          ))}
          {hasChanged && (
            <section className="rounded-lg border border-brick/40 bg-brick-soft/50 p-4">
              <h3 className="mb-1 font-semibold">Ändrade uppgifter under ärendet</h3>
              <FactList facts={changed} />
            </section>
          )}
        </div>
      </section>
    </div>
  );
}
