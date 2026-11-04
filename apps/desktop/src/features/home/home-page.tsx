import { Link } from '@tanstack/react-router';
import { ArrowRight, FilePlus2, Flame, PlayCircle, RotateCcw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PageHeader, SectionTitle } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { modules } from '@/features/study/modules';

function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) return 'God natt';
  if (hour < 10) return 'God morgon';
  if (hour < 18) return 'Hej';
  return 'God kväll';
}

interface ActionCard {
  to: '/study' | '/cases';
  icon: LucideIcon;
  title: string;
  body: string;
  cta: string;
  tone: 'accent' | 'yellow' | 'brick';
}

const actions: ActionCard[] = [
  {
    to: '/study',
    icon: PlayCircle,
    title: 'Fortsätt där du var',
    body: 'Inget påbörjat pass ännu. Börja med modul 3, Lovplikt, det är grunden för allt annat.',
    cta: 'Börja plugga',
    tone: 'accent',
  },
  {
    to: '/study',
    icon: RotateCcw,
    title: 'Repetition',
    body: 'Repetitionen fylls på när du svarat på frågor. Då får du dem igen precis innan du glömmer.',
    cta: 'Öppna repetition',
    tone: 'yellow',
  },
  {
    to: '/cases',
    icon: FilePlus2,
    title: 'Nytt ärende',
    body: 'Ta emot en ansökan, granska handlingarna och skriv ett beslut, som på kontoret.',
    cta: 'Välj ärende',
    tone: 'brick',
  },
];

const toneClass: Record<ActionCard['tone'], string> = {
  accent: 'bg-accent-soft text-accent',
  yellow: 'bg-plan-yellow-soft text-ink',
  brick: 'bg-brick-soft text-brick',
};

/** Modules shown in the overview; phase 1 targets modules 1–6 (docs/07). */
const overviewModules = modules.slice(0, 6);

export function HomePage() {
  return (
    <>
      <PageHeader
        eyebrow={new Intl.DateTimeFormat('sv-SE', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        }).format(new Date())}
        title={`${greeting()}.`}
        description="Dagens förslag: börja med ett snabbquiz i Lovplikt. Tio frågor, med förklaring och lagrum efter varje svar."
      />

      <section aria-labelledby="home-actions" className="mb-10">
        <h2 id="home-actions" className="sr-only">
          Nästa steg
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.title} to={action.to} className="group rounded-lg outline-none">
                <Card interactive className="h-full">
                  <CardContent className="flex h-full flex-col gap-4">
                    <span
                      className={`inline-flex size-10 items-center justify-center rounded-md ${toneClass[action.tone]}`}
                    >
                      <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold">{action.title}</h3>
                      <p className="mt-1 text-sm text-muted">{action.body}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-accent">
                      {action.cta}
                      <ArrowRight
                        className="size-4 transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section aria-labelledby="home-mastery">
          <SectionTitle>
            <span id="home-mastery">Behärskning per modul</span>
          </SectionTitle>
          <Card>
            <CardContent className="flex flex-col gap-4">
              {overviewModules.map((module) => (
                <div key={module.id} className="grid grid-cols-[2rem_1fr_3rem] items-center gap-3">
                  <span className="text-sm tabular-nums text-muted">{module.number}</span>
                  <div>
                    <p className="text-sm font-medium">{module.title}</p>
                    <Progress
                      value={0}
                      thin
                      label={`Behärskning ${module.title}`}
                      className="mt-1.5"
                    />
                  </div>
                  <span className="text-right text-sm tabular-nums text-muted">–</span>
                </div>
              ))}
              <p className="text-xs text-muted">
                Staplarna fylls i allt eftersom du svarar. Behärskning räknas på repetitionsdata,
                inte bara antal rätt.
              </p>
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="home-recent" className="flex flex-col gap-6">
          <div>
            <SectionTitle>
              <span id="home-streak">Streak</span>
            </SectionTitle>
            <Card>
              <CardContent className="flex items-center gap-4">
                <span className="inline-flex size-10 items-center justify-center rounded-md bg-plan-yellow-soft text-ink">
                  <Flame className="size-5" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-2xl font-semibold tabular-nums">0 dagar</p>
                  <p className="text-sm text-muted">Ett pass om dagen räcker.</p>
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
                <p className="text-sm text-muted">
                  Inga pass ännu. Ditt första resultat dyker upp här, med rätt och fel per fråga.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </>
  );
}
