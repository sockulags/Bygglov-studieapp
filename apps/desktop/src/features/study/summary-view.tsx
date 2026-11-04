import { useNavigate } from '@tanstack/react-router';
import {
  ChevronDown,
  CircleCheck,
  CircleDashed,
  CircleMinus,
  CircleX,
  NotebookPen,
  RotateCcw,
  Repeat,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MasteryRing } from '@/components/ui/progress';
import { Stamp } from '@/components/ui/stamp';
import { loadContent } from '@/content';
import { EmptySessionError, summary, type QuestionSummaryOutcome } from '@/engine';
import { cn } from '@/lib/cn';
import { formatDuration, pluralQuestions } from '@/lib/format';
import { AnswerRecap } from './answer-recap';
import { ExplanationPanel } from './explanation-panel';
import { clearStudyRun, startStudyRun, type StudyRun } from './study-store';

const outcomeView: Record<
  QuestionSummaryOutcome,
  { icon: typeof CircleCheck; label: string; tone: string }
> = {
  correct: { icon: CircleCheck, label: 'Rätt', tone: 'text-success' },
  partial: { icon: CircleDashed, label: 'Delvis rätt', tone: 'text-ink' },
  incorrect: { icon: CircleX, label: 'Fel', tone: 'text-brick' },
  skipped: { icon: CircleMinus, label: 'Överhoppad', tone: 'text-muted' },
  pending_self_grade: { icon: NotebookPen, label: 'Ej bedömd', tone: 'text-muted' },
};

function verdict(percent: number): string {
  if (percent >= 90) return 'Mycket bra. Det här sitter.';
  if (percent >= 70) return 'Bra jobbat. Läs förklaringarna på det som blev fel.';
  if (percent >= 40) return 'På god väg. Öva på felen så sätter det sig.';
  return 'Det här behöver mer tid. Läs förklaringarna och kör felen igen.';
}

/** End of a pass: score, right/wrong per question with explanations and "Öva på felen". */
export function SummaryView({ run }: { run: StudyRun }) {
  const navigate = useNavigate();
  const result = summary(run.session);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const start = async (request: Parameters<typeof startStudyRun>[0]) => {
    setBusy(true);
    setError(null);
    try {
      await startStudyRun(request);
      window.scrollTo({ top: 0 });
    } catch (e: unknown) {
      setError(
        e instanceof EmptySessionError ? e.message : 'Det gick inte att starta ett nytt pass.',
      );
    } finally {
      setBusy(false);
    }
  };

  const practiceIds = result.practiceIds;
  const moduleIds = [...new Set(run.session.items.map((i) => i.moduleId))];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <Card>
        <CardContent className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          <MasteryRing
            value={result.percent}
            size={96}
            strokeWidth={8}
            label={`Resultat ${result.percent} %`}
          >
            <span className="text-xl">{result.percent}%</span>
          </MasteryRing>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
              {run.title}
            </p>
            <h1 className="mt-1 text-2xl">
              {result.correct} av {result.total} rätt
            </h1>
            <p className="mt-1 text-muted">{verdict(result.percent)}</p>
            <p className="mt-2 text-sm text-muted">
              {[
                result.partial > 0 ? `${result.partial} delvis rätt` : null,
                result.skipped > 0 ? `${result.skipped} överhoppade` : null,
                result.durationMs !== null ? `tid ${formatDuration(result.durationMs)}` : null,
                result.timeExpired ? 'tiden tog slut' : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          {result.percent >= 90 && (
            <Stamp size="sm" tone="success" className="shrink-0">
              Godkänt
            </Stamp>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        {practiceIds.length > 0 && (
          <Button
            size="lg"
            disabled={busy}
            onClick={() => void start({ mode: 'practice', questionIds: practiceIds, moduleIds })}
          >
            <Repeat aria-hidden="true" />
            Öva på felen ({practiceIds.length})
          </Button>
        )}
        <Button
          size="lg"
          variant={practiceIds.length > 0 ? 'secondary' : 'primary'}
          disabled={busy}
          onClick={() => void start(run.request)}
        >
          <RotateCcw aria-hidden="true" />
          Nytt pass
        </Button>
        <Button
          size="lg"
          variant="ghost"
          onClick={() => {
            clearStudyRun();
            void navigate({ to: '/study' });
          }}
        >
          Tillbaka till Plugga
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-brick">
          {error}
        </p>
      )}

      <section aria-labelledby="summary-questions">
        <h2
          id="summary-questions"
          className="mb-3 text-sm font-semibold tracking-[0.06em] text-muted uppercase"
        >
          Fråga för fråga
        </h2>
        <ol className="flex flex-col gap-2">
          {run.session.items.map((item, index) => {
            const q = result.perQuestion[index];
            if (!q) return null;
            const view = outcomeView[q.outcome];
            const Icon = view.icon;
            const open = openIndex === index;
            const moduleTitle =
              loadContent().modules.find((m) => m.id === item.moduleId)?.titel ?? item.moduleId;
            return (
              <li key={item.question.id} className="rounded-lg border border-line bg-paper">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenIndex(open ? null : index)}
                  className="flex w-full items-start gap-3 rounded-lg px-4 py-3 text-left hover:bg-accent-soft/40"
                >
                  <Icon className={cn('mt-0.5 size-5 shrink-0', view.tone)} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 font-medium">{item.question.fraga}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {view.label}
                      {q.outcome === 'partial' ? ` (${Math.round(q.score * 100)} %)` : ''} ·{' '}
                      {moduleTitle}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      'mt-1 size-4 shrink-0 text-muted transition-transform',
                      open && 'rotate-180',
                    )}
                    aria-hidden="true"
                  />
                </button>
                {open && (
                  <div className="border-t border-line px-4 py-4">
                    {item.response ? (
                      <>
                        <AnswerRecap item={item} />
                        <ExplanationPanel
                          question={item.question}
                          result={item.response.result}
                          className="border-l-4"
                        />
                      </>
                    ) : (
                      <p className="text-sm text-muted">
                        Du hoppade över frågan. Den kommer med när du övar på felen.
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-sm text-muted">
          {pluralQuestions(result.total)} i passet. Alla svar är sparade och styr när frågorna
          kommer tillbaka i repetitionen.
        </p>
      </section>
    </div>
  );
}
