// Original lightweight vector UI art. The dungeon/characters use Blender GLBs.
const paths: Record<string, string> = {
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

/** Hand-painted production atlas: five abilities per school, three rows. */
const spellAtlas = ['ember','cleave','meteor','phoenix_dive','firestorm','frost','ice_lance','glacial_surge','blizzard','frost_guardian','storm','arc_lance','thunderclap','ball_lightning','tempest'];
export function spellArt(id: string): string {
  const index = Math.max(0,spellAtlas.indexOf(id));
  return `<span class="rpg-spell-art rpg-painted-art" aria-hidden="true" style="--art-x:${(index % 5)*25}%;--art-y:${Math.floor(index/5)*50}%"></span>`;
}

const relicAtlas = ['apprentice','cinderwand','glacier','thunderrod','moonstaff','phoenix','wintercrown','tempest','cleaver','starfall','phoenix_talon','inferno','sunforged','icespear','tideglass','hailcaller','wardenheart','winterbranch','arcfang','thunderbell','stormorbit','skybreaker','stormsilver'];
export function relicArt(id: string): string {
  const index = Math.max(0,relicAtlas.indexOf(id));
  return `<span class="rpg-relic-art" aria-hidden="true" style="--art-x:${(index % 6)*20}%;--art-y:${Math.floor(index/6)*100/3}%"></span>`;
}
