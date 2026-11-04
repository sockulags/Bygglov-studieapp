export type ReleaseNotesBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'paragraph'; text: string };

/**
 * Parses the small Markdown subset used in CHANGELOG.md: "###" headings, "-"/"*" lists
 * (with indented continuation lines) and paragraphs. Rendered as React elements, never
 * as HTML, so release notes cannot inject markup.
 */
export function parseReleaseNotes(markdown: string): ReleaseNotesBlock[] {
  const blocks: ReleaseNotesBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };
  const flushList = () => {
    if (list?.length) blocks.push({ kind: 'list', items: list });
    list = null;
  };

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const item = /^\s*[-*]\s+(.*)$/.exec(line);
    if (!line.trim()) {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'heading', text: heading[1] ?? '' });
    } else if (item) {
      flushParagraph();
      list ??= [];
      list.push(item[1] ?? '');
    } else if (list && /^\s+/.test(line)) {
      const last = list.length - 1;
      list[last] = `${list[last] ?? ''} ${line.trim()}`;
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}
