# Random loot bonuses and equipment stats

Every relic's base power applies to all attacks or a whole school. Former spell-specific bases now cover their existing school at the same power value. Base relics have no built-in spell effects. For example, Skybreaker provides Storm power rather than a special Tempest effect.

New dungeon drops always receive universal rolled power. They can also receive a rare skill bonus and at most one additional target, school-power, or named-spell bonus:

| Bonus | Chance per new drop, tier 1 → tier 10 | Strength |
| --- | --- | --- |
| Universal power | 100% | +1 to +12, with stronger ranges at higher tiers |
| Temporary skill ranks | 10% → 18% | +1; occasional +2 from tier 4 for skills with scalable ranks; direct spell unlocks roll +1 |
| Additional targets | 25% → 35% | +1; rare +2 from tier 5 onward |
| School power | 25% → 40% | +1 to +8 damage per target throughout that school |
| Named-spell damage | 5% → 10% | +2 to +12 damage per target with that spell only |

Skill rolls are independent of the final three mutually exclusive bonuses. School relics draw skills and named damage from their school; universal relics can draw any school. Named-spell damage is only damage: it neither adds a visual modifier nor grants access to the spell.

## Temporary skills and combat

Only the exact equipped copy contributes bonuses. `rpgLootSkillBonus` validates its skill ID and bounds its ranks. `rpgEffectiveSkills` adds those ranks immediately, even when the skill has never been learned. `rpgSpellAvailable` also lends that skill's associated spell while the copy is equipped. For example, +1 Overcharge makes Tempest available and adds Overcharge's damage, coverage, and follow-up chain lightning immediately. Removing the copy removes these temporary benefits unless the permanent skill tree supplies them independently.

Equipment never purchases permanent skill ranks, satisfies tree prerequisites, or creates refundable skill points. The permanent tree and math-learning progress stay separate from borrowed abilities.

Extra targets stack with effective modifier ranks, up to two additional targets from loot and ten targets per attack overall. They never spawn additional monsters. School and named damage affect only their stated scope. Runtime selection and resolution use the same availability rules, and switching away from gear that lends the current spell selects an available fallback.

## Saves, duplicates, and forging

Existing IDs, rolled fields, upgrade levels, and receipt rewards remain stored as earned. No old copy is rerolled or given new random fields. The revised broad base definitions and immediate skill activation apply when reading those existing copies; this deliberately updates their behavior without rewriting their rolls.

The optional affix fields are interpreted through `rpgLootAffixes`; missing values contribute zero. Forge upgrades preserve every rolled property and add universal power. Reward and forge receipts remain idempotent. Shop purchases remain deterministic base items. Each duplicate remains an independent copy, with only one equipped at a time. Equipped copies and the last copy of each relic remain protected from reclaiming.

No tutor selection, mastery, review scheduling, or math-progress storage changes are part of this revision.

## Compact inventory presentation

Cards show short stat lines such as `+12 Storm power`, `+4 power`, `+1 Overcharge`, and `+1 target`. Named-spell damage appears only when that copy rolled it, for example `Tempest: +6 damage per target`. Skill bonuses have no inactive or learn-to-activate warning because they work while equipped. Universal base and rolled power combine into one stat; school power remains clearly scoped.

Every owned copy appears once in the main inventory grid, newest acquisition first, and selecting a card equips that exact copy. Older synthetic legacy copies remain behind recorded finds. The equipped summary stays visible separately; there is no second individual-copies section. Damage and target count are compared separately for the selected attack. Direct comparison links show the actual tradeoff and jump to the relevant grid card. Cards that would lose a borrowed spell indicate the fallback attack used by their preview. Equipment, discoveries, victory rewards, and the blacksmith share the stat helpers.

## Verification

The revised game passed 467 automated tests and the production build. `scripts/playtest-rpg-compact-loot.ts` verifies the compact inventory on desktop and phone, immediate gear spell access, reload persistence, a genuine tutor-triggered Tempest cast matching its 46-damage/10-target preview, and safe fallback after unequip. Its disposable-save report is `/tmp/rpg-compact-loot-review/report.json`. Independent review scored both the compact inventory and gear-granted spellbook 8/10 on desktop and phone.

Current shared regression coverage includes broad base scope across every spell, guaranteed power, exact rare-roll probabilities, bounded values, every skill's temporary spell access and effects, unequip behavior, unchanged permanent ranks, and preservation of existing serialized loot. Server and browser coverage verifies receipt replay, forge preservation, and unchanged learning records.

`scripts/playtest-rpg-loot-affixes.ts` uses an isolated temporary database and Chromium CDP. Its assertions now expect compact `+2 Winter Crown` labels, immediate effective ranks and damage, and zero permanent Winter Crown ranks. It also checks equipment persistence, four genuine tutor casts, and forging. The script was updated for this revision; its earlier browser runs below are historical evidence, not a fresh run of these assertions.

### Historical evidence from the earlier affix UI

The earlier implementation passed 59 shared/server/view tests and production build checks. Browser artifacts are `/tmp/rpg-loot-affixes-review/report.json` and `/tmp/rpg-loot-affixes-ui-final/report.json`. Its desktop and phone affinity/comparison UI received an independent 8/10 review. Those runs covered the former verbose labels and learned-only skill activation; they do not establish the result or visual score of the revised compact UI and immediate equipment skills.
