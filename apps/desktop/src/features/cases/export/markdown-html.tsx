import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Markdown to static HTML for the printable report (the model decision appendix). Raw HTML
 * in the Markdown is not rendered (react-markdown's default), so the output is safe to
 * embed. Front matter is removed first.
 */

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** Same rule as `splitFrontMatter` in @bygglov/content-build. */
export function stripFrontMatter(source: string): string {
  const match = FRONT_MATTER.exec(source);
  return match ? source.slice(match[0].length) : source;
}

export function markdownToHtml(source: string): string {
  return renderToStaticMarkup(
    <Markdown remarkPlugins={[remarkGfm]}>{stripFrontMatter(source)}</Markdown>,
  );
}
