// shared/src/topics.test.ts
import { describe, expect, test } from "bun:test";
import { TOPICS, topicById, TopicSchema } from "./topics.ts";

describe("curated topics", () => {
  test("loads and validates all topics", () => {
    expect(TOPICS.length).toBe(15);
    for (const t of TOPICS) expect(() => TopicSchema.parse(t)).not.toThrow();
  });
  test("every prereq id resolves", () => {
    for (const t of TOPICS) for (const p of t.prereqs) expect(topicById(p)).toBeDefined();
  });
  test("graph is acyclic", () => {
    const state = new Map<string, number>(); // 0 visiting, 1 done
    const visit = (id: string): void => {
      if (state.get(id) === 1) return;
      if (state.get(id) === 0) throw new Error(`cycle at ${id}`);
      state.set(id, 0);
      for (const p of topicById(id)!.prereqs) visit(p);
      state.set(id, 1);
    };
    for (const t of TOPICS) expect(() => visit(t.id)).not.toThrow();
  });
  test("has at least one root", () => {
    expect(TOPICS.some((t) => t.prereqs.length === 0)).toBe(true);
  });
});
