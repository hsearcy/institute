/**
 * Minimal SQL interface our repos use. Two implementations:
 *   - Production: thin wrapper around expo-sqlite (apps/kid-app uses this)
 *   - Tests: thin wrapper around better-sqlite3 (in-memory)
 *
 * Why not import expo-sqlite directly: expo-sqlite has no Node runtime, so
 * Vitest tests would die at import time. The Db interface keeps the repos
 * Node-testable.
 */
export type SqlRow = Record<string, unknown>;

export interface Db {
  exec(sql: string): void; // multi-statement DDL
  run(sql: string, params?: unknown[]): void; // INSERT/UPDATE/DELETE
  all<T = SqlRow>(sql: string, params?: unknown[]): T[]; // SELECT
  get<T = SqlRow>(sql: string, params?: unknown[]): T | undefined; // SELECT … LIMIT 1
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS skill_state (
  profile_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  state TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  recent_window_json TEXT NOT NULL,
  current_difficulty REAL NOT NULL,
  srs_interval_days INTEGER NOT NULL,
  srs_ease REAL NOT NULL,
  next_review_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, skill_id)
);

CREATE TABLE IF NOT EXISTS attempt (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  correct INTEGER NOT NULL,
  hinted INTEGER NOT NULL,
  scaffolded INTEGER NOT NULL,
  difficulty REAL NOT NULL,
  occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS attempt_profile_occurred ON attempt(profile_id, occurred_at DESC);
`;

const SCHEMA_VERSION = 1;

/** Apply schema. Drops and recreates if version mismatch (dev-only data loss is fine). */
export function migrate(db: Db): void {
  db.exec(SCHEMA);
  const row = db.get<{ version?: number }>("SELECT version FROM schema_version LIMIT 1");
  const current = row?.version;
  if (current === undefined) {
    db.run("INSERT INTO schema_version (version) VALUES (?)", [SCHEMA_VERSION]);
    return;
  }
  if (current !== SCHEMA_VERSION) {
    db.exec("DROP TABLE skill_state; DROP TABLE attempt; DROP TABLE schema_version;");
    migrate(db);
  }
}

/**
 * Production adapter using expo-sqlite.
 *
 * `openDatabaseSync` (not Async) is used because the sync `execSync` /
 * `runSync` / `getFirstSync` / `getAllSync` family NPEs on Android when
 * called against a connection opened with `openDatabaseAsync`. Sync
 * methods need a sync-opened handle.
 *
 * NOTE: opening the SAME database twice in one process invalidates the
 * first handle (subsequent prepareSync/execSync NPE on the stale conn).
 * Always go through `getDb()` below — never call `openExpoDb` directly.
 */
export async function openExpoDb(name = "institute.db"): Promise<Db> {
  const sqlite = await import("expo-sqlite");
  const conn = sqlite.openDatabaseSync(name);
  type BindParams = Parameters<typeof conn.runSync>[1];
  return {
    exec(sql) {
      conn.execSync(sql);
    },
    run(sql, params = []) {
      conn.runSync(sql, params as unknown as BindParams);
    },
    all<T = SqlRow>(sql: string, params: unknown[] = []) {
      return conn.getAllSync<T>(sql, params as unknown as BindParams);
    },
    get<T = SqlRow>(sql: string, params: unknown[] = []) {
      return (conn.getFirstSync<T>(sql, params as unknown as BindParams) ?? undefined) as T | undefined;
    },
  };
}

let _dbPromise: Promise<Db> | null = null;

/**
 * The single shared, migrated Db instance for the kid-app. Idempotent —
 * subsequent calls return the same connection. Use this everywhere instead
 * of openExpoDb() to avoid multiple native handles to the same file.
 */
export function getDb(): Promise<Db> {
  if (!_dbPromise) {
    _dbPromise = (async () => {
      const db = await openExpoDb();
      migrate(db);
      return db;
    })();
  }
  return _dbPromise;
}
