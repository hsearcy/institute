// The problems the tutor served, by id. A chest's story (and the forge dust it
// promises) is recomputed from this record, never from what a client says the
// problem was. Additive table; rows older than two days are pruned on write.
import type { Database } from "bun:sqlite";

export interface ServedProblem { prompt: string; answer: number; topicId: string | null }

const KEEP_MS = 2 * 24 * 60 * 60 * 1000;

export function ensureServedSchema(db: Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS served_problems (
    profile_id TEXT NOT NULL,
    problem_id TEXT NOT NULL,
    prompt TEXT NOT NULL,
    answer INTEGER NOT NULL,
    topic_id TEXT,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (profile_id, problem_id)
  )`);
}

export function rememberServed(db: Database, profileId: string,
  problems: { id: string; prompt: string; answer: number; topicId?: string | null }[]): void {
  ensureServedSchema(db);
  const now = Date.now();
  const insert = db.query(`INSERT OR IGNORE INTO served_problems (profile_id, problem_id, prompt, answer, topic_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`);
  db.transaction(() => {
    for (const p of problems) insert.run(profileId, p.id, p.prompt, p.answer, p.topicId ?? null, now);
    db.query("DELETE FROM served_problems WHERE created_at < ?").run(now - KEEP_MS);
  })();
}

export function servedProblem(db: Database, profileId: string, problemId: string): ServedProblem | null {
  ensureServedSchema(db);
  const row = db.query("SELECT prompt, answer, topic_id FROM served_problems WHERE profile_id = ? AND problem_id = ?")
    .get(profileId, problemId) as { prompt: string; answer: number; topic_id: string | null } | null;
  return row ? { prompt: row.prompt, answer: row.answer, topicId: row.topic_id } : null;
}
