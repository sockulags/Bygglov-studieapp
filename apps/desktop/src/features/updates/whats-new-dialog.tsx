import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ReleaseNotes } from './release-notes';
import { useWhatsNew } from './whats-new';

/**
 * "Vad är nytt" dialog, shown once after the app has been updated. Mount it once,
 * anywhere inside the providers (it portals itself).
 */
export function WhatsNewDialog() {
  const { open, whatsNew, close } = useWhatsNew();
  if (!whatsNew) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-md bg-accent-soft text-accent">
            <Sparkles className="size-5" aria-hidden="true" />
          </div>
          <DialogTitle>Vad är nytt</DialogTitle>
          <DialogDescription>
            Appen är uppdaterad till version {whatsNew.version}.
            {whatsNew.sections.length === 0 && ' Den här gången finns inga noteringar att visa.'}
          </DialogDescription>
        </DialogHeader>
        {whatsNew.sections.length > 0 && (
          <div className="flex max-h-[55vh] flex-col gap-5 overflow-y-auto pr-1">
            {whatsNew.sections.map((section) => (
              <section key={section.version} aria-label={`Version ${section.version}`}>
                {whatsNew.sections.length > 1 && (
                  <h3 className="mb-2 font-semibold">Version {section.version}</h3>
                )}
                <ReleaseNotes markdown={section.body} />
              </section>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button onClick={close}>Fortsätt plugga</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
