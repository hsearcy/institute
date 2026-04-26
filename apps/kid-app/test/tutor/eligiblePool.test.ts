import { describe, test, expect, beforeEach } from "vitest";
import { migrate, type Db } from "../../src/persistence/db";
import { inMemoryDb } from "../persistence/inMemoryDb";
import { saveSkillState } from "../../src/persistence/skillStateRepo";
import { initialSkillState } from "@institute/skill-engine";
import { computeEligiblePool } from "../../src/tutor/eligiblePool";

let db: Db;
beforeEach(() => {
  db = inMemoryDb();
  migrate(db);
});

describe("computeEligiblePool", () => {
  test("seeds a stretch skill when profile has zero rows", () => {
    const pool = computeEligiblePool(db, "sam", new Date("2026-04-26T12:00:00Z"));
    expect(pool.length).toBeGreaterThan(0);
    expect(pool[0]!.description).toBeTruthy();
    expect(pool[0]!.skillId).toBeTruthy();
  });

  test("includes practicing skills", () => {
    const s = initialSkillState("sam", "skip_count_2");
    s.state = "practicing";
    s.attempts = 5;
    s.correct = 4;
    saveSkillState(db, s);

    const pool = computeEligiblePool(db, "sam", new Date());
    const ids = pool.map((p) => p.skillId);
    expect(ids).toContain("skip_count_2");
  });

  test("each entry includes mastery context fields", () => {
    const s = initialSkillState("sam", "skip_count_2");
    s.state = "practicing";
    s.attempts = 12;
    s.correct = 9;
    s.currentDifficulty = 0.4;
    saveSkillState(db, s);

    const pool = computeEligiblePool(db, "sam", new Date());
    const entry = pool.find((p) => p.skillId === "skip_count_2")!;
    expect(entry.masteryState).toBe("practicing");
    expect(entry.attempts).toBe(12);
    expect(entry.correct).toBe(9);
    expect(entry.currentDifficulty).toBeCloseTo(0.4);
  });

  test("caps pool size to 6", () => {
    const ids = ["counting_1_5", "counting_1_10", "counting_1_20", "skip_count_2", "skip_count_5", "skip_count_10", "add_within_5", "sub_within_5", "add_within_10", "sub_within_10"];
    for (const id of ids) {
      const s = initialSkillState("sam", id);
      s.state = "practicing";
      saveSkillState(db, s);
    }
    const pool = computeEligiblePool(db, "sam", new Date());
    expect(pool.length).toBeLessThanOrEqual(6);
  });
});
