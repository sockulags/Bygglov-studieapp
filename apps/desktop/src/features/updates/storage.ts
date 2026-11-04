/**
 * localStorage access for the update flow. Every call is wrapped because storage can be
 * unavailable (private mode, blocked site data); the app must work without it.
 */

/** The app version the user last saw "Vad är nytt" for (or first ran). */
export const LAST_SEEN_VERSION_KEY = 'bygglov-last-seen-version';
/** Release notes saved just before installing, as a fallback for "Vad är nytt". */
export const PENDING_NOTES_KEY = 'bygglov-pending-release-notes';

export interface PendingReleaseNotes {
  version: string;
  notes: string;
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable; "Vad är nytt" then simply shows again next start.
  }
}

export function getLastSeenVersion(): string | null {
  return read(LAST_SEEN_VERSION_KEY);
}

export function setLastSeenVersion(version: string): void {
  write(LAST_SEEN_VERSION_KEY, version);
}

export function savePendingReleaseNotes(version: string, notes: string): void {
  write(PENDING_NOTES_KEY, JSON.stringify({ version, notes } satisfies PendingReleaseNotes));
}

export function getPendingReleaseNotes(): PendingReleaseNotes | null {
  const raw = read(PENDING_NOTES_KEY);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === 'object' &&
      value !== null &&
      'version' in value &&
      'notes' in value &&
      typeof value.version === 'string' &&
      typeof value.notes === 'string'
    ) {
      return { version: value.version, notes: value.notes };
    }
  } catch {
    // Corrupt entry; ignore it.
  }
  return null;
}

export function clearPendingReleaseNotes(): void {
  write(PENDING_NOTES_KEY, null);
}
