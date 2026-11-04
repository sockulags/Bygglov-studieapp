// @vitest-environment node
/**
 * Runs the migrations against a real SQLite (node:sqlite, built into Node 22.5+).
 * If node:sqlite is unavailable the SQLite part is skipped; the structural checks on
 * the migration list still run.
 */
import { describe, expect, it } from 'vitest';
import { migrations, type Migration } from '../migrations';
import { runMigrations } from '../sql-driver';
import {
  createNodeSqliteDriver,
  isNodeSqliteAvailable,
  type NodeSqliteDriver,
} from '../testing/node-sqlite-driver';

const sqliteAvailable = await isNodeSqliteAvailable();

const EXPECTED_TABLES = [
  'answers',
  'case_events',
  'case_state',
  'case_status',
  'case_steps',
  'decisions',
  'reviews',
  'schema_migrations',
  'sessions',
  'settings',
  'supervisor_feedback',
];

async function freshDriver(): Promise<NodeSqliteDriver> {
  const driver = await createNodeSqliteDriver();
  if (!driver) throw new Error('node:sqlite unavailable');
  return driver;
}

function tables(driver: NodeSqliteDriver): string[] {
  return driver.raw
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all({})
    .map((r) => String(r.name));
}

function schemaSnapshot(driver: NodeSqliteDriver): string[] {
  return driver.raw
    .prepare(
      "SELECT type || ':' || name || ':' || IFNULL(sql, '') AS s FROM sqlite_master ORDER BY type, name",
    )
    .all({})
    .map((r) => String(r.s));
}

describe('migration list', () => {
  it('has unique, strictly increasing versions starting at 1', () => {
    const versions = migrations.map((m) => m.version);
    expect(versions[0]).toBe(1);
    for (let i = 1; i < versions.length; i++) {
      expect(versions[i]).toBeGreaterThan(versions[i - 1] ?? 0);
    }
  });

  it('only uses idempotent CREATE statements', () => {
    for (const m of migrations) {
      expect(m.statements.length).toBeGreaterThan(0);
      for (const sql of m.statements) {
        const s = sql.trim();
        expect(s.endsWith(';'), 'one statement per entry, no trailing semicolon').toBe(false);
        if (/^CREATE\s+(TABLE|INDEX|UNIQUE\s+INDEX)/i.test(s)) {
          expect(s).toMatch(/^CREATE\s+(UNIQUE\s+)?(TABLE|INDEX)\s+IF\s+NOT\s+EXISTS/i);
        }
      }
    }
  });

  it('rejects an unordered list', async () => {
    const bad: Migration[] = [
      { version: 2, name: 'b', statements: ['SELECT 1'] },
      { version: 1, name: 'a', statements: ['SELECT 1'] },
    ];
    const noop = {
      execute: async () => ({ rowsAffected: 0, lastInsertId: null }),
      select: async () => [],
    };
    await expect(runMigrations(noop, bad)).rejects.toThrow(/increasing/);
  });
});

describe.skipIf(!sqliteAvailable)('runMigrations on SQLite', () => {
  it('creates all tables and records the version', async () => {
    const driver = await freshDriver();
    const result = await runMigrations(driver, migrations, () => new Date('2026-03-01T00:00:00Z'));
    expect(result.applied).toEqual(migrations.map((m) => m.version));
    expect(tables(driver)).toEqual(EXPECTED_TABLES);
    expect(await driver.select('SELECT version, name, applied_at FROM schema_migrations')).toEqual([
      { version: 1, name: 'initial', applied_at: '2026-03-01T00:00:00.000Z' },
      { version: 2, name: 'case_state', applied_at: '2026-03-01T00:00:00.000Z' },
    ]);
    driver.close();
  });

  it('is idempotent: a second run applies nothing and changes nothing', async () => {
    const driver = await freshDriver();
    await runMigrations(driver);
    await driver.execute("INSERT INTO settings (key, value_json) VALUES ('tema', '\"dark\"')");
    const before = schemaSnapshot(driver);

    const second = await runMigrations(driver);
    expect(second.applied).toEqual([]);
    expect(second.currentVersion).toBe(migrations.at(-1)?.version);
    expect(schemaSnapshot(driver)).toEqual(before);
    expect(await driver.select('SELECT value_json FROM settings')).toEqual([
      { value_json: '"dark"' },
    ]);
    driver.close();
  });

  it('recovers when a migration ran but was not recorded (app closed halfway)', async () => {
    const driver = await freshDriver();
    await runMigrations(driver);
    await driver.execute('DELETE FROM schema_migrations');
    const again = await runMigrations(driver);
    expect(again.applied).toEqual(migrations.map((m) => m.version));
    expect(tables(driver)).toEqual(EXPECTED_TABLES);
    driver.close();
  });

  it('applies only pending migrations, in order', async () => {
    const driver = await freshDriver();
    await runMigrations(driver);
    const extended: Migration[] = [
      ...migrations,
      {
        version: 100,
        name: 'add_notes',
        statements: ['CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, text TEXT)'],
      },
      {
        version: 101,
        name: 'index_notes',
        statements: ['CREATE INDEX IF NOT EXISTS idx_notes_text ON notes (text)'],
      },
    ];
    const result = await runMigrations(driver, extended);
    expect(result).toEqual({ applied: [100, 101], currentVersion: 101 });
    expect(tables(driver)).toContain('notes');
    driver.close();
  });

  it('refuses a database from a newer app version', async () => {
    const driver = await freshDriver();
    await runMigrations(driver);
    await driver.execute(
      "INSERT INTO schema_migrations (version, name, applied_at) VALUES (999, 'future', 'x')",
    );
    await expect(runMigrations(driver)).rejects.toThrow(/nyare version/);
    driver.close();
  });

  it('enforces the documented constraints', async () => {
    const driver = await freshDriver();
    await runMigrations(driver);
    await driver.execute(
      "INSERT INTO case_status (case_id, status, sim_date, started_at) VALUES ('A1', 'in_progress', '2026-03-01', 'x')",
    );
    await driver.execute(
      "INSERT INTO case_steps (case_id, step_id, answer_json) VALUES ('A1', 'S1', '1')",
    );
    await expect(
      driver.execute(
        "INSERT INTO case_steps (case_id, step_id, answer_json) VALUES ('A1', 'S1', '2')",
      ),
    ).rejects.toThrow(/UNIQUE/);
    await expect(
      driver.execute(
        "INSERT INTO answers (question_id, module_id, answered_at, correct, answer_json, mode) VALUES ('q', 'm', 'x', 2, '1', 'study')",
      ),
    ).rejects.toThrow(/CHECK/);
    await driver.execute("INSERT INTO case_state (case_id, state_json) VALUES ('A1', '{}')");
    await expect(
      driver.execute("INSERT INTO case_state (case_id, state_json) VALUES ('A1', '[]')"),
    ).rejects.toThrow(/UNIQUE|PRIMARY/);
    driver.close();
  });

  it('adds case_state to a database created by version 1, keeping its cases', async () => {
    const driver = await freshDriver();
    const [initial] = migrations;
    if (!initial) throw new Error('no migrations');
    await runMigrations(driver, [initial]);
    await driver.execute(
      "INSERT INTO case_status (case_id, status, sim_date, started_at) VALUES ('A2', 'in_progress', '2026-03-02', 'x')",
    );
    const result = await runMigrations(driver);
    expect(result.applied).toEqual([2]);
    expect(tables(driver)).toContain('case_state');
    expect(await driver.select('SELECT case_id FROM case_status')).toEqual([{ case_id: 'A2' }]);
    driver.close();
  });
});
