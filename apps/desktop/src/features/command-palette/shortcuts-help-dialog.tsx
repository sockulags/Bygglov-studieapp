import { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { KeyCombo } from '@/components/ui/kbd';
import { setShortcutsHelpOpen, usePaletteStore } from './palette-store';
import { shortcutSections } from './shortcuts';

/** "?" anywhere outside the quiz and the case view: every keyboard shortcut in the app. */
export function ShortcutsHelpDialog() {
  const open = usePaletteStore((s) => s.helpOpen);
  const sections = useMemo(() => shortcutSections(), []);
  return (
    <Dialog open={open} onOpenChange={setShortcutsHelpOpen}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Kortkommandon</DialogTitle>
          <DialogDescription>
            Bokstavsgenvägarna fungerar när du inte skriver i ett textfält. Tryck tangenterna i
            följd, till exempel först G och sedan H.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 sm:grid-cols-2">
          {sections.map((section) => (
            <section key={section.title} aria-label={section.title}>
              <h3 className="mb-2 text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                {section.title}
              </h3>
              <dl className="flex flex-col gap-2 text-sm">
                {section.rows.map((row) => (
                  <div
                    key={`${row.keys.join('+')}-${row.description}`}
                    className="grid grid-cols-[minmax(5.5rem,auto)_1fr] items-baseline gap-3"
                  >
                    <dt>
                      <KeyCombo keys={row.keys} mode={row.mode ?? 'together'} size="sm" />
                    </dt>
                    <dd className="m-0">{row.description}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
