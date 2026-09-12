# Adventure progression

Implemented on `concept/math-dungeon-rpg`. The RPG remains a client of the existing adaptive tutor. Math selection, mastery, review intervals, daily and weekly quest rules, Crazy Coins, and original mining purchases are unchanged.

## What the player can work toward

- **Quest board:** six daily quests, including defeating a dungeon boss, and the existing weekly quest are visible from camp and the adventure menu. Their existing gem rewards and daily-board Crazy Coin still apply. Completing a board does not stop normal adventure rewards.
- **Merchant:** 16 named nonlegendary relics can be purchased with the original gem balance. The shop respects existing expedition-clear gates. Purchases have fixed stats; six legendary items remain dungeon discoveries.
- **Individual loot rolls:** every dungeon relic drop is a saved item instance. Tier-one rolls add 1–4 power, while higher tiers allow up to 12. Some rolls add one rank to a skill in the item's school; higher tiers can roll two. Skill bonuses activate only on learned skills and cannot unlock spells, bypass prerequisites, or generate skill points.
- **Blacksmith:** five upgrade levels per copy, each adding two power. Steps cost 25/50/75/100/125 gems and 5/10/15/20/25 forge dust. The player can keep multiple differently rolled copies and compare actual damage with the selected spell.
- **Salvage:** extra copies can be reclaimed for forge dust. Equipped items and the last copy of a discovered relic are protected. A preview identifies the exact copy and material return before confirmation.
- **Dungeon tiers:** clearing the highest available tier opens the next, up to tier 10. Tiers strengthen monsters and improve possible loot bonuses without changing math difficulty or exceeding ten monsters. Lower tiers remain available.
- **Pinned goals:** a chosen item, forge upgrade, or skill shows its remaining requirement. Gem and material progress follows actual balances.
- **Next expedition reward:** the victory screen shows guaranteed crafting material for the next full clear, the next base-item discovery or repeat roll, and the pinned goal. Random bonuses are described as possibilities, never promised upgrades. Repeat runs remain available at tier 10.

Normal rooms award `2 + tier` forge dust; the boss awards `10 + 3 * tier`. A full clear yields 28 dust at tier 1 and 100 at tier 10. Rooms three and six award relic rolls; the first-ever room also provides the introductory Cinderbranch gift. Duplicates retain the original XP bonus and now remain in the backpack as individual rolls.

The player can leave an unfinished expedition to choose another difficulty. Earned rewards remain; leaving does not count as a clear or unlock another tier.

## Balance and compatibility

Raw power increases damage. Extra target coverage comes from relevant learned spell modifiers, capped at two additional targets. This keeps basic attacks distinct from broad advanced spells. Higher-tier monster health scales by `1.4 ** (tier - 1)`. The pacing simulation in `scripts/simulate-rpg-economy.ts` uses the actual combat and cost helpers; its assumptions and results are discussed in `rpg-progression-review.md`.

Existing inventory IDs remain unchanged. Reading an older save supplies stable zero-bonus copies in memory, preserving its original equipped item. The first later adventure write stores the additive fields. No deployment requires replacing a learning database or importing a development fixture.

Purchases, forging, and salvage commit wallet changes, the adventure save, and a request receipt in one SQLite transaction. Retries return the recorded operation without repeating the debit. The browser saves an outstanding request ID across reloads. Loot randomness is generated only while committing the cast receipt; replaying a solved problem cannot reroll it.

## Local preview and verification

The requested development preview runs at `http://localhost:5188`, proxied to an offline tutor on port 8799, with profile `rpg-playtest` in `/tmp/institute-rpg-playtest.db`. It preserves play between server restarts. This preview is separate from the family save and automated QA.

Repeat validation:

```sh
bun run test
bun run --cwd web build
bun scripts/simulate-rpg-economy.ts
bun --no-env-file scripts/playtest-rpg-progression.ts
```

The browser playtest requires the configured Chromium CDP endpoint on port 9222. It creates its own temporary database and servers on ports 8974/5274, and closes only its own browser context and servers. It does not reset or stop the user's preview.
