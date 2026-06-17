import type { Db } from "./db";
import {
  freshProgress,
  type CosmeticSlot,
  type DailyQuest,
  type EquippedMap,
  type ProfileProgress,
  type QuestStatus,
} from "@institute/progression";

type ProgressRow = {
  profile_id: string;
  gems: number;
  streak: number;
  last_quest_date: string | null;
  freeze_used_week: string | null;
};

type QuestRow = {
  profile_id: string;
  date: string;
  target_count: number;
  completed_count: number;
  status: string;
};

export function loadProgress(db: Db, profileId: string): ProfileProgress {
  const row = db.get<ProgressRow>(
    `SELECT * FROM profile_progress WHERE profile_id = ?`,
    [profileId],
  );
  if (!row) return freshProgress(profileId);
  return {
    profileId: row.profile_id,
    gems: row.gems,
    streak: row.streak,
    lastQuestDate: row.last_quest_date ?? null,
    freezeUsedWeek: row.freeze_used_week ?? null,
  };
}

export function saveProgress(db: Db, p: ProfileProgress): void {
  db.run(
    `INSERT INTO profile_progress (
       profile_id, gems, streak, last_quest_date, freeze_used_week
     ) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(profile_id) DO UPDATE SET
       gems = excluded.gems,
       streak = excluded.streak,
       last_quest_date = excluded.last_quest_date,
       freeze_used_week = excluded.freeze_used_week`,
    [p.profileId, p.gems, p.streak, p.lastQuestDate, p.freezeUsedWeek],
  );
}

export function loadQuest(db: Db, profileId: string, date: string): DailyQuest | undefined {
  const row = db.get<QuestRow>(
    `SELECT * FROM daily_quest WHERE profile_id = ? AND date = ?`,
    [profileId, date],
  );
  if (!row) return undefined;
  return {
    profileId: row.profile_id,
    date: row.date,
    targetCount: row.target_count,
    completedCount: row.completed_count,
    status: row.status as QuestStatus,
  };
}

export function saveQuest(db: Db, q: DailyQuest): void {
  db.run(
    `INSERT INTO daily_quest (
       profile_id, date, target_count, completed_count, status
     ) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(profile_id, date) DO UPDATE SET
       target_count = excluded.target_count,
       completed_count = excluded.completed_count,
       status = excluded.status`,
    [q.profileId, q.date, q.targetCount, q.completedCount, q.status],
  );
}

export function loadInventory(db: Db, profileId: string): string[] {
  return db
    .all<{ item_id: string }>(
      `SELECT item_id FROM inventory WHERE profile_id = ?`,
      [profileId],
    )
    .map((r) => r.item_id);
}

export function addInventory(db: Db, profileId: string, itemId: string): void {
  db.run(
    `INSERT OR IGNORE INTO inventory (profile_id, item_id) VALUES (?, ?)`,
    [profileId, itemId],
  );
}

export function loadEquipped(db: Db, profileId: string): EquippedMap {
  const rows = db.all<{ slot: string; item_id: string }>(
    `SELECT slot, item_id FROM equipped WHERE profile_id = ?`,
    [profileId],
  );
  const equipped: EquippedMap = {};
  for (const row of rows) equipped[row.slot as CosmeticSlot] = row.item_id;
  return equipped;
}

export function saveEquipped(
  db: Db,
  profileId: string,
  slot: CosmeticSlot,
  itemId: string,
): void {
  db.run(
    `INSERT INTO equipped (profile_id, slot, item_id) VALUES (?, ?, ?)
     ON CONFLICT(profile_id, slot) DO UPDATE SET
       item_id = excluded.item_id`,
    [profileId, slot, itemId],
  );
}
