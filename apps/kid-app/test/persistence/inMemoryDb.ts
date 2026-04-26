import Database from "better-sqlite3";
import type { Db } from "../../src/persistence/db";

export function inMemoryDb(): Db {
  const db = new Database(":memory:");
  return {
    exec: (sql) => {
      db.exec(sql);
    },
    run: (sql, params = []) => {
      db.prepare(sql).run(...params);
    },
    all: <T,>(sql: string, params: unknown[] = []) =>
      db.prepare(sql).all(...params) as T[],
    get: <T,>(sql: string, params: unknown[] = []) =>
      db.prepare(sql).get(...params) as T | undefined,
  };
}
