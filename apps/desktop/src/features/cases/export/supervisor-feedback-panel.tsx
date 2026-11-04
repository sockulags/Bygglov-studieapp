import { MessageSquarePlus } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { SupervisorFeedback } from '@/data';
import { cn } from '@/lib/cn';
import { formatWhen } from '@/lib/format';
import { useAddSupervisorFeedback, useSupervisorFeedback } from './hooks';
import { SUPERVISOR_GRADES, type SupervisorGrade } from './report';

export interface SupervisorFeedbackPanelProps {
  /** Id of the `beslut` row (Decision.id). */
  decisionId: number;
  className?: string;
  /** Called after an assessment has been saved, e.g. to mark the case as reviewed. */
  onAdded?: () => void;
}

const GRADE_TONE: Record<SupervisorGrade, string> = {
  Godkänt: 'border-success/50 bg-success-soft text-success',
  Komplettera: 'border-plan-yellow bg-plan-yellow-soft text-ink',
  'Gör om': 'border-brick/40 bg-brick-soft text-brick',
};

function isGrade(value: string | null): value is SupervisorGrade {
  return value !== null && (SUPERVISOR_GRADES as readonly string[]).includes(value);
}

function GradeBadge({ grade }: { grade: string | null }) {
  if (!grade) return <span className="text-sm text-muted">Inget betyg</span>;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border px-2 py-0.5 text-sm font-medium',
        isGrade(grade) ? GRADE_TONE[grade] : 'border-line-strong text-ink',
      )}
    >
      {grade}
    </span>
  );
}

function FeedbackItem({ feedback }: { feedback: SupervisorFeedback }) {
  return (
    <li className="flex flex-col gap-1.5 border-b border-line py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <GradeBadge grade={feedback.grade} />
        <span className="text-xs text-muted">{formatWhen(feedback.createdAt)}</span>
      </div>
      {feedback.text.trim().length > 0 ? (
        <p className="text-[0.9375rem] whitespace-pre-line">{feedback.text}</p>
      ) : (
        <p className="text-sm text-muted italic">Ingen kommentar.</p>
      )}
    </li>
  );
}

/**
 * Supervisor feedback on one decision: what has been registered and the dialog "Registrera
 * handledarens bedömning" where she writes down what the supervisor said.
 */
export function SupervisorFeedbackPanel({
  decisionId,
  className,
  onAdded,
}: SupervisorFeedbackPanelProps) {
  const feedback = useSupervisorFeedback(decisionId);
  const addFeedback = useAddSupervisorFeedback(decisionId);
  const [open, setOpen] = useState(false);
  const [grade, setGrade] = useState<SupervisorGrade | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const formId = useId();
  const items = feedback.data ?? [];

  const reset = () => {
    setGrade(null);
    setText('');
    setError(null);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (grade === null) {
      setError('Välj ett betyg.');
      return;
    }
    try {
      await addFeedback.mutateAsync({ grade, text: text.trim() });
      setOpen(false);
      reset();
      onAdded?.();
    } catch (cause: unknown) {
      console.error(cause);
      setError('Bedömningen kunde inte sparas. Försök igen.');
    }
  };

  return (
    <section
      aria-labelledby={`${formId}-title`}
      className={cn('rounded-lg border border-line bg-paper p-5 text-ink', className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id={`${formId}-title`} className="font-semibold">
          Handledarens bedömning
        </h3>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            reset();
            setOpen(true);
          }}
        >
          <MessageSquarePlus aria-hidden="true" />
          Registrera handledarens bedömning
        </Button>
      </div>

      {feedback.isLoading ? (
        <p className="mt-3 text-sm text-muted">Läser in …</p>
      ) : feedback.error ? (
        <p className="mt-3 text-sm text-brick">Bedömningarna kunde inte läsas in.</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          Ingen bedömning registrerad än. Exportera beslutet, skicka det till handledaren och skriv
          in vad hen tyckte här.
        </p>
      ) : (
        <ul className="mt-2">
          {[...items].reverse().map((item) => (
            <FeedbackItem key={item.id} feedback={item} />
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={(event) => void onSubmit(event)}>
            <DialogHeader>
              <DialogTitle>Registrera handledarens bedömning</DialogTitle>
              <DialogDescription>
                Skriv in vad handledaren sa om beslutet. Det sparas bara på den här datorn.
              </DialogDescription>
            </DialogHeader>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Betyg</legend>
              <div className="flex flex-wrap gap-2">
                {SUPERVISOR_GRADES.map((option) => (
                  <label
                    key={option}
                    className={cn(
                      'inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-[0.9375rem]',
                      'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                      grade === option
                        ? GRADE_TONE[option]
                        : 'border-line-strong hover:bg-accent-soft',
                    )}
                  >
                    <input
                      type="radio"
                      name={`${formId}-grade`}
                      value={option}
                      checked={grade === option}
                      onChange={() => {
                        setGrade(option);
                        setError(null);
                      }}
                      className="accent-[var(--accent)]"
                    />
                    {option}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="mt-4 flex flex-col gap-2">
              <label htmlFor={`${formId}-text`} className="text-sm font-medium">
                Kommentar
              </label>
              <textarea
                id={`${formId}-text`}
                className="min-h-32 w-full rounded-md border border-line-strong bg-paper px-3 py-2 text-[0.9375rem] text-ink placeholder:text-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                placeholder="Till exempel: Bra motivering av den lilla avvikelsen, men glöm inte att delge Björken 8."
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            </div>

            {error && (
              <p className="mt-3 text-sm text-brick" role="alert">
                {error}
              </p>
            )}

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary">Avbryt</Button>
              </DialogClose>
              <Button type="submit" disabled={addFeedback.isPending}>
                {addFeedback.isPending ? 'Sparar …' : 'Spara bedömningen'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
