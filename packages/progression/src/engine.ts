// Pure, deterministic meta-progression logic (M6). Dates flow in as
// "YYYY-MM-DD" strings so everything is node-testable; the only place a real
// Date is read is todayYmd().

import type { ProfileProgress, DailyQuest, EquippedMap } from "./types.ts";
import {
  STARTING_GEMS,
  QUEST_TARGET,
  GEMS_PER_CORRECT,
  GEMS_QUEST_BONUS,
} from "./constants.ts";
import { cosmeticById } from "./catalog.ts";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Local-time "YYYY-MM-DD" for a Date. */
export function todayYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Parse a "YYYY-MM-DD" string as UTC midnight (avoids DST drift in day math). */
function parseUtc(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * ISO 8601 week label, e.g. "2026-W25". The ISO week year can differ from the
 * calendar year near January/December, so we compute both from the Thursday of
 * the same week.
 */
export function isoWeek(ymd: string): string {
  const date = parseUtc(ymd);
  // Shift to the Thursday in the current ISO week (ISO weekday: Mon=1..Sun=7).
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / MS_PER_DAY + 1) / 7);
  return `${isoYear}-W${pad2(week)}`;
}

/** Whole calendar days from→to (parsed as UTC midnight). */
export function dayGap(fromYmd: string, toYmd: string): number {
  return Math.round((parseUtc(toYmd).getTime() - parseUtc(fromYmd).getTime()) / MS_PER_DAY);
}

export function freshProgress(profileId: string): ProfileProgress {
  return {
    profileId,
    gems: STARTING_GEMS,
    streak: 0,
    lastQuestDate: null,
    freezeUsedWeek: null,
  };
}

export function generateQuest(profileId: string, today: string): DailyQuest {
  return {
    profileId,
    date: today,
    targetCount: QUEST_TARGET,
    completedCount: 0,
    status: "active",
  };
}

export function awardRoundGems(correctCount: number): number {
  return GEMS_PER_CORRECT * correctCount;
}

/** New quest with completedCount advanced (capped) and status updated. */
export function recordRoundOnQuest(quest: DailyQuest, correctCount: number): DailyQuest {
  const completedCount = Math.min(quest.completedCount + correctCount, quest.targetCount);
  return {
    ...quest,
    completedCount,
    status: completedCount >= quest.targetCount ? "complete" : quest.status,
  };
}

/**
 * Credit a completed quest: add the bonus gems and advance the streak with
 * weekly-freeze logic. Idempotent for a given day (no double credit).
 */
export function applyQuestCompletion(
  progress: ProfileProgress,
  today: string,
): ProfileProgress {
  if (progress.lastQuestDate === today) {
    return progress;
  }

  let streak: number;
  let freezeUsedWeek = progress.freezeUsedWeek;

  if (progress.lastQuestDate === null) {
    streak = 1;
  } else {
    const gap = dayGap(progress.lastQuestDate, today);
    if (gap === 1) {
      streak = progress.streak + 1;
    } else if (gap === 2 && progress.freezeUsedWeek !== isoWeek(today)) {
      // Missed exactly one day and the weekly freeze is available: spend it.
      streak = progress.streak + 1;
      freezeUsedWeek = isoWeek(today);
    } else {
      streak = 1;
    }
  }

  return {
    ...progress,
    gems: progress.gems + GEMS_QUEST_BONUS,
    streak,
    lastQuestDate: today,
    freezeUsedWeek,
  };
}

export type RoundProgressResult = {
  progress: ProfileProgress;
  quest: DailyQuest;
  gemsAwarded: number;
  questJustCompleted: boolean;
};

/** Integration entry point: award round gems + advance quest + (maybe) credit. */
export function applyRound(
  progress: ProfileProgress,
  quest: DailyQuest,
  correctCount: number,
  today: string,
): RoundProgressResult {
  const roundGems = awardRoundGems(correctCount);
  const nextQuest = recordRoundOnQuest(quest, correctCount);
  const questJustCompleted = quest.status === "active" && nextQuest.status === "complete";

  let nextProgress: ProfileProgress = {
    ...progress,
    gems: progress.gems + roundGems,
  };

  if (questJustCompleted) {
    nextProgress = applyQuestCompletion(nextProgress, today);
  }

  return {
    progress: nextProgress,
    quest: nextQuest,
    gemsAwarded: roundGems + (questJustCompleted ? GEMS_QUEST_BONUS : 0),
    questJustCompleted,
  };
}

export function isOwned(owned: string[], itemId: string): boolean {
  return owned.includes(itemId);
}

export function canAfford(progress: ProfileProgress, itemId: string): boolean {
  const item = cosmeticById(itemId);
  return item !== undefined && progress.gems >= item.cost;
}

/** Buy a cosmetic. null if unknown / already owned / unaffordable. */
export function purchase(
  progress: ProfileProgress,
  owned: string[],
  itemId: string,
): { progress: ProfileProgress; owned: string[] } | null {
  const item = cosmeticById(itemId);
  if (item === undefined || isOwned(owned, itemId) || progress.gems < item.cost) {
    return null;
  }
  return {
    progress: { ...progress, gems: progress.gems - item.cost },
    owned: [...owned, itemId],
  };
}

/** Equip a cosmetic into its slot. Unknown items leave the map unchanged. */
export function equip(equipped: EquippedMap, itemId: string): EquippedMap {
  const item = cosmeticById(itemId);
  if (item === undefined) {
    return equipped;
  }
  return { ...equipped, [item.slot]: itemId };
}
