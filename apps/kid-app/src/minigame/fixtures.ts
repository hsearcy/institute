import type { PortalId } from "../config";
import type { SpellCastParams } from "@institute/minigame-spell-cast";

/**
 * Hand-coded round params per portal id, for M2. M5 will replace these with
 * LLM-generated params per round. The shape per portal is whatever each
 * plugin's paramSchema declares.
 *
 * Currently only `spell-cast` is wired; the other 3 portals still show the
 * "Coming soon" toast in App.tsx and never reach this map.
 */
export const FIXTURES: { "spell-cast": SpellCastParams } = {
  "spell-cast": {
    enemyType: "goblin",
    sequence: [2, 4, 6, 8, 10],
    intro: "A goblin appears! Cast sparks by 2s to defeat it.",
  },
};

export type FixtureFor<P extends PortalId> =
  P extends "spell-cast" ? typeof FIXTURES["spell-cast"] : never;
