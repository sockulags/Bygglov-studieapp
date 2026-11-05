import type { ReactNode } from 'react';
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

export interface CaseOverviewProps {
  caseFile: CaseFile;
  active: ActiveCase;
  /** The current step (arbetsytan), shown as "Att göra nu" in the single-column layout. */
  work?: ReactNode;
  /** The diary, shown last in the single-column layout. */
  diary?: ReactNode;
}

/**
 * The case before a document is opened: what the case is about, what to do now, the
 * planning provisions and facts, and the diary. On a wide screen it is one centred column
 * with the step and the diary in it (`work`, `diary`); on a narrow one it is the middle tab
 * and the step and the diary have their own tabs.
 */
export function CaseOverview({ caseFile, active, work, diary }: CaseOverviewProps) {
  const { state } = active;
  const step = currentStep(caseFile, state);
  const documents = visibleDocuments(caseFile, state).filter(
    ({ document }) => document.fakta && Object.keys(document.fakta).length > 0,
  );
  const changed = state.facts;
  const hasChanged = Object.keys(changed).length > 0;

  return (
    <div className="@container mx-auto flex w-full max-w-3xl flex-col gap-8">
      <section aria-labelledby="case-overview-title" className="flex flex-col gap-2">
        <h2 id="case-overview-title" className="text-xl">
          Ärendet
        </h2>
        <p className="max-w-prose text-[1.0625rem] leading-relaxed">{caseFile.sammanfattning}</p>
        {step && !work && (
          <p className="text-sm text-muted">
            Att göra nu: <span className="font-medium text-ink">{step.rubrik}</span> (under
            Arbetsyta)
          </p>
        )}
      </section>

      {work && (
        <section aria-labelledby="case-work-title" className="flex flex-col gap-3">
          <h2 id="case-work-title" className="text-lg">
            Att göra nu
          </h2>
          <div className="overflow-hidden rounded-lg border border-line-strong bg-paper shadow-paper">
            {work}
          </div>
        </section>
      )}

      <section aria-labelledby="case-facts-title" className="flex flex-col gap-3">
        <div>
          <h2 id="case-facts-title" className="text-lg">
            Planbestämmelser och fakta
          </h2>
          <p className="text-sm text-muted">
            Uppgifter ur handlingarna: planbestämmelser, mått och annat som ärendet bygger på.
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

      {diary && (
        <section aria-labelledby="case-diary-title" className="flex flex-col gap-3">
          <div>
            <h2 id="case-diary-title" className="text-lg">
              Diarium
            </h2>
            <p className="text-sm text-muted">
              Handlingar och händelser i ärendet. Öppna en handling för att läsa den.
            </p>
          </div>
          <div className="rounded-lg border border-line bg-paper">{diary}</div>
        </section>
      )}
    </div>
  );
}
