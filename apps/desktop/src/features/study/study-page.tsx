import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { ArrowRight, PlayCircle, Shuffle, Timer, X } from 'lucide-react';
import { PageHeader, SectionTitle } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent } from '@/components/ui/card';
import { MasteryRing } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useStudyOverview } from '@/features/progress/hooks';
import type { ModuleProgress } from '@/features/progress/progress';
import { cn } from '@/lib/cn';
import { pluralQuestions } from '@/lib/format';
import {
  EXAM_MINUTES,
  EXAM_QUESTION_COUNT,
  MODES,
  isPracticeMode,
  type PracticeMode,
} from './modes';
import { clearStudyRun, useStudyStore, type StartRequest } from './study-store';
import { useStartRun } from './use-start-run';

/** What a module card says and does in each mode. */
function cardInfo(
  mode: PracticeMode,
  module: ModuleProgress,
): { detail: string; enabled: boolean } {
  if (module.questionCount === 0) return { detail: 'Inga frågor ännu', enabled: false };
  switch (mode) {
    case 'quick-quiz':
      return { detail: `${pluralQuestions(module.questionCount)} · 10 per pass`, enabled: true };
    case 'module-review':
      return {
        detail: `${pluralQuestions(module.questionCount)} i pedagogisk ordning`,
        enabled: true,
      };
    case 'review':
      return module.due > 0
        ? { detail: `${pluralQuestions(module.due)} väntar på repetition`, enabled: true }
        : {
            detail: module.seen > 0 ? 'Inget att repetera just nu' : 'Svara på frågor först',
            enabled: false,
          };
    case 'study':
      return module.openCount > 0
        ? { detail: `${module.openCount} öppna instuderingsfrågor`, enabled: true }
        : { detail: 'Inga öppna frågor ännu', enabled: false };
    case 'exam':
      return {
        detail: `${Math.min(EXAM_QUESTION_COUNT, module.questionCount)} frågor · ${EXAM_MINUTES} min`,
        enabled: true,
      };
  }
}

function requestFor(mode: PracticeMode, moduleId: string): StartRequest {
  switch (mode) {
    case 'quick-quiz':
      return { mode, moduleIds: [moduleId] };
    case 'module-review':
      return { mode, moduleId };
    case 'review':
      return { mode, moduleIds: [moduleId] };
    case 'study':
      return { mode, moduleId };
    case 'exam':
      return { mode, moduleIds: [moduleId] };
  }
}

function ResumeBanner() {
  const run = useStudyStore((s) => s.run);
  if (!run || run.session.status === 'finished') return null;
  const answered = run.session.items.filter((i) => i.response !== null).length;
  return (
    <Card className="mb-8 border-accent/40 bg-accent-soft/50">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="font-semibold">Du har ett pass på gång</p>
          <p className="text-sm text-muted">
            {run.title} · {answered} av {run.session.items.length} besvarade
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={clearStudyRun}>
            <X aria-hidden="true" />
            Släpp passet
          </Button>
          <Link to="/study/session" className={buttonVariants()}>
            Fortsätt
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function ModeAction({
  mode,
  due,
  onStart,
  pending,
}: {
  mode: PracticeMode;
  due: number;
  onStart: (request: StartRequest) => void;
  pending: boolean;
}) {
  if (mode === 'quick-quiz') {
    return (
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => onStart({ mode, moduleIds: [] })}
      >
        <Shuffle aria-hidden="true" />
        Blanda alla moduler
      </Button>
    );
  }
  if (mode === 'review') {
    return (
      <Button disabled={pending || due === 0} onClick={() => onStart({ mode, moduleIds: [] })}>
        <PlayCircle aria-hidden="true" />
        {due > 0 ? `Repetera allt (${due})` : 'Inget att repetera just nu'}
      </Button>
    );
  }
  if (mode === 'exam') {
    return (
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => onStart({ mode, moduleIds: [] })}
      >
        <Timer aria-hidden="true" />
        Tenta på alla moduler
      </Button>
    );
  }
  return null;
}

export function StudyPage() {
  const { mode: searchMode } = useSearch({ from: '/study' });
  const mode: PracticeMode = isPracticeMode(searchMode) ? searchMode : 'quick-quiz';
  const navigate = useNavigate({ from: '/study' });
  const { overview, isLoading } = useStudyOverview();
  const { start, pending, message } = useStartRun();
  const modules = overview.modules.filter((m) => m.questionCount > 0);
  const upcoming = overview.modules.filter((m) => m.questionCount === 0);

  return (
    <>
      <PageHeader
        title="Plugga"
        description="Välj läge och modul. Efter varje svar får du en kort förklaring och lagrummet; det är förklaringen som är belöningen."
      />

      <ResumeBanner />

      <section aria-labelledby="study-mode" className="mb-10">
        <SectionTitle>
          <span id="study-mode">Läge</span>
        </SectionTitle>
        <Tabs
          value={mode}
          onValueChange={(value) => {
            if (isPracticeMode(value)) void navigate({ search: { mode: value }, replace: true });
          }}
        >
          <TabsList aria-label="Studieläge" className="flex-wrap">
            {MODES.map((m) => (
              <TabsTrigger key={m.id} value={m.id}>
                {m.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {MODES.map((m) => (
            <TabsContent key={m.id} value={m.id}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="max-w-2xl text-[0.9375rem] text-muted">{m.description}</p>
                <ModeAction
                  mode={m.id}
                  due={overview.due}
                  onStart={(r) => void start(r)}
                  pending={pending}
                />
              </div>
            </TabsContent>
          ))}
        </Tabs>
        {message && (
          <p
            role="status"
            className="mt-4 rounded-md border border-line bg-paper px-4 py-3 text-sm"
          >
            {message}
          </p>
        )}
      </section>

      <section aria-labelledby="study-modules" aria-busy={isLoading}>
        <SectionTitle>
          <span id="study-modules">Moduler</span>
        </SectionTitle>
        <ul className="grid gap-4 md:grid-cols-2">
          {modules.map((module) => {
            const info = cardInfo(mode, module);
            return (
              <li key={module.moduleId}>
                <button
                  type="button"
                  disabled={!info.enabled || pending}
                  onClick={() => void start(requestFor(mode, module.moduleId))}
                  className={cn(
                    'group flex h-full w-full items-start gap-4 rounded-lg border border-line bg-paper p-5 text-left',
                    'transition-colors duration-[var(--duration-fast)]',
                    'enabled:hover:border-accent/50 enabled:hover:bg-accent-soft/40',
                    'disabled:cursor-default',
                  )}
                >
                  <MasteryRing
                    value={module.mastery}
                    size={52}
                    label={`Behärskning ${module.title}: ${module.mastery} %`}
                    className={cn(!info.enabled && 'opacity-60')}
                  >
                    <span className={cn(module.seen === 0 && 'text-muted')}>
                      {module.seen === 0 ? module.ordning : `${module.mastery}%`}
                    </span>
                  </MasteryRing>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block text-[0.9375rem] leading-snug font-semibold',
                        !info.enabled && 'text-muted',
                      )}
                    >
                      {module.ordning}. {module.title}
                    </span>
                    <span className="mt-1 line-clamp-2 text-sm text-muted">
                      {module.description}
                    </span>
                    <span
                      className={cn(
                        'mt-2 inline-flex items-center gap-1 text-sm',
                        info.enabled ? 'text-accent' : 'text-muted',
                      )}
                    >
                      {info.detail}
                      {info.enabled && (
                        <ArrowRight
                          className="size-3.5 transition-transform group-hover:translate-x-0.5"
                          aria-hidden="true"
                        />
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {upcoming.length > 0 && (
        <section aria-labelledby="study-upcoming" className="mt-10">
          <SectionTitle>
            <span id="study-upcoming">Kommer i senare versioner</span>
          </SectionTitle>
          <ul className="flex flex-wrap gap-2">
            {upcoming.map((module) => (
              <li
                key={module.moduleId}
                className="rounded-md border border-dashed border-line-strong px-3 py-1.5 text-sm text-muted"
              >
                {module.ordning}. {module.title}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
