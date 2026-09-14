// server/src/topicgen-expansion2.test.ts — correctness of the 2026-09-08 generator
// kinds (the post-30-mastered frontier). topicgen.test.ts covers bounds for ALL
// topics; these re-derive each new kind's answer from its own prompt so a wrong
// answer can never reach him.
import { describe, expect, test } from "bun:test";
import { problemForTopic } from "./topicgen.ts";
import type { Topic, GenSpec } from "@institute/shared";

const N = 400;
const t = (gen: GenSpec): Topic => ({
  id: "x", name: "x", kidLabel: "x", domain: "d", ageRange: [6, 7], description: "",
  evidence: [], assessmentPrompt: "", legacySkill: "add_within_20", gen, fluentMs: null, prereqs: [], helpPrereqs: [],
});
const norm = (s: string) => s.replace(/[−]/g, "-");
const each = (gen: GenSpec, f: (p: ReturnType<typeof problemForTopic>) => void) => {
  for (let i = 0; i < N; i++) f(problemForTopic(t(gen), Math.random()));
};

describe("expansion 2 generators", () => {
  test("estimate_sum: rounds each addend to the nearest ten, then adds", () => {
    each({ kind: "estimate_sum" }, (p) => {
      const m = p.prompt.match(/^About (\d+) \+ (\d+)\?$/); expect(m).not.toBeNull();
      const [a, b] = [Number(m![1]), Number(m![2])];
      expect(p.answer).toBe(Math.round(a / 10) * 10 + Math.round(b / 10) * 10);
    });
  });
  test("add_sub_3d: 3-digit arithmetic stays within 0..999", () => {
    for (const op of ["add", "sub"] as const) each({ kind: "add_sub_3d", op }, (p) => {
      const m = norm(p.prompt).match(/^(\d+) ([+-]) (\d+)$/); expect(m).not.toBeNull();
      const [a, o, b] = [Number(m![1]), m![2], Number(m![3])];
      expect(o).toBe(op === "add" ? "+" : "-");
      expect(p.answer).toBe(op === "add" ? a + b : a - b);
      expect(a).toBeGreaterThanOrEqual(100); expect(p.answer).toBeGreaterThanOrEqual(0); expect(p.answer).toBeLessThanOrEqual(999);
    });
  });
  test("missing_factor: the blank makes the product / quotient true", () => {
    each({ kind: "missing_factor", maxFactor: 10 }, (p) => {
      let m;
      if ((m = p.prompt.match(/^(\d+) × \? = (\d+)$/))) expect(Number(m[1]) * p.answer).toBe(Number(m[2]));
      else if ((m = p.prompt.match(/^\? × (\d+) = (\d+)$/))) expect(p.answer * Number(m[1])).toBe(Number(m[2]));
      else if ((m = p.prompt.match(/^(\d+) ÷ \? = (\d+)$/))) expect(Number(m[1]) / p.answer).toBe(Number(m[2]));
      else throw new Error(`unexpected prompt ${p.prompt}`);
      expect(p.answer).toBeGreaterThanOrEqual(2); expect(p.answer).toBeLessThanOrEqual(10);
    });
  });
  test("mul_2d1d: 2-digit × 1-digit, product ≤ 999", () => {
    each({ kind: "mul_2d1d" }, (p) => {
      const m = p.prompt.match(/^(\d+) × (\d+)$/); expect(m).not.toBeNull();
      const [a, b] = [Number(m![1]), Number(m![2])];
      expect(a).toBeGreaterThanOrEqual(11); expect(a).toBeLessThanOrEqual(99); expect(b).toBeGreaterThanOrEqual(2); expect(b).toBeLessThanOrEqual(9);
      expect(p.answer).toBe(a * b); expect(p.answer).toBeLessThanOrEqual(999);
    });
  });
  test("div_rem: answer is the true remainder, never zero", () => {
    each({ kind: "div_rem", maxDivisor: 9 }, (p) => {
      const m = p.prompt.match(/^(\d+) ÷ (\d+), leftover\?$/); expect(m).not.toBeNull();
      const [n, b] = [Number(m![1]), Number(m![2])];
      expect(p.answer).toBe(n % b); expect(p.answer).toBeGreaterThan(0);
    });
  });
  test("frac_of: k/den of n = k × (n ÷ den), and n divides evenly", () => {
    each({ kind: "frac_of", dens: [2, 3, 4, 5, 10] }, (p) => {
      const m = p.prompt.match(/^(\d+)\/(\d+) of (\d+)$/); expect(m).not.toBeNull();
      const [k, den, n] = [Number(m![1]), Number(m![2]), Number(m![3])];
      expect(n % den).toBe(0); expect(k).toBeLessThan(den); expect(p.answer).toBe(k * (n / den));
    });
  });
  test("double_half: doubles any n, halves only even n", () => {
    each({ kind: "double_half", max: 100 }, (p) => {
      let m;
      if ((m = p.prompt.match(/^Double (\d+)$/))) expect(p.answer).toBe(2 * Number(m[1]));
      else if ((m = p.prompt.match(/^Half of (\d+)$/))) {
        const n = Number(m[1]); expect(n % 2).toBe(0); expect(p.answer).toBe(n / 2);
        // a multi-part number (158 = 100, 50, 8) gets decomposed: every stated half is
        // whole and they add back up to the answer. A single-part number (20, 100)
        // gets a tens nudge that never states the answer.
        const parts = [Math.floor(n / 100) * 100, Math.floor((n % 100) / 10) * 10, n % 10].filter((v) => v > 0);
        const halves = [...p.hint!.matchAll(/Half of (\d+) is (\d+)/g)].map((x) => [Number(x[1]), Number(x[2])]);
        if (parts.length > 1) {
          expect(halves.length).toBe(parts.length); for (const [v, h] of halves) expect(h * 2).toBe(v);
          expect(halves.reduce((a, [, h]) => a + h, 0)).toBe(n / 2);
        } else expect(p.hint!).not.toContain(`is ${n / 2}`);
      }
      else throw new Error(`unexpected prompt ${p.prompt}`);
    });
  });
  test("change_from: change = paid − price, price a multiple of 5", () => {
    each({ kind: "change_from" }, (p) => {
      const m = p.prompt.match(/^Pay (\d+)¢ for (\d+)¢, change\?$/); expect(m).not.toBeNull();
      const [from, price] = [Number(m![1]), Number(m![2])];
      expect(price % 5).toBe(0); expect(price).toBeLessThan(from); expect(p.answer).toBe(from - price);
    });
  });
  test("time_minutes: hours → 60s; clock spans stay inside the hour and are 5-minute jumps", () => {
    each({ kind: "time_minutes" }, (p) => {
      let m;
      if ((m = p.prompt.match(/^Minutes in (\d+) hours?\?$/))) expect(p.answer).toBe(60 * Number(m[1]));
      else if ((m = p.prompt.match(/^(\d+):(\d\d) to (\d+):(\d\d), minutes\?$/))) {
        const [h1, m1, h2, m2] = [1, 2, 3, 4].map((i) => Number(m![i]));
        const end = h2 === h1 ? m2 : 60; // rolled to the next hour → :00
        if (h2 !== h1) expect(m2).toBe(0);
        expect(p.answer).toBe(end - m1); expect(p.answer % 5).toBe(0); expect(p.answer).toBeGreaterThan(0); expect(p.answer).toBeLessThanOrEqual(60);
      } else throw new Error(`unexpected prompt ${p.prompt}`);
    });
  });
  test("perimeter_rect: 4×side for squares, 2(w+h) for rectangles", () => {
    each({ kind: "perimeter_rect" }, (p) => {
      let m;
      if ((m = p.prompt.match(/^Square, side (\d+), all around\?$/))) expect(p.answer).toBe(4 * Number(m[1]));
      else if ((m = p.prompt.match(/^Rectangle (\d+) by (\d+), all around\?$/))) expect(p.answer).toBe(2 * (Number(m[1]) + Number(m[2])));
      else throw new Error(`unexpected prompt ${p.prompt}`);
    });
  });
  test("area_tiles: rows × per-row", () => {
    each({ kind: "area_tiles" }, (p) => {
      const m = p.prompt.match(/^(\d+) rows of (\d+) tiles, total\?$/); expect(m).not.toBeNull();
      expect(p.answer).toBe(Number(m![1]) * Number(m![2]));
    });
  });
});
