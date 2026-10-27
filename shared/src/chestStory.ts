// Chest word problems. When the tutor's waiting problem becomes a chest's lock,
// the SAME problem (prompt, answer, topic, difficulty) is told as the chest's
// story: "The chest holds 3 pouches with 4 forge dust in each." The tutor's
// choice of skill and its mastery records stay exactly as they were.
//
// The story is a pure function of the problem, the dungeon tier and whether
// the chest still pays. The client renders it; the server recomputes it from
// the problem it served, so the forge dust a story promises is the forge dust
// the server pays. Amounts that would flood the forge become gold coins (the
// treasure the open chest spills) and the chest pays its usual dust.
import { TOPICS } from "./topics.ts";
import { rpgRoomForgeDust, rpgTier } from "./rpgLoot";

export type ChestTreasure = "dust" | "gold";
export interface ChestStory {
  /** The story shown above the equation. */
  text: string;
  /** The same story for the tutor voice (always shown as `text` too). */
  spoken: string;
  treasure: ChestTreasure;
  /** The treasure the answer counts, when the answer IS the chest's treasure. */
  counted: number | null;
  /** Forge dust the chest pays for this story, or null for the usual amount. */
  forgeDust: number | null;
}

/** Kinds whose problems read naturally as a shrine's candles and sparks. Others stay plain there. */
const STORY_KINDS = new Set([
  "add_sub", "add_sub_tens", "add3", "missing_addend", "missing_any", "ten_more_less",
  "mul", "mul_div", "table", "mul_2d1d", "div", "two_digit_ones", "add_within_100",
  "add_2d2d", "add_sub_3d", "double_half",
]);

/** The most dust one story chest may pay: a few rooms' worth, never a flood. */
export function rpgChestDustCap(tier: number): number {
  return 6 * rpgRoomForgeDust(rpgTier(tier));
}

const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
const pick = <T>(seed: string, options: readonly T[]): T => options[hash(seed) % options.length]!;

type Shape =
  | { op: "mul"; a: number; b: number }
  | { op: "div"; a: number; b: number }
  | { op: "add"; a: number; b: number }
  | { op: "sub"; a: number; b: number }
  | { op: "add3"; a: number; b: number; c: number }
  | { op: "gap"; have: number; total: number }
  | { op: "double"; n: number }
  | { op: "half"; n: number }
  | { op: "next"; n: number }
  | { op: "seq"; a: number; b: number; c: number }
  | { op: "place"; h: number; t: number; o: number }
  | { op: "start"; take: number; left: number }
  | { op: "took"; had: number; left: number }
  | { op: "each"; groups: number; total: number }
  | { op: "piles"; total: number; size: number }
  | { op: "pick"; bigger: boolean; a: number; b: number }
  | { op: "parity"; even: boolean; nums: number[] }
  | { op: "coins"; parts: { count: number; coin: string; cents: number }[] }
  | { op: "coinCount"; coin: string; cents: number; total: number }
  | { op: "centsGap"; have: number; total: number }
  | { op: "round"; n: number; to: number }
  | { op: "about"; a: number; b: number }
  | { op: "rem"; a: number; b: number }
  | { op: "frac"; n: number; d: number; of: number }
  | { op: "change"; paid: number; price: number }
  | { op: "clock"; from: string; to: string }
  | { op: "hours"; h: number }
  | { op: "square"; side: number }
  | { op: "rect"; long: number; wide: number }
  | { op: "rows"; rows: number; each: number };

const COIN_CENTS: Record<string, number> = { penny: 1, pennies: 1, pennys: 1, nickel: 5, nickels: 5, dime: 10, dimes: 10, quarter: 25, quarters: 25 };
const COIN_NAME: Record<number, [string, string]> = { 1: ["penny", "pennies"], 5: ["nickel", "nickels"], 10: ["dime", "dimes"], 25: ["quarter", "quarters"] };
const coinWords = (count: number, cents: number) => `${count} ${COIN_NAME[cents]![count === 1 ? 0 : 1]}`;
const nearest = (n: number, to: number) => Math.floor(n / to + .5) * to;
const minutesOf = (clock: string) => { const [h, m] = clock.split(":").map(Number); return h! * 60 + m!; };
const list = (items: string[]) => items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** Read a plain prompt shape and confirm it against the problem's answer. */
function shapeOf(prompt: string, answer: number): Shape | null {
  // A trailing "= ?" is the same sum ("8 + 7 = ?" reads as "8 + 7").
  const p = prompt.replace(/[−–—]/g, "-").replace(/\s+/g, " ").trim().replace(/ = \?$/, "");
  let m: RegExpMatchArray | null;
  const n = (s: string) => Number(s);
  let shape: Shape | null = null, value: number | null = null;
  if ((m = p.match(/^(\d+) [×x*] (\d+)$/i))) { shape = { op: "mul", a: n(m[1]!), b: n(m[2]!) }; value = shape.a * shape.b; }
  else if ((m = p.match(/^(\d+) [÷/] (\d+)$/))) { shape = { op: "div", a: n(m[1]!), b: n(m[2]!) }; value = shape.b ? shape.a / shape.b : null; }
  else if ((m = p.match(/^(\d+) \+ (\d+) \+ (\d+)$/))) { shape = { op: "add3", a: n(m[1]!), b: n(m[2]!), c: n(m[3]!) }; value = shape.a + shape.b + shape.c; }
  else if ((m = p.match(/^(\d+) \+ (\d+)$/))) { shape = { op: "add", a: n(m[1]!), b: n(m[2]!) }; value = shape.a + shape.b; }
  else if ((m = p.match(/^(\d+) - (\d+)$/))) { shape = { op: "sub", a: n(m[1]!), b: n(m[2]!) }; value = shape.a - shape.b; }
  else if ((m = p.match(/^(\d+) \+ \? = (\d+)$/)) || (m = p.match(/^\? \+ (\d+) = (\d+)$/))) { shape = { op: "gap", have: n(m[1]!), total: n(m[2]!) }; value = shape.total - shape.have; }
  else if ((m = p.match(/^Double (\d+)$/i))) { shape = { op: "double", n: n(m[1]!) }; value = 2 * shape.n; }
  else if ((m = p.match(/^Half of (\d+)$/i))) { shape = { op: "half", n: n(m[1]!) }; value = shape.n / 2; }
  else if ((m = p.match(/^(\d+), then\?$/i))) { shape = { op: "next", n: n(m[1]!) }; value = shape.n + 1; }
  else if ((m = p.match(/^(\d+), (\d+), (\d+), \?$/))) {
    const [a, b, c] = [n(m[1]!), n(m[2]!), n(m[3]!)];
    shape = { op: "seq", a, b, c }; value = b - a === c - b && b !== a ? c + (c - b) : null;
  }
  else if ((m = p.match(/^(?:(\d+) hundreds? )?(\d+) tens? (\d+) ones?$/i))) { shape = { op: "place", h: n(m[1] ?? "0"), t: n(m[2]!), o: n(m[3]!) }; value = shape.h * 100 + shape.t * 10 + shape.o; }
  else if ((m = p.match(/^\? - (\d+) = (\d+)$/))) { shape = { op: "start", take: n(m[1]!), left: n(m[2]!) }; value = shape.take + shape.left; }
  else if ((m = p.match(/^(\d+) - \? = (\d+)$/))) { shape = { op: "took", had: n(m[1]!), left: n(m[2]!) }; value = shape.had - shape.left; }
  else if ((m = p.match(/^(\d+) [×x*] \? = (\d+)$/i)) || (m = p.match(/^\? [×x*] (\d+) = (\d+)$/i))) { shape = { op: "each", groups: n(m[1]!), total: n(m[2]!) }; value = shape.groups ? shape.total / shape.groups : null; }
  else if ((m = p.match(/^(\d+) [÷/] \? = (\d+)$/))) { shape = { op: "piles", total: n(m[1]!), size: n(m[2]!) }; value = shape.size ? shape.total / shape.size : null; }
  else if ((m = p.match(/^(Bigger|Smaller): (\d+) or (\d+)\?$/i))) {
    shape = { op: "pick", bigger: /bigger/i.test(m[1]!), a: n(m[2]!), b: n(m[3]!) };
    value = shape.a === shape.b ? null : shape.bigger ? Math.max(shape.a, shape.b) : Math.min(shape.a, shape.b);
  }
  else if ((m = p.match(/^(Even|Odd) one: (\d+(?:, \d+)+)$/i))) {
    const even = /even/i.test(m[1]!), nums = m[2]!.split(", ").map(Number), fits = nums.filter(x => (x % 2 === 0) === even);
    shape = { op: "parity", even, nums }; value = fits.length === 1 ? fits[0]! : null;
  }
  else if ((m = p.match(/^(.+) = \?¢$/))) {
    const parts = m[1]!.split(" + ").map(part => part.match(/^(\d+) ([a-z]+)$/i)).map(found => found && COIN_CENTS[found[2]!.toLowerCase()] ? { count: n(found[1]!), coin: found[2]!.toLowerCase(), cents: COIN_CENTS[found[2]!.toLowerCase()]! } : null);
    if (parts.every(Boolean)) { shape = { op: "coins", parts: parts as { count: number; coin: string; cents: number }[] }; value = shape.parts.reduce((sum, part) => sum + part.count * part.cents, 0); }
  }
  else if ((m = p.match(/^How many ([a-z]+) make (\d+)¢\?$/i)) && COIN_CENTS[m[1]!.toLowerCase()]) { shape = { op: "coinCount", coin: m[1]!.toLowerCase(), cents: COIN_CENTS[m[1]!.toLowerCase()]!, total: n(m[2]!) }; value = shape.total / shape.cents; }
  else if ((m = p.match(/^(\d+)¢ \+ \?¢ = (\d+)¢$/))) { shape = { op: "centsGap", have: n(m[1]!), total: n(m[2]!) }; value = shape.total - shape.have; }
  else if ((m = p.match(/^Round (\d+) to nearest (10|100)$/i))) { shape = { op: "round", n: n(m[1]!), to: n(m[2]!) }; value = nearest(shape.n, shape.to); }
  else if ((m = p.match(/^About (\d+) \+ (\d+)\?$/i))) { shape = { op: "about", a: n(m[1]!), b: n(m[2]!) }; value = nearest(shape.a, 10) + nearest(shape.b, 10); }
  else if ((m = p.match(/^(\d+) [÷/] (\d+), leftover\?$/i))) { shape = { op: "rem", a: n(m[1]!), b: n(m[2]!) }; value = shape.b ? shape.a % shape.b : null; }
  else if ((m = p.match(/^(\d+)\/(\d+) of (\d+)$/))) { shape = { op: "frac", n: n(m[1]!), d: n(m[2]!), of: n(m[3]!) }; value = shape.d && shape.of % shape.d === 0 ? shape.of / shape.d * shape.n : null; }
  else if ((m = p.match(/^Pay (\d+)¢ for (\d+)¢, change\?$/i))) { shape = { op: "change", paid: n(m[1]!), price: n(m[2]!) }; value = shape.paid - shape.price; }
  else if ((m = p.match(/^(\d+:\d\d) to (\d+:\d\d), minutes\?$/i))) { shape = { op: "clock", from: m[1]!, to: m[2]! }; value = minutesOf(shape.to) - minutesOf(shape.from); }
  else if ((m = p.match(/^Minutes in (\d+) hours?\?$/i))) { shape = { op: "hours", h: n(m[1]!) }; value = shape.h * 60; }
  else if ((m = p.match(/^Square, side (\d+), all around\?$/i))) { shape = { op: "square", side: n(m[1]!) }; value = 4 * shape.side; }
  else if ((m = p.match(/^Rectangle (\d+) by (\d+), all around\?$/i))) { shape = { op: "rect", long: Math.max(n(m[1]!), n(m[2]!)), wide: Math.min(n(m[1]!), n(m[2]!)) }; value = 2 * (shape.long + shape.wide); }
  else if ((m = p.match(/^(\d+) rows of (\d+) tiles, total\?$/i))) { shape = { op: "rows", rows: n(m[1]!), each: n(m[2]!) }; value = shape.rows * shape.each; }
  // Trust math: a story is told only when the prompt's own arithmetic agrees.
  return shape && value === answer && Number.isInteger(value) && value >= 0 ? shape : null;
}

/** What the answer counts: the chest's treasure itself, or only a part/split of it. */
const countsTreasure = (shape: Shape): boolean => ["mul", "add", "sub", "add3", "double", "place", "start", "rows"].includes(shape.op);

export interface ChestStoryProblem { id: string; prompt: string; answer: number; topicId?: string | null }

/**
 * The chest-lock story for this problem, or null only when its prompt cannot
 * be read with certainty. Every kind of problem has a chest story. `paying`
 * is false once the expedition's paying chests are spent: such a chest holds
 * only old copper coins, so its story never promises treasure it will not pay.
 */
export function rpgChestStory(problem: ChestStoryProblem, tier: number, paying = true): ChestStory | null {
  const shape = shapeOf(problem.prompt, problem.answer);
  if (!shape) return null;
  const answer = problem.answer;
  const base = rpgRoomForgeDust(rpgTier(tier));
  const dust = paying && countsTreasure(shape) && shape.op !== "rows" && answer >= base && answer <= rpgChestDustCap(tier);
  const treasure: ChestTreasure = dust ? "dust" : "gold";
  const unit = dust ? "forge dust" : paying ? "gold coins" : "old copper coins";
  const coin = paying ? "gold coin" : "old copper coin";
  // Coins only, for stories where forge dust does not fit (stacks, piles, spills).
  const coins = dust ? "gold coins" : unit;
  // "1 gold coin", "3 gold coins", "5 forge dust".
  const of = (k: number, what = unit) => `${k} ${k === 1 ? what.replace(/coins$/, "coin") : what}`;
  // "How much forge dust is…" / "How many coins are…"
  const how = dust ? "How much forge dust" : "How many coins";
  const be = dust ? "is" : "are";
  const seed = problem.id;
  let text: string;
  switch (shape.op) {
    case "mul":
      text = pick(seed, [
        `The chest holds ${shape.a} pouches with ${of(shape.b)} in each. ${how} ${be} there in all?`,
        `Inside the chest are ${shape.a} little bags. Each bag has ${of(shape.b)}. ${how} ${be} there altogether?`,
      ]);
      break;
    case "div":
      text = `The chest holds ${of(shape.a, coins)}, packed in stacks of ${shape.b}. How many stacks are there?`;
      break;
    case "add":
      text = pick(seed, [
        `The chest holds ${of(shape.a)}, and ${shape.b} more ${shape.b === 1 ? "is" : "are"} hidden under the lid. ${how} ${be} there in all?`,
        `The chest has ${of(shape.a)} on top and ${of(shape.b)} at the bottom. ${how} ${be} there altogether?`,
      ]);
      break;
    case "sub":
      text = pick(seed, [
        `The chest held ${of(shape.a)}, but a sneaky imp grabbed ${shape.b}. ${how} ${be} left?`,
        `The chest held ${of(shape.a)}. ${shape.b} spilled out through a crack. ${how} ${be} still inside?`,
      ]);
      break;
    case "add3":
      text = `The chest has three pouches: ${shape.a}, ${shape.b} and ${of(shape.c)}. ${how} ${be} there in all?`;
      break;
    case "gap":
      text = `This chest fits ${of(shape.total, coins)}. It holds ${shape.have} now. How many more coins would fill it?`;
      break;
    case "double":
      text = `The chest has two pouches with ${of(shape.n)} in each. ${how} ${be} there in all?`;
      break;
    case "half":
      text = `The chest holds ${of(shape.n, coins)} in two equal piles. How many coins are in one pile?`;
      break;
    case "next":
      text = `Every ${coin} in this chest has a number stamped on it, counting up by one. The last coin says ${shape.n}. What number is on the next coin?`;
      break;
    case "seq": {
      const up = shape.b > shape.a;
      text = `The chest holds stacks of coins that ${up ? "grow" : "shrink"} the same way each time: ${shape.a}, ${shape.b}, ${shape.c}. How many coins are in the next stack?`;
      break;
    }
    case "place":
      text = shape.h
        ? `The chest holds ${shape.h} big ${shape.h === 1 ? "sack" : "sacks"} of one hundred ${unit}, ${shape.t} ${shape.t === 1 ? "bag" : "bags"} of ten, and ${shape.o} loose ${shape.o === 1 ? (dust ? "pinch" : "coin") : (dust ? "pinches" : "coins")}. ${how} ${be} there in all?`
        : `The chest holds ${shape.t} ${shape.t === 1 ? "bag" : "bags"} of ten ${unit} and ${shape.o} loose ${shape.o === 1 ? (dust ? "pinch" : "coin") : (dust ? "pinches" : "coins")}. ${how} ${be} there in all?`;
      break;
    case "start":
      text = `Some ${unit} ${be === "is" ? "was" : "were"} in the chest. A sneaky imp took ${shape.take}, and ${shape.left} are left. ${how} ${be === "is" ? "was" : "were"} there at first?`;
      break;
    case "took":
      text = `The chest held ${of(shape.had, coins)}. Some spilled out through a crack, and ${shape.left} are still inside. How many coins spilled out?`;
      break;
    case "each":
      text = `The chest has ${shape.groups} pouches with the same number of ${coins} in each, ${shape.total} coins in all. How many coins are in each pouch?`;
      break;
    case "piles":
      text = `The chest holds ${of(shape.total, coins)}, packed in stacks of ${shape.size}. How many stacks are there?`;
      break;
    case "pick":
      text = `Two pouches sit in the chest. One holds ${of(shape.a, coins)}, the other holds ${shape.b}. Which pouch has ${shape.bigger ? "more" : "fewer"} coins? Type how many coins it holds.`;
      break;
    case "parity":
      text = shape.even
        ? `The chest has pouches of ${list(shape.nums.map(String))} coins. Only one pouch splits into two equal piles with none left over. Type how many coins that pouch holds.`
        : `The chest has pouches of ${list(shape.nums.map(String))} coins. Only one pouch has one coin left over when you split it into two equal piles. Type how many coins that pouch holds.`;
      break;
    case "coins":
      text = `The chest holds ${list(shape.parts.map(part => coinWords(part.count, part.cents)))}. How many cents is that in all?`;
      break;
    case "coinCount":
      text = `The chest holds ${shape.total} cents, all in ${COIN_NAME[shape.cents]![1]}. How many ${COIN_NAME[shape.cents]![1]} are there?`;
      break;
    case "centsGap":
      text = `The chest holds ${shape.have} cents. How many more cents would make ${shape.total} cents?`;
      break;
    case "round":
      text = `The chest holds ${of(shape.n, coins)}. The merchant counts only in ${shape.to === 100 ? "hundreds" : "tens"}. What is ${shape.n} rounded to the nearest ${shape.to === 100 ? "hundred" : "ten"}?`;
      break;
    case "about":
      text = `One pouch in the chest holds ${shape.a} coins and another holds ${shape.b}. Round each to the nearest ten. About how many coins is that in all?`;
      break;
    case "rem":
      text = `The chest holds ${of(shape.a, coins)}. You stack them in piles of ${shape.b}. How many coins are left over?`;
      break;
    case "frac":
      text = shape.n === 1
        ? `The chest holds ${of(shape.of, coins)}. You split them into ${shape.d} equal piles and take one pile. How many coins do you take?`
        : `The chest holds ${of(shape.of, coins)}. You split them into ${shape.d} equal piles and take ${shape.n} of the piles. How many coins do you take?`;
      break;
    case "change":
      text = `The key to this chest costs ${shape.price} cents. You pay with ${shape.paid} cents. How many cents of change do you get back?`;
      break;
    case "clock":
      text = `The chest's magic lock clicks open at ${shape.to}. It is ${shape.from} now. How many minutes until it opens?`;
      break;
    case "hours":
      text = `The chest's magic lock opens after ${shape.h} ${shape.h === 1 ? "hour" : "hours"}. How many minutes is that?`;
      break;
    case "square":
      text = `The chest's lid is a square, ${shape.side} long on every side. A gold ribbon goes all the way around its edge. How long is the ribbon?`;
      break;
    case "rect":
      text = `The chest's lid is a rectangle, ${shape.long} long and ${shape.wide} wide. A gold ribbon goes all the way around its edge. How long is the ribbon?`;
      break;
    case "rows":
      text = `The ${coins} in the chest lie in ${shape.rows} rows, with ${shape.each} coins in each row. How many coins are there in all?`;
      break;
  }
  return {
    text, spoken: text, treasure,
    counted: countsTreasure(shape) ? answer : null,
    forgeDust: dust ? answer : null,
  };
}

/**
 * The shrine-lock story for this problem, or null to keep the plain form. A
 * shrine pays a boon, not treasure, so its stories count candles, runes and
 * crystal sparks, and nothing the answer counts is paid.
 */
export function rpgShrineStory(problem: ChestStoryProblem): { text: string; spoken: string } | null {
  const kind = problem.topicId ? TOPICS.find(t => t.id === problem.topicId)?.gen.kind : undefined;
  if (kind && !STORY_KINDS.has(kind)) return null;
  const shape = shapeOf(problem.prompt, problem.answer);
  if (!shape) return null;
  const seed = problem.id;
  let text: string;
  switch (shape.op) {
    case "mul":
      text = pick(seed, [
        `The shrine has ${shape.a} rows of candles with ${shape.b} candles in each row. How many candles are there in all?`,
        `${shape.a} crystals ring the shrine. Each crystal holds ${shape.b} sparks of light. How many sparks are there altogether?`,
      ]);
      break;
    case "div":
      text = `The shrine has ${shape.a} candles standing in rows of ${shape.b}. How many rows are there?`;
      break;
    case "add":
      text = pick(seed, [
        `${shape.a} candles burn on the shrine, and you light ${shape.b} more. How many candles are burning now?`,
        `The shrine has ${shape.a} runes on the left and ${shape.b} runes on the right. How many runes are there in all?`,
      ]);
      break;
    case "sub":
      text = pick(seed, [
        `${shape.a} candles burned on the shrine. A cold wind blew out ${shape.b}. How many are still burning?`,
        `The shrine had ${shape.a} glowing runes. ${shape.b} faded away. How many runes still glow?`,
      ]);
      break;
    case "add3":
      text = `Three crystals glow on the shrine, with ${shape.a}, ${shape.b} and ${shape.c} sparks. How many sparks are there in all?`;
      break;
    case "gap":
      text = `The shrine has ${shape.total} candle cups. ${shape.have} candles are lit. How many more candles would light every cup?`;
      break;
    case "double":
      text = `Two crystals on the shrine each hold ${shape.n} sparks. How many sparks are there in all?`;
      break;
    case "half":
      text = `${shape.n} candles stand in two equal rows before the shrine. How many candles are in one row?`;
      break;
    default:
      return null;
  }
  return { text, spoken: text };
}
