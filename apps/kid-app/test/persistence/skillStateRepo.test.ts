import { describe, test, expect, beforeEach } from "vitest";
import { migrate, type Db } from "../../src/persistence/db";
import { inMemoryDb } from "./inMemoryDb";
import { saveSkillState, loadSkillState, loadAllSkillStates } from "../../src/persistence/skillStateRepo";
import { initialSkillState } from "@institute/skill-engine";

let db: Db;
beforeEach(() => {
  db = inMemoryDb();
  migrate(db);
});

describe("skillStateRepo", () => {
  test("loadSkillState returns undefined when nothing saved", () => {
    expect(loadSkillState(db, "sam", "skip_count_2")).toBeUndefined();
  });

  test("save then load round-trips", () => {
    const s = initialSkillState("sam", "skip_count_2");
    saveSkillState(db, s);
    const loaded = loadSkillState(db, "sam", "skip_count_2");
    expect(loaded).toBeDefined();
    expect(loaded!.skillId).toBe("skip_count_2");
    expect(loaded!.profileId).toBe("sam");
    expect(loaded!.state).toBe("unstarted");
  });

  test("save is idempotent (UPSERT semantics)", () => {
    const s = initialSkillState("sam", "skip_count_2");
    saveSkillState(db, s);
    saveSkillState(db, { ...s, attempts: 5, correct: 4 });
    const loaded = loadSkillState(db, "sam", "skip_count_2")!;
    expect(loaded.attempts).toBe(5);
    expect(loaded.correct).toBe(4);
  });

  test("recentWindow round-trips through JSON column", () => {
    const s = initialSkillState("sam", "skip_count_2");
    s.recentWindow = [
      { skillId: "skip_count_2", correct: true, hinted: false, scaffolded: false, difficulty: 0.4, occurredAt: new Date("2026-04-26T12:00:00Z") },
    ];
    saveSkillState(db, s);
    const loaded = loadSkillState(db, "sam", "skip_count_2")!;
    expect(loaded.recentWindow).toHaveLength(1);
    expect(loaded.recentWindow[0]!.correct).toBe(true);
    expect(loaded.recentWindow[0]!.occurredAt).toBeInstanceOf(Date);
    expect(loaded.recentWindow[0]!.occurredAt.toISOString()).toBe("2026-04-26T12:00:00.000Z");
  });

  test("nextReviewAt round-trips (Date or null)", () => {
    const s = initialSkillState("sam", "skip_count_2");
    s.nextReviewAt = new Date("2026-04-27T00:00:00Z");
    saveSkillState(db, s);
    expect(loadSkillState(db, "sam", "skip_count_2")!.nextReviewAt!.toISOString()).toBe("2026-04-27T00:00:00.000Z");

    saveSkillState(db, { ...s, nextReviewAt: null });
    expect(loadSkillState(db, "sam", "skip_count_2")!.nextReviewAt).toBeNull();
  });

  test("loadAllSkillStates returns rows for one profile only", () => {
    saveSkillState(db, initialSkillState("sam", "skip_count_2"));
    saveSkillState(db, initialSkillState("sam", "add_within_5"));
    saveSkillState(db, initialSkillState("alex", "skip_count_2"));
    expect(loadAllSkillStates(db, "sam")).toHaveLength(2);
    expect(loadAllSkillStates(db, "alex")).toHaveLength(1);
  });
});
