// server/src/costume.test.ts — the gem-economy story pass must NEVER touch the
// math: prompt, answer, difficulty, and hint stay identical; only `spoken` gets
// shop clothes, and only with honest numbers.
import { describe, expect, test } from "bun:test";
import { costume, SHOP_PRICES } from "./costume.ts";
import { problemForTopic } from "./topicgen.ts";
import type { Topic, GenSpec } from "@institute/shared";

const N = 250;
const t = (gen: GenSpec): Topic => ({
  id: "x", name: "x", kidLabel: "x", domain: "d", ageRange: [6, 7], description: "",
  evidence: [], assessmentPrompt: "", legacySkill: "add_within_20", gen, fluentMs: null, prereqs: [], helpPrereqs: [],
});
const SHOPPY = /gem|pickaxe|shield|shop|pack|pouch|miner|milo|ruby|chest|trinket|deluxe|sale|coin/i;

describe("costume", () => {
  test("compatible kinds get a shop story; math untouched; spoken bounded", () => {
    const kinds: GenSpec[] = [
      { kind: "missing_addend", totalMax: 20 },
      { kind: "missing_any", max: 20 },
      { kind: "add_sub", max: 20, carry: true },
      { kind: "two_digit_ones" },
      { kind: "add_2d2d" },
      { kind: "add_within_100" },
      { kind: "compare_pick", max: 99 },
      { kind: "mul", tables: [2, 5, 10] },
      { kind: "mul_div", tables: [2, 5, 10] },
      { kind: "ten_more_less", max: 900, steps: [10, 100] },
    ];
    let costumed = 0;
    for (const gen of kinds) {
      for (let i = 0; i < N; i++) {
        const draft = problemForTopic(t(gen), Math.random());
        const before = JSON.stringify({ p: draft.prompt, a: draft.answer, d: draft.difficulty, h: draft.hint });
        const c = costume(draft, gen.kind);
        expect(JSON.stringify({ p: draft.prompt, a: draft.answer, d: draft.difficulty, h: draft.hint })).toBe(before);
        if (c === null) continue; // some shapes (e.g. non-gap missing_any) legitimately decline
        costumed++;
        expect(c.spoken.length).toBeLessThanOrEqual(160);
        expect(c.spoken).toMatch(SHOPPY);
        expect(c.spoken).not.toMatch(/you have/i); // the kid compares against his LIVE counter
      }
    }
    expect(costumed).toBeGreaterThan(kinds.length * N * 0.5); // most compatible drafts costume
  });

  test("incompatible kinds always decline", () => {
    for (const gen of [
      { kind: "skip", steps: [2] },
      { kind: "next_number", max: 100 },
      { kind: "compose_tens", tensMax: 9 },
      { kind: "compose_hundreds" },
      { kind: "coins" },
      { kind: "money_sum" },
      { kind: "round_to", bases: [10, 100] },
      { kind: "odd_pick" },
      { kind: "div", divisors: [2, 3], quotientMax: 5 },
      { kind: "add3", sumMax: 20 },
    ] as GenSpec[]) {
      const draft = problemForTopic(t(gen), 0.5);
      expect(costume(draft, gen.kind)).toBeNull();
    }
  });

  test("compare_pick preserves polarity and never invents prices", () => {
    for (let i = 0; i < N; i++) {
      const draft = problemForTopic(t({ kind: "compare_pick", max: 999 }), Math.random());
      const c = costume(draft, "compare_pick");
      if (!c) continue;
      const m = draft.prompt.match(/^(Bigger|Smaller): (\d+) or (\d+)\?$/)!;
      const wantBig = m[1] === "Bigger";
      expect(c.spoken).toMatch(wantBig ? /more|bigger/i : /less|smaller|cheaper/i);
      expect(c.spoken).not.toMatch(wantBig ? /\bless\b|cheaper/i : /\bmore\b/i);
      // "costs" language only when BOTH numbers are real catalog prices
      if (/costs/i.test(c.spoken)) {
        expect(SHOP_PRICES.some((p) => p.price === Number(m[2]))).toBe(true);
        expect(SHOP_PRICES.some((p) => p.price === Number(m[3]))).toBe(true);
      }
    }
  });

  test("missing_any: only gap shapes costume; whole-shapes decline", () => {
    let gap = 0, whole = 0;
    for (let i = 0; i < 400; i++) {
      const draft = problemForTopic(t({ kind: "missing_any", max: 20 }), Math.random());
      const c = costume(draft, "missing_any");
      const s = draft.prompt.replace(/[−]/g, "-");
      if (/^\? - /.test(s) || / - \? = /.test(s)) { expect(c).toBeNull(); whole++; }
      else if (c) gap++;
    }
    expect(gap).toBeGreaterThan(0);
    expect(whole).toBeGreaterThan(0);
  });

  test("ten_more_less story uses the parsed step", () => {
    for (let i = 0; i < N; i++) {
      const draft = problemForTopic(t({ kind: "ten_more_less", max: 900, steps: [10, 100] }), Math.random());
      const c = costume(draft, "ten_more_less");
      if (!c) continue;
      const m = draft.prompt.replace(/[−]/g, "-").match(/^(\d+) ([+-]) (\d+)$/)!;
      expect(c.spoken).toContain(m[3]); // the step amount appears in the story
    }
  });
});
