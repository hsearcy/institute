// server/src/costume.ts — the gem-economy story pass. Sam computed 450−200 in
// his head, unprompted, because he WANTED a shop item — while the same shape
// as a drill ("2 + ? = 8") stalls him. So problems sometimes wear adventure
// clothes: `spoken` tells the story, but the PROMPT, ANSWER, HINT, and NUMBERS
// are untouched — the topic's envelope and the trust-math guard stay intact.
//
// Rules (see the 2026-07-16 plan):
// - Third-person characters only (Finn/Arlo the adventurers) — never "you have N";
//   the kid compares any "you have" against his live gem counter.
// - Real item names only with their REAL prices; otherwise generic props.
// - Stable quantities only — no live balance (problems are pre-generated).
import { RPG_ITEMS, RPG_WEAPON_GLOWS, rpgMerchantPrice, type GenSpec } from "@institute/shared";
import type { ProblemDraft } from "./generate.ts";

/** Everything the camp Merchant sells, for honest price references + the LLM catalog line. */
export const SHOP_PRICES = [...RPG_ITEMS.flatMap((item) => {
  const price = rpgMerchantPrice(item);
  return price === null ? [] : [{ name: item.name, price }];
}), ...RPG_WEAPON_GLOWS.map((glow) => ({ name: glow.name, price: glow.price }))];

const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const priceItem = (n: number) => {
  const matches = SHOP_PRICES.filter((p) => p.price === n);
  return matches.length ? pick(matches) : undefined;
};

const HEROES = ["Finn the knight", "Arlo the wizard"];
const TREATS = ["healing potion", "magic scroll", "lucky charm", "silver key"];
const norm = (s: string) => s.replace(/[−–—]/g, "-");

/** An adventure-story `spoken` for this draft, or null when the kind/shape declines.
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
        const who = pick(HEROES);
        const treat = pick(TREATS);
        return { spoken: item
          ? pick([
            `${who} saved up ${have} gems and wants the ${item.name}. It costs ${want}. How many more gems does he need?`,
            `The ${item.name} costs ${want} gems, and ${who} has ${have}. How many more to go?`,
          ])
          : pick([
            `${who} saved up ${have} gems and wants a ${treat} that costs ${want}. How many more does he need?`,
            `A ${treat} at the merchant costs ${want} gems, and ${who} has ${have}. How many more to go?`,
          ]) };
      }
      return null;
    }
    case "add_sub":
    case "two_digit_ones":
    case "add_2d2d":
    case "add_within_100": {
      if ((m = p.match(/^(\d+) \+ (\d+)$/))) {
        const who = pick(HEROES);
        return { spoken: pick([
          `${who} found ${m[1]} gems in the dungeon this morning and ${m[2]} more after lunch. How many gems altogether?`,
          `${who} opened a treasure chest with ${m[1]} gems and another with ${m[2]}. How many gems in all?`,
        ]) };
      }
      if ((m = p.match(/^(\d+) - (\d+)$/))) {
        const spent = Number(m[2]);
        const item = priceItem(spent);
        const who = pick(HEROES);
        return { spoken: pick([
          `${who} had ${m[1]} gems and spent ${spent} at the merchant${item ? ` on the ${item.name}` : ""}. How many gems are left?`,
          `${who} had ${m[1]} gems, then a sneaky goblin grabbed ${spent}! How many are left?`,
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
        return { spoken: `Which costs ${wantBig ? "more" : "less"}, the ${ix.name} at ${x} gems, or the ${iy.name} at ${y} gems? Type that price!` };
      }
      return { spoken: `Two treasure chests hold ${x} and ${y} gems. Type the ${wantBig ? "bigger" : "smaller"} number!` };
    }
    case "mul": {
      if (!(m = p.match(/^(\d+) × (\d+)$/))) return null;
      return { spoken: pick([
        `Each treasure chest holds ${m[1]} gems. How many gems in ${m[2]} chests?`,
        `A potion bag holds ${m[1]} potions, and ${pick(HEROES)} buys ${m[2]} bags. How many potions is that?`,
      ]) };
    }
    case "mul_div": {
      if ((m = p.match(/^(\d+) × (\d+)$/))) {
        return { spoken: `Each treasure chest holds ${m[1]} gems. How many gems in ${m[2]} chests?` };
      }
      if ((m = p.match(/^(\d+) ÷ (\d+)$/))) {
        return { spoken: `${pick(HEROES)} packs ${m[1]} gems into bags of ${m[2]}. How many bags does he fill?` };
      }
      return null;
    }
    case "ten_more_less": {
      if (!(m = p.match(/^(\d+) ([+-]) (\d+)$/))) return null;
      const [base, op, step] = [Number(m[1]), m[2], Number(m[3])];
      return { spoken: op === "+"
        ? `A magic scroll at the merchant costs ${base} gems. The golden one costs ${step} more. How much is the golden one?`
        : `A magic scroll costs ${base} gems, but today it's on sale for ${step} less! What does it cost now?` };
    }
    default:
      return null;
  }
}
