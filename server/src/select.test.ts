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
    // His CURRENT run was a freshly-met NEW topic (few attempts) → let him work an
    // in-progress topic rather than opening yet another brand-new one. Discovery
    // is keyed off the current run, so the freshly-met topic must BE that run.
    const G = [t("cur", [], "d-cur"), t("started", [], "pool"), t("fresh", [], "pool")];
    const r = selectNext({ ...base, topics: G, currentTopicId: "cur",
      recentTopicIds: ["cur", "cur", "cur", "cur", "started", "started"],
      mastery: [m("cur", "practicing", 4), m("started", "practicing", 30)] }); // cur just met
    expect(r.topic.id).toBe("started"); // consolidate via in-progress, don't open "fresh"
  });

  test("with TWO long-worked topics a slot is open, so a NEW one appears", () => {
    const G = [t("cur", [], "d-cur"), t("old-a", [], "pool"), t("new1", [], "pool")];
    const r = selectNext({ ...base, topics: G, currentTopicId: "cur",
      recentTopicIds: ["cur", "cur", "cur", "cur", "old-a", "old-a"],
      mastery: [m("cur", "practicing", 40), m("old-a", "practicing", 42)] });
    expect(r.topic.id).toBe("new1");
  });

  test("with ACTIVE_CAP long-worked topics the set is full: work them, open nothing new", () => {
    // He is not trapped: reviews still interleave, misses still ease and rescue,
    // and a slot opens the moment one of these masters.
    const G = [t("cur", [], "d-cur"), t("old-a", [], "pool"), t("old-b", [], "pool"), t("new1", [], "pool")];
    const r = selectNext({ ...base, topics: G, currentTopicId: "cur",
      recentTopicIds: ["cur", "cur", "cur", "cur", "old-a", "old-a", "old-b", "old-b"],
      mastery: [m("cur", "practicing", 40), m("old-a", "practicing", 42), m("old-b", "practicing", 73)] });
    expect(["old-a", "old-b"]).toContain(r.topic.id);
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
    expect(r.difficulty).toBeCloseTo(0.6); // no easing: a review tests the mastered level
  });
  test("a review is served at the mastery high-water mark, not the drifted last difficulty", () => {
    const r = selectNext({ ...base,
      mastery: [{ topicId: "a", state: "mastered", lastDifficulty: 0.3, masteryDifficulty: 0.95,
                  reviewDueAt: NOW - 1000, reviewIntervalDays: 1 }],
    });
    expect(r.mode).toBe("review");
    expect(r.difficulty).toBeCloseTo(0.95);
  });
  test("repeated reviews do not ratchet difficulty down", () => {
    // Each review writes its own difficulty back as last_difficulty; the served
    // level must stay pinned to the mastery mark however many times that happens.
    let last = 0.9;
    for (let i = 0; i < 10; i++) {
      const r = selectNext({ ...base,
        mastery: [{ topicId: "a", state: "mastered", lastDifficulty: last, masteryDifficulty: 0.9,
                    reviewDueAt: NOW - 1000, reviewIntervalDays: 1 }],
      });
      expect(r.mode).toBe("review");
      last = r.difficulty;
    }
    expect(last).toBeCloseTo(0.9);
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
