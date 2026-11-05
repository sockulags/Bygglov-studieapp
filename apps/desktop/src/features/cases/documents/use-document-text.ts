import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { caseDocumentUrl } from '@/content';
import { renderDocumentText } from '@/engine';
import { useCaseStore } from '../case-store';
import { parseFrontMatter, type ParsedDocument } from './front-matter';

/** Kind of viewer a case file needs, from its extension. */
export type DocumentFormat = 'markdown' | 'image' | 'pdf' | 'other';

export function documentFormat(file: string): DocumentFormat {
  const ext = /\.([a-z0-9]+)$/i.exec(file)?.[1]?.toLowerCase();
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'svg' || ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp') {
    return 'image';
  }
  if (ext === 'pdf') return 'pdf';
  return 'other';
}

/** Thrown when a case file is missing from the build (e.g. a drawing not generated yet). */
export class MissingDocumentError extends Error {
  constructor(readonly file: string) {
    super(`Filen ${file} finns inte i appen.`);
    this.name = 'MissingDocumentError';
  }
}

async function fetchText(caseId: string, file: string): Promise<ParsedDocument> {
  const response = await fetch(caseDocumentUrl(caseId, file));
  // Vite's dev server answers unknown paths with index.html.
  const type = response.headers.get('content-type') ?? '';
  if (!response.ok || type.includes('text/html')) throw new MissingDocumentError(file);
  return parseFrontMatter(await response.text());
}

/** A Markdown document of a case, split into front matter and body. Cached per file. */
export function useCaseText(caseId: string, file: string | null) {
  return useQuery({
    queryKey: ['case-document', caseId, file],
    queryFn: () => fetchText(caseId, file ?? ''),
    enabled: file !== null && documentFormat(file) === 'markdown',
    staleTime: Infinity,
    retry: false,
  });
}

/**
 * Renders the template variables ({{beslutsdatum}}, {{kungorelsedatum+19}} …, see
 * content/README.md) of a document of the open case. `receivedDate` is `{{inkomdatum}}`.
 * Texts of another case than the open one are returned unchanged.
 */
export function useDocumentTemplate(
  caseId: string,
  receivedDate: string | null,
): (text: string) => string {
  const state = useCaseStore((s) => (s.active?.caseId === caseId ? s.active.state : null));
  return useCallback(
    (text: string) => (state ? renderDocumentText(text, state, receivedDate) : text),
    [state, receivedDate],
  );
}
