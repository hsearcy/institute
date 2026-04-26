import type { Db } from "./db";
import type { AttemptOutcome, MasteryState, SkillId, SkillState } from "@institute/skill-engine";

type Row = {
  profile_id: string;
  skill_id: string;
  state: string;
  attempts: number;
  correct: number;
  recent_window_json: string;
  current_difficulty: number;
  srs_interval_days: number;
  srs_ease: number;
  next_review_at: string | null;
  updated_at: string;
};

function rowToState(row: Row): SkillState {
  const window: AttemptOutcome[] = JSON.parse(row.recent_window_json).map(
    (o: Omit<AttemptOutcome, "occurredAt"> & { occurredAt: string }) => ({
      ...o,
      occurredAt: new Date(o.occurredAt),
    }),
  );
  return {
    profileId: row.profile_id,
    skillId: row.skill_id,
    state: row.state as MasteryState,
    attempts: row.attempts,
    correct: row.correct,
    recentWindow: window,
    currentDifficulty: row.current_difficulty,
    srsInterval: row.srs_interval_days,
    srsEase: row.srs_ease,
    nextReviewAt: row.next_review_at ? new Date(row.next_review_at) : null,
    updatedAt: new Date(row.updated_at),
  };
}

export function loadSkillState(db: Db, profileId: string, skillId: SkillId): SkillState | undefined {
  const row = db.get<Row>(
    `SELECT * FROM skill_state WHERE profile_id = ? AND skill_id = ?`,
    [profileId, skillId],
  );
  return row ? rowToState(row) : undefined;
}

export function loadAllSkillStates(db: Db, profileId: string): SkillState[] {
  return db
    .all<Row>(`SELECT * FROM skill_state WHERE profile_id = ?`, [profileId])
    .map(rowToState);
}

export function saveSkillState(db: Db, s: SkillState): void {
  db.run(
    `INSERT INTO skill_state (
       profile_id, skill_id, state, attempts, correct, recent_window_json,
       current_difficulty, srs_interval_days, srs_ease, next_review_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(profile_id, skill_id) DO UPDATE SET
       state = excluded.state,
       attempts = excluded.attempts,
       correct = excluded.correct,
       recent_window_json = excluded.recent_window_json,
       current_difficulty = excluded.current_difficulty,
       srs_interval_days = excluded.srs_interval_days,
       srs_ease = excluded.srs_ease,
       next_review_at = excluded.next_review_at,
       updated_at = excluded.updated_at`,
    [
      s.profileId,
      s.skillId,
      s.state,
      s.attempts,
      s.correct,
      JSON.stringify(
        s.recentWindow.map((o) => ({ ...o, occurredAt: o.occurredAt.toISOString() })),
      ),
      s.currentDifficulty,
      s.srsInterval,
      s.srsEase,
      s.nextReviewAt?.toISOString() ?? null,
      s.updatedAt.toISOString(),
    ],
  );
}
