// server/src/costume.ts — the gem-economy story pass. Sam computed 450−200 in
// his head, unprompted, because he WANTED the gold pickaxe — while the same
// shape as a drill ("2 + ? = 8") stalls him. So problems sometimes wear shop
// clothes: `spoken` tells the story, but the PROMPT, ANSWER, HINT, and NUMBERS
// are untouched — the topic's envelope and the trust-math guard stay intact.
//
// Rules (see the 2026-07-16 plan):
// - Third-person characters only (Milo/Ruby the miners) — never "you have N";
//   the kid compares any "you have" against his live gem counter.
// - Real item names only with their REAL prices; otherwise generic props.
// - Stable quantities only — no live balance (problems are pre-generated).
import type { GenSpec } from "@institute/shared";
import type { ProblemDraft } from "./generate.ts";

/** Everything purchasable, for honest price references + the LLM catalog line. */
export const SHOP_PRICES = [
  { name: "stone pickaxe", price: 50 },
  { name: "iron pickaxe", price: 120 },
  { name: "silver pickaxe", price: 250 },
  { name: "gold pickaxe", price: 450 },
  { name: "diamond pickaxe", price: 800 },
  { name: "shield", price: 40 },
  { name: "crazy coin", price: 200 },
  { name: "ocean pad", price: 75 },
  { name: "lava pad", price: 160 },
  { name: "galaxy pad", price: 340 },
  { name: "rainbow pad", price: 650 },
] as const;

const priceItem = (n: number) => SHOP_PRICES.find((p) => p.price === n);

const MINERS = ["Milo the miner", "Ruby the digger"];
const TREATS = ["gem sticker", "shiny pebble", "tiny lantern", "rock candy"];
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const norm = (s: string) => s.replace(/[−–—]/g, "-");

/** A shop-story `spoken` for this draft, or null when the kind/shape declines.
 *  NEVER mutates the draft; callers decide whether to use it. */
export function costume(draft: ProblemDraft, kind: GenSpec["kind"]): { spoken: string } | null {
  const p = norm(draft.prompt);
  let m: RegExpMatchArray | null;

  switch (kind) {
    case "missing_addend":
    case "missing_any": {
      // Gap shapes only: "a + ? = t" or "? + b = t" (the saving-up story).
      if ((m = p.match(/^(\d+) \+ \? = (\d+)$/)) || (m = p.match(/^\? \+ (\d+) = (\d+)$/))) {
        const [have, want] = [Number(m[1]), Number(m[2])];
        const item = priceItem(want);
        const who = pick(MINERS);
        const treat = pick(TREATS);
        return { spoken: item
          ? pick([
            `${who} saved up ${have} gems and wants the ${item.name}. It costs ${want}. How many more gems does he need?`,
            `The ${item.name} costs ${want} gems, and ${who} has ${have}. How many more to go?`,
          ])
          : pick([
            `${who} saved up ${have} gems and wants a ${treat} that costs ${want}. How many more does he need?`,
            `A ${treat} at the shop costs ${want} gems, and ${who} has ${have}. How many more to go?`,
          ]) };
      }
      return null;
    }
    case "add_sub":
    case "two_digit_ones":
    case "add_2d2d":
    case "add_within_100": {
      if ((m = p.match(/^(\d+) \+ (\d+)$/))) {
        const who = pick(MINERS);
        return { spoken: pick([
          `${who} mined ${m[1]} gems this morning and ${m[2]} more after lunch. How many gems altogether?`,
          `${who} found a pouch of ${m[1]} gems and another with ${m[2]}. How many gems in all?`,
        ]) };
      }
      if ((m = p.match(/^(\d+) - (\d+)$/))) {
        const spent = Number(m[2]);
        const item = priceItem(spent);
        const who = pick(MINERS);
        return { spoken: pick([
          `${who} had ${m[1]} gems and spent ${spent} at the shop${item ? ` on a ${item.name}` : ""}. How many gems are left?`,
          `${who} had ${m[1]} gems, then a rockslide took ${spent}! How many are left?`,
        ]) };
      }
      return null;
    }
    case "compare_pick": {
      if (!(m = p.match(/^(Bigger|Smaller): (\d+) or (\d+)\?$/))) return null;
      const wantBig = m[1] === "Bigger";
      const [x, y] = [Number(m[2]), Number(m[3])];
      const ix = priceItem(x), iy = priceItem(y);
      if (ix && iy && ix.name !== iy.name) {
        return { spoken: `Which costs ${wantBig ? "more" : "less"} — the ${ix.name} at ${x} gems, or the ${iy.name} at ${y} gems? Type that price!` };
      }
      return { spoken: `Two treasure chests hold ${x} and ${y} gems. Type the ${wantBig ? "bigger" : "smaller"} number!` };
    }
    case "mul": {
      if (!(m = p.match(/^(\d+) × (\d+)$/))) return null;
      return { spoken: pick([
        `Each gem pouch holds ${m[1]} gems. How many gems in ${m[2]} pouches?`,
        `A shield pack has ${m[1]} shields, and ${pick(MINERS)} buys ${m[2]} packs. How many shields is that?`,
      ]) };
    }
    case "mul_div": {
      if ((m = p.match(/^(\d+) × (\d+)$/))) {
        return { spoken: `Each gem pouch holds ${m[1]} gems. How many gems in ${m[2]} pouches?` };
      }
      if ((m = p.match(/^(\d+) ÷ (\d+)$/))) {
        return { spoken: `${pick(MINERS)} packs ${m[1]} gems into pouches of ${m[2]}. How many pouches does he fill?` };
      }
      return null;
    }
    case "ten_more_less": {
      if (!(m = p.match(/^(\d+) ([+-]) (\d+)$/))) return null;
      const [base, op, step] = [Number(m[1]), m[2], Number(m[3])];
      return { spoken: op === "+"
        ? `A trinket at the shop costs ${base} gems. The deluxe one costs ${step} more. How much is the deluxe one?`
        : `A trinket costs ${base} gems, but today it's on sale for ${step} less! What does it cost now?` };
    }
    default:
      return null;
  }
}
