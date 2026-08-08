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

const m = (topicId: string, state: string, attempts = 20) =>
  ({ topicId, state, lastDifficulty: 0.5, attempts, reviewDueAt: null, reviewIntervalDays: null });

const base: SelectInput = {
  topics: G, now: NOW, currentTopicId: null,
  mastery: [],
  recentTopicIds: [], lastWasReview: false,
};

describe("rut-breaking rotation", () => {
  // Both candidates share ONE domain and the current topic sits in a THIRD, so
  // the different-domain key can't decide it — this isolates the new-vs-started
  // choice.
  const F = [t("cur", [], "current-domain"), t("started", [], "pool"), t("fresh", [], "pool")];

  test("breaks out of a rut: when he's circled ≤2 topics, introduce a NEW one", () => {
    // He's been ping-ponging cur + started; a never-attempted topic must appear
    // so the curriculum keeps moving (and the explore-topics quest can progress).
    const r = selectNext({ ...base, topics: F, currentTopicId: "cur",
      recentTopicIds: ["cur", "cur", "cur", "cur", "started", "started"],
      mastery: [m("started", "practicing")] });
    expect(r.topic.id).toBe("fresh"); // the new topic, not the same two forever
  });

  test("just after meeting a NEW topic, consolidate it instead of piling on another", () => {
    // A freshly-met topic (few attempts) is in recent history → let him work his
    // in-progress topics rather than opening yet another new one.
    const G = [t("cur", [], "d-cur"), t("started", [], "pool"), t("fresh", [], "pool")];
    const r = selectNext({ ...base, topics: G, currentTopicId: "cur",
      recentTopicIds: ["cur", "cur", "cur", "cur", "started", "started"],
      mastery: [m("started", "practicing", 4)] }); // 4 attempts = freshly met
    expect(r.topic.id).toBe("started"); // consolidate the new one, don't pile on
  });

  test("breaks out even with several long-worked topics (the real ares bug)", () => {
    // He's cycled 3+ long-worked topics — none freshly met — so a NEW one appears
    // instead of trapping him on his started set.
    const G = [t("cur", [], "d-cur"), t("old-a", [], "pool"), t("old-b", [], "pool"), t("new1", [], "pool")];
    const r = selectNext({ ...base, topics: G, currentTopicId: "cur",
      recentTopicIds: ["cur", "cur", "cur", "cur", "old-a", "old-a", "old-b", "old-b"],
      mastery: [m("cur", "practicing", 40), m("old-a", "practicing", 42), m("old-b", "practicing", 73)] });
    expect(r.topic.id).toBe("new1");
  });

  test("brand-new topics get picked when nothing is in progress", () => {
    const r = selectNext({ ...base, topics: F, currentTopicId: "cur",
      recentTopicIds: ["cur", "cur", "cur", "cur"], mastery: [] });
    expect(["started", "fresh"]).toContain(r.topic.id);
  });

  test("a never-attempted topic starts gently", () => {
    const r = selectNext({ ...base, topics: F, currentTopicId: "cur",
      recentTopicIds: ["cur", "cur", "cur", "cur"], mastery: [] });
    expect(r.difficulty).toBeCloseTo(0.25); // a first meeting should be a win
  });
});

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
