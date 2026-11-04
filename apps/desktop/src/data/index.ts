/**
 * data/ — local storage. SQLite via @tauri-apps/plugin-sql inside Tauri, an in-memory
 * store with the same interface in a plain browser and in tests. Features should use
 * `getDataStore()` or the hooks; never import db.ts or the plugin directly. db.ts and
 * sql-store.ts are loaded lazily by store.ts so the browser build never touches them.
 */
export * from './types';
export { getDataStore, setDataStore } from './store';
export { createMemoryDataStore } from './memory-store';
export { runMigrations, type SqlDriver, type SqlValue, type MigrationResult } from './sql-driver';
export { migrations, type Migration } from './migrations';
export {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BackupFormatError,
  exportStudyData,
  importStudyData,
  parseStudyDataBackup,
  StudyDataBackupSchema,
  type ImportSummary,
  type StudyDataBackup,
} from './backup';
export {
  dataKeys,
  useAnswerHistory,
  useDueReviews,
  useModuleStats,
  useRecentSessions,
  useRecordAnswer,
  useReviewStates,
  useSetting,
  type UseSettingResult,
} from './hooks';
