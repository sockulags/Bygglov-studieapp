/**
 * Versioned SQLite migrations, run in ascending order by `runMigrations` (sql-driver.ts).
 * Applied versions are recorded in `schema_migrations`.
 *
 * Rules:
 * - Never edit a released migration; add a new version instead.
 * - Every statement must be idempotent (IF NOT EXISTS etc.). The Tauri SQL plugin uses a
 *   connection pool, so a migration cannot be wrapped in one transaction; if the app is
 *   closed halfway, the next start re-runs the whole migration safely.
 * - One statement per array entry (no splitting of SQL text needed).
 * - Use $1, $2, ... placeholders elsewhere; migrations take no parameters.
 *
 * Table and column mapping to docs/05 → Datamodell (Swedish name → English name):
 *
 *   svar             → answers
 *     id, fraga_id → question_id, tidpunkt → answered_at, ratt → correct (0/1),
 *     svar_json → answer_json, svarstid_ms → response_time_ms, lage → mode
 *     added: module_id (for statistics per module without loading content),
 *            score (partial credit 0..1), session_id (→ sessions.id)
 *   repetition       → reviews
 *     fraga_id → question_id (PK), stabilitet → stability, svarighet → difficulty,
 *     nasta_datum → due_at, antal → reps, senast → last_review_at
 *     added: module_id, and the remaining ts-fsrs Card fields elapsed_days,
 *            scheduled_days, learning_steps, lapses, state
 *   pass             → sessions
 *     id, start → started_at, slut → finished_at, lage → mode,
 *     moduler_json → module_ids_json, resultat_json → result_json
 *   arende_status    → case_status
 *     arende_id → case_id (PK), status, aktuellt_steg → current_step_id,
 *     sim_datum → sim_date, startad → started_at, inlamnad → submitted_at
 *   arende_steg      → case_steps
 *     id, arende_id → case_id, steg_id → step_id, svar_json → answer_json,
 *     poang → points, klar_tidpunkt → completed_at; UNIQUE (case_id, step_id)
 *   arende_handelse  → case_events
 *     id, arende_id → case_id, handelse_id → event_id, utlost_tidpunkt → triggered_at,
 *     sim_datum → sim_date; UNIQUE (case_id, event_id)
 *     added (migration 2, table case_state, one row per case_status row):
 *            state_json (the case engine's whole CaseState), notes, reflection
 *   beslut           → decisions
 *     id, arende_id → case_id, beslut_json → decision_json, inlamnad → submitted_at,
 *     export_tidpunkt → exported_at
 *   handledar_svar   → supervisor_feedback
 *     id, beslut_id → decision_id, text, betyg → grade, tidpunkt → created_at
 *   installning      → settings
 *     nyckel → key (PK), varde → value_json
 *
 * Timestamps are ISO 8601 UTC text, simulated dates YYYY-MM-DD text, JSON as text.
 * Foreign keys are declared for documentation, but SQLite only enforces them with
 * PRAGMA foreign_keys per connection, which the plugin's pool does not guarantee. The
 * repositories therefore delete dependent rows explicitly.
 */

export interface Migration {
  version: number;
  name: string;
  statements: readonly string[];
}

export const MIGRATIONS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
)`;

export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'initial',
    statements: [
      `CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        mode TEXT NOT NULL,
        module_ids_json TEXT NOT NULL DEFAULT '[]',
        result_json TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions (started_at)`,

      `CREATE TABLE IF NOT EXISTS answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question_id TEXT NOT NULL,
        module_id TEXT NOT NULL,
        answered_at TEXT NOT NULL,
        correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
        score REAL,
        answer_json TEXT NOT NULL,
        response_time_ms INTEGER,
        mode TEXT NOT NULL,
        session_id INTEGER REFERENCES sessions (id) ON DELETE SET NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_answers_question ON answers (question_id, answered_at)`,
      `CREATE INDEX IF NOT EXISTS idx_answers_module ON answers (module_id)`,
      `CREATE INDEX IF NOT EXISTS idx_answers_session ON answers (session_id)`,

      `CREATE TABLE IF NOT EXISTS reviews (
        question_id TEXT PRIMARY KEY,
        module_id TEXT NOT NULL,
        due_at TEXT NOT NULL,
        stability REAL NOT NULL,
        difficulty REAL NOT NULL,
        elapsed_days REAL NOT NULL DEFAULT 0,
        scheduled_days REAL NOT NULL DEFAULT 0,
        learning_steps INTEGER NOT NULL DEFAULT 0,
        reps INTEGER NOT NULL DEFAULT 0,
        lapses INTEGER NOT NULL DEFAULT 0,
        state INTEGER NOT NULL DEFAULT 0,
        last_review_at TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_reviews_due ON reviews (due_at)`,
      `CREATE INDEX IF NOT EXISTS idx_reviews_module_due ON reviews (module_id, due_at)`,

      `CREATE TABLE IF NOT EXISTS case_status (
        case_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        current_step_id TEXT,
        sim_date TEXT NOT NULL,
        started_at TEXT NOT NULL,
        submitted_at TEXT
      )`,

      `CREATE TABLE IF NOT EXISTS case_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        case_id TEXT NOT NULL REFERENCES case_status (case_id) ON DELETE CASCADE,
        step_id TEXT NOT NULL,
        answer_json TEXT NOT NULL,
        points REAL,
        completed_at TEXT,
        UNIQUE (case_id, step_id)
      )`,

      `CREATE TABLE IF NOT EXISTS case_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        case_id TEXT NOT NULL REFERENCES case_status (case_id) ON DELETE CASCADE,
        event_id TEXT NOT NULL,
        triggered_at TEXT NOT NULL,
        sim_date TEXT NOT NULL,
        UNIQUE (case_id, event_id)
      )`,

      `CREATE TABLE IF NOT EXISTS decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        case_id TEXT NOT NULL REFERENCES case_status (case_id) ON DELETE CASCADE,
        decision_json TEXT NOT NULL,
        submitted_at TEXT NOT NULL,
        exported_at TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_decisions_case ON decisions (case_id)`,

      `CREATE TABLE IF NOT EXISTS supervisor_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        decision_id INTEGER NOT NULL REFERENCES decisions (id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        grade TEXT,
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_supervisor_feedback_decision ON supervisor_feedback (decision_id)`,

      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
      )`,
    ],
  },
  {
    version: 2,
    name: 'case_state',
    statements: [
      // A separate table instead of ALTER TABLE ... ADD COLUMN, which SQLite cannot make
      // idempotent. Read together with case_status through a LEFT JOIN.
      `CREATE TABLE IF NOT EXISTS case_state (
        case_id TEXT PRIMARY KEY REFERENCES case_status (case_id) ON DELETE CASCADE,
        state_json TEXT,
        notes TEXT NOT NULL DEFAULT '',
        reflection TEXT NOT NULL DEFAULT ''
      )`,
    ],
  },
];
