// server/src/visuals.test.ts — the per-table fact ladder and the topics that use it.
import { describe, expect, test } from "bun:test";
import { ProblemSchema, TOPICS, topicById } from "@institute/shared";
import { anchorFor, factLadder, tableHint, TABLE_STEP_UP, UNAIDED_FROM } from "./visuals.ts";
import { problemForTopic } from "./topicgen.ts";

const factors = (v: ReturnType<typeof factLadder>) => v?.rows.map((r) => r.factor);

describe("factLadder", () => {
  test("fades: whole table → two each side → one each side → one anchor → nothing", () => {
    expect(factors(factLadder(8, 7, 0.2))).toEqual([1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12]);
    expect(factors(factLadder(8, 7, 0.44))).toEqual([1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12]);
    expect(factors(factLadder(8, 7, 0.5))).toEqual([5, 6, 8, 9]);
    expect(factors(factLadder(8, 7, 0.7))).toEqual([6, 8]);
    expect(factors(factLadder(8, 7, 0.85))).toEqual([5]);
    expect(factLadder(8, 7, 0.89)).toBeDefined();
    expect(factLadder(8, 7, UNAIDED_FROM)).toBeUndefined();
    expect(factLadder(8, 7, 0.95)).toBeUndefined();
  });
  test("rows are exact products and never reveal the target", () => {
    for (let k = 2; k <= 12; k++) for (const d of [0, 0.5, 0.7, 0.85]) {
      const v = factLadder(7, k, d);
      for (const r of v?.rows ?? []) {
        expect(r.factor).not.toBe(k);
        expect(r.product).toBe(7 * r.factor);
        expect(r.factor).toBeGreaterThanOrEqual(1);
        expect(r.factor).toBeLessThanOrEqual(12);
      }
    }
  });
  test("neighbors clip at the table edges", () => {
    expect(factors(factLadder(6, 2, 0.5))).toEqual([1, 3, 4]);
    expect(factors(factLadder(6, 12, 0.5))).toEqual([10, 11]);
    expect(factors(factLadder(6, 12, 0.7))).toEqual([11]);
  });
  test("an anchor target gets no anchor ladder (it IS the known fact)", () => {
    for (const k of [2, 5, 10]) expect(factLadder(9, k, 0.85)).toBeUndefined();
  });
  test("anchor prefers adding on from a close fact below", () => {
    expect(anchorFor(7)).toBe(5);
    expect(anchorFor(6)).toBe(5);
    expect(anchorFor(3)).toBe(2);
    expect(anchorFor(9)).toBe(10);
    expect(anchorFor(12)).toBe(10);
  });
});

describe("fade pace", () => {
  test("climbing at TABLE_STEP_UP from a new topic's 0.25 spends several problems at every stage", () => {
    const stages: number[] = [];
    for (let d = 0.25; d < UNAIDED_FROM; d = +(d + TABLE_STEP_UP).toFixed(2)) stages.push(factLadder(8, 7, d)!.rows.length);
    expect(stages.length).toBeGreaterThanOrEqual(10); // ≥10 correct answers before the ladder is gone
    for (const size of [11, 4, 2, 1]) expect(stages.filter((n) => n === size).length).toBeGreaterThanOrEqual(2);
  });
});

describe("tableHint", () => {
  test("points at a visible neighbor, else an anchor; never states the answer", () => {
    expect(tableHint(8, 7, factLadder(8, 7, 0.5))).toBe("Find 8 × 6 = 48. Add one more 8.");
    expect(tableHint(8, 7, factLadder(8, 7, 0.7))).toBe("Find 8 × 6 = 48. Add one more 8.");
    expect(tableHint(8, 7, undefined)).toBe("Start from 8 × 5 = 40. Add 2 more 8s.");
    expect(tableHint(8, 9, undefined)).toBe("Start from 8 × 10 = 80. Take away one 8.");
    for (let t = 3; t <= 12; t++) for (let k = 2; k <= 12; k++) for (const d of [0, 0.5, 0.7, 0.85, 0.95]) {
      const hint = tableHint(t, k, factLadder(t, k, d));
      expect(hint).not.toContain(`= ${t * k}`);
      expect(hint.length).toBeLessThanOrEqual(200);
    }
  });
});

describe("per-table topics", () => {
  const tables = TOPICS.filter((t) => t.gen.kind === "table");
  test("3, 4, 6, 7, 8, 9, 11, 12 each have a topic with a speed gate", () => {
    expect(tables.map((t) => (t.gen as { table: number }).table).sort((a, b) => a - b)).toEqual([3, 4, 6, 7, 8, 9, 11, 12]);
    for (const t of tables) expect(t.fluentMs).not.toBeNull();
  });
  test("generate only n × k, k 2..12, every fact reachable at every level, with a valid ladder", () => {
    for (const t of tables) {
      const n = (t.gen as { table: number }).table;
      for (const d of [0.2, 0.5, 0.7, 0.85, 0.95]) {
        const seen = new Set<number>();
        for (let i = 0; i < 400; i++) {
          const p = problemForTopic(t, d);
          const m = p.prompt.match(/^(\d+) × (\d+)$/)!;
          expect(Number(m[1])).toBe(n);
          const k = Number(m[2]);
          seen.add(k);
          expect(p.answer).toBe(n * k);
          expect(p.visual?.target ?? k).toBe(k);
          expect(() => ProblemSchema.parse({ ...p, id: "x" })).not.toThrow();
          if (d >= UNAIDED_FROM) expect(p.visual).toBeUndefined();
          // Help always offers the WHOLE table, and the hint points at the fact before.
          expect(p.helpVisual?.rows.map((r) => r.factor)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1).filter((f) => f !== k));
          expect(p.hint).toBe(`Find ${n} × ${k - 1} = ${n * (k - 1)}. Add one more ${n}.`);
        }
        expect(seen.size).toBe(11);
      }
    }
  });
  test("mixed topics unlock only after their tables", () => {
    expect(topicById("mt_wQ89AEXhz3")!.prereqs).toEqual(expect.arrayContaining(["tt_3", "tt_4", "tt_8"]));
    expect(topicById("mt_K5jM7vlVhA")!.prereqs).toEqual(expect.arrayContaining(tables.map((t) => t.id)));
  });
});
