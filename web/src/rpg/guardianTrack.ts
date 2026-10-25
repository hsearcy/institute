import { RPG_GUARDIAN_ENCOUNTER, RPG_GUARDIAN_PACKS, rpgGuardianAwake, rpgPacksCleared, type RpgExpedition } from '@institute/shared';
import { escapeHtml as esc } from './icons';

/**
 * The track at the top: one mark per pack still needed to wake the guardian,
 * then the guardian. Packs beyond those are counted, as packs never run out.
 */
export function renderGuardianTrack(expedition: RpgExpedition | null | undefined, bossName: string): string {
  if (!expedition) return '';
  const packs = rpgPacksCleared(expedition), awake = rpgGuardianAwake(expedition), fighting = expedition.encounterIndex === RPG_GUARDIAN_ENCOUNTER;
  const marks = Array.from({ length: RPG_GUARDIAN_PACKS }, (_, i) =>
    `<span class="${expedition.cleared || i < packs ? 'complete' : i === packs ? 'current' : ''}" title="Pack ${i + 1}">◆</span>`).join('');
  const extra = packs > RPG_GUARDIAN_PACKS ? `<small class="rpg-route-extra" title="Packs defeated">+${packs - RPG_GUARDIAN_PACKS}</small>` : '';
  const title = expedition.cleared ? `${bossName} defeated` : fighting ? `${bossName} is awake` : awake ? `${bossName} is awake. Find the sanctum` : `${bossName} wakes after ${RPG_GUARDIAN_PACKS} packs`;
  const state = expedition.cleared ? 'complete' : fighting ? 'current' : awake ? 'awake' : '';
  return `${marks}${extra}<span class="${state}" title="${esc(title)}">♜</span>`;
}
