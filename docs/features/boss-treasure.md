# Boss treasure

Each completed boss encounter makes two independent server rolls: 10% for one Crazy Coin and 10% for one dime. Both may win. The rolls are saved in `rpg_cast_claims`; their balances and the daily boss quest are committed in the same transaction. Old receipts replay unchanged. The dime balance is an additive `profile_state.dimes` column, measured in whole dimes.

Parent journal buttons redeem one reward at a time. Dimes represent $0.10 paid by the parent; no payment service is called. Both endpoints accept a request ID and save a redemption receipt. The RPG client retains that ID after a lost response, updates only the balance and status, and preserves the open journal and scroll position. The original mine's coin endpoint remains compatible without a request ID.

New boss item copies have +3 added to the ordinary power roll, within the existing power cap. Every boss copy rolls one of two extra traits: opening strike (+25% damage on the first cast per room) or boss slayer (+30% damage to `enemy-0` in the boss room). Actual hit damage includes these conditions; ordinary item previews show base damage with the conditions listed separately.

Boss copies also have a 40% chance of a school-matched spell shape, with five choices per school. Neutral items can draw any of the 15 shapes. The [spell effect list](../plans/spell-effect-bonuses.md) gives each visual and combat bonus: either +30% damage or +2 targets, within the ten-target limit. Each shape lends its named spell while equipped. The server records the used shape in the cast receipt so the renderer uses the same trait. Extra visual contacts do not apply damage twice.

The original `twin-orb`, `meteor-shower`, and `split-lance` IDs are retained. Their visuals are now Twin Orbit, Molten Core, and Diamond Drill. No saved item copies are rerolled.

Temporary skill rolls are now boss-only (20% at tier 1 through 30% at tier 10), drawn from visual modifier skills. Ordinary drops keep power, school power, and extra targets. Existing skill and named-spell damage rolls remain valid and are never rerolled or removed.

Validation: 437 shared, server, and web tests; production build; `web/scripts/check-boss-rewards.mjs` uses a disposable database and Windows Brave CDP on 9222 to check desktop/phone redemptions, lost-response retry, journal retention, all three base/bonus spell effects, granted-spell UI, and victory layout. No player reward balance is changed by that browser check.
