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

/* ------------------------------------------------------------------ AI tutor (studiehjälp) */
/*
 * Wrappers for the tutor_* commands (IPC contract with src-tauri). The API key is stored by
 * the Rust side in the OS keyring and never comes back to JavaScript: these functions can
 * hand a key over once (`tutorSetKey`) but never read it.
 */

export type TutorEffort = 'low' | 'medium' | 'high';

export interface TutorSystemBlock {
  text: string;
  /** Marks the end of a cacheable prefix (cache_control: ephemeral on the Rust side). */
  cache: boolean;
}

export interface TutorMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface TutorRequest {
  model: string;
  maxTokens: number;
  effort: TutorEffort;
  system: TutorSystemBlock[];
  messages: TutorMessage[];
}

export interface TutorUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  model: string;
}

export type TutorEvent =
  | { type: 'text'; text: string }
  | { type: 'done'; usage: TutorUsage; stopReason: string }
  | { type: 'error'; message: string };

export interface TutorKeyTestResult {
  ok: boolean;
  model: string;
  message: string;
}

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

/** Commands reject with a Swedish message string; normalise it to an Error. */
function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === 'string' ? error : 'Okänt fel från appen.');
}

async function tutorCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await tauriInvoke<T>(command, args);
  } catch (error: unknown) {
    throw toError(error);
  }
}

/** Whether an API key is stored in the OS keyring. */
export function tutorHasKey(): Promise<boolean> {
  return tutorCommand<boolean>('tutor_has_key');
}

/** Stores the key in the OS keyring. Rejects (Swedish message) unless it starts with "sk-ant-". */
export function tutorSetKey(key: string): Promise<void> {
  return tutorCommand<void>('tutor_set_key', { key });
}

export function tutorClearKey(): Promise<void> {
  return tutorCommand<void>('tutor_clear_key');
}

/** A small non-streaming request (max_tokens 16) to check that the key works. */
export function tutorTestKey(model: string): Promise<TutorKeyTestResult> {
  return tutorCommand<TutorKeyTestResult>('tutor_test_key', { model });
}

/**
 * Streams an answer: `onEvent` receives text deltas and finally `done` or `error`.
 * Resolves with the usage when the stream has ended.
 */
export async function tutorAsk(
  request: TutorRequest,
  onEvent: (event: TutorEvent) => void,
): Promise<TutorUsage> {
  const { Channel } = await import('@tauri-apps/api/core');
  const channel = new Channel<TutorEvent>();
  channel.onmessage = onEvent;
  return tutorCommand<TutorUsage>('tutor_ask', { request, onEvent: channel });
}
