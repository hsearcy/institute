// server/src/graph.test.ts
import { describe, expect, test } from "bun:test";
import { unlockedTopics, frontierTopics } from "./graph.ts";
import type { Topic } from "@institute/shared";

const t = (id: string, prereqs: string[]): Topic => ({
  id, name: id, kidLabel: id, domain: "d", ageRange: [5, 6], description: "",
  evidence: [], assessmentPrompt: "", legacySkill: "add_within_20",
  gen: { kind: "add_sub", max: 10 }, fluentMs: null, prereqs,
});
const G = [t("a", []), t("b", []), t("c", ["a"]), t("d", ["a", "b"]), t("e", ["d"])];

describe("unlockedTopics", () => {
  test("roots are always unlocked", () => {
    const ids = unlockedTopics(G, new Set()).map((x) => x.id);
    expect(ids.sort()).toEqual(["a", "b"]);
  });
  test("a topic unlocks when ALL prereqs are mastered", () => {
    expect(unlockedTopics(G, new Set(["a"])).map((x) => x.id).sort()).toEqual(["a", "b", "c"]);
    expect(unlockedTopics(G, new Set(["a", "b"])).map((x) => x.id).sort()).toEqual(["a", "b", "c", "d"]);
  });
});

describe("frontierTopics", () => {
  test("frontier = unlocked and not yet mastered", () => {
    expect(frontierTopics(G, new Set(["a"])).map((x) => x.id).sort()).toEqual(["b", "c"]);
  });
  test("all mastered → empty frontier", () => {
    expect(frontierTopics(G, new Set(["a", "b", "c", "d", "e"]))).toEqual([]);
  });
});
