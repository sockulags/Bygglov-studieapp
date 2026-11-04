import { UpdateBanner } from '@/components/ui/update-banner';
import { cn } from '@/lib/cn';
import { ReleaseNotes } from './release-notes';
import { useUpdater } from './use-updater';

export interface UpdatePromptProps {
  className?: string;
}

/**
 * "En ny version finns. Uppdatera nu?" banner with release notes and download progress.
 * Mount it once, at the top of the main content area. It runs the background update
 * schedule itself and renders nothing outside Tauri or when there is no update.
 */
export function UpdatePrompt({ className }: UpdatePromptProps) {
  const { status, update, progress, error, dismissed, installNow, later } = useUpdater();

  const onUpdate = () => void installNow();

  if (status === 'downloading' || status === 'installing') {
    return (
      <UpdateBanner
        state="downloading"
        progress={status === 'installing' ? 100 : (progress?.percent ?? 0)}
        note={
          status === 'installing'
            ? 'Installerar … Appen stängs och startar om av sig själv.'
            : progress?.percent === undefined
              ? 'Du kan fortsätta plugga under tiden.'
              : `${progress.percent} % hämtat. Du kan fortsätta plugga under tiden.`
        }
        className={className}
      />
    );
  }

  if (dismissed || !update) return null;

  if (status === 'error' && error?.phase === 'install') {
    return (
      <UpdateBanner state="error" onUpdate={onUpdate} onDismiss={later} className={className} />
    );
  }

  if (status !== 'available') return null;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <UpdateBanner state="available" onUpdate={onUpdate} onDismiss={later} />
      {update.notes && (
        <details className="group rounded-lg border border-line bg-paper px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-ink select-none">
            Vad är nytt i version {update.version}
          </summary>
          <ReleaseNotes markdown={update.notes} className="mt-3" />
        </details>
      )}
    </div>
  );
}
