import { test, expect, describe } from "vitest";
import {
  todayYmd,
  isoWeek,
  dayGap,
  freshProgress,
  generateQuest,
  awardRoundGems,
  recordRoundOnQuest,
  applyQuestCompletion,
  applyRound,
  purchase,
  isOwned,
  canAfford,
  equip,
} from "../src/engine.ts";
import type { ProfileProgress } from "../src/types.ts";
import {
  STARTING_GEMS,
  QUEST_TARGET,
  GEMS_PER_CORRECT,
  GEMS_QUEST_BONUS,
} from "../src/constants.ts";

describe("date helpers", () => {
  test("todayYmd formats local date with zero-padding", () => {
    expect(todayYmd(new Date(2026, 0, 3))).toBe("2026-01-03");
    expect(todayYmd(new Date(2026, 11, 25))).toBe("2026-12-25");
  });

  test("dayGap counts whole calendar days, DST-safe", () => {
    expect(dayGap("2026-06-15", "2026-06-16")).toBe(1);
    expect(dayGap("2026-06-15", "2026-06-15")).toBe(0);
    expect(dayGap("2026-06-15", "2026-06-17")).toBe(2);
    // Across a US spring-forward boundary (2026-03-08).
    expect(dayGap("2026-03-07", "2026-03-09")).toBe(2);
  });

  test("isoWeek labels the ISO week", () => {
    expect(isoWeek("2026-06-17")).toBe("2026-W25");
    // 2026-01-01 is a Thursday → ISO week 1 of 2026.
    expect(isoWeek("2026-01-01")).toBe("2026-W01");
  });
});

describe("freshProgress / generateQuest", () => {
  test("freshProgress seeds starting gems and empty streak state", () => {
    expect(freshProgress("p1")).toEqual({
      profileId: "p1",
      gems: STARTING_GEMS,
      streak: 0,
      lastQuestDate: null,
      freezeUsedWeek: null,
    });
  });

  test("generateQuest produces an active quest for the day", () => {
    expect(generateQuest("p1", "2026-06-17")).toEqual({
      profileId: "p1",
      date: "2026-06-17",
      targetCount: QUEST_TARGET,
      completedCount: 0,
      status: "active",
    });
  });
});

describe("quest gem math", () => {
  test("awardRoundGems is gems-per-correct times count", () => {
    expect(awardRoundGems(0)).toBe(0);
    expect(awardRoundGems(3)).toBe(GEMS_PER_CORRECT * 3);
  });

  test("recordRoundOnQuest advances and caps at target without mutating", () => {
    const q = generateQuest("p1", "2026-06-17");
    const q1 = recordRoundOnQuest(q, 2);
    expect(q1.completedCount).toBe(2);
    expect(q1.status).toBe("active");
    expect(q.completedCount).toBe(0); // input untouched

    const q2 = recordRoundOnQuest(q1, 10); // overshoots target
    expect(q2.completedCount).toBe(QUEST_TARGET);
    expect(q2.status).toBe("complete");
  });

  test("recordRoundOnQuest marks complete exactly at target", () => {
    const q = generateQuest("p1", "2026-06-17");
    const done = recordRoundOnQuest(q, QUEST_TARGET);
    expect(done.completedCount).toBe(QUEST_TARGET);
    expect(done.status).toBe("complete");
  });
});

describe("applyQuestCompletion streak logic", () => {
  const base = (over: Partial<ProfileProgress> = {}): ProfileProgress => ({
    ...freshProgress("p1"),
    ...over,
  });

  test("first ever completion sets streak to 1 and adds bonus", () => {
    const p = applyQuestCompletion(base(), "2026-06-17");
    expect(p.streak).toBe(1);
    expect(p.gems).toBe(STARTING_GEMS + GEMS_QUEST_BONUS);
    expect(p.lastQuestDate).toBe("2026-06-17");
  });

  test("consecutive day advances the streak", () => {
    const p = applyQuestCompletion(
      base({ streak: 3, lastQuestDate: "2026-06-16" }),
      "2026-06-17",
    );
    expect(p.streak).toBe(4);
    expect(p.lastQuestDate).toBe("2026-06-17");
  });

  test("same-day completion is not double-credited", () => {
    const yesterday = applyQuestCompletion(
      base({ streak: 3, lastQuestDate: "2026-06-16" }),
      "2026-06-17",
    );
    const again = applyQuestCompletion(yesterday, "2026-06-17");
    expect(again).toBe(yesterday); // unchanged reference
    expect(again.streak).toBe(4);
    expect(again.gems).toBe(yesterday.gems);
  });

  test("one missed day spends the weekly freeze and keeps the streak", () => {
    // last on the 15th, complete on the 17th → gap 2 → freeze.
    const p = applyQuestCompletion(
      base({ streak: 5, lastQuestDate: "2026-06-15" }),
      "2026-06-17",
    );
    expect(p.streak).toBe(6);
    expect(p.freezeUsedWeek).toBe(isoWeek("2026-06-17"));
  });

  test("freeze already used this week → streak resets", () => {
    const p = applyQuestCompletion(
      base({
        streak: 5,
        lastQuestDate: "2026-06-15",
        freezeUsedWeek: isoWeek("2026-06-17"),
      }),
      "2026-06-17",
    );
    expect(p.streak).toBe(1);
    expect(p.freezeUsedWeek).toBe(isoWeek("2026-06-17"));
  });

  test("two or more missed days resets even with freeze available", () => {
    // last on the 14th, complete on the 17th → gap 3 → no freeze, reset.
    const p = applyQuestCompletion(
      base({ streak: 5, lastQuestDate: "2026-06-14" }),
      "2026-06-17",
    );
    expect(p.streak).toBe(1);
    expect(p.freezeUsedWeek).toBeNull();
  });
});

describe("applyRound integration", () => {
  test("partial progress awards round gems only, no completion", () => {
    const p = freshProgress("p1");
    const q = generateQuest("p1", "2026-06-17");
    const r = applyRound(p, q, 2, "2026-06-17");
    expect(r.questJustCompleted).toBe(false);
    expect(r.gemsAwarded).toBe(awardRoundGems(2));
    expect(r.progress.gems).toBe(STARTING_GEMS + awardRoundGems(2));
    expect(r.quest.completedCount).toBe(2);
    expect(r.progress.streak).toBe(0); // not credited yet
  });

  test("completing the quest adds bonus and advances streak once", () => {
    const p = freshProgress("p1");
    const q = generateQuest("p1", "2026-06-17");
    const r = applyRound(p, q, QUEST_TARGET, "2026-06-17");
    expect(r.questJustCompleted).toBe(true);
    expect(r.gemsAwarded).toBe(awardRoundGems(QUEST_TARGET) + GEMS_QUEST_BONUS);
    expect(r.progress.gems).toBe(
      STARTING_GEMS + awardRoundGems(QUEST_TARGET) + GEMS_QUEST_BONUS,
    );
    expect(r.progress.streak).toBe(1);
    expect(r.quest.status).toBe("complete");
  });

  test("a round on an already-complete quest does not re-credit the bonus", () => {
    const p = freshProgress("p1");
    const q = generateQuest("p1", "2026-06-17");
    const first = applyRound(p, q, QUEST_TARGET, "2026-06-17");
    const second = applyRound(first.progress, first.quest, 1, "2026-06-17");
    expect(second.questJustCompleted).toBe(false);
    expect(second.gemsAwarded).toBe(awardRoundGems(1)); // round gems only
    expect(second.progress.streak).toBe(1);
  });
});

describe("shop: purchase / isOwned / canAfford", () => {
  test("isOwned reflects the inventory", () => {
    expect(isOwned(["hat_party"], "hat_party")).toBe(true);
    expect(isOwned([], "hat_party")).toBe(false);
  });

  test("canAfford compares gems to cost; false for unknown item", () => {
    const rich: ProfileProgress = { ...freshProgress("p1"), gems: 50 };
    expect(canAfford(rich, "hat_party")).toBe(true); // cost 12
    expect(canAfford(freshProgress("p1"), "hat_crown")).toBe(false); // cost 50, gems 10
    expect(canAfford(rich, "nope")).toBe(false);
  });

  test("successful purchase deducts gems and appends item, no mutation", () => {
    const p: ProfileProgress = { ...freshProgress("p1"), gems: 30 };
    const owned: string[] = [];
    const res = purchase(p, owned, "hat_party"); // cost 12
    expect(res).not.toBeNull();
    expect(res!.progress.gems).toBe(18);
    expect(res!.owned).toEqual(["hat_party"]);
    expect(owned).toEqual([]); // input untouched
    expect(p.gems).toBe(30);
  });

  test("purchase returns null when unaffordable", () => {
    const p = freshProgress("p1"); // 10 gems
    expect(purchase(p, [], "hat_crown")).toBeNull(); // cost 50
  });

  test("purchase returns null when already owned", () => {
    const p: ProfileProgress = { ...freshProgress("p1"), gems: 99 };
    expect(purchase(p, ["hat_party"], "hat_party")).toBeNull();
  });

  test("purchase returns null for unknown item", () => {
    const p: ProfileProgress = { ...freshProgress("p1"), gems: 99 };
    expect(purchase(p, [], "nope")).toBeNull();
  });
});

describe("equip", () => {
  test("places the item into its catalog slot", () => {
    expect(equip({}, "hat_wizard")).toEqual({ tutorHat: "hat_wizard" });
    expect(equip({ tutorHat: "hat_party" }, "hero_teal")).toEqual({
      tutorHat: "hat_party",
      heroOutfit: "hero_teal",
    });
  });

  test("equipping a same-slot item replaces it", () => {
    expect(equip({ tutorHat: "hat_party" }, "hat_crown")).toEqual({
      tutorHat: "hat_crown",
    });
  });

  test("unknown item leaves the map unchanged", () => {
    const m = { pet: "pet_slime" };
    expect(equip(m, "nope")).toEqual(m);
  });
});
