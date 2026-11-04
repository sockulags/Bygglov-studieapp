/**
 * Test-only SqlDriver backed by node:sqlite (built into Node 22.5+, no install needed).
 * Lets vitest run the real migrations and SQL repositories against a real SQLite.
 * Never imported by app code.
 */
import type { SqlDriver, SqlValue } from '../sql-driver';

interface StatementSync {
  run(params: Record<string, SqlValue>): {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  };
  all(params: Record<string, SqlValue>): Record<string, unknown>[];
}

interface DatabaseSync {
  prepare(sql: string): StatementSync;
  exec(sql: string): void;
  close(): void;
}

interface NodeSqliteModule {
  DatabaseSync: new (path: string) => DatabaseSync;
}

export interface NodeSqliteDriver extends SqlDriver {
  /** Synchronous raw access for assertions (e.g. sqlite_master). */
  raw: DatabaseSync;
  close(): void;
}

async function loadModule(): Promise<NodeSqliteModule | null> {
  try {
    // A variable specifier keeps tsc from needing Node's types in the app program.
    const specifier = 'node:sqlite';
    return (await import(/* @vite-ignore */ specifier)) as NodeSqliteModule;
  } catch {
    return null;
  }
}

/** Binds `[a, b]` to the `$1, $2` placeholders actually present in the statement. */
function bind(sql: string, params: readonly SqlValue[]): Record<string, SqlValue> {
  const used = new Set([...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
  const named: Record<string, SqlValue> = {};
  for (const n of used) {
    if (n < 1 || n > params.length) throw new Error(`Missing value for $${n} in: ${sql}`);
    named[`$${n}`] = params[n - 1] ?? null;
  }
  if (params.length > used.size) throw new Error(`Unused parameters for: ${sql}`);
  return named;
}

/** Returns null when node:sqlite is unavailable (older Node). */
export async function createNodeSqliteDriver(path = ':memory:'): Promise<NodeSqliteDriver | null> {
  const mod = await loadModule();
  if (!mod) return null;
  const db = new mod.DatabaseSync(path);
  return {
    raw: db,
    close: () => db.close(),
    async execute(sql, params = []) {
      const result = db.prepare(sql).run(bind(sql, params));
      return { rowsAffected: Number(result.changes), lastInsertId: Number(result.lastInsertRowid) };
    },
    async select<Row>(sql: string, params: readonly SqlValue[] = []) {
      // node:sqlite returns null-prototype objects; copy to plain objects.
      return db
        .prepare(sql)
        .all(bind(sql, params))
        .map((row) => ({ ...row }) as Row);
    },
  };
}

export async function isNodeSqliteAvailable(): Promise<boolean> {
  return (await loadModule()) !== null;
}
