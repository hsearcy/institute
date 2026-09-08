import {
  RPG_SCHOOLS, RPG_SKILLS, RPG_SPELLS, rpgSpellCombatStats, rpgSpellModifiers, rpgSpellUnlocked, rpgSpellAvailable,
  type RpgModifier, type RpgSchoolId, type RpgSpellId, type RpgState,
} from '@institute/shared';
import { escapeHtml as esc, icon, spellArt } from './icons';

export interface SpellbookViewProps {
  state: RpgState;
  school: RpgSchoolId;
  trackedSpell: RpgSpellId | null;
  playing: boolean;
  /** The existing remembered spell for the open school; this view never saves it. */
  favoriteSpell?: RpgSpellId;
}

const modifierNames: Record<RpgModifier, string> = {
  burn: 'Burning ground', 'ice-shards': 'Ice shards', chain: 'Forked lightning',
  echo: 'Second strike', pierce: 'Piercing splinters', wide: 'Wider sweep',
  orbit: 'Orbiting sparks', summon: 'Twin guardians',
};

// One restrained, symmetric engraved ornament. It is decorative rather than a control.
const engraving = `<svg class="rpg-grimoire-engraving" viewBox="0 0 240 26" aria-hidden="true" fill="none"><path d="M5 13h71l12-7h21m22 0h21l12 7h71M37 17h37l14-7h14m36 0h14l14 7h37M102 13l18-11 18 11-18 11Z"/><path d="m114 13 6-6 6 6-6 6Z"/></svg>`;

/** Pure presentation. Spell and school buttons retain RpgGame's existing handlers. */
export function renderSpellbookView({ state, school: schoolId, trackedSpell, playing, favoriteSpell }: SpellbookViewProps): string {
  const school = RPG_SCHOOLS.find(entry => entry.id === schoolId) ?? RPG_SCHOOLS[0];
  const spells = RPG_SPELLS.filter(spell => spell.school === school.id);
  const isLearned = (id: RpgSpellId) => rpgSpellUnlocked(id, state.skills);
  const isAvailable = (id: RpgSpellId) => rpgSpellAvailable(state, id);
  const relicCount = RPG_SPELLS.filter(spell => isAvailable(spell.id) && !isLearned(spell.id)).length;
  const focus = spells.find(spell => spell.id === state.selectedSpellId)
    ?? spells.find(spell => spell.id === trackedSpell)
    ?? spells.find(spell => spell.id === favoriteSpell && isAvailable(spell.id))
    ?? spells[0];
  const learned = isAvailable(focus.id);
  const fromRelic = learned && !isLearned(focus.id);
  const selected = state.selectedSpellId === focus.id;
  const unlock = RPG_SKILLS.find(skill => skill.id === focus.skillId);
  const parent = RPG_SKILLS.find(skill => skill.id === unlock?.parentId);
  const power = rpgSpellCombatStats(state, focus.id);
  const modifiers = learned ? rpgSpellModifiers(state, focus.id) : [];
  const learnedCount = RPG_SPELLS.filter(spell => isLearned(spell.id)).length;
  const chapter = ['I', 'II', 'III'][RPG_SCHOOLS.indexOf(school)];
  const description = focus.description;

  return `<div class="rpg-grimoire" style="--spell-color:${school.color}">
    <header class="rpg-grimoire-title">
      <p class="rpg-eyebrow">THE GRIMOIRE</p>
      <h2 id="rpg-dialog-title">Your spells <small>${learnedCount} / ${RPG_SPELLS.length} learned${relicCount ? ` · ${relicCount} from relic` : ''}</small></h2>
      <p>Choose a spell for your next cast.</p>
    </header>
    <div class="rpg-school-tabs" role="group" aria-label="Magic school">${RPG_SCHOOLS.map(entry => `<button data-school="${entry.id}" data-view="spellbook" class="${entry.id === school.id ? 'active' : ''}" style="--spell-color:${entry.color}" aria-pressed="${entry.id === school.id}">${spellArt(entry.id)}<span>${esc(entry.name)}</span></button>`).join('')}</div>
    <div class="rpg-grimoire-spread">
      <section class="rpg-grimoire-feature ${learned ? 'learned' : 'locked'}" aria-labelledby="rpg-featured-spell">
        <div class="rpg-grimoire-chapter"><span>CHAPTER ${chapter}</span><b>${esc(school.name)}</b><span>${String(spells.indexOf(focus) + 1).padStart(2, '0')} / 05</span></div>
        <div class="rpg-grimoire-portrait"><div class="rpg-grimoire-bezel">${spellArt(focus.id)}</div><span class="rpg-grimoire-portrait-mark" aria-hidden="true">◆</span></div>
        <div class="rpg-grimoire-feature-copy">
          <span class="rpg-grimoire-feature-state">${fromRelic ? selected ? 'SELECTED · FROM RELIC' : 'FROM RELIC' : selected ? 'SELECTED SPELL' : learned ? 'LEARNED SPELL' : trackedSpell === focus.id ? 'YOUR NEXT SPELL' : 'UNDISCOVERED SPELL'}</span>
          <h3 id="rpg-featured-spell">${esc(focus.name)}</h3>
          <p class="rpg-grimoire-description">${esc(description)}</p>${fromRelic ? '<p class="rpg-grimoire-requirement">From relic · available while equipped.<br>Learn it in the skill tree to keep it.</p>' : ''}
        </div>
        <div class="rpg-grimoire-feature-bottom">
          ${engraving}
          ${learned ? `<div class="rpg-grimoire-power"><strong>${power.damage}</strong><span>damage per target<small>Up to ${power.targets} targets · with your equipment</small></span></div>${modifiers.length ? `<ul class="rpg-grimoire-modifiers" aria-label="Spell enhancements">${modifiers.map(modifier => `<li>${modifierNames[modifier]}</li>`).join('')}</ul>` : ''}` : `<p class="rpg-grimoire-requirement">Learn in the ${esc(school.name)} skill tree.<br><b>Level ${unlock?.level ?? 1}</b>${parent ? ` · Requires ${esc(parent.name)}` : ''}</p>`}
        </div>
      </section>
      <section class="rpg-grimoire-index" aria-label="${esc(school.name)} spells">
        <div class="rpg-grimoire-index-heading"><h3>${esc(school.name)} spells</h3><span>${spells.filter(spell => isLearned(spell.id)).length} / 5 learned</span></div>
        <div class="rpg-spell-library">${spells.map((spell, index) => {
          const unlocked = isAvailable(spell.id);
          const borrowed = unlocked && !isLearned(spell.id);
          const chosen = state.selectedSpellId === spell.id;
          const focused = focus.id === spell.id;
          const tracked = trackedSpell === spell.id;
          const skill = RPG_SKILLS.find(entry => entry.id === spell.skillId);
          const status = borrowed ? chosen ? 'Selected · From relic' : 'From relic · Select spell' : chosen ? 'Selected' : unlocked ? 'Select spell' : tracked ? 'Tracked · View skill tree' : `Level ${skill?.level ?? 1} · Track spell`;
          return `<button class="rpg-spell-card rpg-grimoire-entry ${unlocked ? 'learned' : 'locked'} ${chosen ? 'selected' : ''} ${focused ? 'focused' : ''} ${tracked && !unlocked ? 'tracked' : ''}" data-spell="${spell.id}" style="--spell-color:${spell.color}" aria-pressed="${chosen}" ${focused ? 'aria-describedby="rpg-featured-spell"' : ''} aria-label="${esc(spell.name)}, ${focused && !chosen ? 'viewing, ' : ''}${esc(status)}">
            <span class="rpg-grimoire-entry-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
            <span class="rpg-grimoire-entry-art">${spellArt(spell.id)}${!unlocked ? `<span class="rpg-grimoire-entry-lock">${icon('lock')}</span>` : ''}</span>
            <span class="rpg-grimoire-entry-copy"><strong>${esc(spell.name)}</strong><span>${focused && !chosen ? '<small class="rpg-grimoire-viewing">Viewing</small>' : ''}${esc(status)}</span></span>
            <span class="rpg-grimoire-entry-mark" aria-hidden="true">${chosen ? '◆' : '›'}</span>
          </button>`;
        }).join('')}</div>
        <p class="rpg-grimoire-index-note">${spells.every(spell => isLearned(spell.id)) ? 'All five spells learned. Shape them further in your skill tree.' : 'Choose a locked spell to follow its path in the skill tree.'}</p>
        <button class="rpg-grimoire-tree-link" data-action="skills">${icon('tree')}<span>Learn new spells</span><span aria-hidden="true">→</span></button>
      </section>
    </div>
    <div class="rpg-button-row rpg-grimoire-footer"><span>Each school remembers your last spell.</span><button class="rpg-primary" data-action="close">${playing ? 'Return to dungeon' : 'Back to camp'}</button></div>
  </div>`;
}
