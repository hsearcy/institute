import { ITEM_MODELS } from './itemModels';

// Original lightweight vector UI art. The dungeon/characters use Blender GLBs.
const paths: Record<string, string> = {
  forge: '<path d="M7 34h48v7H39l-3 7v5h10v6H19v-6h9v-5l-8-7h-5Z"/><path d="m27 8 7-6 18 15-7 8Z"/><path d="m34 20-12 14-5-4 12-15Z"/><path d="m8 18 5 4m1-12 2 6m-10 9 6 1" fill="none"/>' ,
  forest: '<path d="m19 6 14 22h-8l12 18H6l12-18h-8Zm24 9 14 22H30Z"/><path d="M20 45v13m23-21v21" fill="none"/>',
  coast: '<path d="M5 41q8-10 17 0t18 0 19 0M5 52q8-10 17 0t18 0 19 0" fill="none"/><path d="m9 33 10-21 11 7 6 14Z"/><circle cx="46" cy="13" r="6"/>',
  quarry: '<path d="m5 48 9-22 13 5 11-19 16 9 5 27Z" fill="none"/><path d="m13 47 7-11 10 4 12-17 12 4M8 56h48" fill="none"/>',
  garden: '<path d="M12 57V26a20 20 0 0 1 40 0v31M20 57V26a12 12 0 0 1 24 0v31M7 57h50" fill="none"/><path d="M12 45C0 35 5 29 12 35M51 34c14-11 9-19 1-10"/>',
  ember: '<path d="M32 7c6 15-9 16 0 26 1-8 9-9 8-16 16 17 16 34-8 39C9 51 11 34 22 24c-2 12 5 12 5 7 0-10 8-12 5-24Z"/><ellipse cx="32" cy="48" rx="25" ry="9" fill="none"/>',
  frost: '<path d="m32 5 10 20 14 7-14 8-10 19-10-19L8 32l14-7Z"/><path d="M32 8v48M10 32h44M17 17l30 30M47 17 17 47" fill="none"/>',
  storm: '<path d="m36 4-23 32h16l-6 25 29-37H35Z"/><path d="m11 15 5 8-9 7m45 12-7 4 8 9" fill="none"/>',
  sword: '<path d="m48 5 11 1-1 11-29 27-11-11Z"/><path d="m12 31 22 22M21 43 7 57m0-10 10 10" fill="none"/>',
  bag: '<path d="M17 20h30l7 34H10Z"/><path d="M23 20V10h18v10M12 34h40M27 31v12h10V31" fill="none"/>',
  tree: '<path d="m32 4 9 10-9 10-9-10Zm-17 34 9 10-9 10-9-10Zm34 0 9 10-9 10-9-10Z"/><path d="M32 24v8H15v6m17-6h17v6" fill="none"/>',
  map: '<path d="m6 14 17-7 18 7 17-7v43l-17 7-18-7-17 7Z" fill="none"/><path d="M23 7v43m18-36v43M13 32l6-5 13 9 19-12" fill="none"/>',
  ring: '<ellipse cx="32" cy="38" rx="18" ry="21" fill="none" stroke-width="7"/><path d="m32 5 12 10-12 13-12-13Z"/>',
  sound: '<path d="M8 25h12l15-13v40L20 39H8Z"/><path d="M43 22q12 10 0 20m5-27q20 17 0 34" fill="none"/>',
  muted: '<path d="M8 25h12l15-13v40L20 39H8Z"/><path d="m43 24 14 16m0-16L43 40" fill="none"/>',
  help: '<circle cx="32" cy="32" r="24" fill="none"/><path d="M24 24c0-12 22-12 18 1-2 6-11 5-10 15m0 6v3" fill="none"/>',
  lock: '<rect x="15" y="27" width="34" height="28" rx="4"/><path d="M22 27V16a10 10 0 0 1 20 0v11" fill="none"/>',
  shield: '<path d="m32 6 22 8v19c-2 13-12 21-22 26C22 54 12 46 10 33V14Z" fill="none"/><path d="m20 31 8 9 17-21" fill="none"/>',
  crown: '<path d="m7 17 13 11L32 8l12 20 13-11-7 33H14Z"/><path d="M15 57h34" fill="none"/>',
};
export function icon(name: string, cls = ''): string {
  return `<svg class="rpg-icon ${cls}" viewBox="0 0 64 64" aria-hidden="true" fill="currentColor" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${paths[name] ?? paths.sword}</svg>`;
}
export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
}

/** Illustrated production atlas: five abilities per school, three rows. */
const spellAtlas = ['ember','cleave','meteor','phoenix_dive','firestorm','frost','ice_lance','glacial_surge','blizzard','frost_guardian','storm','arc_lance','thunderclap','ball_lightning','tempest'];
export function spellArt(id: string): string {
  const index = Math.max(0,spellAtlas.indexOf(id));
  return `<span class="rpg-spell-art rpg-painted-art" aria-hidden="true" style="--art-x:${(index % 5)*25}%;--art-y:${Math.floor(index/5)*50}%"></span>`;
}

const relicAtlas = ['apprentice','cinderwand','glacier','thunderrod','moonstaff','phoenix','wintercrown','tempest','cleaver','starfall','phoenix_talon','inferno','sunforged','icespear','tideglass','hailcaller','wardenheart','winterbranch','arcfang','thunderbell','stormorbit','skybreaker','stormsilver'];
export function relicArt(id: string): string {
  const authored = ITEM_MODELS[id];
  if (authored) return `<span class="rpg-relic-art" aria-hidden="true" style="background-image:url('${authored.thumbnail}');background-size:contain;background-position:center;background-repeat:no-repeat"></span>`;
  const index = Math.max(0,relicAtlas.indexOf(id));
  return `<span class="rpg-relic-art" aria-hidden="true" style="--art-x:${(index % 6)*20}%;--art-y:${Math.floor(index/6)*100/3}%"></span>`;
}

// Companion atlas gives each passive and modifier its own readable subject.
const skillAtlas = ['ember_power','ember_echo','ember_master','cleave','cleave_sweep',
  'meteor_shower','phoenix_wings','firestorm_inferno','frost_shards','frost_master',
  'ice_lance_split','glacial_tide','blizzard_hail','guardian_twins','storm_chain',
  'storm_master','arc_lance_fork','thunderclap_echo','ball_lightning_orbit','tempest_overcharge'];
export function skillArt(id: string, spellId: string): string {
  const index = skillAtlas.indexOf(id);
  if (index < 0) return spellArt(spellId);
  return `<span class="rpg-spell-art rpg-painted-art rpg-skill-art ${id === 'ember_power' ? 'rpg-wildfire-art' : ''}" aria-hidden="true" style="--art-x:${(index % 5)*25}%;--art-y:${Math.floor(index/5)*100/3}%"></span>`;
}

/** Armour and jewellery icons, rendered in Blender from each base's exact GLB. */
export const gearIconUrl = (baseId: string) => `/assets/rpg/gear/${encodeURIComponent(baseId)}.webp`;
export const gearModelUrl = (baseId: string) => `/assets/rpg/gear/${encodeURIComponent(baseId)}.glb`;
export const wornGearUrl = (baseId: string) => `/assets/rpg/gear/worn/${encodeURIComponent(baseId)}.glb`;
export function gearArt(baseId: string): string {
  return `<span class="rpg-gear-art" aria-hidden="true" style="background-image:url('${gearIconUrl(baseId)}')"></span>`;
}
