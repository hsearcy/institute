# Inventory and directional targeting verification

The inventory compares full-power damage with the selected spell, including relic affinity, rolled bonuses, forge levels, and learned bonus skill ranks. Owned relics show damage, the change from equipped gear, and copy counts. Individual copies stay separate. A stronger copy of the equipped relic gets a notice and a link directly to its card. Equipping does not consume a copy; existing blacksmith protections remain unchanged.

Ice Lance, Arc Lance, Glacial Surge, and Phoenix Dive now present the server-selected targets with aimed effects and corresponding arrival contacts. The hero faces the primary target throughout the cast. This changes presentation, not target selection, damage, rewards, or the learning system.

## Functional coverage

`scripts/playtest-rpg-inventory-targeting.ts` uses Chromium CDP at port 9222, a disposable database in `/tmp`, and its own local API/Vite servers. It leaves the existing preview and player saves alone.

- Equips a stronger duplicate through the inventory, preserves every copy, and verifies the selected copy after reload.
- Verifies that the stronger-copy link scrolls to the correct card, and checks phone overflow.
- Confirms inventory actions leave the learning tables unchanged.
- Solves a real tutor question with each affected spell and compares every visual contact ID with the server combat receipt.
- Renders a deterministic stress layout with front, rear, left, and right victims plus an unaffected bystander. Each victim receives exactly one contact, with a physical contact origin; the bystander receives none.
- Confirms visual-only stress casts do not write RPG or learning state, and captures native frames for independent review.

The helper tests cover directional endpoint tracking, rotation, skipped frames, exactly-once arrivals, and recoil isolation. Inventory tests cover spell-specific comparisons, duplicate labels, protected copies, stronger-copy notices, and preservation of the selected loadout.

## Independent visual review

The separate critic scores only the changed UI and spell presentations, with 10 representing AAA presentation. Existing world, hero, and item models are outside this review.

The first functional revision passed browser coverage. Inventory scored 8/10 on desktop and phone; Phoenix Dive scored 8/10. Ice Lance, Arc Lance, and Glacial Surge initially scored 6.5/10. Subsequent revisions narrowed the ice silhouettes, added short wakes, replaced the loose lightning path with a crisp directional spine, varied the glacial formations, and made actual contacts readable with compact highlights and chips.

| Changed presentation | Final independent score |
| --- | --- |
| Inventory, desktop | 8/10 |
| Inventory, phone | 8/10 |
| Ice Lance | 8/10 |
| Arc Lance | 8/10 |
| Glacial Surge | 8/10 |
| Phoenix Dive | 8/10 |

The critic inspected native screenshots and timed frames, including side and rear victims, and requested no further changes within this scope. This is not a score for every existing game asset or a continuous-video review.

Final evidence from this session:

- `/tmp/rpg-inventory-targeting-final/report.json`: complete browser pass, duplicate equip/reload, four real math casts, four directional stress casts, unchanged learning for equipment/visual-only actions, and zero browser/shader errors.
- `/tmp/rpg-targeting-contact-review/report.json`: additional pass after the final shader/contact brightness adjustment, with three stress casts and native frames at 200–1500 ms. No target or combat rules changed in that adjustment.
- 60 focused tests passed across directional geometry, progression views, Frostfall, Chain Lightning, hero locomotion, and server RPG compatibility.
- Production web build and `git diff --check` passed.
