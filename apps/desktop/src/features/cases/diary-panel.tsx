import {
  CalendarClock,
  CheckCircle2,
  FileText,
  Gavel,
  Hourglass,
  Inbox,
  Megaphone,
  SkipForward,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { CaseFile } from '@bygglov/content-schema';
import { diary, formatSwedishDate, type CaseState, type DiaryKind } from '@/engine';
import { cn } from '@/lib/cn';

const KIND: Record<DiaryKind, { icon: LucideIcon; label: string }> = {
  registrering: { icon: Inbox, label: 'Registrering' },
  handling: { icon: FileText, label: 'Handling' },
  steg: { icon: CheckCircle2, label: 'Åtgärd' },
  hoppat: { icon: SkipForward, label: 'Överhoppat' },
  handelse: { icon: Megaphone, label: 'Händelse' },
  tid: { icon: Hourglass, label: 'Tid' },
  frist: { icon: CalendarClock, label: 'Tidsfrist' },
  beslut: { icon: Gavel, label: 'Beslut' },
};

export interface DiaryPanelProps {
  caseFile: CaseFile;
  state: CaseState;
  selectedDocumentId: string | null;
  onOpenDocument: (documentId: string) => void;
}

/**
 * Diariet: the case's timeline in simulated time. Documents are buttons that open them in
 * the viewer; unread ones carry a brick-red "NY".
 */
export function DiaryPanel({
  caseFile,
  state,
  selectedDocumentId,
  onOpenDocument,
}: DiaryPanelProps) {
  const entries = diary(state);
  const unseen = new Set(state.visibleDocuments.filter((d) => d.unseen).map((d) => d.documentId));
  const list = useRef<HTMLOListElement>(null);
  const count = entries.length;

  // Keep the newest entry in view when something is added.
  useEffect(() => {
    const el = list.current?.parentElement;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  return (
    <ol ref={list} className="flex flex-col gap-0.5 p-3" aria-label="Diarieposter">
      {entries.map((entry, index) => {
        const showDate = index === 0 || entries[index - 1]?.date !== entry.date;
        const kind = KIND[entry.kind];
        const Icon = kind.icon;
        const document =
          entry.kind === 'handling' && entry.documentId
            ? caseFile.handlingar.find((d) => d.id === entry.documentId)
            : undefined;
        const subtle = entry.kind === 'tid' || entry.kind === 'frist';
        return (
          <li key={index} className="flex flex-col">
            {showDate && (
              <p className="mt-3 mb-1 px-2 text-xs font-semibold tracking-[0.06em] text-muted uppercase first:mt-0">
                <time dateTime={entry.date}>{formatSwedishDate(entry.date)}</time>
              </p>
            )}
            {document ? (
              <button
                type="button"
                onClick={() => onOpenDocument(document.id)}
                aria-current={selectedDocumentId === document.id ? 'true' : undefined}
                className={cn(
                  'group flex w-full items-start gap-2.5 rounded-md border px-2.5 py-2 text-left text-sm',
                  'transition-colors duration-[var(--duration-fast)]',
                  selectedDocumentId === document.id
                    ? 'border-accent/50 bg-accent-soft'
                    : 'border-transparent hover:border-line-strong hover:bg-paper',
                )}
              >
                <Icon className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium leading-snug text-ink">{document.titel}</span>
                  <span className="text-xs text-muted">{document.id}</span>
                </span>
                {unseen.has(document.id) && (
                  <span className="fade-in-up mt-0.5 shrink-0 rounded-sm bg-brick px-1.5 py-0.5 text-[0.625rem] font-bold tracking-[0.1em] text-paper">
                    NY<span className="sr-only"> handling, inte öppnad</span>
                  </span>
                )}
              </button>
            ) : (
              <p
                className={cn(
                  'flex items-start gap-2.5 px-2.5 py-1.5 text-sm leading-snug',
                  subtle ? 'text-xs text-muted' : 'text-ink',
                  entry.kind === 'handelse' && 'rounded-md bg-plan-yellow-soft py-2',
                  entry.kind === 'beslut' && 'font-medium',
                )}
              >
                <Icon
                  className={cn(
                    'mt-0.5 shrink-0',
                    subtle ? 'size-3.5' : 'size-4',
                    entry.kind === 'handelse' || entry.kind === 'hoppat'
                      ? 'text-brick'
                      : 'text-muted',
                  )}
                  aria-label={kind.label}
                />
                <span className="min-w-0 flex-1">{entry.text}</span>
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
