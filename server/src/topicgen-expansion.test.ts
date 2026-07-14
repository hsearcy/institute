// server/src/topicgen-expansion.test.ts — correctness of the 2026-07-10 generator
// kinds. The main property test in topicgen.test.ts covers bounds for ALL topics;
// these tests re-derive each new kind's answer from its own prompt.
import { describe, expect, test } from "bun:test";
import { problemForTopic } from "./topicgen.ts";
import type { Topic, GenSpec } from "@institute/shared";

const N = 300;
const t = (gen: GenSpec): Topic => ({
  id: "x", name: "x", kidLabel: "x", domain: "d", ageRange: [6, 7], description: "",
  evidence: [], assessmentPrompt: "", legacySkill: "add_within_20", gen, fluentMs: null, prereqs: [],
});
const norm = (s: string) => s.replace(/[−]/g, "-");

describe("expansion generators", () => {
  test("two_digit_ones / add_2d2d / add_within_100 are correct binary arithmetic", () => {
    for (const gen of [{ kind: "two_digit_ones" }, { kind: "add_2d2d" }, { kind: "add_within_100" }] as GenSpec[]) {
      for (let i = 0; i < N; i++) {
        const p = problemForTopic(t(gen), Math.random());
        const m = norm(p.prompt).match(/^(\d+) ([+-]) (\d+)$/);
        expect(m).not.toBeNull();
        const [a, op, b] = [Number(m![1]), m![2], Number(m![3])];
        expect(p.answer).toBe(op === "+" ? a + b : a - b);
        expect(p.answer).toBeGreaterThanOrEqual(0);
        expect(a + b).toBeLessThanOrEqual(op === "+" ? 99 : 999);
      }
    }
  });

  test("missing_any covers all four slots and answers the blank", () => {
    const shapes = new Set<string>();
    for (let i = 0; i < N; i++) {
      const p = problemForTopic(t({ kind: "missing_any", max: 20 }), Math.random());
      const s = norm(p.prompt);
      let m;
      if ((m = s.match(/^(\d+) \+ \? = (\d+)$/))) { shapes.add("a+?"); expect(p.answer).toBe(+m[2] - +m[1]); }
      else if ((m = s.match(/^\? \+ (\d+) = (\d+)$/))) { shapes.add("?+b"); expect(p.answer).toBe(+m[2] - +m[1]); }
      else if ((m = s.match(/^(\d+) - \? = (\d+)$/))) { shapes.add("a-?"); expect(p.answer).toBe(+m[1] - +m[2]); }
      else if ((m = s.match(/^\? - (\d+) = (\d+)$/))) { shapes.add("?-b"); expect(p.answer).toBe(+m[1] + +m[2]); }
      else throw new Error(`unrecognized missing_any prompt: "${s}"`);
    }
    expect(shapes.size).toBe(4);
  });

  test("compare_pick answers with one of the two shown numbers, correctly", () => {
    for (let i = 0; i < N; i++) {
      const p = problemForTopic(t({ kind: "compare_pick", max: 99 }), Math.random());
      const m = p.prompt.match(/^(Bigger|Smaller): (\d+) or (\d+)\?$/);
      expect(m).not.toBeNull();
      const [a, b] = [Number(m![2]), Number(m![3])];
      expect(a).not.toBe(b);
      expect(p.answer).toBe(m![1] === "Bigger" ? Math.max(a, b) : Math.min(a, b));
    }
  });

  test("compose_hundreds builds the three-digit number", () => {
    for (let i = 0; i < N; i++) {
      const p = problemForTopic(t({ kind: "compose_hundreds" }), Math.random());
      const m = p.prompt.match(/^(\d) hundreds (\d) tens (\d) ones$/);
      expect(m).not.toBeNull();
      expect(p.answer).toBe(+m![1] * 100 + +m![2] * 10 + +m![3]);
    }
  });

  test("coins totals are correct cents", () => {
    const VALUE: Record<string, number> = { quarter: 25, dime: 10, nickel: 5, penny: 1 };
    for (let i = 0; i < N; i++) {
      const p = problemForTopic(t({ kind: "coins" }), Math.random());
      // e.g. "2 dimes + 1 nickel = ?¢"
      let total = 0;
      for (const m of p.prompt.matchAll(/(\d+) (quarter|dime|nickel|penny|pennie)s?/g)) {
        total += Number(m[1]) * VALUE[m[2] === "pennie" ? "penny" : m[2]];
      }
      expect(total).toBeGreaterThan(0);
      expect(p.answer).toBe(total);
      expect(p.answer).toBeLessThanOrEqual(99);
    }
  });

  test("money_sum answers the gap or the coin count", () => {
    const shapes = new Set<string>();
    for (let i = 0; i < N; i++) {
      const p = problemForTopic(t({ kind: "money_sum" }), Math.random());
      let m;
      if ((m = p.prompt.match(/^(\d+)¢ \+ \?¢ = (\d+)¢$/))) { shapes.add("gap"); expect(p.answer).toBe(+m[2] - +m[1]); }
      else if ((m = p.prompt.match(/^How many (nickel|dime)s make (\d+)¢\?$/))) {
        shapes.add("count");
        const v = m[1] === "nickel" ? 5 : 10;
        expect(+m[2] % v).toBe(0);
        expect(p.answer).toBe(+m[2] / v);
      } else throw new Error(`unrecognized money_sum prompt: "${p.prompt}"`);
    }
    expect(shapes.size).toBe(2);
  });

  test("round_to rounds half-up to the base", () => {
    for (let i = 0; i < N; i++) {
      const p = problemForTopic(t({ kind: "round_to", bases: [10, 100] }), Math.random());
      const m = p.prompt.match(/^Round (\d+) to nearest (\d+)$/);
      expect(m).not.toBeNull();
      const [n, base] = [Number(m![1]), Number(m![2])];
      expect(n % base).not.toBe(0); // never ask about an exact multiple
      expect(p.answer).toBe(Math.round(n / base) * base);
    }
  });

  test("odd_pick has exactly one number of the asked parity", () => {
    for (let i = 0; i < N; i++) {
      const p = problemForTopic(t({ kind: "odd_pick" }), Math.random());
      const m = p.prompt.match(/^(Odd|Even) one: (\d+), (\d+), (\d+)$/);
      expect(m).not.toBeNull();
      const want = m![1] === "Odd" ? 1 : 0;
      const nums = [Number(m![2]), Number(m![3]), Number(m![4])];
      const matching = nums.filter((n) => n % 2 === want);
      expect(matching).toEqual([p.answer]);
    }
  });

  test("skip with offset starts off-multiple; back counts down without going negative", () => {
    for (let i = 0; i < N; i++) {
      const p = problemForTopic(t({ kind: "skip", steps: [10], offset: true }), Math.random());
      const m = p.prompt.match(/^(\d+), (\d+), (\d+), \?$/);
      expect(m).not.toBeNull();
      const [a, b, c] = [Number(m![1]), Number(m![2]), Number(m![3])];
      const step = b - a;
      expect(Math.abs(step)).toBe(10);
      expect(c - b).toBe(step);
      expect(p.answer).toBe(c + step);
      expect(p.answer).toBeGreaterThanOrEqual(0);
    }
    // back:true must produce at least one descending sequence
    let sawBack = false;
    for (let i = 0; i < N; i++) {
      const p = problemForTopic(t({ kind: "skip", steps: [3], back: true }), Math.random());
      const m = p.prompt.match(/^(\d+), (\d+), (\d+), \?$/)!;
      if (Number(m[2]) < Number(m[1])) sawBack = true;
      expect(p.answer).toBeGreaterThanOrEqual(0);
    }
    expect(sawBack).toBe(true);
  });

  test("ten_more_less with steps [10,100] uses both jumps", () => {
    const seen = new Set<number>();
    for (let i = 0; i < N; i++) {
      const p = problemForTopic(t({ kind: "ten_more_less", max: 900, steps: [10, 100] }), Math.random());
      const m = p.prompt.replace(/[−]/g, "-").match(/^(\d+) ([+-]) (\d+)$/);
      expect(m).not.toBeNull();
      const [n, op, step] = [Number(m![1]), m![2], Number(m![3])];
      seen.add(step);
      expect([10, 100]).toContain(step);
      expect(p.answer).toBe(op === "+" ? n + step : n - step);
      expect(p.answer).toBeGreaterThanOrEqual(0);
      expect(p.answer).toBeLessThanOrEqual(999);
    }
    expect(seen.size).toBe(2);
  });
});

describe("spoken sequences use words (ElevenLabs garbles digit runs)", () => {
  test("numberWords covers 0-999", async () => {
    const { numberWords } = await import("./topicgen.ts");
    expect(numberWords(8)).toBe("eight");
    expect(numberWords(12)).toBe("twelve");
    expect(numberWords(40)).toBe("forty");
    expect(numberWords(56)).toBe("fifty six");
    expect(numberWords(434)).toBe("four hundred thirty four");
    expect(numberWords(900)).toBe("nine hundred");
  });
  test("skip-counting spoken lines contain no digit runs", () => {
    for (const steps of [[2], [3], [10], [4, 8, 50, 100], [5, 10, 100]] as number[][]) {
      for (let i = 0; i < 60; i++) {
        const p = problemForTopic(t({ kind: "skip", steps, offset: steps.length > 2 }), Math.random());
        expect(p.spoken).not.toMatch(/\d/);          // fully worded
        expect(p.spoken.length).toBeLessThanOrEqual(160);
      }
    }
  });
});
