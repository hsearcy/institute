import type { Db } from "./db";
import type { AttemptOutcome } from "@institute/skill-engine";

type Row = {
  skill_id: string;
  correct: number;
  hinted: number;
  scaffolded: number;
  difficulty: number;
  occurred_at: string;
};

export function appendAttempt(db: Db, profileId: string, o: AttemptOutcome): void {
  db.run(
    `INSERT INTO attempt (profile_id, skill_id, correct, hinted, scaffolded, difficulty, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      profileId,
      o.skillId,
      o.correct ? 1 : 0,
      o.hinted ? 1 : 0,
      o.scaffolded ? 1 : 0,
      o.difficulty,
      o.occurredAt.toISOString(),
    ],
  );
}

export function loadRecentAttempts(db: Db, profileId: string, limit: number): AttemptOutcome[] {
  return db
    .all<Row>(
      `SELECT skill_id, correct, hinted, scaffolded, difficulty, occurred_at
       FROM attempt WHERE profile_id = ?
       ORDER BY occurred_at DESC LIMIT ?`,
      [profileId, limit],
    )
    .map((r) => ({
      skillId: r.skill_id,
      correct: !!r.correct,
      hinted: !!r.hinted,
      scaffolded: !!r.scaffolded,
      difficulty: r.difficulty,
      occurredAt: new Date(r.occurred_at),
    }));
}
