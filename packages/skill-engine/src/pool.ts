import type { SkillId, SkillState, Taxonomy } from "./types.ts";

export const DEFAULT_POOL_SIZE = 6;

export type EligiblePoolOptions = {
  maxPoolSize?: number;
};

/**
 * Returns the SkillIds the kid should be practicing today, in priority order:
 *   1. Skills currently due for review.
 *   2. Skills currently in `learning` or `practicing`.
 *   3. One stretch skill: the easiest unstarted skill whose every prereq is at
 *      least `practicing` (or `mastered`/`review`).
 * Capped to `maxPoolSize` (default 6).
 */
export function eligiblePool(
  states: SkillState[],
  taxonomy: Taxonomy,
  now: Date,
  opts: EligiblePoolOptions = {},
): SkillId[] {
  const cap = opts.maxPoolSize ?? DEFAULT_POOL_SIZE;
  const byId = new Map(states.map((s) => [s.skillId, s] as const));
  const result: SkillId[] = [];
  const seen = new Set<SkillId>();

  // 1. Due reviews
  for (const s of states) {
    if (s.state === "review" && s.nextReviewAt && s.nextReviewAt.getTime() <= now.getTime()) {
      if (!seen.has(s.skillId)) {
        result.push(s.skillId);
        seen.add(s.skillId);
      }
    }
  }

  // 2. Active learning/practicing
  for (const s of states) {
    if (s.state === "learning" || s.state === "practicing") {
      if (!seen.has(s.skillId)) {
        result.push(s.skillId);
        seen.add(s.skillId);
      }
    }
  }

  // 3. Stretch — easiest unstarted skill whose prereqs are all practicing+
  if (result.length < cap) {
    const stretch = pickStretch(taxonomy, byId, seen);
    if (stretch) {
      result.push(stretch);
      seen.add(stretch);
    }
  }

  return result.slice(0, cap);
}

function pickStretch(
  taxonomy: Taxonomy,
  byId: Map<SkillId, SkillState>,
  seen: Set<SkillId>,
): SkillId | undefined {
  // Sort by lower bound of difficultyBand ascending — easiest first.
  const candidates = [...taxonomy].sort(
    (a, b) => a.difficultyBand[0] - b.difficultyBand[0],
  );
  for (const skill of candidates) {
    if (seen.has(skill.id)) continue;
    const state = byId.get(skill.id);
    if (state && state.state !== "unstarted") continue;
    if (!prereqsMet(skill.prereqs, byId)) continue;
    return skill.id;
  }
  return undefined;
}

function prereqsMet(prereqs: SkillId[], byId: Map<SkillId, SkillState>): boolean {
  for (const p of prereqs) {
    const s = byId.get(p);
    if (!s) return false;
    if (s.state === "unstarted" || s.state === "learning") return false;
  }
  return true;
}
