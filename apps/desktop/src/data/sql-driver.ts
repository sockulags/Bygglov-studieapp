import {
  MIGRATIONS_TABLE_SQL,
  migrations as defaultMigrations,
  type Migration,
} from './migrations';

/** A value that both the Tauri SQL plugin and node:sqlite can bind. */
export type SqlValue = string | number | null;

/**
 * Minimal async SQL interface shared by the Tauri plugin (db.ts) and the node:sqlite
 * test driver. Queries use `$1, $2, ...` placeholders, each number used at least once.
 */
export interface SqlDriver {
  execute(
    sql: string,
    params?: readonly SqlValue[],
  ): Promise<{ rowsAffected: number; lastInsertId: number | null }>;
  select<Row>(sql: string, params?: readonly SqlValue[]): Promise<Row[]>;
}

export interface MigrationResult {
  /** Versions applied by this run (empty when the schema was already current). */
  applied: number[];
  /** Highest version in the database after the run. */
  currentVersion: number;
}

function assertOrdered(list: readonly Migration[]): void {
  for (let i = 1; i < list.length; i++) {
    const prev = list[i - 1];
    const cur = list[i];
    if (prev && cur && cur.version <= prev.version) {
      throw new Error(
        `Migrations must have strictly increasing versions (${prev.version} → ${cur.version}).`,
      );
    }
  }
}

/**
 * Applies pending migrations in version order. Safe to call on every start: already
 * applied versions are skipped, and each statement is itself idempotent.
 */
export async function runMigrations(
  driver: SqlDriver,
  list: readonly Migration[] = defaultMigrations,
  now: () => Date = () => new Date(),
): Promise<MigrationResult> {
  assertOrdered(list);
  await driver.execute(MIGRATIONS_TABLE_SQL);

  const rows = await driver.select<{ version: number }>('SELECT version FROM schema_migrations');
  const appliedVersions = new Set(rows.map((r) => Number(r.version)));
  const known = new Set(list.map((m) => m.version));
  const unknown = [...appliedVersions].filter((v) => !known.has(v));
  if (unknown.length > 0) {
    throw new Error(
      `Databasen har en nyare version (${Math.max(...unknown)}) än appen känner till. Uppdatera appen.`,
    );
  }

  const applied: number[] = [];
  for (const migration of list) {
    if (appliedVersions.has(migration.version)) continue;
    for (const statement of migration.statements) {
      await driver.execute(statement);
    }
    await driver.execute(
      'INSERT OR IGNORE INTO schema_migrations (version, name, applied_at) VALUES ($1, $2, $3)',
      [migration.version, migration.name, now().toISOString()],
    );
    applied.push(migration.version);
  }

  const versions = [...appliedVersions, ...applied];
  return { applied, currentVersion: versions.length > 0 ? Math.max(...versions) : 0 };
}
