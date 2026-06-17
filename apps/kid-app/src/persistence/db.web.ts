/**
 * Web persistence adapter (Metro resolves `db.web.ts` over `db.ts` for
 * platform=web; native keeps using expo-sqlite untouched).
 *
 * Why not expo-sqlite on web: its web build drives wa-sqlite through a Worker
 * and needs SharedArrayBuffer (cross-origin isolation). Expo Router's dev
 * server serves the HTML document outside Metro's middleware, so it can't set
 * the COOP/COEP headers that isolation requires. Instead we back the same sync
 * `Db` interface with sql.js — SQLite compiled to wasm, running synchronously
 * on the main thread (no Worker, no SharedArrayBuffer).
 *
 * The DB lives in memory and is mirrored to localStorage after each write so a
 * profile's progress survives a page reload, matching on-device behavior.
 */
import type { Database, SqlJsStatic } from "sql.js";
import { Asset } from "expo-asset";

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

CREATE TABLE IF NOT EXISTS profile_progress (
  profile_id TEXT PRIMARY KEY,
  gems INTEGER NOT NULL,
  streak INTEGER NOT NULL,
  last_quest_date TEXT,
  freeze_used_week TEXT
);

CREATE TABLE IF NOT EXISTS daily_quest (
  profile_id TEXT NOT NULL,
  date TEXT NOT NULL,
  target_count INTEGER NOT NULL,
  completed_count INTEGER NOT NULL,
  status TEXT NOT NULL,
  PRIMARY KEY (profile_id, date)
);

CREATE TABLE IF NOT EXISTS inventory (
  profile_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  PRIMARY KEY (profile_id, item_id)
);

CREATE TABLE IF NOT EXISTS equipped (
  profile_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  item_id TEXT NOT NULL,
  PRIMARY KEY (profile_id, slot)
);
`;

const SCHEMA_VERSION = 2;

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
    db.exec(
      "DROP TABLE skill_state; DROP TABLE attempt; DROP TABLE profile_progress; DROP TABLE daily_quest; DROP TABLE inventory; DROP TABLE equipped; DROP TABLE schema_version;",
    );
    migrate(db);
  }
}

const STORAGE_KEY = "institute.db.v1";

function loadBytes(): Uint8Array | undefined {
  try {
    const b64 = localStorage.getItem(STORAGE_KEY);
    if (!b64) return undefined;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return undefined;
  }
}

function persist(database: Database): void {
  try {
    const bytes = database.export();
    let bin = "";
    for (const byte of bytes) bin += String.fromCharCode(byte);
    localStorage.setItem(STORAGE_KEY, btoa(bin));
  } catch {
    // Quota / private-mode failures are non-fatal: persistence is best-effort.
  }
}

function wrap(database: Database): Db {
  return {
    exec(sql) {
      database.run(sql);
      persist(database);
    },
    run(sql, params = []) {
      database.run(sql, params as never);
      persist(database);
    },
    all<T = SqlRow>(sql: string, params: unknown[] = []) {
      const stmt = database.prepare(sql);
      stmt.bind(params as never);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      stmt.free();
      return rows;
    },
    get<T = SqlRow>(sql: string, params: unknown[] = []) {
      const stmt = database.prepare(sql);
      stmt.bind(params as never);
      const row = stmt.step() ? (stmt.getAsObject() as T) : undefined;
      stmt.free();
      return row;
    },
  };
}

let _dbPromise: Promise<Db> | null = null;

/** The single shared, migrated Db instance for the kid-app (web). Idempotent. */
export function getDb(): Promise<Db> {
  if (!_dbPromise) {
    _dbPromise = (async () => {
      // Force the classic UMD build (drives wasm via `locateFile`); the package
      // "browser" condition resolves to a different build + wasm filename.
      const initSqlJs = require("sql.js/dist/sql-wasm.js") as (
        config?: { locateFile?: (file: string) => string },
      ) => Promise<SqlJsStatic>;
      // Bundled wasm asset → served URL (see `wasm` in metro.config assetExts).
      const wasmUri = Asset.fromModule(require("sql.js/dist/sql-wasm.wasm")).uri;
      const SQL = await initSqlJs({ locateFile: () => wasmUri });

      const saved = loadBytes();
      const database = saved ? new SQL.Database(saved) : new SQL.Database();
      const db = wrap(database);
      migrate(db);
      return db;
    })();
  }
  return _dbPromise;
}
