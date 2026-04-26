import { test, expect, describe } from "vitest";
import { eligiblePool, DEFAULT_POOL_SIZE } from "../src/pool.ts";
import { initialSkillState } from "../src/mastery.ts";
import { TAXONOMY } from "../src/skills.ts";
import type { SkillState } from "../src/types.ts";

const now = new Date("2026-04-25T10:00:00Z");

function profileWithStates(overrides: Record<string, Partial<SkillState>>): SkillState[] {
  return TAXONOMY.map((s) => ({
    ...initialSkillState("p1", s.id),
    ...(overrides[s.id] ?? {}),
  }));
}

describe("eligiblePool", () => {
  test("for a brand-new profile, returns the easiest no-prereq skill as the stretch", () => {
    const states = profileWithStates({});
    const pool = eligiblePool(states, TAXONOMY, now);
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.length).toBeLessThanOrEqual(DEFAULT_POOL_SIZE);
    // Counting/recognize/shape/pattern are no-prereq skills. Should pull from there.
    expect(pool).toContain("counting_1_5");
  });

  test("includes all skills currently in 'learning' or 'practicing'", () => {
    const states = profileWithStates({
      counting_1_5: { state: "practicing" },
      add_within_5: { state: "learning" },
    });
    const pool = eligiblePool(states, TAXONOMY, now);
    expect(pool).toContain("counting_1_5");
    expect(pool).toContain("add_within_5");
  });

  test("includes skills whose nextReviewAt is due", () => {
    const states = profileWithStates({
      add_within_5: {
        state: "review",
        nextReviewAt: new Date(now.getTime() - 1000),
      },
      add_within_10: {
        state: "review",
        nextReviewAt: new Date(now.getTime() + 86_400_000), // tomorrow
      },
    });
    const pool = eligiblePool(states, TAXONOMY, now);
    expect(pool).toContain("add_within_5");
    expect(pool).not.toContain("add_within_10");
  });

  test("respects pool size cap", () => {
    const overrides: Record<string, Partial<SkillState>> = {};
    for (const skill of TAXONOMY) overrides[skill.id] = { state: "practicing" };
    const states = profileWithStates(overrides);
    const pool = eligiblePool(states, TAXONOMY, now, { maxPoolSize: 4 });
    expect(pool.length).toBe(4);
  });

  test("does not include a stretch skill whose prereqs are not at least practicing", () => {
    // sub_within_10 needs sub_within_5 + add_within_10. Leave both unstarted.
    const states = profileWithStates({});
    const pool = eligiblePool(states, TAXONOMY, now);
    expect(pool).not.toContain("sub_within_10");
  });

  test("when prereqs are met, the stretch slot can introduce one new skill", () => {
    const overrides: Record<string, Partial<SkillState>> = {};
    for (const s of TAXONOMY) overrides[s.id] = { state: "mastered" };
    overrides["add_within_20"] = { state: "unstarted" };
    const states = profileWithStates(overrides);
    const pool = eligiblePool(states, TAXONOMY, now);
    // add_within_20's prereq (add_within_10) is mastered → eligible as stretch
    expect(pool).toContain("add_within_20");
  });
});
