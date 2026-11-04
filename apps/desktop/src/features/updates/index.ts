export { UpdatePrompt, type UpdatePromptProps } from './update-prompt';
export { WhatsNewDialog } from './whats-new-dialog';
export { ReleaseNotes } from './release-notes';
export { useUpdater, type UseUpdaterOptions, type UseUpdaterResult } from './use-updater';
export { useWhatsNew, resolveWhatsNew, type WhatsNew } from './whats-new';
export {
  checkForUpdates,
  checkForUpdatesManually,
  installNow,
  later,
  useUpdaterStore,
  type AvailableUpdate,
  type DownloadProgress,
  type UpdaterError,
  type UpdaterState,
  type UpdaterStatus,
} from './updater';
