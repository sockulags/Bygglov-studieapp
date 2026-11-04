import { useQueryClient } from '@tanstack/react-query';
import { ClipboardCopy, FileCode, FileDown, Send } from 'lucide-react';
import { useId, useState } from 'react';
import { Button, type ButtonSize, type ButtonVariant } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getCase, loadContent } from '@/content';
import { dataKeys, getDataStore } from '@/data';
import { formatWhen } from '@/lib/format';
import { isTauri } from '@/lib/tauri';
import { flushCaseWrites, setCaseReflection, useCaseStore } from '../case-store';
import { copyText, printHtml, saveHtmlFile } from './export-actions';
import { exportKeys, useDecisionRow } from './hooks';
import { loadDecisionReport, ReportLoadError, ReportNotesSchema, reportNotesKey } from './load';
import { reportFileBaseName } from './report';
import { renderDecisionReportHtml } from './report-html';
import { renderDecisionReportMarkdown } from './report-markdown';

export type ExportMethod = 'pdf' | 'html' | 'text';

export interface ExportDecisionButtonProps {
  caseId: string;
  /** Id of the `beslut` row (Decision.id). */
  decisionId: number;
  /** Button text; default "Exportera till handledare". */
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  /** Called after a successful export, when the decision has been marked as exported. */
  onExported?: (method: ExportMethod) => void;
}

type Status = { tone: 'ok' | 'error'; text: string } | null;

const SUCCESS: Record<ExportMethod, string> = {
  pdf: 'Utskriften är klar. Välj "Spara som PDF" eller "Microsoft Print to PDF" som skrivare om du vill ha en PDF.',
  html: 'Rapporten är sparad som HTML-fil. Den går att öppna i vilken webbläsare som helst.',
  text: 'Rapporten är kopierad. Klistra in den i ett sms eller mejl.',
};

/**
 * "Exportera till handledare": builds the decision report from the stored case and decision
 * and exports it as PDF (via the print dialog), as an HTML file or as text on the clipboard.
 * Everything is loaded from the ids; the decision is marked exported afterwards.
 */
export function ExportDecisionButton({
  caseId,
  decisionId,
  label = 'Exportera till handledare',
  variant = 'secondary',
  size = 'md',
  className,
  onExported,
}: ExportDecisionButtonProps) {
  const queryClient = useQueryClient();
  const decision = useDecisionRow(decisionId);
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [busy, setBusy] = useState<ExportMethod | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const notesId = useId();

  const openDialog = () => {
    setStatus(null);
    setNotesLoaded(false);
    setOpen(true);
    void (async () => {
      try {
        const store = await getDataStore();
        const active = useCaseStore.getState().active;
        const reflection =
          active?.caseId === caseId
            ? active.reflection
            : ((await store.cases.getCaseStatus(caseId))?.reflection ?? '');
        if (reflection.trim().length > 0) {
          setNotes(reflection);
        } else {
          // Earlier versions kept the text per decision in settings.
          const parsed = ReportNotesSchema.safeParse(
            await store.settings.get(reportNotesKey(decisionId)),
          );
          setNotes(parsed.success ? parsed.data : '');
        }
      } catch (error: unknown) {
        console.error(error);
      } finally {
        setNotesLoaded(true);
      }
    })();
  };

  // The text is her reflection on the case, the same as "Egna reflektioner" in the
  // comparison view, so it is saved on the case.
  const saveNotes = async (value: string) => {
    const caseFile = getCase(loadContent(), caseId);
    if (caseFile && useCaseStore.getState().active?.caseId === caseId) {
      setCaseReflection(caseFile, value);
      await flushCaseWrites();
    } else {
      const store = await getDataStore();
      if (await store.cases.getCaseStatus(caseId)) {
        await store.cases.updateCaseStatus(caseId, { reflection: value });
      }
    }
  };

  const run = async (method: ExportMethod) => {
    setBusy(method);
    setStatus(null);
    try {
      await saveNotes(notes);
      const store = await getDataStore();
      const { report } = await loadDecisionReport(store, loadContent(), caseId, decisionId, {
        notes,
      });
      let done = true;
      if (method === 'pdf') {
        await printHtml(renderDecisionReportHtml(report));
      } else if (method === 'html') {
        done = await saveHtmlFile(
          `${reportFileBaseName(report)}.html`,
          renderDecisionReportHtml(report),
        );
      } else {
        await copyText(renderDecisionReportMarkdown(report));
      }
      if (!done) return;
      await store.cases.markDecisionExported(decisionId);
      await queryClient.invalidateQueries({ queryKey: exportKeys.decision(decisionId) });
      await queryClient.invalidateQueries({ queryKey: dataKeys.all });
      setStatus({ tone: 'ok', text: SUCCESS[method] });
      onExported?.(method);
    } catch (error: unknown) {
      console.error(error);
      setStatus({
        tone: 'error',
        text:
          error instanceof ReportLoadError
            ? error.message
            : 'Exporten misslyckades. Försök igen eller välj ett annat sätt.',
      });
    } finally {
      setBusy(null);
    }
  };

  const exportedAt = decision.data?.exportedAt ?? null;

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={openDialog}>
        <Send aria-hidden="true" />
        {label}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next && notesLoaded) {
            void saveNotes(notes).catch((error: unknown) => console.error(error));
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Beslutsrapport till handledaren</DialogTitle>
            <DialogDescription>
              Rapporten innehåller ditt beslut, datumlinjen, appens kontroller, hur du bockade
              bedömningspunkterna och en ruta för handledarens bedömning. Modellbeslutet ligger sist
              som bilaga.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <label htmlFor={notesId} className="text-sm font-medium">
              Egna reflektioner (valfritt)
            </label>
            <textarea
              id={notesId}
              className="min-h-28 w-full rounded-md border border-line-strong bg-paper px-3 py-2 text-[0.9375rem] text-ink placeholder:text-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              placeholder="Vad var svårt? Vad vill du att handledaren tittar extra på?"
              value={notes}
              disabled={!notesLoaded}
              onChange={(event) => setNotes(event.target.value)}
              onBlur={() => void saveNotes(notes).catch((error: unknown) => console.error(error))}
            />
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            <Button disabled={busy !== null || !notesLoaded} onClick={() => void run('pdf')}>
              <FileDown aria-hidden="true" />
              {busy === 'pdf' ? 'Öppnar …' : 'Spara som PDF'}
            </Button>
            <Button
              variant="secondary"
              disabled={busy !== null || !notesLoaded}
              onClick={() => void run('html')}
            >
              <FileCode aria-hidden="true" />
              {busy === 'html' ? 'Sparar …' : 'Spara som HTML-fil'}
            </Button>
            <Button
              variant="secondary"
              disabled={busy !== null || !notesLoaded}
              onClick={() => void run('text')}
            >
              <ClipboardCopy aria-hidden="true" />
              {busy === 'text' ? 'Kopierar …' : 'Kopiera som text'}
            </Button>
          </div>

          <div className="mt-4 min-h-5 text-sm" aria-live="polite">
            {status ? (
              <p className={status.tone === 'error' ? 'text-brick' : 'text-success'}>
                {status.text}
              </p>
            ) : (
              <p className="text-muted">
                {exportedAt
                  ? `Senast exporterad ${formatWhen(exportedAt)}.`
                  : 'Beslutet har inte exporterats än.'}
                {isTauri()
                  ? ''
                  : ' I webbläsaren laddas HTML-filen ner till mappen för hämtade filer.'}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
