declare const __DEV__: boolean | undefined;

/** Hardcoded for M3 — the profile picker is a later milestone. */
export const PROFILE_ID = "sam";

/** Show the corner FPS overlay. Defaults to dev-only. */
export const SHOW_FPS: boolean = typeof __DEV__ === "boolean" ? __DEV__ : false;

export type PortalId = "spell-cast" | "block-tower" | "cookie-share" | "door-code";

export type PortalDef = {
  id: PortalId;
  label: string;
  /** World-space position [x, y, z]. Y=0 places the base of the portal on the ground. */
  position: readonly [number, number, number];
};

/**
 * The 4 mini-game portals, arranged in a 90° arc in front of the hero (looking south).
 * Hero is at origin; portals sit at z=−6 (ahead of hero) and spread along x.
 */
export const PORTAL_DEFS: ReadonlyArray<PortalDef> = [
  { id: "spell-cast",   label: "Spell Cast",   position: [-3.5, 0, -6] },
  { id: "block-tower",  label: "Block Tower",  position: [-1.2, 0, -7] },
  { id: "cookie-share", label: "Cookie Share", position: [ 1.2, 0, -7] },
  { id: "door-code",    label: "Door Code",    position: [ 3.5, 0, -6] },
];
