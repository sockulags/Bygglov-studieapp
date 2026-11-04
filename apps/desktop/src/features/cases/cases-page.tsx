import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowRight, FolderOpen, MapPin, Play, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import type { CaseFile } from '@bygglov/content-schema';
import { EmptyState, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { loadContent } from '@/content';
import { cn } from '@/lib/cn';
import { CASE_LIST_STATUS_LABELS, propertyName, type CaseListStatus } from './case-model';
import { startNewCase } from './case-store';
import { useCaseSummaries, type CaseSummary } from './hooks';

const levels = [
  {
    level: 1,
    title: 'Grund',
    body: 'Komplett ansökan och en händelse. Fokus på rutinen: lovplikt, process och beslut.',
  },
  {
    level: 2,
    title: 'Normal',
    body: 'Komplettering, liten avvikelse och grannar som ska höras.',
  },
  {
    level: 3,
    title: 'Avancerad',
    body: 'Utanför plan, remisser, strandskydd och överklagande.',
  },
  {
    level: 4,
    title: 'Tillsyn',
    body: 'Olovligt byggande, förelägganden och sanktionsavgifter.',
  },
] as const;

const STATUS_CLASS: Record<CaseListStatus, string> = {
  ny: 'border-line-strong bg-bg text-muted',
  pagar: 'border-accent/40 bg-accent-soft text-accent',
  inlamnat: 'border-brick/40 bg-brick-soft text-brick',
  bedomt: 'border-success/40 bg-success-soft text-success',
};

/** /cases: the case list, grouped by level (docs/04 → Ärenden). */
export function CasesPage() {
  const { cases } = loadContent();
  const { summaries } = useCaseSummaries(cases);
  const [restart, setRestart] = useState<CaseFile | null>(null);
  const navigate = useNavigate();
  const byId = new Map(summaries.map((s) => [s.caseId, s]));

  const start = (caseFile: CaseFile) => {
    startNewCase(caseFile);
    void navigate({ to: '/cases/$caseId', params: { caseId: caseFile.id } });
  };

  return (
    <>
      <PageHeader
        title="Ärenden"
        description="Bygglovsärenden som på kontoret: handlingar i ett diarium, steg att arbeta igenom, händelser på vägen och ett beslut som jämförs med ett modellbeslut."
      />

      <div className="flex flex-col gap-10">
        {levels.map((item) => {
          const inLevel = cases.filter((c) => c.niva === item.level);
          return (
            <section key={item.level} aria-labelledby={`level-${item.level}`}>
              <div className="mb-3">
                <h2 id={`level-${item.level}`} className="text-lg font-semibold">
                  Nivå {item.level} · {item.title}
                </h2>
                <p className="text-sm text-muted">{item.body}</p>
              </div>
              {inLevel.length === 0 ? (
                <EmptyState
                  className="py-8"
                  icon={<FolderOpen />}
                  title="Inga ärenden på den här nivån ännu"
                  description="Ärendena skrivs tillsammans med handledaren och följer med en kommande uppdatering."
                />
              ) : (
                <ul className="flex flex-col gap-3">
                  {inLevel.map((c) => {
                    const summary = byId.get(c.id);
                    return summary ? (
                      <li key={c.id}>
                        <CaseCard
                          caseFile={c}
                          summary={summary}
                          onStart={() => start(c)}
                          onRestart={() => setRestart(c)}
                        />
                      </li>
                    ) : null;
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <Dialog open={restart !== null} onOpenChange={(open) => !open && setRestart(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Börja om {restart?.id}?</DialogTitle>
            <DialogDescription>
              Allt du gjort i ärendet tas bort: svar, händelser, beslut och anteckningar. Det
              startar från ansökningsdagen igen.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Avbryt</Button>
            </DialogClose>
            <Button
              variant="danger"
              onClick={() => {
                const target = restart;
                setRestart(null);
                if (target) start(target);
              }}
            >
              Börja om
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CaseCard({
  caseFile,
  summary,
  onStart,
  onRestart,
}: {
  caseFile: CaseFile;
  summary: CaseSummary;
  onStart: () => void;
  onRestart: () => void;
}) {
  const started = summary.status !== 'ny';
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
              {caseFile.id} · Nivå {caseFile.niva}
            </p>
            <span
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-xs font-medium',
                STATUS_CLASS[summary.status],
              )}
            >
              {CASE_LIST_STATUS_LABELS[summary.status]}
            </span>
          </div>
          <h3 className="mt-1 text-lg font-semibold">
            {caseFile.titel}, {propertyName(caseFile)}
          </h3>
          <p className="mt-0.5 inline-flex items-center gap-1 text-sm text-muted">
            <MapPin className="size-3.5" aria-hidden="true" />
            {caseFile.fastighet}
          </p>
          <p className="mt-2 max-w-prose text-[0.9375rem] leading-relaxed">
            {caseFile.sammanfattning}
          </p>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer font-medium text-accent">Lärandemål</summary>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
              {caseFile.larandemal.map((goal) => (
                <li key={goal}>{goal}</li>
              ))}
            </ul>
          </details>
          {started && (
            <p className="mt-2 text-sm text-muted tabular-nums">
              {summary.stepsDone} av {summary.stepsTotal} steg klara
              {summary.simDate ? ` · i ärendet ${summary.simDate}` : ''}
              {summary.currentStepTitle ? ` · nästa: ${summary.currentStepTitle}` : ''}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 md:flex-col md:items-stretch">
          {started ? (
            <>
              <Link
                to="/cases/$caseId"
                params={{ caseId: caseFile.id }}
                className={buttonVariants()}
                aria-label={`${summary.status === 'pagar' ? 'Fortsätt' : 'Öppna'} ${caseFile.id}, ${caseFile.titel}`}
              >
                {summary.status === 'pagar' ? 'Fortsätt' : 'Öppna'}
                <ArrowRight aria-hidden="true" />
              </Link>
              <Button variant="ghost" onClick={onRestart}>
                <RotateCcw aria-hidden="true" />
                Börja om
              </Button>
            </>
          ) : (
            <Button onClick={onStart} aria-label={`Starta ${caseFile.id}, ${caseFile.titel}`}>
              <Play aria-hidden="true" />
              Starta
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
