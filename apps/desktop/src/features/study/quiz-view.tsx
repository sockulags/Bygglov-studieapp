import { ArrowRight, Clock, Keyboard, LogOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { currentItem, remainingMs, type QuizAnswer } from '@/engine';
import { cn } from '@/lib/cn';
import { formatClock } from '@/lib/format';
import { isActivatableTarget, useKeydown } from '@/lib/use-keydown';
import { AnswerInput } from './answer-input';
import { ExplanationPanel } from './explanation-panel';
import { QuestionDrawing } from './question-drawing';
import {
  endStudyRun,
  expireStudyRunIfNeeded,
  goToNextQuestion,
  submitAnswer,
  submitSelfAssessment,
  useStudyStore,
  type StudyRun,
} from './study-store';

const TYPE_HINT: Record<string, string> = {
  flerval: 'Ett rätt svar',
  flersvar: 'Ett eller flera rätta svar',
  sant_falskt: 'Sant eller falskt',
  lucktext: 'Fyll i luckorna',
  para_ihop: 'Para ihop',
  ordning: 'Sätt i rätt ordning',
  berakning: 'Beräkning',
  oppen: 'Öppen fråga',
  ritning: 'Ritning',
};

function Difficulty({ level }: { level: 1 | 2 | 3 }) {
  const label = ['Lätt', 'Medel', 'Svår'][level - 1];
  return (
    <span className="inline-flex items-center gap-1.5" title={`Svårighet: ${label}`}>
      <span className="sr-only">Svårighet: {label}</span>
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          aria-hidden="true"
          className={cn('size-1.5 rounded-full', n <= level ? 'bg-accent' : 'bg-line-strong')}
        />
      ))}
    </span>
  );
}

function ExamTimer({ run }: { run: StudyRun }) {
  const [now, setNow] = useState(() => new Date(run.session.startedAt));
  useEffect(() => {
    const tick = () => {
      const current = new Date();
      setNow(current);
      expireStudyRunIfNeeded(current);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [run.key]);
  const left = remainingMs(run.session, now);
  if (left === null) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-medium tabular-nums',
        left < 60_000 ? 'border-brick/50 bg-brick-soft text-brick' : 'border-line bg-paper',
      )}
      aria-label={`Tid kvar ${formatClock(left)}`}
    >
      <Clock className="size-4" aria-hidden="true" />
      {formatClock(left)}
    </span>
  );
}

function EndDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Avsluta passet?</DialogTitle>
          <DialogDescription>
            Frågor du inte svarat på räknas som överhoppade. Dina svar hittills är sparade.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Fortsätt plugga</Button>
          </DialogClose>
          <Button
            onClick={() => {
              onOpenChange(false);
              endStudyRun();
            }}
          >
            Avsluta och visa resultat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One question at a time: progress on top, the question in the middle, explanation below. */
export function QuizView({ run }: { run: StudyRun }) {
  const { session } = run;
  const item = currentItem(session);
  const saveError = useStudyStore((s) => s.saveError);
  const [endOpen, setEndOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const shownAt = useRef(0);
  const nextButton = useRef<HTMLButtonElement>(null);
  const explanation = useRef<HTMLDivElement>(null);

  const reveal = session.feedback === 'immediate';
  const answered = item?.response != null;
  const pendingSelfGrade = item?.response?.result.kind === 'self_graded';
  const canContinue = answered && !pendingSelfGrade;

  // Start the response timer when a question is shown.
  useEffect(() => {
    shownAt.current = performance.now();
  }, [session.index, run.key]);

  // After answering, bring the explanation into view and focus "Nästa".
  useEffect(() => {
    if (!canContinue || !reveal) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    explanation.current?.scrollIntoView?.({
      block: 'nearest',
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
    nextButton.current?.focus({ preventScroll: true });
  }, [canContinue, reveal, session.index]);

  useKeydown((event) => {
    if (event.key === '?') {
      event.preventDefault();
      setShowHelp((v) => !v);
    } else if (event.key === 'Enter' && canContinue && !isActivatableTarget(event.target)) {
      event.preventDefault();
      goToNextQuestion();
    }
  }, !endOpen);

  if (!item) return null;
  const { question } = item;
  const position = session.index + 1;
  const total = session.items.length;
  const onSubmit = (answer: QuizAnswer) => {
    const elapsed = performance.now() - shownAt.current;
    submitAnswer(answer, elapsed > 0 ? elapsed : null);
    // In Tentaläge there is no feedback; move straight on.
    if (!reveal && question.typ !== 'oppen') goToNextQuestion();
  };
  const isLast = position === total;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xs font-semibold tracking-[0.08em] text-muted uppercase">
              {run.title}
            </h1>
            <p className="text-sm text-muted tabular-nums" aria-live="polite">
              Fråga {position} av {total}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {session.timeLimitMs !== null && <ExamTimer run={run} />}
            <Button variant="ghost" size="sm" onClick={() => setEndOpen(true)}>
              <LogOut aria-hidden="true" />
              Avsluta
            </Button>
          </div>
        </div>
        <Progress
          value={((session.index + (canContinue ? 1 : 0)) / total) * 100}
          label={`Fråga ${position} av ${total}`}
        />
      </header>

      <Card className="p-6 sm:p-8">
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-muted">
          <span>{TYPE_HINT[question.typ]}</span>
          <span aria-hidden="true">·</span>
          <Difficulty level={question.svarighet} />
        </div>
        {question.typ !== 'lucktext' && (
          <h2 className="mb-6 text-xl leading-snug font-semibold whitespace-pre-line sm:text-[1.375rem]">
            {question.fraga}
          </h2>
        )}
        {question.typ === 'ritning' && (
          <QuestionDrawing question={question} moduleId={item.moduleId} className="mb-6" />
        )}
        <AnswerInput
          key={`${run.key}-${session.index}`}
          item={item}
          revealFeedback={reveal}
          onSubmit={onSubmit}
          onSelfAssess={(checked) => {
            submitSelfAssessment(checked);
            if (!reveal) goToNextQuestion();
          }}
        />
      </Card>

      {reveal && item.response && (
        <div ref={explanation}>
          <ExplanationPanel
            question={question}
            result={item.response.result}
            answer={item.response.answer}
          />
        </div>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-4">
        <p className="inline-flex items-center gap-2 text-sm text-muted">
          <Keyboard className="size-4" aria-hidden="true" />
          {showHelp
            ? `Siffertangenterna 1–9 väljer svar, S och F svarar sant eller falskt, Enter går vidare${
                question.typ === 'ritning' ? ', M mäter på ritningen' : ''
              }, ? döljer hjälpen.`
            : 'Tryck ? för tangentbordet.'}
        </p>
        {canContinue && reveal && (
          <Button ref={nextButton} size="lg" onClick={goToNextQuestion}>
            {isLast ? 'Visa resultat' : 'Nästa fråga'}
            <ArrowRight aria-hidden="true" />
          </Button>
        )}
      </footer>

      {saveError && (
        <p role="status" className="text-sm text-brick">
          {saveError}
        </p>
      )}

      <EndDialog open={endOpen} onOpenChange={setEndOpen} />
    </div>
  );
}
