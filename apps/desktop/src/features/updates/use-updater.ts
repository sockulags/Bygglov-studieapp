import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  checkForUpdatesManually,
  installNow,
  later,
  startAutoCheck,
  useUpdaterStore,
  type UpdaterState,
} from './updater';

export interface UseUpdaterOptions {
  /** Run the background schedule (startup + every six hours). Default true. */
  autoCheck?: boolean;
}

export interface UseUpdaterResult extends UpdaterState {
  installNow: () => Promise<void>;
  later: () => void;
  checkNow: typeof checkForUpdatesManually;
}

/**
 * Update state and actions. With `autoCheck` (the default) it checks for updates
 * shortly after start and then every six hours. Outside Tauri the status stays "idle".
 */
export function useUpdater({ autoCheck = true }: UseUpdaterOptions = {}): UseUpdaterResult {
  const state = useUpdaterStore(
    useShallow((s) => ({
      status: s.status,
      update: s.update,
      progress: s.progress,
      error: s.error,
      dismissed: s.dismissed,
      lastCheckedAt: s.lastCheckedAt,
    })),
  );

  useEffect(() => {
    if (!autoCheck) return;
    return startAutoCheck();
  }, [autoCheck]);

  return { ...state, installNow, later, checkNow: checkForUpdatesManually };
}
