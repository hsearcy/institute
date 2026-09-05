import { RPG_SKILLS, RPG_SPELLS, rpgLevel, rpgSpellUnlocked, type RpgSkill, type RpgSpellId, type RpgState } from '@institute/shared';

/** A personal spell target describes existing RPG gates; it never adds a quest,
 * changes rewards, or influences the tutor. One rank satisfies a prerequisite. */
export function nextSpellGoal(state: Pick<RpgState, 'xp' | 'level' | 'skillPoints' | 'skills'>, preferred?: RpgSpellId | null) {
  const spell = RPG_SPELLS.find(spell => spell.id === preferred)
    ?? RPG_SPELLS.filter(spell => !rpgSpellUnlocked(spell.id, state.skills))
      .sort((a, b) => RPG_SKILLS.find(skill => skill.id === a.skillId)!.level - RPG_SKILLS.find(skill => skill.id === b.skillId)!.level)[0];
  if (!spell) return null;
  const path: RpgSkill[] = [];
  let skill = RPG_SKILLS.find(skill => skill.id === spell.skillId);
  while (skill) { path.unshift(skill); skill = RPG_SKILLS.find(parent => parent.id === skill!.parentId); }
  const learned = rpgSpellUnlocked(spell.id, state.skills);
  const next = learned ? undefined : path.find(skill => !(state.skills[skill.id] > 0));
  const requiredLevel = next ? Math.max(next.level, state.level + (state.skillPoints === 0 ? 1 : 0)) : state.level;
  let requiredXp = state.xp;
  while (rpgLevel(requiredXp).level < requiredLevel) {
    const level = rpgLevel(requiredXp);
    requiredXp += level.xpForNextLevel - level.xpIntoLevel;
  }
  return { spell, path, next, learned, ready: !!next && state.level >= next.level && state.skillPoints > 0, xpRemaining: requiredXp - state.xp };
}
