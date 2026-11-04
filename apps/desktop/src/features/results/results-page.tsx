import { Link } from '@tanstack/react-router';
import { ArrowRight, ChartLine, Download, Tag } from 'lucide-react';
import { useMemo } from 'react';
import { EmptyState, PageHeader, SectionTitle } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent } from '@/components/ui/card';
import { MasteryRing, Progress } from '@/components/ui/progress';
import { loadContent } from '@/content';
import { useAnswerHistory } from '@/data';
import { useSubmittedDecisions } from '@/features/cases';
import { ExportDecisionButton } from '@/features/cases/export';
import { usePassHistory, useStudyOverview } from '@/features/progress/hooks';
import { overallMastery, questionIndex, tagLabel, weakTags } from '@/features/progress/progress';
import { studyModeLabel } from '@/features/study/modes';
import { formatDuration, formatWhen } from '@/lib/format';
import { CaseResults } from './case-results';

export function ResultsPage() {
  const { overview } = useStudyOverview();
  const { history } = usePassHistory();
  const answers = useAnswerHistory();
  const questions = useMemo(() => questionIndex(loadContent()), []);
  const tags = useMemo(() => weakTags(answers.data ?? [], questions), [answers.data, questions]);
  const modules = overview.modules.filter((m) => m.questionCount > 0);
  const finished = history.passes.filter((p) => p.session.finishedAt !== null && p.result);
  const totalAnswers = answers.data?.length ?? 0;
  const decisions = useSubmittedDecisions();
  const latestDecision = decisions.data?.[0] ?? null;
  const now = new Date();

  const stats = [
    {
      label: 'Behärskning totalt',
      value: `${overallMastery(modules)} %`,
      hint: 'Viktat snitt över modulerna med frågor',
    },
    { label: 'Besvarade frågor', value: String(totalAnswers), hint: 'Alla svar, alla pass' },
    {
      label: 'Pass',
      value: String(finished.length),
      hint: `Streak ${history.streak.days} ${history.streak.days === 1 ? 'dag' : 'dagar'}`,
    },
  ];

  return (
    <>
      <PageHeader
        title="Mina resultat"
        description="Hur det går över tid: behärskning per modul, det du oftast missar, dina ärenden och dina senaste pass."
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

      <section aria-label="Översikt" className="mb-10 grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-5">
              <p className="text-sm text-muted">{stat.label}</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">{stat.value}</p>
              <p className="text-xs text-muted">{stat.hint}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <div className="mb-10 grid gap-6 lg:grid-cols-[3fr_2fr]">
        <section aria-labelledby="results-mastery">
          <SectionTitle>
            <span id="results-mastery">Behärskning per modul</span>
          </SectionTitle>
          <Card>
            <CardContent className="flex flex-col gap-5">
              {modules.map((module) => (
                <div key={module.moduleId} className="flex items-center gap-4">
                  <MasteryRing
                    value={module.mastery}
                    size={44}
                    strokeWidth={4}
                    label={`Behärskning ${module.title}: ${module.mastery} %`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {module.ordning}. {module.title}
                    </p>
                    <p className="text-sm text-muted">
                      {module.seen} av {module.questionCount} frågor besvarade
                      {module.due > 0 ? ` · ${module.due} väntar på repetition` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="results-weak">
          <SectionTitle>
            <span id="results-weak">Svaga taggar</span>
          </SectionTitle>
          <Card>
            <CardContent>
              {tags.length === 0 ? (
                <p className="text-sm text-muted">
                  {totalAnswers === 0
                    ? 'När du svarat på några frågor visas här de ämnen du oftast missar.'
                    : 'Inga tydligt svaga områden just nu. Fortsätt så!'}
                </p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {tags.map((tag) => (
                    <li key={tag.tag}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="inline-flex min-w-0 items-center gap-1.5 font-medium">
                          <Tag className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
                          <span className="truncate">{tagLabel(tag.tag)}</span>
                        </span>
                        <span className="shrink-0 text-sm text-muted tabular-nums">
                          {Math.round(tag.accuracy * 100)} % av {tag.answered}
                        </span>
                      </div>
                      <Progress
                        value={tag.accuracy * 100}
                        tone="brick"
                        thin
                        className="mt-1.5"
                        label={`Andel rätt för ${tagLabel(tag.tag)}`}
                      />
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 text-xs text-muted">
                Räknat på ditt senaste svar per fråga, så det du övat in slutar dra ned.
              </p>
            </CardContent>
          </Card>
        </section>
      </div>

      <CaseResults />

      <section aria-labelledby="results-history">
        <SectionTitle>
          <span id="results-history">Senaste pass</span>
        </SectionTitle>
        {finished.length === 0 ? (
          <EmptyState
            icon={<ChartLine />}
            title="Inga pass ännu"
            description="När du gjort ett pass visas det här med resultat och tid."
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
                  <span className="w-14 text-right text-lg font-semibold tabular-nums">
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
