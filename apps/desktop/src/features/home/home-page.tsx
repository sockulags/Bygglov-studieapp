import { Link } from '@tanstack/react-router';
import { ArrowRight, FilePlus2, Flame, PlayCircle, RotateCcw, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { PageHeader, SectionTitle } from '@/components/layout/page-header';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { usePassHistory, useStudyOverview } from '@/features/progress/hooks';
import { studyModeLabel } from '@/features/study/modes';
import { useStudyStore, type StartRequest } from '@/features/study/study-store';
import { useStartRun } from '@/features/study/use-start-run';
import { cn } from '@/lib/cn';
import { formatDueDay, formatWhen, pluralQuestions } from '@/lib/format';

function greeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 5) return 'God natt';
  if (hour < 10) return 'God morgon';
  if (hour < 18) return 'Hej';
  return 'God kväll';
}

const toneClass = {
  accent: 'bg-accent-soft text-accent',
  yellow: 'bg-plan-yellow-soft text-ink',
  brick: 'bg-brick-soft text-brick',
} as const;

function ActionCard({
  icon: Icon,
  tone,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  tone: keyof typeof toneClass;
  title: string;
  body: ReactNode;
  action: ReactNode;
}) {
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-4">
        <span
          className={`inline-flex size-10 items-center justify-center rounded-md ${toneClass[tone]}`}
        >
          <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="flex-1">
          <h3 className="text-lg font-semibold">{title}</h3>
          <div className="mt-1 text-sm text-muted">{body}</div>
        </div>
        <div>{action}</div>
      </CardContent>
    </Card>
  );
}

/** Default first step: module 3 is the foundation (docs/07). */
const FIRST_MODULE = '03-lovplikt';

export function HomePage() {
  const run = useStudyStore((s) => s.run);
  const { overview } = useStudyOverview();
  const { history } = usePassHistory();
  const { start, pending, message } = useStartRun();
  const now = new Date();

  const activeRun = run && run.session.status !== 'finished' ? run : null;
  const lastPass = history.passes.find((p) => p.session.finishedAt !== null && p.result !== null);
  const modulesWithQuestions = overview.modules.filter((m) => m.questionCount > 0);
  const firstModule =
    modulesWithQuestions.find((m) => m.moduleId === FIRST_MODULE) ?? modulesWithQuestions[0];

  // "Fortsätt där du var": the pass in progress, else a new pass like the last one.
  let continueBody: ReactNode;
  let continueAction: ReactNode;
  if (activeRun) {
    const answered = activeRun.session.items.filter((i) => i.response !== null).length;
    continueBody = (
      <>
        {activeRun.title}. Du har svarat på {answered} av {activeRun.session.items.length}.
      </>
    );
    continueAction = (
      <Link to="/study/session" className={buttonVariants()}>
        Fortsätt passet
        <ArrowRight aria-hidden="true" />
      </Link>
    );
  } else if (lastPass?.result) {
    const request: StartRequest = {
      mode: 'quick-quiz',
      moduleIds: lastPass.session.moduleIds,
    };
    continueBody = (
      <>
        Senast: {lastPass.result.title}, {lastPass.result.percent} % rätt (
        {formatWhen(lastPass.session.finishedAt ?? lastPass.session.startedAt, now)}). Kör ett nytt
        snabbquiz i samma {lastPass.session.moduleIds.length === 1 ? 'modul' : 'urval'}.
      </>
    );
    continueAction = (
      <button
        type="button"
        disabled={pending}
        onClick={() => void start(request)}
        className={buttonVariants()}
      >
        Nytt snabbquiz
        <ArrowRight aria-hidden="true" />
      </button>
    );
  } else {
    continueBody = firstModule
      ? `Inget påbörjat pass ännu. Börja med ${firstModule.title}, det är grunden för allt annat.`
      : 'Inget innehåll är inläst ännu.';
    continueAction = firstModule ? (
      <button
        type="button"
        disabled={pending}
        onClick={() => void start({ mode: 'quick-quiz', moduleIds: [firstModule.moduleId] })}
        className={buttonVariants()}
      >
        Börja plugga
        <ArrowRight aria-hidden="true" />
      </button>
    ) : null;
  }

  const due = overview.due;
  const description =
    due > 0
      ? `Dagens förslag: ${pluralQuestions(due)} väntar på repetition. Ta dem först, det är då minnet gör mest nytta.`
      : activeRun
        ? 'Dagens förslag: gör klart passet du påbörjade.'
        : 'Dagens förslag: ett snabbquiz. Tio frågor, med förklaring och lagrum efter varje svar.';

  return (
    <>
      <PageHeader
        eyebrow={new Intl.DateTimeFormat('sv-SE', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        }).format(now)}
        title={`${greeting(now)}.`}
        description={description}
      />

      <section aria-labelledby="home-actions" className="mb-10">
        <h2 id="home-actions" className="sr-only">
          Nästa steg
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <ActionCard
            icon={PlayCircle}
            tone="accent"
            title="Fortsätt där du var"
            body={continueBody}
            action={continueAction}
          />
          <ActionCard
            icon={RotateCcw}
            tone="yellow"
            title="Repetition"
            body={
              due > 0
                ? `${pluralQuestions(due)} väntar. Du får dem igen precis innan du hinner glömma dem.`
                : overview.nextReview
                  ? `Inget väntar just nu. Nästa repetition ${formatDueDay(overview.nextReview, now)}.`
                  : 'Repetitionen fylls på när du svarat på frågor. Då får du dem igen precis innan du glömmer.'
            }
            action={
              due > 0 ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void start({ mode: 'review', moduleIds: [] })}
                  className={buttonVariants({ variant: 'secondary' })}
                >
                  Repetera {due}
                  <ArrowRight aria-hidden="true" />
                </button>
              ) : (
                <Link
                  to="/study"
                  search={{ mode: 'review' }}
                  className={buttonVariants({ variant: 'ghost' })}
                >
                  Om repetition
                  <ArrowRight aria-hidden="true" />
                </Link>
              )
            }
          />
          <ActionCard
            icon={FilePlus2}
            tone="brick"
            title="Nytt ärende"
            body="Ta emot en ansökan, granska handlingarna och skriv ett beslut, som på kontoret. Ärendena kommer i nästa version."
            action={
              <Link to="/cases" className={buttonVariants({ variant: 'ghost' })}>
                Se ärendena
                <ArrowRight aria-hidden="true" />
              </Link>
            }
          />
        </div>
        {message && (
          <p role="status" className="mt-4 text-sm">
            {message}
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section aria-labelledby="home-mastery">
          <SectionTitle>
            <span id="home-mastery">Behärskning per modul</span>
          </SectionTitle>
          <Card>
            <CardContent className="flex flex-col gap-4">
              {modulesWithQuestions.map((module) => (
                <div
                  key={module.moduleId}
                  className="grid grid-cols-[2rem_1fr_3rem] items-center gap-3"
                >
                  <span className="text-sm tabular-nums text-muted">{module.ordning}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{module.title}</p>
                    <Progress
                      value={module.mastery}
                      thin
                      label={`Behärskning ${module.title}`}
                      className="mt-1.5"
                    />
                  </div>
                  <span className="text-right text-sm tabular-nums text-muted">
                    {module.seen === 0 ? '–' : `${module.mastery} %`}
                  </span>
                </div>
              ))}
              <p className="text-xs text-muted">
                Behärskning räknas på repetitionsdata, inte bara antal rätt: en fråga räknas fullt
                först när du kan den flera veckor framåt. Övriga moduler fylls på i kommande
                versioner.
              </p>
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="home-recent" className="flex flex-col gap-6">
          <div>
            <SectionTitle>
              <span id="home-streak">Streak</span>
            </SectionTitle>
            <Card aria-labelledby="home-streak">
              <CardContent className="flex items-center gap-4">
                <span
                  className={cn(
                    'inline-flex size-10 items-center justify-center rounded-md',
                    history.streak.days > 0 ? 'bg-plan-yellow-soft text-brick' : 'bg-bg text-muted',
                  )}
                >
                  <Flame className="size-5" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-2xl font-semibold tabular-nums">
                    {history.streak.days} {history.streak.days === 1 ? 'dag' : 'dagar'}
                  </p>
                  <p className="text-sm text-muted">
                    {history.streak.studiedToday
                      ? 'Dagens pass är gjort.'
                      : history.streak.days > 0
                        ? 'Ett pass i dag håller den vid liv.'
                        : 'Ett pass om dagen räcker.'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
          <div>
            <SectionTitle>
              <span id="home-recent">Senaste resultat</span>
            </SectionTitle>
            <Card>
              <CardContent>
                {history.passes.filter((p) => p.result).length === 0 ? (
                  <p className="text-sm text-muted">
                    Inga pass ännu. Ditt första resultat dyker upp här, med rätt och fel per fråga.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {history.passes
                      .filter((p) => p.result)
                      .slice(0, 4)
                      .map(({ session, result }) => (
                        <li key={session.id} className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {result?.title ?? studyModeLabel(session.mode)}
                            </p>
                            <p className="text-xs text-muted">
                              {formatWhen(session.finishedAt ?? session.startedAt, now)}
                            </p>
                          </div>
                          <span className="shrink-0 text-sm font-semibold tabular-nums">
                            {result?.correct}/{result?.total}
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
                <Link
                  to="/results"
                  className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent"
                >
                  Mina resultat
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </>
  );
}
