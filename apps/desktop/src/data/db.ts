import { runMigrations, type SqlDriver, type SqlValue } from './sql-driver';

/** Database file, relative to the app's config directory (tauri-plugin-sql convention). */
export const DATABASE_URL = 'sqlite:bygglov.db';

/**
 * Opens the app database through @tauri-apps/plugin-sql and runs pending migrations.
 * Only call inside Tauri (see `isTauri()`); store.ts picks the in-memory store otherwise.
 */
export async function open(url: string = DATABASE_URL): Promise<SqlDriver> {
  const { default: Database } = await import('@tauri-apps/plugin-sql');
  const db = await Database.load(url);

  const driver: SqlDriver = {
    async execute(sql, params: readonly SqlValue[] = []) {
      const result = await db.execute(sql, [...params]);
      return { rowsAffected: result.rowsAffected, lastInsertId: result.lastInsertId ?? null };
    },
    async select<Row>(sql: string, params: readonly SqlValue[] = []) {
      return db.select<Row[]>(sql, [...params]);
    },
  };

  await runMigrations(driver);
  return driver;
}
