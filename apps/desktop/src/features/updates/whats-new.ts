import { useCallback, useEffect, useState } from 'react';
import changelogRaw from '../../../../../CHANGELOG.md?raw';
import { getAppVersion } from '@/lib/tauri';
import { parseChangelog, sectionsBetween, type ChangelogSection } from './changelog';
import {
  clearPendingReleaseNotes,
  getLastSeenVersion,
  getPendingReleaseNotes,
  setLastSeenVersion,
  type PendingReleaseNotes,
} from './storage';
import { compareVersions } from './version';

export interface WhatsNewInput {
  currentVersion: string;
  lastSeenVersion: string | null;
  changelog: string;
  pendingNotes: PendingReleaseNotes | null;
}

export interface WhatsNew {
  version: string;
  previousVersion: string;
  /** Newest first. Empty when no notes could be found; the dialog still confirms the update. */
  sections: ChangelogSection[];
}

/**
 * Decides whether "Vad är nytt" should be shown. Shown once, when the running version is
 * newer than the one stored last time. A first install (nothing stored) shows nothing.
 * Notes come from the CHANGELOG.md bundled with this version; the notes saved before
 * installing are a fallback.
 */
export function resolveWhatsNew({
  currentVersion,
  lastSeenVersion,
  changelog,
  pendingNotes,
}: WhatsNewInput): WhatsNew | null {
  if (!lastSeenVersion || compareVersions(currentVersion, lastSeenVersion) <= 0) return null;
  let sections = sectionsBetween(parseChangelog(changelog), lastSeenVersion, currentVersion);
  if (sections.length === 0 && pendingNotes?.version === currentVersion && pendingNotes.notes) {
    sections = [{ version: currentVersion, body: pendingNotes.notes.trim() }];
  }
  return { version: currentVersion, previousVersion: lastSeenVersion, sections };
}

export interface UseWhatsNewResult {
  open: boolean;
  whatsNew: WhatsNew | null;
  /** Closes the dialog and remembers the current version so it is not shown again. */
  close: () => void;
}

/** Shows "Vad är nytt" once after an update. */
export function useWhatsNew(): UseWhatsNewResult {
  const [whatsNew, setWhatsNew] = useState<WhatsNew | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getAppVersion().then((version) => {
      if (cancelled) return;
      const lastSeenVersion = getLastSeenVersion();
      const result = resolveWhatsNew({
        currentVersion: version,
        lastSeenVersion,
        changelog: changelogRaw,
        pendingNotes: getPendingReleaseNotes(),
      });
      if (result) {
        setCurrentVersion(version);
        setWhatsNew(result);
      } else if (lastSeenVersion !== version) {
        // First run or a downgrade: remember the version without showing anything.
        setLastSeenVersion(version);
        clearPendingReleaseNotes();
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const close = useCallback(() => {
    if (currentVersion) setLastSeenVersion(currentVersion);
    clearPendingReleaseNotes();
    setWhatsNew(null);
  }, [currentVersion]);

  return { open: whatsNew !== null, whatsNew, close };
}
