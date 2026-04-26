import type { Db } from "../persistence/db";
import { loadAllSkillStates, saveSkillState } from "../persistence/skillStateRepo";
import {
  TAXONOMY,
  eligiblePool,
  initialSkillState,
  getSkill,
  type SkillId,
  type MasteryState,
} from "@institute/skill-engine";

export type EligiblePoolEntry = {
  skillId: SkillId;
  description: string;
  masteryState: MasteryState;
  currentDifficulty: number;
  attempts: number;
  correct: number;
};

/**
 * Compute the eligible pool for the profile, reading skill_state from `db`.
 *
 * On a fresh profile (no rows yet), seed `unstarted` rows for every skill
 * with no prereqs and persist them, so the stretch logic always has at
 * least one candidate.
 */
export function computeEligiblePool(db: Db, profileId: string, now: Date): EligiblePoolEntry[] {
  let states = loadAllSkillStates(db, profileId);

  if (states.length === 0) {
    for (const skill of TAXONOMY) {
      if (skill.prereqs.length === 0) {
        const seed = initialSkillState(profileId, skill.id);
        seed.updatedAt = now;
        saveSkillState(db, seed);
      }
    }
    states = loadAllSkillStates(db, profileId);
  }

  const ids = eligiblePool(states, TAXONOMY, now);
  const byId = new Map(states.map((s) => [s.skillId, s] as const));

  return ids.map((id) => {
    const s = byId.get(id);
    const skill = getSkill(TAXONOMY, id);
    return {
      skillId: id,
      description: skill?.description ?? id,
      masteryState: s?.state ?? "unstarted",
      currentDifficulty: s?.currentDifficulty ?? skill?.difficultyBand[0] ?? 0,
      attempts: s?.attempts ?? 0,
      correct: s?.correct ?? 0,
    };
  });
}
