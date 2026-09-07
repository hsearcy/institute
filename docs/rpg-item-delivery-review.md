# Item catalogue delivery review

Independent review, 2026-09-07. This assesses the **whole visible item**, using the user's scale: 10 = AAA graphics, 1 = unusable art, acceptance = 8+. A valid export, closed mesh, good attachment, or isolated material detail does not establish an 8. Source renders do not certify exported or equipped appearance. Scores below are visual judgments from the listed images, not unseen geometry or code.

The immediate delivery problem is missing usable item variety. The existing candidates have distinct silhouettes worth integrating, but the observed collection does **not** currently meet the requested 8+ visual standard. Do not describe integration completeness as visual acceptance. Avoid spending another cycle on invisible micro-detail while most of the catalogue remains absent.

## Existing installed thumbnails

Images inspected directly: `web/public/assets/rpg/items/{apprentice,thunderrod,cleaver,moonstaff,phoenix}.png` (512 × 512). These scores apply to their inventory presentation; no new runtime motion review is claimed.

| Item | Score / 10 | Highest-impact visible improvement |
|---|---:|---|
| Apprentice's Runeblade | 6 | Stronger steel bevel/face separation; presently an ordinary, softly lit starter sword. |
| Thunder Rod | 6 | Make the conductor the readable focal point; its dark blue center and broken-looking open prongs weaken the magical read. |
| Ashsplitter | 6 | Establish a bright cutting edge against the blackened broad face; most of the blade currently collapses into one dark value. |
| Moonshard Staff | 6 | Increase moonstone size/brightness relative to its surrounding crescent so it survives small inventory cards. |
| Phoenix Scepter | 6.5 | Strengthen the wing rim and garnet contrast; the distinct reward silhouette is present but the bronze wings disappear into shadow. |

## Remaining source candidates

Scores concern the visible source candidate only. Final GLB thumbnails and equipped views remain separate evidence requirements. “Unscored” means no suitable whole-item evidence was located, not a failing score.

| Item ID / name | Source score / 10 | Evidence | Highest-impact visible improvement |
|---|---:|---|---|
| `cinderwand` — Cinderbranch | 6.5 | A | Give the enclosed ember a visible warm core. At this scale it is mainly a brown forked stick; further charcoal microstructure will not solve that. |
| `glacier` — Glacier Fang | 6 | B | Separate a bright frozen cutting edge from a dark translucent-looking core. The present low-contrast blue face reads as opaque plastic. |
| `starfall` — Starfall Edge | 6.5 | C | Make the meteor/inset feature a deliberate large focal point rather than another dark gray recess in an otherwise plain steel sword. |
| `phoenix_talon` — Phoenix Talon | 6 | D | Sharpen the bronze spine versus steel edge contrast and broaden the feather guard into a recognizable phoenix detail at card scale. |
| `sunforged` — Sunforged Runeblade | Unscored | No whole-item image located | Review a full-item export/thumbnail before assigning a score. |
| `tempest` — Tempest Caller | 6 | D | Enlarge and brighten the stormstone; the long plain shaft dominates the small spiral head. |
| `arcfang` — Arc Fang | Unscored | No whole-item image located | Review a full-item export/thumbnail before assigning a score. |
| `skybreaker` — Skybreaker | 5.5 | D | The plain silver split tip resembles a forked tool. Add one strong lightning-shaped recess/core spanning the blade so the legendary identity reads. |
| `stormsilver` — Stormsilver Runeblade | Unscored | No whole-item image located | Review a full-item export/thumbnail before assigning a score. |
| `wintercrown` — Staff of Endless Winter | 5.5 | E | Differentiate dark crystal roots and pale frosted tips; its head currently reads as a cluster of flat blue wedges. |
| `tideglass` — Tideglass Blade | 6 | E | Retain the good wave silhouette, but establish layered dark teal depth and a bright narrow edge across the broad flat blue face. |
| `icespear` — Rimepiercer | 6 | F | Give the main spearhead stronger cold-metal edge contrast and connect the side frost barbs visually with the central head. |
| `hailcaller` — Hailcaller | 5.5 | F | Break the uniform toy-blue crystal faces into deep icy cores and pale fractured impact planes. |
| `winterbranch` — Winterbranch | 5.5 | F | Enlarge the drooping crystal buds and give the hand area one strong binding feature; it reads primarily as a pale bare twig. |
| `inferno` — Crown of the Inferno | 5 | G | Replace the flat red triangular inserts with visibly flame-shaped, dimensional garnet features; the current silhouette resembles a toy crown. |
| `wardenheart` — Winter Warden's Heart | 5.5 | G | Deepen the main fissure and brighten its cold interior; the current pendant reads as a flat blue stone shield. |
| `thunderbell` — Bell of Thunder | 6.5 | H | Make the broad lightning emblem crisp enough to read on an inventory card; it currently looks like a soft dent. |
| `stormorbit` — Orb of the Stormkeeper | 5.5 | G | Separate a luminous violet core from dark outer facets and offset it inside the cage; the current stone reads as a striped low-poly ball. |

Evidence inspected:

- A: `docs/rpg-playtest/v18/items/cinderbranch/cinderbranch-v18-front.png`.
- B: `tmp/item-models/glacier-v8-front.png`.
- C: `tmp/item-models/starfall-v8-front.png`.
- D: `docs/rpg-playtest/v22/items/forge-and-storm/v2/corrected-front.png` (Phoenix Talon, Skybreaker, Tempest Caller, left to right).
- E: `tmp/item-models/frost-set-v2/remaining-held-full.png` (Staff of Endless Winter, Tideglass Blade).
- F: `tmp/item-models/frost-set-v2/source-front.png` and `source-high.png` (Rimepiercer, Hailcaller, Winterbranch).
- G: `tmp/item-models/frost-relics-v1/wearables-front.png` (Crown, Heart, Bell v1, Orb; Bell score uses newer H).
- H: `tmp/item-models/thunderbell-v3/front.png`.

## Delivery review priorities

1. Every saved catalogue ID must resolve to its own GLB and thumbnail. The visible silhouette should match the advertised item and remain recognizable on the inventory card.
2. Weapons must sit in the hand; crown, heart, bell, and orb must occupy their intended worn sockets. A wearable must not hide the normal sword or become its attack trail.
3. Inspect one contact sheet of the actual exported catalogue and native equipment changes, then correct conspicuous missing parts, black faces, clipping, unreadable framing, or wrong sizes together.
4. The next visual pass should focus on broad elemental focal points and material/edge contrast. Do not confuse additional micro-detail, bake iterations, or isolated component scores with better whole-item reward appeal.

## Exact exported thumbnails, catalogue v1

Inspected directly at 512 × 512; files are `tmp/item-models/catalogue-v1/{id}/{id}.png`. These are final-model thumbnail evidence supplied by the export task, not the older source sheets above. This section does not claim a new equipped-motion review.

| Exported item | Whole-item score / 10 | Export presentation check |
|---|---:|---|
| Staff of Endless Winter (`wintercrown`) | 5.5 | Fully framed; tines and shaft intact; no conspicuous black/missing faces. Crystal head remains flat and subdued. |
| Tempest Caller (`tempest`) | 6 | Fully framed; spiral, stone, and shaft intact. The small stone is legible at full size but weak at card size. |
| Phoenix Talon (`phoenix_talon`) | 6 | Fully framed; recurved blade, guard, and hooked pommel intact. Strong color separation, simple broad materials. |
| Sunforged Runeblade (`sunforged`) | 6 | Fully framed; sun-disc guard and blade intact. Distinct sun motif; plain blade lacks a stronger rare-item focal point. |
| Rimepiercer (`icespear`) | 6 | Fully framed; spike, barbs, and haft intact. Dark head retains its edges without a broken-export patch. |
| Tideglass Blade (`tideglass`) | 6 | Fully framed; wave blade and open guard intact; good silhouette and bright edge. Broad face remains simply shaded. |
| Hailcaller (`hailcaller`) | 5.5 | Fully framed; head, retaining arms, and haft visible. No large missing face; crystal reads as painted polygonal blocks. |
| Winter Warden's Heart (`wardenheart`) | 5.5 | Fully framed; loop, stone and claws visible. The large pale face reads as a smooth shield panel, with little stone depth. |
| Arc Fang (`arcfang`) | 6 | Fully framed; continuous zigzag blade and guard visible. Distinct lightning silhouette; very simple material treatment. |
| Bell of Thunder (`thunderbell`) | 6.5 | Fully framed; hanger, rim and now-crisp emblem visible. No conspicuous export patch. This camera does not prove the underside/clapper. |
| Orb of the Stormkeeper (`stormorbit`) | 6 | Fully framed; cage and purple center visible. The core reads as a polished purple bead more than a storm-filled crystal. |
| Cinderbranch (`cinderwand`) | 6.5 | Fully framed; fork and copper binding visible. Ember is nearly hidden from this thumbnail angle. |
| Glacier Fang (`glacier`) | 5.5 | Fully framed; guard and complete blade outline visible. Blade is grainy and dark against the inventory background; weak frost-depth read. |
| Starfall Edge (`starfall`) | 6.5 | Fully framed; blade, fullers and hilt visible. No conspicuous missing face; recognizable but restrained steel reward. |
| Skybreaker (`skybreaker`) | 5.5 | Fully framed; both prongs, blade, and guard visible. Tool-like plain split blade remains the main aesthetic weakness. |
| Stormsilver Runeblade (`stormsilver`) | 6 | Fully framed; swept basket, grip and blade visible. Clean sword silhouette; elemental identity remains quiet. |
| Crown of the Inferno (`inferno`) | 5.5 | Fully framed; circlet and flame teeth visible. Broad clear silhouette, but planar enamel and simple metal do not read as a premium relic. |
| Winterbranch (`winterbranch`) | 5.5 | Fully framed; all three crystal buds visible. Strongly distinct twig shape; small buds are too subdued at card size. |

All 18 candidate thumbnails were individually inspected. No conspicuous clipped silhouette, absent major component, or large broken black patch was observed in those views. This is a thumbnail assessment, not proof of unseen backs/undersides or equipped motion.

The [23-item contact sheet](rpg-playtest/item-catalogue-delivery/catalogue-contact-sheet.png) uses the actual `web/public/assets/rpg/items/*.png` files, with no art alterations. All 18 new public PNGs matched their reviewed candidate PNGs byte for byte. The [receipt](rpg-playtest/item-catalogue-delivery/catalogue-contact-sheet.json) records every source image hash. The assembled sheet was visually inspected with its final labels.

**Catalogue thumbnail coverage is now 23/23.** Distinct usable item variety has improved substantially. No whole-item visual 8+ is awarded by this review. The broadest remaining aesthetic weakness is flat, quiet material treatment, especially ice and late-tier steel weapons; this should not be misreported as a broken export or missing-model blocker.
