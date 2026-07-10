// server/src/select.test.ts
import { describe, expect, test } from "bun:test";
import { selectNext, type SelectInput } from "./select.ts";
import type { Topic } from "@institute/shared";

const NOW = 1_750_000_000_000;
const t = (id: string, prereqs: string[], domain = "d1", age = 5): Topic => ({
  id, name: id, kidLabel: id, domain, ageRange: [age, age + 1], description: "",
  evidence: [], assessmentPrompt: "", legacySkill: "add_within_20",
  gen: { kind: "add_sub", max: 10 }, fluentMs: null, prereqs,
});
// a,b roots in different domains; c behind a; d root in a third domain
const G = [t("a", [], "add"), t("b", [], "count"), t("c", ["a"], "add"), t("d", [], "place")];

const base: SelectInput = {
  topics: G, now: NOW, currentTopicId: null,
  mastery: [],
  recentTopicIds: [], lastWasReview: false,
};

describe("selectNext", () => {
  test("cold start serves a frontier root", () => {
    const r = selectNext(base);
    expect(r.mode).toBe("learn");
    expect(["a", "b", "d"]).toContain(r.topic.id);
  });
  test("due review wins over learning", () => {
    const r = selectNext({ ...base,
      mastery: [{ topicId: "a", state: "mastered", lastDifficulty: 0.6, reviewDueAt: NOW - 1000, reviewIntervalDays: 1 }],
    });
    expect(r).toMatchObject({ mode: "review", topic: { id: "a" } });
    expect(r.difficulty).toBeCloseTo(0.5); // lastDifficulty − 0.1
  });
  test("never two reviews back-to-back", () => {
    const r = selectNext({ ...base, lastWasReview: true,
      mastery: [{ topicId: "a", state: "mastered", lastDifficulty: 0.6, reviewDueAt: NOW - 1000, reviewIntervalDays: 1 }],
    });
    expect(r.mode).toBe("learn");
  });
  test("stays on current frontier topic under the run cap", () => {
    const r = selectNext({ ...base, currentTopicId: "b", recentTopicIds: ["b", "b"] });
    expect(r.topic.id).toBe("b");
  });
  test("rotates after 4 consecutive, preferring a different domain", () => {
    const r = selectNext({ ...base, currentTopicId: "b", recentTopicIds: ["b", "b", "b", "b"] });
    expect(r.topic.id).not.toBe("b");
    expect(r.topic.domain).not.toBe("count");
  });
  test("reviews are not served for practicing topics even with stale due dates", () => {
    const r = selectNext({ ...base,
      mastery: [{ topicId: "a", state: "practicing", lastDifficulty: 0.6, reviewDueAt: NOW - 1000, reviewIntervalDays: 1 }],
    });
    expect(r.mode).toBe("learn");
  });
  test("everything mastered and nothing due → deepest topic, learn mode", () => {
    const mastered = G.map((x) => ({ topicId: x.id, state: "mastered" as const, lastDifficulty: 0.5, reviewDueAt: NOW + 999_999_999, reviewIntervalDays: 4 }));
    const r = selectNext({ ...base, mastery: mastered });
    expect(r.mode).toBe("learn");
    expect(r.topic).toBeDefined();
  });
});
