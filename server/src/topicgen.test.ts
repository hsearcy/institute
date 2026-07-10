// server/src/topicgen.test.ts
import { describe, expect, test } from "bun:test";
import { problemForTopic } from "./topicgen.ts";
import { TOPICS, topicById } from "@institute/shared";

const N = 200; // generators are random — property-test across many samples

describe("problemForTopic", () => {
  test("every curated topic generates valid problems across the difficulty range", () => {
    for (const t of TOPICS) {
      for (let i = 0; i < N; i++) {
        const d = i / (N - 1);
        const p = problemForTopic(t, d);
        expect(p.skill).toBe(t.legacySkill as typeof p.skill);
        expect(p.topicId).toBe(t.id);
        expect(Number.isInteger(p.answer)).toBe(true);
        expect(p.answer).toBeGreaterThanOrEqual(0);
        expect(p.answer).toBeLessThanOrEqual(999);
        expect(p.prompt.length).toBeGreaterThan(0);
        expect(p.prompt.length).toBeLessThanOrEqual(40);
        expect(p.spoken.length).toBeLessThanOrEqual(160);
      }
    }
  });
  test("add_sub within 5 stays within 5", () => {
    const t = topicById("mt_ghF3Vv6taM")!;
    for (let i = 0; i < N; i++) {
      const p = problemForTopic(t, Math.random());
      const m = p.prompt.replace(/[−]/g, "-").match(/^(\d+) ([+-]) (\d+)$/);
      expect(m).not.toBeNull();
      const [a, op, b] = [Number(m![1]), m![2], Number(m![3])];
      expect(op === "+" ? a + b : a).toBeLessThanOrEqual(5); // sum ≤5 / minuend ≤5
      expect(p.answer).toBe(op === "+" ? a + b : a - b);
    }
  });
  test("missing_addend answers the missing part", () => {
    const t = topicById("mt_e8CZ7E5qW7")!;
    for (let i = 0; i < N; i++) {
      const p = problemForTopic(t, Math.random());
      const m = p.prompt.match(/^(\d+) \+ \? = (\d+)$/);
      expect(m).not.toBeNull();
      expect(p.answer).toBe(Number(m![2]) - Number(m![1]));
    }
  });
  test("mul_div sometimes produces division", () => {
    const t = topicById("mt_HhuSDxwDNM")!;
    const kinds = new Set<string>();
    for (let i = 0; i < N; i++) kinds.add(problemForTopic(t, 0.8).prompt.includes("÷") ? "div" : "mul");
    expect(kinds.size).toBe(2);
  });
});
