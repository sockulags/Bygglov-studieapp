import { isTauri } from '@/lib/tauri';

/**
 * Saving and opening a text file chosen by the user. Inside Tauri this uses the native
 * dialogs (plugin-dialog) and plugin-fs, which may only touch the path the user picked.
 * In a plain browser it falls back to a download and a file input.
 */

const JSON_FILTER = { name: 'Studiedata (JSON)', extensions: ['json'] };

/** Returns false when the user cancelled. */
export async function saveTextFile(defaultName: string, text: string): Promise<boolean> {
  if (isTauri()) {
    const [{ save }, { writeTextFile }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-fs'),
    ]);
    const path = await save({ defaultPath: defaultName, filters: [JSON_FILTER] });
    if (!path) return false;
    await writeTextFile(path, text);
    return true;
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = defaultName;
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    // Give the browser a moment to start the download before revoking.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return true;
}

/** Returns the file's text, or null when the user cancelled. */
export async function openTextFile(): Promise<string | null> {
  if (isTauri()) {
    const [{ open }, { readTextFile }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-fs'),
    ]);
    const path = await open({ multiple: false, directory: false, filters: [JSON_FILTER] });
    if (path === null) return null;
    return readTextFile(path);
  }
  return new Promise<string | null>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      file.text().then(resolve, reject);
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
