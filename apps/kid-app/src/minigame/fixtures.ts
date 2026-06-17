import type { PortalId } from "../config";
import type { SpellCastParams } from "@institute/minigame-spell-cast";
import type { BlockTowerParams } from "@institute/minigame-block-tower";
import type { CookieShareParams } from "@institute/minigame-cookie-share";
import type { DoorCodeParams } from "@institute/minigame-door-code";

/**
 * Hand-coded round params per portal id, for M2/M6. M5 will replace these with
 * LLM-generated params per round. The shape per portal is whatever each
 * plugin's paramSchema declares. `sequence` mirrors each round's correct
 * answers in order so the voice layer (MiniGameMount) can match spoken input.
 */
export const FIXTURES: {
  "spell-cast": SpellCastParams;
  "block-tower": BlockTowerParams;
  "cookie-share": CookieShareParams;
  "door-code": DoorCodeParams;
} = {
  "spell-cast": {
    enemyType: "goblin",
    sequence: [2, 4, 6, 8, 10],
    intro: "A goblin appears! Cast sparks by 2s to defeat it.",
  },
  "block-tower": {
    problems: [
      { a: 3, b: 4, answer: 7 },
      { a: 5, b: 5, answer: 10 },
      { a: 6, b: 7, answer: 13 },
    ],
    intro: "Let's build a block tower! Add the blocks to stack it up high.",
    sequence: [7, 10, 13],
  },
  "cookie-share": {
    rounds: [
      { cookies: 6, friends: 3, answer: 2 },
      { cookies: 8, friends: 2, answer: 4 },
      { cookies: 9, friends: 3, answer: 3 },
    ],
    intro: "Your friends are hungry! Share the cookies so everyone gets the same.",
    sequence: [2, 4, 3],
  },
  "door-code": {
    problems: [
      { kind: "sub", a: 10, b: 4, answer: 6 },
      { kind: "sub", a: 8, b: 3, answer: 5 },
      { kind: "missing_addend", a: 7, b: 10, answer: 3 },
    ],
    intro: "The treasure door is locked! Solve each riddle to crack the code.",
    sequence: [6, 5, 3],
  },
};

export type FixtureFor<P extends PortalId> =
  P extends "spell-cast" ? SpellCastParams
  : P extends "block-tower" ? BlockTowerParams
  : P extends "cookie-share" ? CookieShareParams
  : P extends "door-code" ? DoorCodeParams
  : never;
