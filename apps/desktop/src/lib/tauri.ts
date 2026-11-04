/**
 * Guards around the Tauri runtime so the app also runs in a plain browser
 * (`pnpm --filter desktop dev`). Every Tauri API call in the app should go through
 * helpers in this file or check `isTauri()` first.
 */

/** True when running inside the Tauri webview. */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * The app version. Inside Tauri it is read from tauri.conf.json via the API;
 * in a browser it falls back to the version injected from package.json at build time.
 */
export async function getAppVersion(): Promise<string> {
  if (isTauri()) {
    try {
      const { getVersion } = await import('@tauri-apps/api/app');
      return await getVersion();
    } catch {
      // Fall through to the build-time version.
    }
  }
  return __APP_VERSION__;
}

/** Human-readable runtime label for Inställningar. */
export function runtimeLabel(): string {
  return isTauri() ? 'Skrivbordsapp' : 'Webbläsare (utvecklingsläge)';
}

export type UpdateCheckResult =
  | { status: 'unsupported' }
  | { status: 'up-to-date' }
  | { status: 'available'; version: string; notes?: string }
  | { status: 'error'; message: string };

/**
 * Manual update check for Inställningar → Uppdateringar. Only asks the updater
 * endpoint whether a newer version exists; downloading and installing is driven by
 * the update flow (UpdateBanner) in the release track.
 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  if (!isTauri()) return { status: 'unsupported' };
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (!update) return { status: 'up-to-date' };
    return { status: 'available', version: update.version, notes: update.body };
  } catch (error: unknown) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}
