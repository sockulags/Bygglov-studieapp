import { isTauri } from '@/lib/tauri';

/**
 * The three ways out of the app for the decision report. Same pattern as lib/text-file.ts
 * (plugin-dialog + plugin-fs inside Tauri, a download in the browser), with an HTML filter.
 */

const HTML_FILTER = { name: 'Webbsida (HTML)', extensions: ['html'] };

/** Saves the report as an .html file. Returns false when the user cancelled. */
export async function saveHtmlFile(defaultName: string, html: string): Promise<boolean> {
  if (isTauri()) {
    const [{ save }, { writeTextFile }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-fs'),
    ]);
    const path = await save({ defaultPath: defaultName, filters: [HTML_FILTER] });
    if (!path) return false;
    await writeTextFile(path, html);
    return true;
  }
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = defaultName;
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return true;
}

/**
 * Prints the report from a hidden iframe. The print dialog offers "Spara som PDF" (in
 * Tauri on Windows WebView2 also "Microsoft Print to PDF"). Resolves when the dialog has
 * been closed or, where print() does not block, shortly after it opened. The browser does
 * not say whether a PDF was actually saved.
 */
export function printHtml(html: string, documentRef: Document = document): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const frame = documentRef.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('tabindex', '-1');
    frame.title = 'Beslutsrapport för utskrift';
    Object.assign(frame.style, {
      position: 'fixed',
      right: '0',
      bottom: '0',
      width: '0',
      height: '0',
      border: '0',
      visibility: 'hidden',
    });
    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      // Removing the frame too early cancels printing in some engines.
      window.setTimeout(() => frame.remove(), 1000);
    };
    let printed = false;
    frame.addEventListener('load', () => {
      // Print once, even if the frame reports load again (e.g. after the dialog).
      if (printed) return;
      printed = true;
      const win = frame.contentWindow;
      if (!win) {
        cleanup();
        reject(new Error('Utskriftsfönstret kunde inte öppnas.'));
        return;
      }
      win.addEventListener('afterprint', cleanup);
      try {
        win.focus();
        win.print();
        cleanup();
        resolve();
      } catch (error: unknown) {
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    frame.srcdoc = html;
    documentRef.body.append(frame);
  });
}

/** Copies text to the clipboard, with a fallback for webviews without the async API. */
export async function copyText(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back below (e.g. permission denied in an insecure context).
    }
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  Object.assign(area.style, { position: 'fixed', top: '0', left: '-9999px', opacity: '0' });
  document.body.append(area);
  try {
    area.select();
    const ok = typeof document.execCommand === 'function' && document.execCommand('copy');
    if (!ok) throw new Error('Det gick inte att kopiera till urklipp.');
  } finally {
    area.remove();
  }
}
