import { useId, useState, type FormEvent } from 'react';
import type { CaseFile } from '@bygglov/content-schema';
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
import { addDays, maxExtensionWeeks, type CaseState } from '@/engine';
import { cn } from '@/lib/cn';
import type { ExtensionAvailability } from './case-model';
import { extendCaseDeadline } from './case-store';

const fieldClass =
  'w-full rounded-md border border-line-strong bg-paper px-3 text-[0.9375rem] focus-visible:border-accent';

export interface ExtendDeadlineDialogProps {
  caseFile: CaseFile;
  state: CaseState;
  /** Whether the deadline can be extended now; otherwise the dialog says why. */
  availability: ExtensionAvailability;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Förläng fristen": weeks (1–10) and the reason, which goes to the diary with the
 * references to 9 kap. 99 § andra stycket and 100 § 3 PBL.
 */
export function ExtendDeadlineDialog({
  caseFile,
  state,
  availability,
  open,
  onOpenChange,
}: ExtendDeadlineDialogProps) {
  const id = useId();
  const [weeks, setWeeks] = useState('4');
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);

  const maxWeeks = maxExtensionWeeks(state);
  const parsed = Number(weeks);
  const weeksValid = Number.isInteger(parsed) && parsed >= 1 && parsed <= maxWeeks;
  const reasonValid = reason.trim() !== '';
  const newDeadline =
    weeksValid && state.deadlineDate !== null ? addDays(state.deadlineDate, parsed * 7) : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (!weeksValid || !reasonValid) return;
    if (extendCaseDeadline(caseFile, parsed, reason)) {
      onOpenChange(false);
      setReason('');
      setTried(false);
    }
  };

  if (!availability.allowed) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fristen kan inte förlängas</DialogTitle>
            <DialogDescription>{availability.reason}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button">Stäng</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Förläng tidsfristen</DialogTitle>
            <DialogDescription>
              {state.notification
                ? 'Fyraveckorsfristen för en anmälan får förlängas en gång med högst fyra veckor om det är nödvändigt på grund av handläggningen eller utredningen (9 kap. 99 § andra stycket PBL och 6 kap. 5 § PBF).'
                : 'Tioveckorsfristen får förlängas en gång med högst tio veckor om det är nödvändigt på grund av handläggningen eller utredningen (9 kap. 99 § andra stycket PBL).'}{' '}
              Sökanden ska skriftligen informeras om förlängningen och skälen innan den ursprungliga
              fristen gått ut (100 § 3).
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-weeks`} className="text-sm font-medium">
              Antal veckor (1–{maxWeeks})
            </label>
            <input
              id={`${id}-weeks`}
              type="number"
              min={1}
              max={maxWeeks}
              step={1}
              inputMode="numeric"
              value={weeks}
              onChange={(event) => setWeeks(event.target.value)}
              aria-invalid={tried && !weeksValid ? true : undefined}
              aria-describedby={`${id}-weeks-hint`}
              className={cn(fieldClass, 'h-9 w-28 tabular-nums')}
            />
            <p id={`${id}-weeks-hint`} className="text-sm text-muted">
              {tried && !weeksValid
                ? `Ange ett helt antal veckor mellan 1 och ${maxWeeks}.`
                : newDeadline
                  ? `Ny sista dag för beslut: ${newDeadline}.`
                  : 'Förlängningen räknas från den frist som gäller.'}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-reason`} className="text-sm font-medium">
              Skäl till förlängningen
            </label>
            <textarea
              id={`${id}-reason`}
              rows={4}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-invalid={tried && !reasonValid ? true : undefined}
              aria-describedby={`${id}-reason-hint`}
              className={cn(fieldClass, 'py-2 leading-relaxed')}
            />
            <p
              id={`${id}-reason-hint`}
              className={cn('text-sm', tried && !reasonValid ? 'text-brick' : 'text-muted')}
            >
              {tried && !reasonValid
                ? 'Skriv skälet. Det hamnar i diariet och i beskedet till sökanden.'
                : 'T.ex. att ett remissvar behöver kompletteras. Skälet hamnar i diariet.'}
            </p>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Avbryt
              </Button>
            </DialogClose>
            <Button type="submit">Förläng fristen</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
