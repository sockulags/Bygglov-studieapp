import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const SHORTCUTS: [string, string][] = [
  ['1–9', 'Välj alternativ, markera en post i checklistan eller välj beslut'],
  ['Enter', 'Lämna in steget, eller gå till nästa steg efter återkopplingen'],
  ['Ctrl + Enter', 'Lämna in en text (skrivelse, öppen fråga)'],
  ['Esc', 'Stäng den öppna handlingen eller helskärmsvyn'],
  ['Piltangenter, + och −', 'Flytta och zooma i en ritning (när ritningen har fokus), 0 anpassar'],
  [
    'M',
    'Mät i ritningen: klicka två punkter för ett avstånd. Esc avbryter mätningen, sedan rensas måtten',
  ],
  ['?', 'Visa eller dölj den här hjälpen'],
];

/** "?" in the case view: the keyboard shortcuts. */
export function KeyboardHelp({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tangentbordet i ärendet</DialogTitle>
          <DialogDescription>
            Genvägarna fungerar när du inte skriver i ett textfält. Tab flyttar mellan diariet,
            handlingen och arbetsytan.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {SHORTCUTS.map(([keys, what]) => (
            <div key={keys} className="contents">
              <dt>
                <kbd className="rounded-sm border border-line-strong bg-bg px-1.5 py-0.5 font-sans text-xs font-semibold">
                  {keys}
                </kbd>
              </dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
