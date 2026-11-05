import type { ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/cn';
import type { DocumentMeta } from './front-matter';

/** The brick-red "INKOM" stamp with arrival date and diary number. */
export function ArrivalStamp({
  date,
  diaryNumber,
  animate = false,
  label = 'Inkom',
}: {
  date: string;
  diaryNumber?: string | undefined;
  animate?: boolean;
  label?: string;
}) {
  return (
    <span
      className={cn('arrival-stamp text-xs', animate && 'stamp-animate')}
      role="img"
      aria-label={`${label} ${date}${diaryNumber ? `, diarienummer ${diaryNumber}` : ''}`}
    >
      <span aria-hidden="true">{label}</span>
      <small aria-hidden="true">{date}</small>
      {diaryNumber && <small aria-hidden="true">{diaryNumber}</small>}
    </span>
  );
}

/**
 * GFM task list boxes (`- [x] Bygglov`) are form fields on paper, not controls: a disabled
 * checkbox without a name is noise for a screen reader, so they are drawn as a box with the
 * state as its name.
 */
interface TextNode {
  type: string;
  value?: string;
  children?: TextNode[];
}

const textOf = (node: TextNode): string =>
  node.type === 'text' ? (node.value ?? '') : (node.children ?? []).map(textOf).join('');

const MARKDOWN_COMPONENTS: Components = {
  /**
   * Form-like tables in documents start with an empty header row (`| | |`). Empty column
   * headers say nothing to a screen reader, so such a header row is left out.
   */
  thead({ node, children, ...props }) {
    if (node && textOf(node as TextNode).trim() === '') return null;
    return <thead {...props}>{children}</thead>;
  },
  /** An empty cell in a header row ("| Uppgifter om byggnaden | |") is not a header. */
  th({ node, children, ...props }) {
    if (node && textOf(node as TextNode).trim() === '') return <td {...props}>{children}</td>;
    return <th {...props}>{children}</th>;
  },
  input({ type, checked }) {
    if (type !== 'checkbox') return null;
    return (
      <span
        role="img"
        aria-label={checked ? 'Ikryssad' : 'Inte ikryssad'}
        className="paper-checkbox"
        data-checked={checked ? 'true' : 'false'}
      />
    );
  },
};

/** Rendered Markdown in document style (headings, tables, GFM task lists). */
export function MarkdownBody({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn('paper-body', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

export interface PaperProps {
  meta?: DocumentMeta;
  /** Arrival date for the stamp; no stamp when missing. */
  receivedDate?: string | null;
  stampLabel?: string;
  animateStamp?: boolean;
  /** Small label above the sender, e.g. "Modelltext". */
  eyebrow?: ReactNode;
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
}

/**
 * A document as an A4 sheet: sender and title from the front matter, the arrival stamp
 * top right, then the body.
 */
export function Paper({
  meta,
  receivedDate,
  stampLabel,
  animateStamp,
  eyebrow,
  children,
  className,
  ...props
}: PaperProps) {
  const hasHeader =
    eyebrow !== undefined ||
    receivedDate ||
    meta?.avsandare !== undefined ||
    meta?.datum !== undefined;
  return (
    <article className={cn('paper', className)} aria-label={props['aria-label']}>
      {hasHeader && (
        <header className="mb-6 flex items-start justify-between gap-4 border-b border-line pb-4">
          <div className="min-w-0 font-sans text-sm text-muted">
            {eyebrow && (
              <p className="mb-1 text-xs font-semibold tracking-[0.08em] uppercase">{eyebrow}</p>
            )}
            {meta?.avsandare && <p className="font-medium text-ink">{meta.avsandare}</p>}
            {(meta?.datum || meta?.diarienummer) && (
              <p className="tabular-nums">
                {meta.datum && <span>Datum {meta.datum}</span>}
                {meta.datum && meta.diarienummer && <span aria-hidden="true"> · </span>}
                {meta.diarienummer && <span>Dnr {meta.diarienummer}</span>}
              </p>
            )}
          </div>
          {receivedDate && (
            <ArrivalStamp
              date={receivedDate}
              diaryNumber={meta?.diarienummer}
              animate={animateStamp ?? false}
              {...(stampLabel !== undefined ? { label: stampLabel } : {})}
            />
          )}
        </header>
      )}
      {children}
    </article>
  );
}
