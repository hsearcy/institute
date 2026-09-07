# RPG progression: independent review

Reviewer: separate `camp_economy` subagent, 2026-09-07. This is an independent
review of the progression UI and loot/combat integration. Scores assess the new
menu UI as a whole, excluding the unchanged world behind the modal; they are
not narrowly scoped scores for one successful detail. Scores use the user's
scale: **10 is AAA graphics; 8 is the minimum acceptable visual quality**. Passing
functional checks is not a visual score, and this review does not certify the
existing character, world, item models, or effects at 8.

## Economy and compatibility

The merchant spends `profile_state.gems`, the existing mining wallet. It does
not subtract lifetime earnings, consume Crazy Coins, change pickaxes, or write
learning records. Its named purchases have no random bonuses. Legendary items
remain dungeon finds. Existing discovery gates still apply.

Wallet debit, RPG save, and operation receipt are in one SQLite transaction.
Every mutation requires a request ID. Exact retries return the original action
details with current saved state; conflicting reuse rejects. A test deliberately
fails the RPG save after debiting and verifies the debit rolls back.

The forge spends gems and earned forge dust. It supports five upgrades, each
adding two power. Salvage protects equipped gear and the final copy of each
discovered base item. The latter also prevents migration from regenerating a
salvaged last copy for endless dust. Salvaging a pinned upgrade target clears
that target. Eight economy tests with 57 assertions passed at review time.

Independent reading of loot and combat code found that skill affixes augment
learned non-unlock skills only. They cannot unlock spells, satisfy tree gates,
or generate refundable skill points. Random drops are rolled inside the
server's atomic receipt transaction; a replay returns its saved roll. Legacy
item IDs migrate to stable zero-bonus instances without changing old progress.

## Pacing simulation

Reproduce with `bun scripts/simulate-rpg-economy.ts`. The script uses production
combat, price, and dust helpers. It uses fixed loadouts in six-room Embercrypt;
it does not change or simulate tutor difficulty. Quest and hoard bonuses are
excluded so the numbers describe play after the quest board is finished.

The first pass found a real progression problem: damage also expanded coverage
to ten targets, and tier ten only multiplied monster health by 2.44. A midgame
Flame build cleared all five ordinary rooms in one cast even at tier ten. The
original full forge ladder also cost 1,650 gems but only 75 dust, making gems
disproportionately slow relative to the dungeon rewards.

The implemented revision makes coverage depend on relevant modifier ranks,
caps that increase at two targets, scales health by `1.4 ** (tier - 1)`, and
prices each forge step at `25 * nextLevel` gems plus `5 * nextLevel` dust.

| Loadout | Damage / targets | Tier 1 casts | Tier 7 casts | Tier 10 casts |
| --- | --- | ---: | ---: | ---: |
| Starter | 6 / 6 | 25 | 170 | 453 |
| Early Cinderbranch, +2 roll, forge 1 | 15 / 6 | 13 | 75 | 186 |
| Mid Flame specialist | 42 / 6 | 11 | 30 | 65 |
| Maximum Flame, including +2 mastery affix | 91 / 10 | 6 | 11 | 27 |
| Maximum Frost Guardian, including +2 mastery affix | 96 / 7 | 10 | 14 | 33 |
| Maximum Storm, including +2 mastery affix | 95 / 10 | 6 | 11 | 26 |

These are casts for an entire dungeon. The top Flame build now needs three to
four casts per ordinary tier-ten room and nine for its boss room. Undergeared
tier-ten loadouts are intentionally shown to expose the steep difficulty, not
to recommend that route for a new player. Players can choose lower unlocked
tiers; math selection remains the existing tutor's responsibility.

The full five-step forge ladder costs **375 gems and 75 dust**. Dust is earned in
three tier-one clears even without salvage. Gems take about 125 solves with a
sustained first-try streak or 375 solves at one gem per solve, before any quest
bonuses. These are transparent scenarios, not predictions of a child's accuracy.

## Initial visual evidence and critique

Actual browser captures inspected at 1440×900 desktop and 390×844 phone:

| Capture under `tmp/rpg-progression-qa/` | Initial whole visible UI score |
| --- | ---: |
| `quests-desktop.png` | 6.5 / 10 |
| `merchant-desktop.png` | 6.5 / 10 |
| `blacksmith-desktop.png` | 6 / 10 |
| `quests-phone.png` | 6 / 10 |
| `blacksmith-phone.png` | 6 / 10 |
| `victory-next-reward.png` | 6.5 / 10 |

The gold frame, dark material, readable type, and actual item thumbnails create
a consistent RPG direction. The panels remain visibly simpler than AAA UI:
plain repeated cards, small flat item presentations, and weak active-state
hierarchy limit the score. The phone's header and pinned goal consume almost
half its height before actionable content.

One focused revision was requested: clearly selected tabs with equal mobile
heights; a compact camp header and pinned goal; affirmative "Ready to buy/forge"
instead of "0 more" costs; unambiguous forge rank and cost buttons; less empty
desktop forge-card area; brighter victory reward text and a visible continuation
action. No world or model changes were requested.

## Final fresh-capture assessment

The focused revision was inspected from a fresh browser run in
`tmp/rpg-progression-qa-final/`. Evidence is retained under
[`docs/rpg-playtest/progression-2026-09-07/`](rpg-playtest/progression-2026-09-07/).

| Final capture | Final new-menu UI score |
| --- | ---: |
| [Quest board desktop](rpg-playtest/progression-2026-09-07/quests-desktop.png) | 7 / 10 |
| [Merchant desktop](rpg-playtest/progression-2026-09-07/merchant-desktop.png) | 7 / 10 |
| [Blacksmith desktop](rpg-playtest/progression-2026-09-07/blacksmith-desktop.png) | 7 / 10 |
| [Quest board phone](rpg-playtest/progression-2026-09-07/quests-phone.png) | 7 / 10 |
| [Blacksmith phone](rpg-playtest/progression-2026-09-07/blacksmith-phone.png) | 7 / 10 |
| [Victory desktop](rpg-playtest/progression-2026-09-07/victory-next-reward.png) | 7.5 / 10 |
| [Victory phone](rpg-playtest/progression-2026-09-07/victory-phone.png) | 7.5 / 10 |

The revised active tabs are immediately identifiable. Phone tabs now share a
height and the camp header leaves more room for the actual collection. Ready
goals state the action and exact cost. Forge buttons distinguish the next rank
from its price. The victory screen has a much clearer sequence of earned item,
XP, next dungeon rewards, pinned goal, and continuation button. Its primary
action remains visible on both desktop and phone.

The remaining visual gap is the menu presentation itself: repeated plain dark
cards, small flat item renders, generous blank areas in desktop forge rows, and
limited ornament or reward-specific composition. The stronger hierarchy makes
the UI more usable but does not make the complete interface AAA-quality. These
scores **do not meet the requested 8/10 acceptance bar**. No model, world, or
effect score is upgraded by this UI pass.

The parent agent reports that the final browser run passed all tested flows,
including a server-committed purchase with an intentionally lost response,
reload and retry without double charging, actual boss loot and next-tier
continuation, and retreat while preserving earned loot. This functional result
is separate from the visual assessment above.
