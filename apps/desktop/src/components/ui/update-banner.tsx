import { Download, RefreshCw, X } from 'lucide-react';
import { Button } from './button';
import { Progress } from './progress';
import { cn } from '@/lib/cn';

export type UpdateBannerState = 'available' | 'downloading' | 'ready' | 'error';

export interface UpdateBannerProps {
  state: UpdateBannerState;
  /** Download progress 0–100, used when `state` is `downloading`. */
  progress?: number;
  /** Optional short release note shown under the headline. */
  note?: string;
  onUpdate?: () => void;
  onRestart?: () => void;
  onDismiss?: () => void;
  className?: string;
}

const copy: Record<UpdateBannerState, { title: string; body: string }> = {
  available: {
    title: 'En ny version finns.',
    body: 'Uppdatera nu? Det tar någon minut och appen startar om själv.',
  },
  downloading: {
    title: 'Hämtar uppdateringen …',
    body: 'Du kan fortsätta plugga under tiden.',
  },
  ready: {
    title: 'Uppdateringen är klar.',
    body: 'Starta om appen för att börja använda den nya versionen.',
  },
  error: {
    title: 'Uppdateringen gick inte att hämta.',
    body: 'Kontrollera nätverket och försök igen senare.',
  },
};

/**
 * Presentational banner for the auto-updater. The updater logic (plugin-updater,
 * plugin-process) lives in the release track and drives this via props.
 */
export function UpdateBanner({
  state,
  progress = 0,
  note,
  onUpdate,
  onRestart,
  onDismiss,
  className,
}: UpdateBannerProps) {
  const { title, body } = copy[state];
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-start gap-4 rounded-lg border border-accent/30 bg-accent-soft p-4 text-ink',
        'animate-[slide-down_var(--duration-base)_var(--ease-out)]',
        state === 'error' && 'border-brick/30 bg-brick-soft',
        className,
      )}
    >
      <div
        className={cn(
          'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-paper text-accent',
          state === 'error' && 'text-brick',
        )}
      >
        {state === 'downloading' ? (
          <RefreshCw className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="size-4" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted">{note ?? body}</p>
        {state === 'downloading' && (
          <Progress value={progress} className="mt-3 max-w-sm" label="Hämtar uppdatering" />
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {state === 'available' && (
            <Button size="sm" onClick={onUpdate}>
              Uppdatera nu
            </Button>
          )}
          {state === 'ready' && (
            <Button size="sm" onClick={onRestart}>
              Starta om
            </Button>
          )}
          {state === 'error' && (
            <Button size="sm" variant="secondary" onClick={onUpdate}>
              Försök igen
            </Button>
          )}
          {onDismiss && state !== 'downloading' && (
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              Senare
            </Button>
          )}
        </div>
      </div>
      {onDismiss && state !== 'downloading' && (
        <button
          type="button"
          onClick={onDismiss}
          className="-m-1 rounded-sm p-1 text-muted hover:text-ink"
          aria-label="Stäng"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
