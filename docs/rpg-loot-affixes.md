# Random loot bonuses and inventory affinity

New dungeon drops retain their existing universal power and optional skill-rank rolls, and can gain one additional specialized bonus:

| Bonus | Roll |
| --- | --- |
| Additional targets | +1; rare +2 from dungeon tier 5 onward |
| Named spell power | +2 to +12 damage with that spell |
| School power | +1 to +8 damage with all spells in that school |

The chance of a specialized bonus rises from 55% at tier 1 to 90% at tier 10. Damage ranges improve with tier. Specialist relics roll their own spell; school relics roll within their school; universal relics can roll any spell or school. Power and skill-rank random draws occur before the new draws.

Only the equipped copy contributes bonuses. Extra targets stack with learned coverage modifiers but never exceed ten targets or spawn additional monsters. Named power applies only to its stated spell/school. Skill-rank bonuses still require the skill to be learned and cannot unlock abilities or satisfy tree prerequisites.

Existing copies do not gain or reroll bonuses. The new fields are optional JSON properties, with absent values interpreted as zero by `rpgLootAffixes`. Reading a save preserves the stored loot. Forge upgrades keep every rolled property; reward and forge receipts remain idempotent. Shop purchases retain their existing deterministic base items. No learning selection, mastery, review, or math-progress storage changes were made.

Inventory tiles and individual copies now name their base affinity and rolled skill/spell bonuses. Damage and target count are compared separately. Duplicate shortcuts expose alternatives such as lower per-target damage with wider coverage, without claiming one choice is better in every situation. The shared bonus descriptions also appear in discovery, victory, and blacksmith views.

## Verification

- 59 shared, server, and view tests passed, including deterministic roll branches, scope, bounded values, old saves, receipt replay without rerolling, forge preservation, and unchanged learning records.
- Production web build and diff checks passed.
- `scripts/playtest-rpg-loot-affixes.ts` uses an isolated temporary database and Chromium CDP. The full run equipped a +2-target copy, reloaded it, cast four genuine tutor answers using different bonuses, checked damage/coverage against previews, confirmed an inactive skill remained unlearned, and forged a copy without losing its affix or changing learning records.
- Full browser evidence: `/tmp/rpg-loot-affixes-review/report.json`. Final label/thumbnail verification: `/tmp/rpg-loot-affixes-ui-final/report.json`.
- Independent review of native desktop and phone screenshots scored the changed affinity/comparison UI **8/10 on each viewport**. This score concerns the changed UI only; it does not re-score the existing world or models.
