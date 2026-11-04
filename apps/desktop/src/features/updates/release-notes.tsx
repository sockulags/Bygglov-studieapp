import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { parseReleaseNotes } from './release-notes-parse';

/** **bold** and [text](url) (shown as plain text; links open nothing inside the app). */
function renderInline(text: string): ReactNode {
  const plain = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/`([^`]+)`/g, '$1');
  return plain.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i} className="font-semibold text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

export interface ReleaseNotesProps {
  markdown: string;
  className?: string;
}

export function ReleaseNotes({ markdown, className }: ReleaseNotesProps) {
  const blocks = parseReleaseNotes(markdown);
  return (
    <div className={cn('flex flex-col gap-2 text-[0.9375rem]', className)}>
      {blocks.map((block, i) => {
        switch (block.kind) {
          case 'heading':
            return (
              <p key={i} className="mt-1 text-sm font-semibold tracking-wide text-ink uppercase">
                {block.text}
              </p>
            );
          case 'list':
            return (
              <ul key={i} className="flex list-disc flex-col gap-1 pl-5 text-ink marker:text-muted">
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ul>
            );
          case 'paragraph':
            return (
              <p key={i} className="text-ink">
                {renderInline(block.text)}
              </p>
            );
        }
      })}
    </div>
  );
}
