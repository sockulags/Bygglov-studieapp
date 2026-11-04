/**
 * Auto-update logic around @tauri-apps/plugin-updater (docs/06-release-och-uppdatering.md).
 *
 * State lives in a small zustand store so the banner (UpdatePrompt), the hook and the
 * manual check in Inställningar all see the same update. Everything is a no-op outside
 * the Tauri webview, so the app keeps working in a plain browser during development.
 */
import type { Update } from '@tauri-apps/plugin-updater';
import { create } from 'zustand';
import { isTauri, type UpdateCheckResult } from '@/lib/tauri';
import { savePendingReleaseNotes } from './storage';

export type UpdaterStatus =
  'idle' | 'checking' | 'available' | 'downloading' | 'installing' | 'error';

export interface AvailableUpdate {
  version: string;
  currentVersion: string;
  /** Release notes (Markdown from CHANGELOG.md via latest.json). */
  notes?: string;
  date?: string;
}

export interface DownloadProgress {
  downloadedBytes: number;
  /** Unknown when the server sends no Content-Length. */
  totalBytes?: number;
  /** 0–100, only when totalBytes is known. */
  percent?: number;
}

export interface UpdaterError {
  /** A failed check is shown in Inställningar only; a failed install shows the banner. */
  phase: 'check' | 'install';
  message: string;
}

export interface UpdaterState {
  status: UpdaterStatus;
  update: AvailableUpdate | null;
  progress: DownloadProgress | null;
  error: UpdaterError | null;
  /** The user pressed "Senare"; the banner stays hidden until the next check finds an update. */
  dismissed: boolean;
  lastCheckedAt: number | null;
}

/** Background checks: shortly after start, then every six hours. */
export const STARTUP_CHECK_DELAY_MS = 3_000;
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

const initialState: UpdaterState = {
  status: 'idle',
  update: null,
  progress: null,
  error: null,
  dismissed: false,
  lastCheckedAt: null,
};

export const useUpdaterStore = create<UpdaterState>()(() => ({ ...initialState }));

// The Update object holds a resource on the Rust side, so it is kept outside React state.
let pendingUpdate: Update | null = null;
let inFlightCheck: Promise<UpdateCheckResult> | null = null;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function replacePendingUpdate(next: Update | null): Promise<void> {
  const previous = pendingUpdate;
  pendingUpdate = next;
  if (previous && previous !== next) {
    try {
      await previous.close();
    } catch {
      // The resource may already be gone; nothing to clean up.
    }
  }
}

function isBusy(status: UpdaterStatus): boolean {
  return status === 'downloading' || status === 'installing';
}

function currentResult(): UpdateCheckResult {
  const { update } = useUpdaterStore.getState();
  return update
    ? { status: 'available', version: update.version, notes: update.notes }
    : { status: 'up-to-date' };
}

async function runCheck(): Promise<UpdateCheckResult> {
  const before = useUpdaterStore.getState();
  // Keep an already visible banner instead of flashing "checking".
  if (before.status !== 'available') {
    useUpdaterStore.setState({ status: 'checking', error: null });
  }
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const result = await check();
    await replacePendingUpdate(result);
    const lastCheckedAt = Date.now();
    if (!result) {
      useUpdaterStore.setState({ status: 'idle', update: null, error: null, lastCheckedAt });
      return { status: 'up-to-date' };
    }
    useUpdaterStore.setState({
      status: 'available',
      update: {
        version: result.version,
        currentVersion: result.currentVersion,
        notes: result.body?.trim() || undefined,
        date: result.date,
      },
      progress: null,
      error: null,
      dismissed: false,
      lastCheckedAt,
    });
    return { status: 'available', version: result.version, notes: result.body };
  } catch (error: unknown) {
    const message = errorMessage(error);
    const { update } = useUpdaterStore.getState();
    // A failed re-check must not hide an update that was already found.
    useUpdaterStore.setState(
      update ? { status: 'available' } : { status: 'error', error: { phase: 'check', message } },
    );
    return { status: 'error', message };
  }
}

/**
 * Asks the update endpoint (latest.json on GitHub Releases) whether a newer version
 * exists. Concurrent calls share one request. Does nothing while an update is
 * downloading or installing.
 */
export function checkForUpdates(): Promise<UpdateCheckResult> {
  if (!isTauri()) return Promise.resolve({ status: 'unsupported' });
  if (isBusy(useUpdaterStore.getState().status)) return Promise.resolve(currentResult());
  if (!inFlightCheck) {
    inFlightCheck = runCheck().finally(() => {
      inFlightCheck = null;
    });
  }
  return inFlightCheck;
}

/**
 * For the "Sök nu" button in Inställningar → Uppdateringar. Same result type as
 * `checkForUpdate()` in lib/tauri.ts; if an update is found it also un-hides the banner,
 * where it can be installed.
 */
export async function checkForUpdatesManually(): Promise<UpdateCheckResult> {
  const result = await checkForUpdates();
  if (result.status === 'available') useUpdaterStore.setState({ dismissed: false });
  return result;
}

/**
 * Downloads and installs the available update, then restarts the app. On Windows the
 * NSIS installer (installMode "passive") closes the app itself and starts the new
 * version; elsewhere we relaunch explicitly.
 */
export async function installNow(): Promise<void> {
  if (!isTauri() || isBusy(useUpdaterStore.getState().status)) return;

  if (!pendingUpdate) {
    const result = await checkForUpdates();
    if (result.status !== 'available' || !pendingUpdate) return;
  }
  const update = pendingUpdate;
  const info = useUpdaterStore.getState().update;
  if (info?.notes) savePendingReleaseNotes(info.version, info.notes);

  useUpdaterStore.setState({
    status: 'downloading',
    dismissed: false,
    error: null,
    progress: { downloadedBytes: 0 },
  });

  let downloadedBytes = 0;
  let totalBytes: number | undefined;
  try {
    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case 'Started':
          totalBytes = event.data.contentLength || undefined;
          downloadedBytes = 0;
          break;
        case 'Progress':
          downloadedBytes += event.data.chunkLength;
          break;
        case 'Finished':
          useUpdaterStore.setState({
            status: 'installing',
            progress: { downloadedBytes, totalBytes, percent: 100 },
          });
          return;
      }
      useUpdaterStore.setState({
        progress: {
          downloadedBytes,
          totalBytes,
          percent: totalBytes
            ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
            : undefined,
        },
      });
    });
    useUpdaterStore.setState({ status: 'installing' });
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch (error: unknown) {
    useUpdaterStore.setState({
      status: 'error',
      error: { phase: 'install', message: errorMessage(error) },
    });
  }
}

/** "Senare": hide the banner until the next scheduled check finds the update again. */
export function later(): void {
  if (isBusy(useUpdaterStore.getState().status)) return;
  useUpdaterStore.setState({ dismissed: true });
}

let autoCheckUsers = 0;
let startupTimer: ReturnType<typeof setTimeout> | null = null;
let intervalTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Starts the background schedule (startup + every six hours). Reference counted, so
 * several mounted hooks (or React StrictMode's double mount) share one schedule.
 * Returns the matching stop function.
 */
export function startAutoCheck(): () => void {
  if (!isTauri()) return () => {};
  autoCheckUsers += 1;
  if (autoCheckUsers === 1) {
    startupTimer = setTimeout(() => {
      startupTimer = null;
      void checkForUpdates();
    }, STARTUP_CHECK_DELAY_MS);
    intervalTimer = setInterval(() => void checkForUpdates(), CHECK_INTERVAL_MS);
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    autoCheckUsers -= 1;
    if (autoCheckUsers === 0) {
      if (startupTimer) clearTimeout(startupTimer);
      if (intervalTimer) clearInterval(intervalTimer);
      startupTimer = null;
      intervalTimer = null;
    }
  };
}

/** Test helper: back to a fresh state between tests. */
export function resetUpdaterForTests(): void {
  pendingUpdate = null;
  inFlightCheck = null;
  autoCheckUsers = 0;
  if (startupTimer) clearTimeout(startupTimer);
  if (intervalTimer) clearInterval(intervalTimer);
  startupTimer = null;
  intervalTimer = null;
  useUpdaterStore.setState({ ...initialState });
}
