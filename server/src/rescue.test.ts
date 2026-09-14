// server/src/rescue.test.ts
import { describe, expect, test } from "bun:test";
import { rescueTopic } from "./rescue.ts";
import type { Topic } from "@institute/shared";
import type { MasteryLite } from "./select.ts";

const t = (id: string, prereqs: string[] = [], helpPrereqs: string[] = []): Topic => ({
  id, name: id, kidLabel: id, domain: "d", ageRange: [5, 6], description: "",
  evidence: [], assessmentPrompt: "", legacySkill: "add_within_20",
  gen: { kind: "add_sub", max: 10 }, fluentMs: null, prereqs, helpPrereqs,
});
const m = (topicId: string, state: string): MasteryLite =>
  ({ topicId, state, lastDifficulty: 0.5, reviewDueAt: null, reviewIntervalDays: null });

const ALL = [t("root"), t("soft"), t("hard"), t("x", ["hard"], ["soft"])];

describe("rescueTopic", () => {
  test("prefers a mastered candidate", () => {
    const r = rescueTopic(ALL[3], [m("soft", "mastered"), m("hard", "practicing")], ALL);
    expect(r?.id).toBe("soft");
  });
  test("a help-prereq (the remediation ladder) beats a hard prereq (the gate)", () => {
    // Both mastered: the hand-authored ladder must win, not the taxonomy gate.
    const r = rescueTopic(ALL[3], [m("soft", "mastered"), m("hard", "mastered")], ALL);
    expect(r?.id).toBe("soft");
  });
  test("falls back to any candidate when none mastered", () => {
    const r = rescueTopic(ALL[3], [], ALL);
    expect(["hard", "soft"]).toContain(r?.id);
  });
  test("null when the topic has no prereqs at all", () => {
    expect(rescueTopic(ALL[0], [], ALL)).toBeNull();
  });
  test("ignores unresolvable ids", () => {
    const orphan = t("o", ["ghost"], ["phantom"]);
    expect(rescueTopic(orphan, [], [...ALL, orphan])).toBeNull();
  });
});
