import { isTauri } from '@/lib/tauri';
import { createMemoryDataStore } from './memory-store';
import type { DataStore } from './types';

let storePromise: Promise<DataStore> | null = null;

async function createDefaultStore(): Promise<DataStore> {
  if (!isTauri()) return createMemoryDataStore();
  const [{ open }, { createSqlDataStore }] = await Promise.all([import('./db'), import('./sql-store')]);
  return createSqlDataStore(await open());
}

/**
 * The app's data store: SQLite inside Tauri, in-memory in a plain browser.
 * Opened once (migrations run on first call); a failed open is retried on the next call.
 */
export function getDataStore(): Promise<DataStore> {
  if (!storePromise) {
    storePromise = createDefaultStore().catch((error: unknown) => {
      storePromise = null;
      throw error;
    });
  }
  return storePromise;
}

/** Replaces the store (tests, Storybook-like previews). Pass null to go back to the default. */
export function setDataStore(store: DataStore | null): void {
  storePromise = store ? Promise.resolve(store) : null;
}
