import { ExternalLink, FileQuestion, FileText, X } from 'lucide-react';
import type { CaseDocument, CaseFile } from '@bygglov/content-schema';
import { Button } from '@/components/ui/button';
import { caseDocumentUrl } from '@/content';
import { DrawingViewer } from './drawing-viewer';
import { MarkdownBody, Paper } from './paper';
import { documentFormat, MissingDocumentError, useCaseText } from './use-document-text';

export interface DocumentViewerProps {
  caseFile: CaseFile;
  document: CaseDocument | null;
  /** Simulated arrival date for the stamp. */
  receivedDate: string | null;
  /** Animate the stamp (a document that just arrived). */
  isNew?: boolean;
  onClose?: () => void;
}

/** The middle panel: the chosen document as paper, drawing or PDF. */
export function DocumentViewer({
  caseFile,
  document,
  receivedDate,
  isNew = false,
  onClose,
}: DocumentViewerProps) {
  if (!document) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted">
        <FileText className="size-8 stroke-[1.5]" aria-hidden="true" />
        <p className="font-medium text-ink">Ingen handling öppen</p>
        <p className="max-w-xs text-sm">Välj en handling i diariet för att läsa den här.</p>
      </div>
    );
  }
  const format = documentFormat(document.fil);
  const url = caseDocumentUrl(caseFile.id, document.fil);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
            {document.id} · {receivedDate ? `inkom ${receivedDate}` : 'handling'}
          </p>
          <h2 className="truncate text-base font-semibold" id="document-title">
            {document.titel}
          </h2>
        </div>
        {format !== 'markdown' && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex size-8 items-center justify-center rounded-sm text-muted hover:bg-accent-soft hover:text-ink"
            aria-label="Öppna i nytt fönster"
            title="Öppna i nytt fönster"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        )}
        {onClose && (
          <Button
            variant="ghost"
            size="sm"
            className="size-8 px-0"
            onClick={onClose}
            aria-label="Stäng handlingen (Esc)"
            title="Stäng handlingen (Esc)"
          >
            <X aria-hidden="true" />
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6" aria-labelledby="document-title">
        {format === 'markdown' && (
          <MarkdownDocument
            caseFile={caseFile}
            document={document}
            receivedDate={receivedDate}
            isNew={isNew}
          />
        )}
        {format === 'image' && <DrawingViewer key={url} src={url} title={document.titel} />}
        {format === 'pdf' && (
          <object
            data={url}
            type="application/pdf"
            aria-label={document.titel}
            className="h-full min-h-[480px] w-full rounded-md border border-line"
          >
            <p className="p-4 text-sm">
              PDF-filen kan inte visas här.{' '}
              <a href={url} target="_blank" rel="noreferrer">
                Öppna den i ett nytt fönster
              </a>
              .
            </p>
          </object>
        )}
        {format === 'other' && (
          <p className="text-sm text-muted">
            Filtypen kan inte visas i appen.{' '}
            <a href={url} target="_blank" rel="noreferrer">
              Öppna filen
            </a>
            .
          </p>
        )}
      </div>
    </div>
  );
}

function MarkdownDocument({
  caseFile,
  document,
  receivedDate,
  isNew,
}: {
  caseFile: CaseFile;
  document: CaseDocument;
  receivedDate: string | null;
  isNew: boolean;
}) {
  const text = useCaseText(caseFile.id, document.fil);
  if (text.isPending) {
    return (
      <div className="paper animate-pulse" aria-busy="true">
        <span className="sr-only">Läser in handlingen …</span>
      </div>
    );
  }
  if (text.isError) return <MissingFile file={document.fil} missing={text.error} />;
  return (
    <Paper
      meta={text.data.meta}
      receivedDate={receivedDate}
      animateStamp={isNew}
      aria-label={document.titel}
    >
      <MarkdownBody>{text.data.body}</MarkdownBody>
    </Paper>
  );
}

/** A model text (modelltext, modellbeslut) as paper, loaded from the case folder. */
export function ModelDocument({
  caseFile,
  file,
  eyebrow = 'Modelltext',
}: {
  caseFile: CaseFile;
  file: string;
  eyebrow?: string;
}) {
  const text = useCaseText(caseFile.id, file);
  if (text.isPending) {
    return (
      <div className="paper animate-pulse" aria-busy="true">
        <span className="sr-only">Läser in modelltexten …</span>
      </div>
    );
  }
  if (text.isError) return <MissingFile file={file} missing={text.error} />;
  return (
    <Paper meta={text.data.meta} eyebrow={eyebrow} aria-label={eyebrow}>
      <MarkdownBody>{text.data.body}</MarkdownBody>
    </Paper>
  );
}

function MissingFile({ file, missing }: { file: string; missing: unknown }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong p-10 text-center text-sm text-muted">
      <FileQuestion className="size-6" aria-hidden="true" />
      <p className="font-medium text-ink">Handlingen kunde inte läsas</p>
      <p>
        {missing instanceof MissingDocumentError
          ? `Filen ${file} finns inte i den här versionen av appen.`
          : 'Försök igen om en stund.'}
      </p>
    </div>
  );
}
