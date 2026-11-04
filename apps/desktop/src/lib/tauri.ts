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
