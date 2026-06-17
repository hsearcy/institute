// Data model for the meta-progression layer (M6): daily quest, gems, streak,
// cosmetics inventory. All logic that consumes these lives in engine.ts and is
// pure (dates passed in as "YYYY-MM-DD" strings) so it stays node-testable.

export type CosmeticSlot = "tutorHat" | "heroOutfit" | "pet";

export type Cosmetic = {
  id: string;
  name: string;
  slot: CosmeticSlot;
  /** Gem price in the shop. */
  cost: number;
  /** Color/style hint the 3D layer uses to render the item. */
  swatch: string;
};

export type ProfileProgress = {
  profileId: string;
  gems: number;
  streak: number;
  /** "YYYY-MM-DD" of the last day a quest was completed; null if never. */
  lastQuestDate: string | null;
  /** ISO week (e.g. "2026-W25") the weekly streak-freeze was last spent; null if available. */
  freezeUsedWeek: string | null;
};

export type QuestStatus = "active" | "complete";

export type DailyQuest = {
  profileId: string;
  /** "YYYY-MM-DD" the quest is for. */
  date: string;
  targetCount: number;
  completedCount: number;
  status: QuestStatus;
};

/** slot -> owned cosmetic id currently worn. */
export type EquippedMap = Partial<Record<CosmeticSlot, string>>;
