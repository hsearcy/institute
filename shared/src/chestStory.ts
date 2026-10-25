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

/** Kinds whose problems read naturally as a chest's contents. Others stay plain. */
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
  | { op: "half"; n: number };

/** Read a plain prompt shape and confirm it against the problem's answer. */
function shapeOf(prompt: string, answer: number): Shape | null {
  const p = prompt.replace(/[−–—]/g, "-").replace(/\s+/g, " ").trim();
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
  // Trust math: a story is told only when the prompt's own arithmetic agrees.
  return shape && value === answer && Number.isInteger(value) && value >= 0 ? shape : null;
}

/** What the answer counts: the chest's treasure itself, or only a part/split of it. */
const countsTreasure = (shape: Shape): boolean => ["mul", "add", "sub", "add3", "double"].includes(shape.op);

export interface ChestStoryProblem { id: string; prompt: string; answer: number; topicId?: string | null }

/**
 * The chest-lock story for this problem, or null to keep the plain form.
 * `paying` is false once the expedition's paying chests are spent: an empty
 * chest never tells a story about treasure it will not pay.
 */
export function rpgChestStory(problem: ChestStoryProblem, tier: number, paying = true): ChestStory | null {
  if (!paying) return null;
  const kind = problem.topicId ? TOPICS.find(t => t.id === problem.topicId)?.gen.kind : undefined;
  if (kind && !STORY_KINDS.has(kind)) return null;
  const shape = shapeOf(problem.prompt, problem.answer);
  if (!shape) return null;
  const answer = problem.answer;
  const base = rpgRoomForgeDust(rpgTier(tier));
  const dust = countsTreasure(shape) && answer >= base && answer <= rpgChestDustCap(tier);
  const treasure: ChestTreasure = dust ? "dust" : "gold";
  const unit = dust ? "forge dust" : "gold coins";
  // "How much forge dust is…" / "How many coins are…"
  const how = dust ? "How much forge dust" : "How many coins";
  const be = dust ? "is" : "are";
  const seed = problem.id;
  let text: string;
  switch (shape.op) {
    case "mul":
      text = pick(seed, [
        `The chest holds ${shape.a} pouches with ${shape.b} ${unit} in each. ${how} ${be} there in all?`,
        `Inside the chest are ${shape.a} little bags. Each bag has ${shape.b} ${unit}. ${how} ${be} there altogether?`,
      ]);
      break;
    case "div":
      text = `The chest holds ${shape.a} gold coins, packed in stacks of ${shape.b}. How many stacks are there?`;
      break;
    case "add":
      text = pick(seed, [
        `The chest holds ${shape.a} ${unit}, and ${shape.b} more are hidden under the lid. ${how} ${be} there in all?`,
        `The chest has ${shape.a} ${unit} on top and ${shape.b} ${unit} at the bottom. ${how} ${be} there altogether?`,
      ]);
      break;
    case "sub":
      text = pick(seed, [
        `The chest held ${shape.a} ${unit}, but a sneaky imp grabbed ${shape.b}. ${how} ${be} left?`,
        `The chest held ${shape.a} ${unit}. ${shape.b} spilled out through a crack. ${how} ${be} still inside?`,
      ]);
      break;
    case "add3":
      text = `The chest has three pouches: ${shape.a}, ${shape.b} and ${shape.c} ${unit}. ${how} ${be} there in all?`;
      break;
    case "gap":
      text = `This chest fits ${shape.total} gold coins. It holds ${shape.have} now. How many more coins would fill it?`;
      break;
    case "double":
      text = `The chest has two pouches with ${shape.n} ${unit} in each. ${how} ${be} there in all?`;
      break;
    case "half":
      text = `The chest holds ${shape.n} gold coins in two equal piles. How many coins are in one pile?`;
      break;
  }
  return {
    text, spoken: text, treasure,
    counted: countsTreasure(shape) ? answer : null,
    forgeDust: dust ? answer : null,
  };
}
