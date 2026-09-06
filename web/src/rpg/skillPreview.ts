import { RPG_SKILLS, RPG_SPELLS, rpgSpellCombatStats, rpgSpellModifiers, rpgSpellUnlocked, type RpgState } from '@institute/shared';

/** Preview one rank against the actual loadout, without spending or changing state. */
export function skillUpgradePreview(state: Pick<RpgState, 'skills' | 'selectedSpellId' | 'equippedItemId'>, skillId: string, _encounterIndex: number) {
  const skill = RPG_SKILLS.find(entry => entry.id === skillId);
  if (!skill || (state.skills[skillId] ?? 0) >= skill.maxRank) return null;
  const after = { ...state, skills: { ...state.skills, [skillId]: (state.skills[skillId] ?? 0) + 1 } };
  const spells = RPG_SPELLS.filter(spell => rpgSpellUnlocked(spell.id, after.skills)
    && (skill.scope === 'school' ? spell.school === skill.school : spell.id === skill.spellId));
  return spells.map(spell => {
    const beforeModifiers = rpgSpellModifiers(state, spell.id);
    const before = rpgSpellCombatStats(state, spell.id), next = rpgSpellCombatStats(after, spell.id);
    return { spell, before: before.targets, after: next.targets, extraTargets: next.targets - before.targets,
      beforeDamage: before.damage, afterDamage: next.damage, extraDamage: next.damage - before.damage,
      unlocked: !rpgSpellUnlocked(spell.id, state.skills),
      newModifiers: rpgSpellModifiers(after, spell.id).filter(effect => !beforeModifiers.includes(effect)),
      existingModifier: !!skill.effect && beforeModifiers.includes(skill.effect) };
  });
}
