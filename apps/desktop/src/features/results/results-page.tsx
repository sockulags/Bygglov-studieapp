import { Link } from '@tanstack/react-router';
import { ArrowDownRight, ArrowRight, ArrowUpRight, ChartLine, Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyState, PageHeader, SectionTitle } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent } from '@/components/ui/card';
import { useSubmittedDecisions } from '@/features/cases';
import { ExportDecisionButton } from '@/features/cases/export';
import { usePassHistory } from '@/features/progress/hooks';
import { studyModeLabel } from '@/features/study/modes';
import { cn } from '@/lib/cn';
import { formatDuration, formatWhen } from '@/lib/format';
import { DEFAULT_FILTER, inWindow, type ResultsFilter } from './aggregate';
import { AnswersChart } from './answers-chart';
import { CaseResults } from './case-results';
import { useResultsData } from './hooks';
import { MasteryChart } from './mastery-chart';
import { ResultsFilters } from './results-filters';
import { TagsChart } from './tags-chart';
import './results.css';

interface HeroTile {
  label: string;
  value: string;
  hint: string;
  delta?: number | null;
}

function DeltaHint({ delta }: { delta: number }) {
  if (delta === 0) return <span>Oförändrat de senaste 4 veckorna</span>;
  const up = delta > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className={cn('size-3.5', up ? 'text-success' : 'text-brick')} aria-hidden="true" />
      <span>
        {up ? '+' : '−'}
        {Math.abs(delta)} procentenheter på 4 veckor
      </span>
    </span>
  );
}

function HeroRow({ tiles }: { tiles: readonly HeroTile[] }) {
  return (
    <section aria-label="Översikt" className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardContent className="p-5">
            <p className="text-sm text-muted">{tile.label}</p>
            <p className="mt-1 text-4xl font-semibold tracking-tight">{tile.value}</p>
            <p className="mt-1 text-xs text-muted">
              {tile.delta != null ? <DeltaHint delta={tile.delta} /> : tile.hint}
            </p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function ResultsPage() {
  const [filter, setFilter] = useState<ResultsFilter>(DEFAULT_FILTER);
  const now = new Date();
  const data = useResultsData(filter, now);
  const { history } = usePassHistory();
  const finished = history.passes.filter(
    (p) =>
      p.session.finishedAt !== null &&
      p.result &&
      inWindow(p.session.finishedAt, data.days) &&
      (filter.moduleId === null || p.session.moduleIds.includes(filter.moduleId)),
  );
  const decisions = useSubmittedDecisions();
  const latestDecision = decisions.data?.[0] ?? null;
  const studied = useMemo(() => new Set(data.modules.map((m) => m.moduleId)), [data.modules]);
  const { hero } = data;

  const tiles: HeroTile[] = [
    {
      label: 'Streak',
      value: plural(hero.streak.days, 'dag', 'dagar'),
      hint: hero.streak.studiedToday
        ? 'Du har pluggat i dag'
        : hero.streak.days > 0
          ? 'Gör ett pass i dag för att hålla den'
          : 'Dagar i rad med minst ett pass',
    },
    {
      label: 'Frågor i dag',
      value: String(hero.answeredToday),
      hint: hero.answeredToday === 0 ? 'Inga svar än i dag' : 'Svar sedan midnatt',
    },
    { label: 'Besvarade totalt', value: String(hero.answeredTotal), hint: 'Alla svar, alla pass' },
    {
      label: 'Behärskning totalt',
      value: `${hero.mastery} %`,
      hint: 'Viktat snitt över modulerna med frågor',
      delta: hero.masteryDelta,
    },
  ];

  return (
    <>
      <PageHeader
        title="Mina resultat"
        description="Hur det går över tid: behärskning per modul, hur mycket du pluggar, det du oftast missar och dina ärenden."
        actions={
          latestDecision ? (
            <ExportDecisionButton
              caseId={latestDecision.caseFile.id}
              decisionId={latestDecision.decision.id}
              label="Exportera senaste beslutet"
            />
          ) : (
            <Button
              variant="secondary"
              disabled
              title="Aktiveras när du lämnat in ett beslut i ett ärende"
            >
              <Download aria-hidden="true" />
              Exportera till handledare
            </Button>
          )
        }
      />

      <HeroRow tiles={tiles} />

      <ResultsFilters
        value={filter}
        modules={data.moduleOptions}
        studied={studied}
        onChange={setFilter}
      />

      <div className="results-charts" data-refreshing={data.isRefreshing ? 'true' : 'false'}>
        <section aria-labelledby="results-study" className="mb-10">
          <SectionTitle>
            <span id="results-study">Plugg</span>
          </SectionTitle>
          <div className="flex flex-col gap-4">
            <MasteryChart
              days={data.days}
              series={data.series}
              hiddenModules={data.hiddenModules}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <AnswersChart buckets={data.bars.buckets} unit={data.bars.unit} />
              <TagsChart tags={data.tags} hasAnswers={data.hasAnswers} />
            </div>
          </div>
        </section>

        <CaseResults counts={data.caseCounts} checks={data.checks} />
      </div>

      <section aria-labelledby="results-history">
        <SectionTitle>
          <span id="results-history">Senaste pass</span>
        </SectionTitle>
        {finished.length === 0 ? (
          <EmptyState
            icon={<ChartLine />}
            title={history.passes.length === 0 ? 'Inga pass ännu' : 'Inga pass i perioden'}
            description={
              history.passes.length === 0
                ? 'När du gjort ett pass visas det här med resultat och tid.'
                : 'Välj ett längre tidsintervall eller en annan modul för att se fler pass.'
            }
            action={
              <Link to="/study" className={buttonVariants()}>
                Börja plugga
                <ArrowRight aria-hidden="true" />
              </Link>
            }
          />
        ) : (
          <Card>
            <ul className="divide-y divide-line">
              {finished.slice(0, 15).map(({ session, result }) => (
                <li key={session.id} className="flex flex-wrap items-center gap-4 px-6 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {result?.title ?? studyModeLabel(session.mode)}
                    </p>
                    <p className="text-sm text-muted">
                      {formatWhen(session.finishedAt ?? session.startedAt, now)}
                      {result?.durationMs != null ? ` · ${formatDuration(result.durationMs)}` : ''}
                      {result && result.partial > 0 ? ` · ${result.partial} delvis rätt` : ''}
                    </p>
                  </div>
                  <span className="text-sm text-muted tabular-nums">
                    {result?.correct} av {result?.total} rätt
                  </span>
                  <span className="w-16 text-right text-lg font-semibold whitespace-nowrap tabular-nums">
                    {result?.percent} %
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </>
  );
}
