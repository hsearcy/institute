/**
 * Where closing a dialog leads. Camp, unless the hero is still in the dungeon:
 * mid-expedition, or with the guardian beaten and the way down open (the
 * drops and the portal wait in the world).
 */
export function closeLeadsToCamp(view: { playing: boolean; cleared: boolean; awaitingDescent: boolean }): boolean {
  if (!view.playing) return true;
  return view.cleared && !view.awaitingDescent;
}
