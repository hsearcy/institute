// server/src/visuals.ts — on-screen context built from a problem's numbers. Pure,
// so the ladder a child sees is always exact (never LLM-authored).
import type { ProblemVisual } from "@institute/shared";

/** At or above this difficulty a table problem shows NO ladder: it is pure recall.
 *  Mastery's speed gate for table topics counts only solves at this level. */
export const UNAIDED_FROM = 0.9;

/** Difficulty climbs by at most this per correct answer on a table topic, so each
 *  ladder stage lasts a few problems instead of one (~11 correct to reach recall). */
export const TABLE_STEP_UP = 0.06;

/** Facts a young child already knows by heart; the one-anchor level leans on them. */
const ANCHORS = [2, 5, 10];
export const TABLE_MAX = 12;

/** The known fact to build from: the anchor just below when it is close (adding
 *  on is easier than taking away), else the nearest one. */
export function anchorFor(k: number): number {
  const below = [...ANCHORS].reverse().find((a) => a <= k);
  if (below !== undefined && k - below <= 2) return below;
  return [...ANCHORS].sort((a, b) => Math.abs(a - k) - Math.abs(b - k) || a - b)[0];
}

/** How much of the table to show around `table × k`, fading as difficulty rises:
 *  the whole table → two neighbors each side → one each side → one anchor fact →
 *  nothing. */
export function factLadder(table: number, k: number, difficulty: number): ProblemVisual | undefined {
  let factors: number[];
  const near = (n: number) => [k - n, k - 1, k + 1, k + n].filter((f) => f >= 1 && f <= TABLE_MAX);
  if (difficulty >= UNAIDED_FROM) return undefined;
  if (difficulty < 0.45) factors = Array.from({ length: TABLE_MAX }, (_, i) => i + 1);
  else if (difficulty < 0.62) factors = near(2);
  else if (difficulty < 0.77) factors = [...new Set(near(1))];
  else {
    // The target IS a known fact: nothing useful to lean on.
    if (ANCHORS.includes(k)) return undefined;
    factors = [anchorFor(k)];
  }
  return {
    kind: "fact_ladder", table, target: k,
    rows: factors.filter((f) => f !== k).map((f) => ({ factor: f, product: table * f })),
  };
}

/** A strategy hint that points at a fact he can SEE (or knows), never the answer. */
export function tableHint(table: number, k: number, visual: ProblemVisual | undefined): string {
  const near = visual?.rows.find((r) => r.factor === k - 1);
  if (near) return `Find ${table} × ${k - 1} = ${near.product}. Add one more ${table}.`;
  if (ANCHORS.includes(k)) return `Count by ${table}s, ${k} times.`;
  const a = anchorFor(k);
  const n = Math.abs(k - a);
  const groups = n === 1 ? `one more ${table}` : `${n} more ${table}s`;
  return k > a
    ? `Start from ${table} × ${a} = ${table * a}. Add ${groups}.`
    : `Start from ${table} × ${a} = ${table * a}. Take away ${n === 1 ? `one ${table}` : `${n} ${table}s`}.`;
}
