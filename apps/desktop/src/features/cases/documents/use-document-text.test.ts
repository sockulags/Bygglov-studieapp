// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCaseText, isHtmlPage, MissingDocumentError } from './use-document-text';

function serve(body: string, init: ResponseInit) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(body, init))),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchCaseText', () => {
  it('reads Markdown that the Tauri app serves as text/html', async () => {
    serve('---\nrubrik: Ansökan om bygglov\n---\n\nVi söker bygglov.', {
      headers: { 'content-type': 'text/html' },
    });
    const parsed = await fetchCaseText('A001', 'handlingar/ansokan.md');
    expect(parsed.meta.rubrik).toBe('Ansökan om bygglov');
    expect(parsed.body).toContain('Vi söker bygglov.');
  });

  it("treats the dev server's index.html fallback as a missing file", async () => {
    serve('<!doctype html>\n<html lang="sv"><body><div id="root"></div></body></html>', {
      headers: { 'content-type': 'text/html' },
    });
    await expect(fetchCaseText('A001', 'handlingar/saknas.md')).rejects.toBeInstanceOf(
      MissingDocumentError,
    );
  });

  it('treats a 404 as a missing file', async () => {
    serve('', { status: 404 });
    await expect(fetchCaseText('A001', 'handlingar/saknas.md')).rejects.toBeInstanceOf(
      MissingDocumentError,
    );
  });
});

describe('isHtmlPage', () => {
  it('recognises HTML pages but not Markdown', () => {
    expect(isHtmlPage('  <!DOCTYPE html><html></html>')).toBe(true);
    expect(isHtmlPage('<html lang="sv"></html>')).toBe(true);
    expect(isHtmlPage('# Ansökan\n\n<html> i löptext')).toBe(false);
    expect(isHtmlPage('---\nrubrik: X\n---\n')).toBe(false);
  });
});
