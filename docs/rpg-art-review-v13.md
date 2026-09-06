# Independent art review — v13 current gate and baseline history

Reviewer: independent `art_critic` subagent, separate from implementation. Baseline reviewed 2026-09-05; latest continuation review 2026-09-06. Baseline code commit: `ff25a45`; the new uncommitted wraith is explicitly identified below. This is a visual critique, not a learning-system or gameplay correctness certification.

**Acceptance gate: FAILED.** The user requires every art category to score at least 8/10, with 10 meaning AAA graphics and 1 meaning garbage. Current evidence does not support that claim. The initial baseline presentation was approximately **4.5/10**. That historical descriptive number is not a current aggregate score and must never average away a failing asset or category. The ledger below records current scoped acceptance; historical scores remain below for traceability.

Scores are subjective art-direction judgments, grounded in the listed visible evidence. They are not precision measurements. 8 means cohesive, highly polished production art at the intended gameplay distance, with convincing materials, intentional silhouettes/composition, clean integration, and no conspicuous prototype geometry or presentation. Stylization can score 8–10; photorealism is not required. Being procedural, child-friendly, technically functional, or improved over the previous pass does not lower the bar.

## Current acceptance ledger

**User-directed impact gate remains open: combat must show at most10 enemies, starter attacks must leave survivors, and hits must feel forceful rather than an effect followed by disappearance. Prior complete Ball/Nova passes remain withdrawn. Latest actual-loop v7 review passes skeletal Nova survivor catch/recovery, skeleton/revenant falls, guardian final collapse/settle and cleanup/order at8 in the shown desktop sequences. Guardian initial contact7.5 and wraith death7.5 still fail; Ball survivor response is unverified because its recorded veteran casts clear both low-HP packs. The starter Nova first answer leaves four of six enemies alive, then the second clears. See CE; no complete game-wide or spell-wide impact pass.**

**Global gate: FAILED. No complete game-wide art or animation acceptance.** A score applies only to the specified evidence and scope. Source/static/layout passes do not transfer to runtime readability, animation, other assets or other viewports.

| Accepted scope | Score | Latest reviewed evidence |
|---|---:|---|
| Equipped authored skeleton v8 shown source construction/silhouette | 8 | `/tmp/authored-skeleton-equipped-v8-{high,arm,native}.png`; rear/hidden-side, optimized export and runtime remain separate. |
| V7 desktop skeletal Nova survivor catch/recovery; skeleton/revenant falls; guardian final collapse/settle; cleanup/order | 8, scoped motion | `docs/rpg-playtest/v15/combat/{starter-two-casts-v7,veteran-ball-two-casts-v7}.{webm,json}`; all507 decoded frames reviewed with native detail strips. Guardian initial contact, wraith death and Ball survivors excluded. |
| Compact v4 reward unobstruction and portrait boss framing | 8 | `docs/rpg-playtest/v15/compact-layout/v4-{guardian,boss}-{390x844,844x390}.png`; no floating XP over actors; all ten portrait boss actors fit. Static scope only. |
| Skeleton v5 controlled survivor catch / final silhouette; guardian and revenant v6c final silhouettes | 8, visible shape only | `/tmp/hit-keyposes-v5-skeleton-*.png`; `/tmp/hit-keyposes-v6c-{guardian,revenant}-death-*.png`. Fixture retained idle offsets in earlier death studies; support conclusions provisional. No actual-loop timing/support acceptance. |
| Ordinary compact damaged-enemy health bars at 390×844 and 844×390; subtitle-row outcome placement in shown ordinary/boss states | 8 | `docs/rpg-playtest/v15/compact-layout/v3-wounded-guardian-bar-{390x844,844x390}.png`; `v2-wounded-{pack,boss}-{390x844,844x390}.png`; floating XP excluded |
| Latest short-landscape boss header / ten-actor framing at 844×390 | 8 | `docs/rpg-playtest/v15/compact-layout/v3-wounded-boss-landscape-camera.png`; exact saved-state load, no transient cast notice or motion proof |
| Partial-hit v2 ordinary desktop damaged-enemy health bars and formation/outcome legibility | 8 | `/tmp/partial-hit-v2-after-1.png`; ordered v2 frames confirm stale toast clears before second cast. Boss and mobile/landscape excluded. |
| Skill menu, desktop and phone; all three schools, partial/mastered branches and details | 8 | `docs/rpg-playtest/v13/rpg-v13-skills{4,5,6}-*.png`; `phone-detail-fresh-load.png` |
| Grimoire static presentation, desktop/phone, all schools, viewing/selected/locked/tracked states | 8 | `docs/rpg-playtest/v13/grimoire/rpg-grimoire-v2-*.png` |
| Victory static presentation, desktop/phone, new/duplicate/rare/XP-only, low-level/no-point states | 8 | `docs/rpg-playtest/v13/treasure/rpg-treasure-v1-{desktop,duplicate}.png`; `rpg-treasure-v2-{rare-desktop,no-item-desktop,phone}.png` |
| Equipment relic section static states, desktop/phone; all 23 desktop crops, shown phone upper/lower rows, unowned/rare/legendary equipped states | 8 | `docs/rpg-playtest/v13/equipment/rpg-equipment-v3-{fresh-desktop,phone-top,phone-lower,phone-locked,legendary-desktop}.png` |
| Revised short-landscape HUD layout/hierarchy only | 8 | `/tmp/rpg-landscape-v4-open.png`; `/tmp/rpg-ball-v5-ordinary-landscape-{contact,latecontact}.png` |
| Compact small-landscape static HUD presentation at568×320 and640×360 | 8 | `docs/rpg-playtest/v13/compact-landscape/rpg-landscape-compact-v2-{568,640}.png`; readable current-spell name, simplified orbs, no XP microtext |
| Desktop dock v4 housing/material hierarchy and labels | 8 | `/tmp/rpg-v36-desktop-dock-precast.png`; bottom dock only, video-derived proof; other HUD and viewports excluded |
| Portal v7 actual textured export front/back construction/material fidelity | 8 | `/tmp/rpg-portal-export-{front,back}-v7.png`; sourcev4 preserved, native integration pending |
| Ball v33 compact palm-charge visible form | 8 | `/tmp/rpg-ball-v33-single-first.jpg`; transfer timing remains unaccepted due skipped interval |
| Ball Lightning main orb visible form at full-quality desktop, single and orbit variants | 8 | `docs/rpg-playtest/v13/rpg-ball-v4-{single-0_7,orbit-1_1}.png`; `docs/rpg-playtest/v13/ball-lightning/single-contact.png` |
| Ball Lightning fallback orb form and revised landscape orbit context | 8 | `docs/rpg-playtest/v13/ball-lightning/{fallback,desktop,landscape}-contact.png`; historical fallback late-contact confirms recovered strand separation |
| Ball Lightning portrait four-orb framing/form at 390×844 and 360×780 | 8 | `docs/rpg-playtest/v13/ball-lightning/{portrait,portrait-small}-contact.png`; historical late-contact confirms lower orbitals remain above question panel |
| Refined lich/wraith source and final GLB static appearance; depicted moderate rigid pose | 8 | `scripts/blender/previews/v2/lich-refined-study-{front-back,high-view}.png`; `lich-rigid-pose-comparison.png`; `wraith-cc0-exported-game-angle.png` |
| Final wraith runtime static readability at1.85 in reviewed Embercrypt/Stormspire camera | 8 | `docs/rpg-playtest/wraith-accepted/{embercrypt,stormspire}.png`; stronger localized cloth curve restores broad panel separation |
| Masonry pier source and optimized v8 GLB front/back construction/material fidelity in supplied studio views | 8 | `/tmp/rpg-masonry-pier-v6.png`; `/tmp/rpg-masonry-source-v8-back.png`; `/tmp/rpg-masonry-glb-v8-{front,back}.png`; native placement scored separately below |
| Portal v4 source front/back construction and material history | 8 | `/tmp/rpg-portal-source-{front,back}-v4.png`; export/native review pending |
| Full-height masonry pier native construction/material/readability and placement in reviewed warm/cool rooms | 8 | `/tmp/rpg-masonry-full-room{0,1}-after.png`; `/tmp/rpg-masonry-full-room1-stormspire.png`; miniature bridge posts excluded |
| Nova v16 clean full-front form and spatial composition in reviewed desktop phases | 8 | `/tmp/rpg-nova-v16-nova-{0.35,0.65,0.95}.png`; contact/death and HUD scopes scored separately; complete motion pending |
| Nova v18 actual-HUD static context in desktop, portrait and short landscape; revised late residue | 8 | `/tmp/rpg-nova-v18-hud-{desktop,portrait,landscape}-{contact,fade}.png`; fallback/chasm and real-loop timing excluded |
| Short-post v3 optimized export front/back construction and material fidelity | 8 | `docs/rpg-playtest/v14/masonry/post/export-{front,back}.png`; native scopes reviewed separately |
| Short-post bridge native construction/material, torch support and placement; visible upper wall-support portions | 8 | `docs/rpg-playtest/v14/masonry/post/native-room3-{embercrypt,stormspire}.png` and other room captures; obscured wall footings unverified |
| Corrected wall-pier footing contact on stepped aisles, with ordinary-view integration | 8 | `docs/rpg-playtest/v14/masonry/post/base-contact-room{N}-side{S}.png`; `raised-room{N}-{region}.png`; reviewed exposed contacts described below |
| Authored hero visible level-ground stride-v4 travel/arrival and rapid-answer cut/local staging | 8 | `/tmp/rpg-authored-hero-embercrypt-{stride,rapid-answer}-v4-frames/`; gate/stair support and exact cut/gather onset excluded |
| Authored hero gallery-route v5 doorway clearance and supported traversal, reviewed desktop sequence | 8 | `/tmp/rpg-authored-hero-embercrypt-gallery-route-v5-frames/`; every180–230 and later approach/arrival samples; environment visibility pop excluded |
| Nova v26 static palm-to-floor release connection | 8 | `/tmp/rpg-nova-v26-opening-authored-{0.13,0.17,0.18,0.23}-native-crop.png`; actual-loop opening timing pending |
| Authored hero heading-v2 native cast and planted cleave action sequences at recorded sampling | 8 | `/tmp/rpg-authored-hero-embercrypt-heading-v2-frames/`; cast26–61, cleave236–273; travel and effect-opening synchronization excluded |
| Authored hero native idle construction/material/readability in reviewed warm/cool desktop views | 8 | `/tmp/rpg-authored-hero-{embercrypt,stormspire}-normal-idle.png`; runtime motion excluded |
| Nova v13 small combustion-group visible form in native-size inspection crops | 8 | `/tmp/rpg-nova-v13-group-nova-{0.35,0.45,0.55}-native-crop.png`; full radial wave, contacts/deaths and motion pending |
| Authored warrior source, equipped static poses and optimized GLB construction/material fidelity | 8 | `scripts/blender/previews/v2/authored-hero-full-equipped-v12.png`; `authored-hero-contact-v13.png`; `authored-hero-packed-export-{front-back,high}.png`; native runtime and ordered motion pending |
| Wayfarer phone selected armor-card portrait/layout | 8 | `docs/rpg-playtest/v14/hero/wayfarer-card-phone.png`; other armor portraits excluded |
| Wayfarer shown desktop unselected armor-card layout/readability | 8 | `/tmp/rpg-wayfarer-card-desktop.png`; phone/equipped state and other armor portraits excluded |
| Wayfarer portrait raster source, complete512×640 transparent view | 8 | `web/public/assets/rpg/appearances/wayfarer.png`; actual armor menu deployment remains separate |
| Spell/relic/skill illustration source art | 8 | `web/public/assets/rpg/ui/{spells-v2,relics-v2,skills-v3}.png`, `wildfire-v3.png`; deployment acceptance only where reviewed separately above |


| Failing or unverified scope | Current grade/status | Main remaining gap / evidence |
|---|---:|---|
| Hero variants, skeleton, revenant, guardian/boss | 3.5–5 runtime baseline; hero source passes separately | Authored anatomy, armor/cloth construction, convincing silhouettes and materials still needed. Individual grades below. |
| World, architecture, floor, lighting, landmarks and props | 4–6; latest gate-v2 composition7, masonry5, floor6.5 | Repeated blocky structures and weak authored material/prop composition remain. Latest native fixture is `docs/rpg-playtest/v14/gate/ordinary.png`; first-room priorities are in candidate review AB below. |
| Ball/Nova combat impact and complete temporal presentation | V7 guardian initial contact7.5; wraith death7.5; Ball wounded-survivor response unverified. | Guardian flashes with insufficient shoulder impulse before its accepted collapse; wraith retains an active-looking reaching hold. Starter Nova partial outcome and other reviewed body responses pass separately. Prior complete passes remain withdrawn; see CE. |
| Other fourteen spells, shared non-Ball impacts/deaths and loot effects | 3–5 baseline or unverified; Nova v18 front/contact/poses/erosion, reviewed HUD context and late residue8; fallback chasm integration8; prior impact/complete motion passes withdrawn after user feedback; visual effect forms remain separate from reopened hit/death feel | Every family has its own unresolved form/contact/temporal gaps; see individual table below. No current complete combat-impact temporal acceptance. |
| Gateway visibility transition during hero travel | 5 | Gallery-route v5 frames218→219 remove the full gateway abruptly while bases remain; character route acceptance does not approve this environment pop. |
| Desktop/portrait combat HUD, notifications | Below gate / full review pending | Safe portrait orbit framing passes separately; accepted landscape presentation does not approve all other HUD layouts or notifications. |
| Armor selection section | 5 historical; still below gate in current partial view | `docs/rpg-playtest/v13/equipment/rpg-equipment-v3-phone-lower.png`: generic default shield and simplistic character thumbnails remain; accepted relic section does not approve armor. |
| Animation, reveal transitions, character locomotion/casting/death, performance modes | Unverified for full acceptance | Dense Ball review supports scoped motion components; it does not accept the weak opening or reconstruct missing critical rendered states. Other character/transition motion remains unverified. Recorded rAF timing is separate from visual quality and encoded video FPS. |
| Remaining coverage | Unverified | Remaining large equipped-detail variants, full room/biome coverage, every character under intended lighting and motion, and every effect/modifier on supported viewports. All23 relic collection crops have passed. |

The latest scores supersede historical entries only within their named scope. Technical tests, licensing provenance, polygon counts and implementation effort do not raise visual scores.

## Evidence and limitations

Direct references: `docs/concepts/math-dungeon-rpg/04-horde-viewport.png`, `05-fire-nova.png`, `06-spells-and-relics.png`.

Current committed gameplay evidence: `docs/rpg-playtest/v12/{horde-renderer,phoenix,tempest,chain-lightning,landscape}.png`. The horde capture is renderer-only; the other captures include actual game UI. These do not prove animation quality.

Additional spell coverage: all fifteen named `cast-*.png` captures under `web/test-results/spellbook/rpg-spellbook-all-fifteen--3d14f-st-across-three-expeditions/`. These are local test artifacts and may be overwritten by subsequent runs. The visible cast-12 Arc Lance frame misses the principal beam; the meteor frame shows aftermath rather than the incoming meteor. These observations are not substitutes for temporal review.

Model evidence: `scripts/blender/previews/v2/characters-final.png`, `revenant-exported.png`, `guardian-surface-comparison.png`, `room-landmarks.png`; final new-wraith `wraith-layered-exported.png` and `wraith-layered-game-light.png`, confirmed ready by the Blender implementer before final grading. Older model previews are supporting evidence only where corroborated by current gameplay.

UI evidence: current v12 HUD; v10 armor menu; v2 spellbook; local regression victory, skills and portrait-phone screenshots. Older menus receive provisional grades until a current screenshot confirms their appearance. Source illustration sheets were inspected directly: `web/public/assets/rpg/ui/{spells-v2,relics-v2,hud-v2}.png`.

## World, models and rendering

| Category / asset | Score /10 | Evidence and reason below 8 | Two concrete changes with highest value |
|---|---:|---|---|
| World composition and environmental storytelling | 5 | v12 horde: readable room and warm/cool lighting, but long repeated wall bays and tombs surrounding a largely empty rectangular floor. Concept has nested spaces, broken structures, layered debris and deliberate local detail. | Author asymmetric room compositions with foreground/midground/background depth; build coherent prop clusters indicating the room's former use rather than scattered cosmetic fragments. |
| Masonry, arches, pillars and broken ruins | 5 | v12 horde/bridge: architecture has relief, but huge smooth slab faces and sharp regular edges dominate; damage lacks the concept's worn scale and layered stonework. | Rebuild a small modular masonry set with believable stone/block scale, worn edges and deep mortar; integrate broad damage patterns and rubble transitions into each room composition. |
| Floor and ground dressing | 6 | v12 horde: best environmental material, with readable cobbles and wet response, but tiling remains obvious and the broad central patch is sparse. | Blend authored wear/damp/dirt masks around meaningful traffic and drainage; add contact debris and localized displaced stones without obscuring the hero's combat space. |
| Lighting, materials and depth | 5 | v12 captures: clear warm torches/cold crystals, but actors look pasted onto the room, material response is often uniformly dull or plastic, and black voids lack atmosphere. | Calibrate stone, cloth, bone and metal response together under gameplay lights; establish restrained contact shading, motivated indirect fill and atmospheric depth without simply brightening everything. |
| Furnace landmark | 4.5 | Room-landmark export and Firestorm/Cleave captures: identifiable, but oversized clean blocks and glowing flat lumps resemble a simple fireplace prop. | Add authored soot, ash, layered refractory damage and convincing ember bed; shape surrounding tools/ruin composition to make it an actual former forge. |
| Reliquary landmark | 4.5 | Export and v12 Tempest: simple octagonal frame around a bright gem; scant history or crafted ornament. | Develop a distinct reliquary silhouette with carved supports and damaged ceremonial details; give the crystal/frame material interaction and local ground dressing a coherent focus. |
| Crystal gallery landmark | 4 | v12 Chain Lightning: very large, regular blue prisms with bright white facets dominate the room. More like opaque polygons than mineral. | Author clustered mineral growth with varied scale, inclusions and fracture; improve depth/color absorption and roughness variation while reserving bloom for selective luminous seams. |
| Small decorative crystals | 5 | v12 horde: subdued clusters fit better than bright cones, but remain simple dark shards. | Create convincing growth bases and broken fragments; tune facet/material variation at actual camera size. |
| Hero — Wayfarer | 4 | Character preview and cast-1: hood/weapon/cape are readable, but anatomy, glove/boot forms and armor construction remain toy-like and generic. | Rebuild a strong authored hero silhouette with believable fitted armor and joint anatomy; add cloth tension, layered equipment and a cohesive weathered material set. |
| Hero — Cinder Knight | 4.5 | v10 armor and v12 Phoenix: palette and shoulders distinguish it, but it retains the same mannequin proportions and simple geometry. | Develop a distinct Flame armor silhouette and crafted armor forms; integrate emissive accents with material wear and cloth rather than relying on red recoloring. |
| Hero — Glacier Warden | 4.5 | v10 armor and frost casts: silhouette and silver/blue palette read, but plates look smooth and oversized. | Sculpt clear layered cold-forged armor construction; use controlled frost/mineral details and convincing metal response. |
| Hero — Tempest Weaver | 4.5 | v10 armor and v12 Tempest: purple identity is clear, but armor and cloak remain simple assembled shapes. | Author a distinct storm-caster silhouette with elegant layered equipment; refine cloth, etched metal and selective electrical details. |
| Skeleton | 3.5 | Revenant export and v12 horde: face has oversized circular eyes; ribs, limbs, hands and stance resemble an anatomy toy. | Rebuild skull/rib/pelvis/limb forms with coherent stylized anatomy and asymmetric equipment; pose and animate a threatening but child-appropriate silhouette with convincing weight. |
| Armored revenant | 4.5 | Revenant export and v12 horde: shield gives welcome mass, but the shared toy skull, flat plates and rod-like limbs still dominate. | Author helmet/face and armor fit as one character design; improve shield wear, layered plates and guarded body posture. |
| Guardian and scaled boss | 5 | Guardian comparison and v12 horde: substantial silhouette and crystal identity, but stacked round stones, friendly carved face and regular crystal spikes lack the concept's rugged menace. | Rebuild asymmetrical rock anatomy with large fractured masses and smaller compression joints; integrate mineral growth, fissures and worn surface detail instead of attaching uniform spikes. Boss needs authored distinctions beyond scale. |
| Old in-game wraith | 3.5 | v12 horde/Phoenix: long narrow teal sheet, generic hood and thin arms. | Replace with the revised asset; continue the structural cloth/head work listed below. |
| New layered wraith, uncommitted v13 asset | 5 | Final GLB front/back and old/new game-light render: layering and fingers are improvements, but drapes look rubbery, folds resemble curtains, hood is a smooth oval, and arms/caps remain simple geometry. No current in-game or motion proof yet. | Author asymmetric tension/compression folds, fabric response and torn layers; develop a distinct head/upper-body silhouette and expressive articulated claw gesture. Tiny clasp additions alone will not reach 8. |
| Brazier/torch, chest, small props | 4.5 provisional | Visible only at small size in current horde; brazier works as a light source, chest and tomb shapes remain basic. Insufficient close or multi-angle evidence for a final asset gate. | Review final exported props under gameplay lighting at intended size; rebuild weak silhouettes and material wear as a coordinated prop kit. |

## Spell effects — every spell remains below the gate or incompletely verified

These are **visible-frame art scores**, not full animation acceptance. Every spell still needs anticipation/peak/contact/aftermath temporal review. Source spell icons are graded separately; a beautiful icon does not validate its real-time effect.

| Spell / family | Score /10 | Visible evidence and reason below 8 | Two concrete improvements |
|---|---:|---|---|
| Fire Nova | 5 | cast-1: strong circular coverage, but the edge is a repeated orange strip with separated flaps; debris resembles confetti. | Use turbulent flame shape with varied thickness and hot-core/cool-smoke hierarchy; bind impacts, scorch and fragment scale to individual enemies and floor contact. |
| Flame Cleave | 4 | cast-2: smooth bright white semicircle resembles a light tube, little sword-path texture. | Author a tapered, broken blade wake following the actual swing; give contact sparks and dissipating heat a directional hierarchy. |
| Meteor | 4 provisional | cast-3: aftermath repeats the Nova ring and a flat orange impact disc; incoming core is absent from supplied frame. | Give the falling body a distinct crust/molten trail and timed strike; replace reused rings with a localized crater flash, dust, ejecta and lingering scorch. |
| Phoenix Dive | 4 | v12 Phoenix: improved feathered silhouette, but wings read as orange noodles/ribbons rather than luminous fire anatomy; reward banner intersects the focal action. | Design a coherent phoenix body/wing mass with a few primary feather shapes and turbulent secondary breakup; synchronize lift/dive/impact and reserve focal space from notifications. |
| Firestorm | 4.5 | cast-5: orange tongues form an opaque hedge with repeated holes and chunky debris. | Create layered flame/smoke volumes with varied cadence and dark negative space; give sequential ground eruptions clear localized impacts and aftermath. |
| Frostfall | 3.5 | cast-6: repeated hanging blue pendants with thin dotted stems, weak ice material. | Build irregular crystalline falling shards with depth and bright fracture edges; add short vapor trails, localized shatter and frost propagation. |
| Ice Lance | 3 | cast-7: several long cyan rods dominate; lacks a convincing spear head or volumetric energy. | Create a strong tapering projectile/core and broken wake; stage penetrating contacts as discrete shattering bursts, with irregular secondary splinters. |
| Glacial Surge | 4 | cast-8: repeated opaque pale-blue pyramids, strong area shape but toy-like material. | Use an authored rising fracture/wave silhouette with scale variation; add mineral depth, frost dust and grounded crack formation. |
| Blizzard | 3.5 | cast-9: sparse dots and the same suspended pendants as Frostfall, little distinct storm identity. | Build a directional turbulent snow/vapor field with varied streak lengths; distinguish accumulating hail impacts and swirling motion from Frostfall. |
| Frost Guardian | 4.5 | cast-10: summon is visible but looks like an enlarged white/blue version of the same rock enemy and broadly washes the room. | Design a distinct summoned ice silhouette/material; create formation through shards/frost and local foot/strike interaction rather than global white illumination. |
| Chain Lightning | 3.5 | v12 Chain Lightning: thin uniform white wires connect the room; generic blue dots around targets. | Use short-lived branched strokes with strong luminance/thickness hierarchy and asymmetric secondary arcs; stage contact flashes and local light sequentially so the chain is legible. |
| Arc Lance | Unverified; visible aftermath 3 | cast-12 misses the primary beam; surrounding dots do not identify the spell. | Supply anticipation/beam/impact frames; build a coherent piercing lightning spear with directionally grouped contact effects. |
| Thunderclap | 3.5 | cast-13: broad pale regular donut dominates the frame. | Replace smooth ring edge with broken pressure/dust/ionization structure; time a compact charged core and outward hit reactions with a clean fade. |
| Ball Lightning | 3 | cast-14: opaque flat white balls plus thin white connections. | Build layered electrical cores with internal filament depth and irregular coronas; use lively orbital motion and distinct discharge contacts without solid white discs. |
| Tempest | 3.5 | v12 Tempest: wispy dark curves are hard to read and thin wires/dots dominate; no convincing storm body. | Create an asymmetric rotating mass of dark cloud wisps and luminous internal branches; stage readable bursts and grounded contact, keeping hero/enemy silhouettes visible. |
| Shared hit/death/debris and loot effects | 4 provisional | Multiple casts: repeated round dots and pale chunks across most targets flatten school identity; no complete loot reveal sequence supplied. | Make fragment shape, size, direction and material match each creature and element; choreograph impacts, corpse collapse, reward reveal and cleanup so effects support one focal action. |

## UI art and presentation, separately from usability

| Category | Art score /10 | Evidence and deficit | Two concrete improvements |
|---|---:|---|---|
| Spell illustration source sheet | 8 | `spells-v2.png`: cohesive detailed imagery, good color-school grouping and recognizable major motifs. This passes only as source illustration, not spell animation or final small-icon readability. | Preserve this fidelity in final crops; test each icon at actual HUD size, especially similarly colored Frost abilities. |
| Relic illustration source sheet | 8 | `relics-v2.png`: convincing crafted silhouettes/material detail and consistent presentation. Individual deployment/crop coverage for all 23 items is missing. | Verify every item mapping and crop at inventory/reveal sizes; give rare finds sufficient on-screen scale to appreciate the artwork. |
| Desktop HUD integration | 5.5 | v12 captures: readable gold/black theme, but plain double-line rectangles and oversized numbered orbs weaken the sculpted concept's richness; tiny labels and notification placement compete with action. | Build one coherent frame/material treatment with intentional hierarchy; move reward/equip notices away from cast focus and refine typography at actual resolution. |
| Spellbook | 5.5 provisional | v2 screenshot: attractive icons inside large flat cards; resembles a generic catalog more than a crafted grimoire. | Rework composition around large selected-spell art and compact navigable choices; give frames, selected/locked states and typography a consistent crafted identity. |
| Skill trees | 5 provisional | Local regression screenshot and v2: enormous rectangular panels with tiny central icons, much empty space, thin connector lines and low visual hierarchy. | Replace card-grid emphasis with prominent skill nodes, purposeful branch spacing and clear connectors; give selected skill detail its own focused panel. |
| Equipment and armor menu | 5 provisional | v10: strong relic illustrations but tiny simplistic character renders; default armor is a generic symbol while other options use models. | Use consistent high-quality character portraits/turntable presentation; reduce catalog-card sprawl and focus selected equipment/art with clear hierarchy. |
| Victory and loot reveal | 5 provisional | Local regression victory: coherent typography, but generic crown glyph and small relic card undersell the major reward. | Give the found relic a dramatic large presentation with crafted frame; choreograph reward/XP/next-unlock information without a wall of equal-weight controls. |
| Portrait phone presentation | 4.5 | Local regression 06-phone: keypad/input/spell bar take much of screen; top chrome and banners crowd the remaining battlefield. | Design a dedicated compact mobile HUD/keypad arrangement; preserve a clear vertical focal corridor for hero, enemies and spell impacts. |
| Landscape phone presentation | 3 | v12 landscape: field of play becomes a narrow strip beneath title/banner/top controls and above a very large bottom HUD; keypad occupies upper-right. | Use a true landscape layout with compressed peripheral information and a smaller action dock; reserve a stable unobstructed combat rectangle while input is open. |
| UI usability | Not graded as visual quality | Screenshots suggest basic controls are accessible, but interaction tests and readability do not prove polished art. | Validate behavior separately from this visual gate; do not promote art scores because buttons work or tests pass. |

## Three structural priorities

1. **Replace the weakest character foundations with authored character art.** Start with the hero and one common enemy, and get them to 8 in final gameplay lighting and motion before multiplying variants. The present anatomy, cloth, armor fit and poses are the strongest source of a toy/prototype impression. Higher polygon counts and small accessories alone will not solve this.
2. **Build a coherent effects production pipeline and finish representative effects.** Establish proper energy/opacity/texture breakup, emissive hierarchy, contact lighting, grounded aftermath and timed enemy reaction for one fire, one frost and one lightning spell. Then derive the remaining spells with distinct silhouettes and staging. Reusing circles, rods, dots and white discs with more particles will plateau below the required bar.
3. **Art-direct a finished room and integrated HUD as one composition.** Bring one room to the concept's masonry scale, surface richness, asymmetric prop storytelling and depth; calibrate all materials under its lighting. Design desktop and mobile HUDs around preserving that focal scene. Use the successful room as a standard for all six rooms, not as an isolated beauty shot.

## Missing coverage and required re-review

- Animation and temporal presentation are **unverified**, not 8: hero idle/cast/swing/travel; enemy idle/approach/recoil/death; cloth behavior; camera travel; full spell anticipation/contact/aftermath; reward and level-up transitions. Request: a real-time 12–20 second idle→cast→impact→death→travel capture with timestamps/frame cadence, plus representative spell stage captures. Stills or source code cannot establish this.
- Current fresh menu coverage is missing for all three skill schools, all spellbook pages, all 23 equipment/relic mappings, region selection/map, help, pause and reward states. Older screenshots support provisional criticism only.
- Each of six room layouts and all three regional treatments need current screenshots at normal and maximum pack counts, with the actual HUD. The current subset cannot certify every world asset.
- New wraith requires actual in-game front/side/back visibility and movement validation; studio comparison alone does not certify integration.
- All four heroes require current in-game motion and close gameplay-distance review. Source model views alone cannot validate silhouettes in combat.
- Responsive coverage must include desktop, portrait phone and short landscape phone with the answer keypad open and closed.
- Lower rendering quality/performance fallback must be reviewed in motion; a high-quality still cannot validate a mode that drops frames or changes the look substantially.
- Legacy `imp`/`wall` aliases and any unused assets are not separate accepted art deliverables. If they can appear at runtime, their actual rendering must enter the review inventory.

**No global art acceptance is granted.** Re-review changed assets independently using new rendered evidence, keep below-8 scores visible, and keep missing categories unverified. Do not redefine 8 as “good for this implementation” or treat the existence of this report as passing the gate.

## Candidate review A — structural skill tree and wraith clay

These are new worktree candidates after the baseline. They do not replace the baseline's other failing or missing categories.

### Skill tree candidate

Evidence: `/tmp/rpg-v13-skills-desktop.png` and `/tmp/rpg-v13-skills-phone.png` (390×844), supplied by root. Both show a fully learned Flame tree. Locked/available states and interaction transitions are not yet covered.

- **Desktop: 6.5/10.** The connected illustrated nodes plus focused detail panel are a substantial improvement over giant cards. Branch structure is now legible. It still lacks polished state hierarchy and material integration: every node is a similar flat square with a thick cream geometric bevel, repeated artwork is visually dominant, rank diamonds are small, and the selected node is not unmistakable. The header consumes roughly 250 pixels before the tree; the final node is clipped in a 900-pixel-high capture.
- **Phone: 6/10.** The graph fits without horizontal overflow, but four sibling nodes occupy some rows with very small names, the selection is not obvious, and the detail/action is completely below the visible graph. Fitting the DOM width does not establish a polished mobile composition.

Two required structural revisions: (1) establish a clear visual grammar for selected, new-spell, passive-upgrade, learnable and mastered nodes, using restrained worn-metal rims and localized highlights rather than uniform pale extrusions; (2) reclaim header whitespace and improve text/rank clarity, preserve the branch silhouette on desktop, and give phone a compact persistent selected-skill summary with an explicit route to full detail without covering graph nodes. Final scores depend on the actual render, including locked and available states; implementing this advice does not guarantee 8.

### Wraith structural clay candidate

Evidence: `scripts/blender/previews/v2/wraith-structural-clay-front-back.png` and `wraith-structural-clay-isometric.png`, first clay candidate. **Shape-only score: 4.5/10; not ready for baking.** This is not a material score and should not be compared as a complete asset score to the earlier textured model.

The hunched posture, unequal arms and more defined head are useful exploration. However, the model currently reads as separate short sleeve tubes, a tube torso and a separate open skirt, with obvious waist ledges and open shoulder connections. The hood is a clean upright leaf shape; the face is a cute skull/mask with round eye sockets and a tiny mouth. One hand still hangs with parallel straight fingers. These are structural failures at the actual high camera angle.

Two required corrections: (1) create a believable continuous robe/cowl system with sewn sleeves, overlapping tension at the waist, diagonal chest folds and an uneven long drape, eliminating cylinder-like junctions; (2) recess and reshape the head/hood, using a lower sloped brow, angular cheek/temple/nasal forms and cloth collapsing around the neck, and finish a curved grasping hand gesture. Materials and small ornaments cannot conceal the current segmented construction. A second corrected clay is pending; no approval to treat this candidate as an accepted asset is given.

## Candidate review B — Ball Lightning volume

Evidence: local `sequence-still-14-ball_lightning-{anticipation,release,peak,aftermath,travel}.png` and `sequence-stills-14-ball_lightning.json` under the spellbook test result directory. **Visible-frame score: 4/10, provisional; full temporal quality unverified.**

The opaque white discs are gone, but the new electrical volumes are nearly invisible small blue starlets/haze at gameplay scale. Thin room-spanning wires and generic blue dots dominate. The result reads as Chain Lightning aftermath, not a distinct Ball Lightning cast.

The timing metadata matters: the first screenshot call brackets attack age approximately 0.28–1.24 seconds, the second begins around 1.30 seconds, and the file called `peak` already shows an empty post-combat room. These labels do not prove anticipation/peak coverage. The before/after timing brackets also do not establish the exact instant the displayed pixels were sampled. Screenshot readback perturbs this capture; its diagnostic FPS values are not an uncontaminated motion benchmark.

Required revisions: make the volume readable through several dominant irregular branching arcs defining a roughly 30–45-pixel energized mass at the desktop gameplay camera, with a concentrated asymmetrical core and transparent/dark gaps; reduce subordinate wire/dot prominence so the orbs own the hierarchy. Increasing readability must not restore opaque white balls or uniform outlined spheres. The implementer separately identified excessive attenuation and subpixel channels as causes. Request fixed simulation-time renders around 0.35, 0.70 and 1.10 seconds for form review, followed by continuous motion evidence for a full effect score.

## Candidate review C — second skill tree layout

Evidence: `/tmp/rpg-v13-skills2-desktop.png`, `/tmp/rpg-v13-skills2-phone.png`, `/tmp/rpg-v13-skills2-phone-detail.png`. Fully learned Flame state only.

**Desktop 7/10; phone tree 6.5/10; phone detail 7/10.** The complete branch structure now fits desktop, the condensed header helps, the darker node rims are better integrated, and the mobile Tree/Details split preserves graph space. These are real improvements. They do not establish 8 or validate locked/available states.

The biggest remaining visual deficit is node identity. Wildfire/Twin Nova/Phoenix Heart, Meteor/Meteor Shower, Phoenix Dive/Ashen Wings, and Firestorm/Living Inferno reuse identical pictures within their groups. Tiny rank diamonds and faint bracket/rim differences bear too much of the visual meaning. At phone size these remain near-identical thumbnails. Author distinct upgrade treatments communicating echo, wider coverage, repeated meteors and empowered wings, while preserving the polished base illustrations for actual spell unlocks. Make the selected surround immediately recognizable without reading labels. New icon variants must match the existing illustration quality; symbolic clutter is not a solution.

The secondary deficit is frame/material integration: generic flat panels and thin borders sit on a noisy slate field, while the detail illustration has a broad, pale, unweathered rectangular bezel. Unify these with dark worn metal, coherent bevel lighting and restrained school-colored focal accents. More ornament on every surface would not improve hierarchy. Current footer clipping/scrolling also needs interaction review, but is not the principal art deficit.

## Candidate reviews D–F — continued structural iterations

### Wraith clay 2 and 3

Evidence: `wraith-continuous-clay-{front-back,isometric}.png` and `wraith-integrated-clay-{front-back,isometric}.png` in `scripts/blender/previews/v2/`.

**Both remain 5/10 shape-only.** The second removes the hard waist junction and improves skull anatomy; the third covers shoulder gaps and overlaps the front garment. The remaining visual failure is cloth construction: an inflated smooth hood, stiff broad collar, short tubular sleeves and flat bib-like chest panel resemble molded pieces. Their overlap is more continuous, but not yet convincing drapery. The third high isometric view also hides almost all facial character. Requested next step: replace stiff collar/sleeves with a mantle physically draped over shoulder/upper-arm volumes, preserve arm-to-torso negative space, and sculpt or simulate meaningful hood/brow/neck and raised-shoulder compression. Fabric edges must be thin layered cloth rather than rubber slabs. No material bake acceptance granted.

### Ball Lightning second visible-volume candidate

Evidence: `/tmp/rpg-ball-v2-single-{0_35,0_7,1_1,1_75}.png` and corresponding `orbit` files. These are exact simulation-time actual-renderer frames, paused for screenshot readback, with no game HUD.

**Visible-form score 6/10.** The electrical masses are now readable, have transparent dark gaps, and no longer drown in a room-wide generic lightning web. Single and four-orb states preserve hero visibility. Dominant crossing channels still form an X-shaped spark burst, with a circular halo of smaller veins, rather than an energized volume. Curve and branch the dominant channels through unequal depths/directions, use a small off-center core and partial occlusion through darker cloud wisps, and avoid a clean central X. Contact circles remain generic blue-dot confetti; use fewer sharp directional fragments and short grounded contact haze.

A 3.68-second renderer recording exists at `/tmp/rpg-ball-v2-motion.mp4`, with implementer-reported approximately 20 actual renderer FPS despite a 25-FPS recorder. This review inspected the exact-time stills, not continuous video playback; motion quality is therefore still unverified. Neither the existence of the file nor the recorder's nominal frame rate earns an animation score.

### Skill tree third candidate and new illustrations

Evidence: `/tmp/rpg-v13-skills3-{desktop,phone}.png` and corresponding `*-partial-fixture.png`; source `web/public/assets/rpg/ui/skills-v3.png` and `wildfire-v3.png`. The partial state is a local render-only level-6 fixture with two points, not a server modification.

**Desktop 7.5/10; phone 7/10.** Distinct Flame upgrade illustrations solve the previous repeated-image identity problem. The dark detail bezel is better integrated. The new illustration sheet and Wildfire override score **8/10 as source art**, with coherent quality across Flame, Frost and Storm. The rejected meteor-like atlas cell must remain unused for Wildfire. Actual deployed Frost/Storm crops still need inspection.

The remaining deficit is state hierarchy and small-screen legibility. In the partial fixture, learnable and mastered nodes are similarly bright and tiny filled/hollow rank diamonds do nearly all the differentiation. Selection still relies heavily on tiny name chevrons and subtle rim differences. Request a clear localized selected-node surround or halo, used only on selection, plus a consistent readable learnable state distinct from mastered. Phone names and ranks need more size/spacing across four sibling nodes; use intentional two-line labels and tier spacing rather than shrinking all content to fit. No need to regenerate the now-distinct Flame illustrations. Full skill-tree acceptance also requires actual Frost/Storm layouts and states, not just this Flame fixture.

## Candidate review G — fourth skill tree, three schools

Evidence: `/tmp/rpg-v13-skills4-{ember,frost,storm}-{desktop,phone}-partial-fixture.png`. These show actual UI with local render-only partial progression fixtures. The root reports a passing mobile selection/details/explicit-Learn regression; that behavioral evidence is separate from the art scores below.

| Visible composition | Desktop | Phone |
|---|---:|---:|
| Flame | 8 | 7.5 |
| Frost | 8 | 7.5 |
| Storm | 8 | 7 |

**The visible desktop partial-state compositions now meet 8 for this specific screen region.** The selected surround, learnable/locked badges, explicit numeric ranks and distinct upgrade illustrations give a coherent hierarchy. Artwork crops across the three schools are polished and identifiable. More decoration is not needed to pass this scoped desktop assessment.

This is not acceptance of the whole UI or unseen tree content. The bottom Frost/Storm desktop nodes are outside the supplied viewport; phone lower nodes/details still need coverage. The phone Storm labels `THUNDERCLAP` and `FORKED ARC` visibly run together. Four sibling columns leave insufficient room for long names, and mixed one/two-line names produce inconsistent rank baselines. Flame/Frost are clearer but similarly crowded. Use deliberately bounded consistent-height label slots, a readable narrower/less-tracked mobile text treatment or a deliberately scrollable wider branch arrangement, and align ranks within each tier. Do not solve the problem simply by shrinking labels back below readable size. Re-review lower-tree scroll positions and phone Details for all three schools.

## Candidate review H — Ball Lightning v3

Evidence: `/tmp/rpg-ball-v3-{single,orbit}-{0_35,0_7,1_1,1_75}.png`. **Visible-form score 6.5/10.** Removing blue-dot confetti and adding restrained contact haze improves integration. The former X-shaped intersection is gone. The main channels now resemble long, clean glowing J/C-shaped wires or rune strokes, still outlining the mass more than conveying turbulent energy depth.

Highest-value next revision: break the dominant contours into irregular branching/tapering paths passing through an off-center plasma core, with some portions dimmed or hidden behind cloud depth. Use two or three bright knots rather than one long uniformly white curve. More global brightness or particles are unnecessary. An actual renderer recording exists, but continuous playback was not inspected in this still-image review; motion remains unverified. The implementer's recorded approximately 19 renderer FPS needs a separate no-recording cadence check to distinguish capture overhead from target gameplay performance.

## Candidate review I — collision-safe wraith cloak

Evidence: `scripts/blender/previews/v2/wraith-cloak-clay-{front-back,isometric}.png`. **Shape-only 5.5/10.** The cloth folds and asymmetrical open hem improve on prior rigid pieces, but a broad umbrella-like poncho still dominates a narrow straight torso. At the gameplay-like high view, the creature is mostly that mantle and hood. The visible rear-neck opening also breaks garment continuity.

Highest-return revision: change the mantle's pattern/silhouette, reducing its radial spread and gathering one side on the raised shoulder while the other hangs farther toward arm/chest. Its lower edge should be diagonal and asymmetric rather than a near-horizontal skirt around the neck. Give the torso a slight curved/twisted axis and connect hood drape into the back cloth to close the neck opening. More small folds or surface detail alone cannot correct the main silhouette. Public asset remains unchanged; no bake or final art acceptance granted.

## Candidate review J — Ball Lightning v4 orb form

Evidence: all eight `/tmp/rpg-ball-v4-{single,orbit}-{0_35,0_7,1_1,1_75}.png` exact-time renderer stills. **Main orb visible form: 8/10 at the supplied full-quality desktop camera.** Interrupted branching channels, localized bright knots, dark depth gaps and restrained corona now form a coherent charged volume. The single and four-orb variants remain readable without white discs, clean rune-like outlines or a room-wide wire web. Further microtuning of this successful shape is not the priority.

This is a deliberately scoped form score, **not full spell acceptance**. Continuous animation/cadence, actual HUD/mobile/fallback presentation, and shared hit/death effects still need independent evidence and review. The 1.75-second orbit frame includes a large overexposed contact flare at the top edge and a strong orange victim flash at lower right; their duration and prominence need motion review. Shared death fragments/poses retain their separate failing baseline grade. Do not report that Ball Lightning as a complete gameplay effect has passed solely because its orb geometry/material presentation now passes in these stills.

## Candidate review K — fifth skill tree and complete lower-node coverage

Evidence: twelve `docs/rpg-playtest/v13/rpg-v13-skills5-{ember,frost,storm}-{phone-partial,phone-lower-mastered,phone-detail,desktop-lower-mastered}.png` captures, plus previously reviewed unchanged desktop upper states.

**Desktop trees: 8/10 in all three schools. Phone trees: 8/10 in all three schools.** Mixed-case mobile labels in consistent slots resolve the prior overlap, stabilize rank placement and retain readable names. Upper partial-state and lower mastered captures now cover the full branch layouts and all deployed upgrade illustrations. Selected, learnable, locked and mastered states are visually distinguishable. No further tree redesign is needed for this visual gate.

Phone Details composition also scores 8, but the illustration rendering in the three supplied phone-detail captures remains **7.5/10 pending a sharpness check**: the Living Inferno, Twin Guardians and Overcharge pictures and inner bezels appear noticeably blurred while surrounding text/controls remain sharp. Matching desktop detail illustrations are crisp. Requested root to inspect settled styles/rendering for a transition, scaling or filtering artifact and supply a settled phone detail capture. If that blur persists in ordinary display, fix it; if it is a transient capture artifact, new settled evidence can close this point. This is a narrow remaining issue, not a request to rework the accepted tree layouts.

These scores apply to the skill-tree menu only. They do not promote the separate spellbook, inventory, HUD, victory, world or effects categories.

## Candidate review L — gathered wraith mantle

Evidence: `scripts/blender/previews/v2/wraith-gathered-clay-{front-back,isometric}.png`. **Shape-only 6/10, still unaccepted.** The narrower asymmetric mantle, bent torso axis and paired forearm bones move the silhouette materially closer to an authored creature. A conspicuous waist discontinuity, open rear neckline, stretched smooth cloth strips and crude skull/hand anatomy remain. Repairing the seam alone will not bridge the gap to 8.

The authorized search for an authored openly licensed sculpt foundation is a reasonable change in approach: repeated procedural adjustments have improved broad composition but are plateauing in anatomical and cloth specificity. Preserve the candidate as a pose/asymmetry reference rather than a production replacement. Any new foundation must be judged under neutral and gameplay lighting at the actual high camera; a detailed marketplace or studio render is not automatic acceptance. Public runtime asset remains unchanged.

## Candidate review M — settled larger phone skill details

Evidence: `docs/rpg-playtest/v13/rpg-v13-skills6-{ember,frost,storm}-phone-detail.png`. **All three phone Details presentations: 8/10.** Increasing the illustration to 144 pixels makes the detailed art appreciable at the supplied phone resolution while preserving a coherent hierarchy. The previously observed small-image softness no longer materially weakens the presentation. The root reports no active transform/filter/animation and identical decoded PNG/lossless-WebP pixels; this is a presentation-size improvement, not a claim that source compression or a browser defect was fixed.

**The reviewed skill-menu visual category now meets 8 across desktop and phone trees, partial/mastered state fixtures, lower branches and detail panels.** Preserve these reviewed captures and verify the fresh application load uses the final CSS. This acceptance is limited to the skill menu; it does not transfer to HUD, spellbook, equipment, victory, world, models or complete spell effects.


## Persisted accepted evidence

The accepted skill-menu captures are preserved under `docs/rpg-playtest/v13/`: the `rpg-v13-skills4-*` partial desktop states, `rpg-v13-skills5-*` complete lower-branch and phone tree captures, and `rpg-v13-skills6-*-phone-detail.png` settled larger details. `phone-detail-fresh-load.png` independently shows the same enlarged detail presentation after a fresh application load; it was inspected and remains consistent with the scoped 8/10 grade.

Representative accepted Ball Lightning orb-form frames are preserved as `docs/rpg-playtest/v13/rpg-ball-v4-single-0_7.png` and `rpg-ball-v4-orbit-1_1.png`. Other exact-time phase frames retain their temporary paths in the historical review above. The adjacent `rpg-ball-v4-no-recording.json` is performance evidence, not proof of full visual or temporal acceptance.

Global art gate remains **FAILED**. Accepted skill-menu presentation and Ball Lightning orb form do not average away the below-8 world/model/HUD/other-menu/spell categories or missing motion evidence.

## Candidate review N — integrated grimoire v1

Evidence: `/tmp/rpg-grimoire-v1-desktop.png` and `/tmp/rpg-grimoire-v1-phone.png`. **Desktop 7.5/10; phone 7.5/10, provisional.** The large focused illustration and restrained spell index are substantially better than the earlier catalog cards and use materials consistent with the accepted skill menu.

The principal remaining visual issue is state identity: Fire Nova is the focused detail, but its index row has the same treatment and `Select spell` text as every other row. Give the focused row a restrained visible surround/rule tied to the large detail panel, and distinguish the actually equipped spell from mere inspection/focus. Avoid making every row a large equal-weight button. Desktop content currently pushes important actions/footer below the visible modal; the implementer is already reducing its height. Phone text/art is legible, though the focus panel occupies much of the first screen, so keep its summary/actions concise while preserving list navigation. Final coverage requires all three schools, locked/equipped/focused states and the bottom actions. Source illustration quality is not itself grimoire acceptance.

## Candidate reviews O–P — grimoire acceptance and authored lich foundation

### Grimoire v2

Evidence: `docs/rpg-playtest/v13/grimoire/rpg-grimoire-v2-{desktop,frost-desktop,storm-desktop,short-desktop,locked-desktop,locked-phone,locked-phone-bottom,storm-phone,flame-phone,narrow-phone}.png`.

**Desktop 8/10; phone 8/10 for the reviewed visual states.** The focused `Viewing` row is distinct from the gold actually `Selected` spell, locked/tracked states remain readable, the large detail illustration and index form a coherent composition, and the bottom actions are clearly presented. The 360-pixel phone uses a deliberate stacked detail arrangement without sacrificing illustration/text readability. Desktop height is now controlled, including the short desktop view. No further visual redesign is needed for this grimoire category. Preserve these images and verify fresh-load/interaction behavior separately; this score does not transfer to other menus or combat HUD.

### Authored anatomy adaptation

Evidence: `scripts/blender/previews/v2/wraith-cc0-fixed-clay-{front-back,isometric}.png`. **Complete shape 6.5/10.** The visible bones and hands are more anatomically convincing and the skull less toy-like. Source pedigree earns no credit; this is a visible improvement. The old garment remains the limiting part, with stretched smooth slabs, pinched waist shelf and an open neckline, and it hides nearly all facial character in the high view. Preserve the improved anatomy but replace the garment foundation rather than repeatedly tweaking isolated strips/collar rings.

### New lich garment foundation

Evidence: `scripts/blender/previews/v2/lich-cc0-foundation-high-view.png`, neutral clay and normalized textured render of the actual imported asset. **Current rendered presentation 7.5/10, provisional from one view.** It is the strongest model foundation reviewed so far: layered cowl, gathered waist cloth, unequal hanging strips and a deliberate tall silhouette solve much of the prior garment-design problem. The source license/pedigree did not affect the grade.

Remaining deficits: coarse thin/angular garment strips and jagged ground hem can look like mesh artifacts; the staff/hand is rigidly merged; fine relief appears primarily in albedo and needs convincing cloth/trim/bone response under changing light. Preserve the authored garment/helm design while cleaning and thickening fragile edges, refining major fold normals, separating/removing the staff cleanly and introducing restrained material roughness/normal variation. A desaturated teal adaptation should retain local value contrast. Back views, actual high gameplay camera and integration/motion evidence are required before final asset acceptance. Do not replace the well-authored garment with the weaker procedural foundation merely to retain old code.

Accepted grimoire v2 evidence is now persisted under `docs/rpg-playtest/v13/grimoire/` with the same basenames. The accepted category remains limited to the reviewed grimoire presentation.


## Candidate review Q — refined lich source presentation

Evidence: `scripts/blender/previews/v2/lich-refined-study-front-back.png` and `lich-refined-study-high-view.png`. **Visible static source asset: 8/10 at these studio and elevated angles.** Continuous authored folds, layered trim, varied hanging silhouette and restrained teal value grouping now clear the static-model appearance gate. The back is coherent and the refined normals avoid the earlier coarse shading. Slightly sharp hem tips and similar bright bone/trim values are polish opportunities rather than grounds for another structural redesign.

This score is limited to the supplied source renders. The proposed rigid upper-body joints, posed sleeve/shoulder seams, staff/grip continuity, final exported GLB/material fidelity and actual dungeon-camera readability remain unverified. Preserve the intact drapes and test a moderate casting/reaching pose; detached forearms or large sleeve gaps would invalidate the current appearance. The existing runtime wraith is not promoted by this source-only acceptance.

## Candidate review R — Ball Lightning electrical-collapse direction

Evidence: `/tmp/rpg-electric-collapse-{before,after}-{0.9,1.75,2.2}.png`; inspected before/after at 0.9 and 1.75 seconds and after at 2.2 seconds. Reduced root throw improves containment and removes the distracting orange reflected flare at 1.75 seconds. The residual orb fade at 2.2 seconds is restrained. **Visible shared death-pose quality remains about 5/10**: skeleton/revenant bodies still spread their limbs and float, and guardians form airborne piles. Reducing the root hop does not make the joint poses read as an electrical collapse.

Highest-return next change: a brief authored contraction/recoil, then knees and torso folding toward the ground while arms drop and shields lower, with small joint separation. Avoid the existing explosive limb spread/disassembly. Preserve the accepted orb form. A white actor flash and cool flare at the upper edge still need isolation and temporal review. Actual HUD, mobile, short landscape, fallback and continuous motion/cadence remain unverified for the complete spell.

## Candidate review S — guardian treasure/victory screen

Evidence: `/tmp/rpg-treasure-v1-{desktop,phone,phone-bottom,duplicate}.png` and `/tmp/rpg-treasure-v2-{rare-desktop,no-item-desktop,phone}.png`. These are client-only receipt/state fixtures, not evidence that rewards were awarded in gameplay.

**Reviewed static victory presentation: 8/10 on desktop and phone.** The large framed relic illustration, restrained material palette and clear reward/XP/action hierarchy form a coherent screen. Legendary new and duplicate states, a rare item at level 2 with no unspent points, and an XP-only state all retain that hierarchy. The XP-only illustration supports progression without leaving an empty reward slot. The fresh-load phone footer fits and all actions remain visible. No further decorative redesign is needed for these reviewed states.

Reveal and transition animation remain unverified; stills do not prove their pacing or smoothness. This acceptance is limited to the static victory screen and does not promote the dungeon, combat HUD, reward behavior or other menus. Global art gate remains **FAILED** while the remaining categories are below 8 or unverified.


### Refined lich moderate rigid-pose check

Evidence: `scripts/blender/previews/v2/lich-rigid-pose-comparison.png`, rest and reaching pose. **Depicted pose integrity: 8/10.** The reaching gesture reads, holding hand/staff remain connected, and no conspicuous shoulder, elbow or waist opening is visible at this angle. The hanging sleeve and front skirt remain fairly stiff sheets; runtime rotations should remain restrained until broader motion evidence shows that larger cape swings or elbow lifts preserve the silhouette. Bake/export can proceed without another shape redesign. This check does not approve continuous animation, unseen joint extremes or the final runtime asset.


### Weighted electrical joint-collapse iteration

Evidence: `/tmp/rpg-electric-weighted-after-{0.9,1.75,2.2}.png`, `before-1.75.png` and `after-cold-off-1.75.png`. **Pose direction: 6.5/10.** Connected bent knees and lowered arms now read as contraction rather than disassembly. The disappearance is still weak: at 2.2 seconds, victims become miniature intact characters instead of full-size bodies losing energy. Source inspection confirms the shared root scale shrinks to .005 after normalized death time .58. For Ball Lightning, retain body scale, finish a low grounded fold and dissolve/fade the settled body over the existing lifecycle. Grounded sparse brute chips are also appropriate for the isolated cold-recess reflection. Continuous motion may expose further timing issues; complete effect acceptance remains pending.


## Candidate review T — exported lich and initial HUD context

Final GLB evidence: `scripts/blender/previews/v2/wraith-cc0-exported-game-angle.png`. **Reimported static asset appearance/fidelity: 8/10.** Trim, layered folds, crown silhouette and restrained warm/cool response survive the bake/export. No further bake correction is warranted from this evidence. Actual crowded dungeon integration `/tmp/rpg-wraith-final-dungeon-desktop.png` remains **provisionally 7.5/10 for readability**: dark skirt folds merge with thin bright ribs and crown/face are difficult to distinguish. Ordinary lower-density encounter evidence and native-scale warm/cool crops are requested to distinguish presentation density/camera from asset material issues. Runtime motion remains unverified.

Landscape side-control candidate `/tmp/rpg-landscape-v3-open.png`: **visual hierarchy about 7/10**. Moving controls beside the unobscured canvas is a structural improvement. The oversized plain red level orb versus smaller blue orb is a known pending correction; painted art and balanced sizes need restoring. At this stress density the 622×305 canvas makes characters very small, so ordinary encounter evidence is required before final layout acceptance. Functional control fit is not visual acceptance.

Ball Lightning HUD contact frames `/tmp/rpg-ball-hud-{desktop,portrait,landscape,fallback}-contact.png`: desktop main orb form remains **8**, fallback form/readability **7.5**, portrait context/readability **7**, and old short landscape context **5.5**. Reduced-resolution fallback smears fine depth channels; the crowded portrait clips the left volume; the old landscape dock obstructs the lower orbitals. Root's new side-control layout must replace the old landscape evidence before further grading that arrangement. These are contact-frame/context grades only, not complete effect or animation approval. Other supplied phase frames were not used to grant acceptance; death/fade changes are still in progress.


### Full-scale electrical dissolution iteration

Evidence: `/tmp/rpg-electric-dissolve-after-{0.9,1.75,2.2,2.55}.png` and `after-no-stones-1.75.png`. **Death/fade presentation: 7/10 from these stills.** Miniature shrinking is gone and the 2.55-second frame clears cleanly. The no-stones A/B isolates the distracting upper flare; the subsequent grounded-chip correction is reported but not yet independently rendered in these files. Remaining deficit: cyan lace-like outlines across dissolving torsos at 1.75–2.2 seconds resemble a material debug effect. Thin and dim the edge, break its continuity and introduce a coherent erosion progression, such as upper-body energy draining toward the grounded residual. Preserve the full-size silhouette and restrained settled pose. Ordinary-density close evidence and continuous motion are required before the pose/fade can reach 8.


## Candidate review U — ordinary-density Ball v5, landscape layout and normal-pack wraith

Ball evidence: `/tmp/rpg-ball-v5-ordinary-{desktop,portrait,landscape,fallback}-{contact,latecontact,fade}.png` where inspected, and normal-loop recording `/tmp/rpg-ball-v5-ordinary-motion/page@b436e66b6aafa09969c80b5ffb23c282.webm`. Contact and late-contact were inspected across the four layouts; desktop/portrait fade were inspected. **Dissolution material treatment: 8/10 in the shown desktop phases.** Reduced edge brightness/continuity eliminates the cyan lace appearance, while grounded chips remove the isolated bright flare. Main single-orb form remains 8 on desktop and legible in revised portrait/landscape. Fallback internal-channel detail remains about 7.5 due to reduced-resolution smearing. Four-orb modifier context requires separate updated coverage.

**Death-pose presentation remains about 7/10.** Bent skeleton knees remain suspended above ground shadows, brutes hunch at near-standing height, and wraiths tilt as rigid cones. Lower hips/root enough for convincing foot or knee support, retain connected attachments and briefly hold a full-size grounded silhouette before erosion. Wraiths need a restrained spectral slouch/dissipation rather than a large rigid tilt. Do not rework the now-accepted dissolve material.

The real recording was sampled at 1 FPS for overview and 8 FPS over seconds 6–9 for the first cast, producing `/tmp/rpg-ball-v5-motion-overview.png` and `rpg-ball-v5-motion-cast-sequence.png`. These sequences show orderly orb travel, staggered target loss and clean room transition. This is sampled-frame inspection, **not continuous-video playback or a smoothness pass**. Implementer-reported recorded rAF median 33.3ms is separate evidence; encoded 25 FPS is not a renderer/GPU performance measurement.

Revised landscape `/tmp/rpg-landscape-v4-open.png`, corroborated by the ordinary-density Ball landscape contact/late-contact frames: **static HUD layout/hierarchy 8/10**. Balanced orbs, unobscured play area and coherent side controls resolve the previous structure problem. This limited layout acceptance does not promote world, characters, other HUD layouts or motion.

Normal 15-actor wraith evidence `/tmp/rpg-wraith-normal-{warm,cool}.png`: **runtime readability remains 7.5/10**. Reduced density improves separation, but cloth still collapses to near-black triangular masses with thin bright ribs, losing the layered fold volumes seen in the accepted export. Raise dark cloth midtones modestly while preserving dark recesses and trim brightness, then compare the same native camera. Source/export appearance remains 8; no new silhouette redesign is requested. Global art gate remains FAILED.


### Size-only wraith and ground-v6 follow-up

Size-only evidence `/tmp/rpg-wraith-size-{embercrypt,stormspire}-{165,185}.png`: **both sizes remain 7.5/10 runtime readability**. The 1.85 scale gives a modest crown/upper-body improvement but does not recover dark skirt fold volumes. A localized cloth midtone lift remains the next correction, preserving dark recesses and trim/bone values.

Ground-v6 evidence `/tmp/rpg-electric-ground-v6-grounded-{1.75,2.2}.png`: **death-pose presentation remains about 7/10**. Wraith posture is more upright and avoids the prior rigid cone tip. Skeleton/revenant poses still read as synchronized half-squats and guardians remain almost standing. A deeper bilateral knee fold with matched hip drop and verified sole bounds should establish a lower supported final posture before the accepted erosion. No further orb/dissolve material embellishment is requested.


## Candidate review V — equipment v1 and orbit/fallback v6

Equipment evidence `/tmp/rpg-equipment-v1-{desktop,phone}.png`: **relic presentation desktop 7.5, phone 7**. Large equipped art and coherent collection illustrations are strong. Planned six-column desktop layout, shorter feature panel and removal of the inherited full-width count box address composition waste. Collection labels remain too small, especially on phone; use readable roughly 12px mixed-case names in consistent two-line slots even if scrolling remains. Keep equipped state distinct from hover/focus. Lower collection rows, unowned/locked and different-equipped states remain unreviewed. Unchanged armor thumbnails retain their separate below-gate grade.

Orbit evidence `/tmp/rpg-ball-v6-orbit-{desktop,portrait,landscape,fallback}-contact.png` plus portrait/fallback late-contact. **Fallback orb form now 8**: recovered strand coverage preserves internal separation without broad wires or opaque balls. Desktop and revised landscape four-orb context also retain **8 for visible orb presentation**. **Portrait orbit context remains 7** because lower orbitals disappear behind the input panel at late contact. Center the hero within the unobscured battlefield above that panel to allow orbit space below and above; preserve the accepted orb shaders.

Implementer reports stress-recorded casting median50.1ms/p95200.1ms and approximately14.8FPS mean. This is a material unresolved cadence issue, not an 8-rated motion result. The ordinary-density recording and sampled sequence do not override the stress result. Global gate remains FAILED.


### Equipment v2 shown-state follow-up

Evidence `/tmp/rpg-equipment-v2-{desktop,phone}.png`: **shown relic section desktop 8, phone 8**. Readable labels, three-column phone cards and balanced desktop feature/collection composition resolve the previous deficits. All 23 desktop relic crops are now visible and coherent. Phone lower rows, locked/unowned state and alternate equipped detail remain pending; armor remains separately below gate. No further decorative redesign is required before reviewing those states.


## Candidate review W — safe portrait, deeper fold and first wraith cloth lift

Safe portrait evidence `/tmp/rpg-ball-v7-safe-orbit-{portrait,portrait-small}-{contact,latecontact}.png`: **four-orb framing/form context 8 at390×844 and360×780**. Hero and all four orbitals remain in the usable battlefield above the question panel. Preserve the framing. This does not approve every HUD element or continuous motion.

Deeper fold evidence `/tmp/rpg-electric-ground-v7-grounded-{1.75,2.2}.png`: **death-pose presentation7.5**. Lower weight and support now read more clearly. Remaining deficit is repeated bilateral squat silhouettes across skeletons/revenants. Two restrained asymmetric settled variants, such as weight folding over one knee and a hand/shield bracing toward ground, would make the loss of support more convincing while preserving verified sole bounds. Wraith's upright dissipation direction is now adequate in these stills.

First cloth lift `/tmp/rpg-wraith-midtone-{embercrypt,stormspire}-185.png` remains **7.5 runtime readability** compared with the matching size-185 baselines. Pixel difference bounds confirm only the wraith changes (maximumlocalchange about14/255), but broad skirt values remain too close to black between bright ribs. A stronger localized cloth-midtone curve is requested without lifting bone/trim or deep recesses.

New implementer-reported actual-HUD unrecorded stress evidence `docs/rpg-playtest/v13/ball-lightning/unrecorded-hud-boss-telemetry.json`:48-enemy four-orb boss cast to victory, medianrAF16.7ms/p9533.4ms and about49.1FPS mean, compared with roughly47FPS isolated unrecorded. This supports the conclusion that the earlier14.8FPS recording was not representative in the controlled follow-up. It is cadence evidence, not a GPU-cost or animation-art score.


## Candidate review X — equipment relic-state acceptance

Evidence `docs/rpg-playtest/v13/equipment/rpg-equipment-v3-{fresh-desktop,phone-top,phone-lower,phone-locked,legendary-desktop}.png`: **reviewed static relic section8/10 on desktop and phone**. Fresh desktop, upper/lower phone collection, unowned/locked state with rare equipped detail and legendary Phoenix detail retain coherent framing, readable labels and clear equipped identity. All23 deployed collection illustrations are covered on desktop; shown phone crops remain consistent. These client-only state fixtures do not prove equip/reward behavior or animation.

The separate armor section remains below gate: its generic default shield and simplistic character thumbnails are visible unchanged at the bottom of the phone-lower image. Relic-section acceptance must not be presented as complete equipment/armor-screen acceptance.


## Candidate review Y — smallest landscape HUD

Evidence `/tmp/rpg-landscape-small-568.png` at568×320 and `rpg-landscape-small-640.png` at640×360. **Layout hierarchy remains8**: side controls preserve a clear play rectangle. **Complete HUD typography/detail remains about7 at568 and7.5 at640**. Spell captions, skill-tree label and XP detail become microtext, and ornate orb detail compresses into visual noise. A compact presentation tier should simplify orb ornament, show readable short spell labels around10–12px or a single readable current-spell name, and omit nonessential XP microdetail while retaining the bar/level. Control fit does not close this visual gap. The39-actor world crowding and old public wraith retain their separate model/world grades.

Accepted equipment relic-state evidence is now preserved under `docs/rpg-playtest/v13/equipment/` with the v3 basenames and `evidence.json` fixture provenance. References above use the durable paths. Functional test counts do not affect these visual scores.


## Candidate review Z — static wraith integration and asymmetric electrical poses

Evidence `docs/rpg-playtest/wraith-accepted/{embercrypt,stormspire}.png`: **runtime wraith static readability8/10 at1.85 in these native-camera views**. Broad skirt panels now separate from deep recesses without whitening crown/bone/trim. This closes the previously weak material-value integration in the reviewed conditions. Preserve the stronger localized cloth candidate. Source/export/moderate-pose passes remain intact; continuous motion and other camera/light conditions remain separately unverified.

Evidence `/tmp/rpg-electric-ground-v8-grounded-{1.75,2.2}.png`: **depicted static electrical death-pose presentation8/10**. The lower-knee and hand/shield brace variants break the repeated bilateral-squat pattern, preserve connected full-size bodies and support the accepted restrained erosion. No further static redesign is requested. Normal-loop release/settle/fade timing remains the next independent gate. This does not approve the underlying low-scoring skeleton/revenant/guardian model art or other spells' shared deaths.


### Exact cloth-v2 export and final Ball sampled timing

Exact final reimport `scripts/blender/previews/v2/wraith-cc0-cloth-v2-exported-game-angle.png` confirms **8/10 static/export fidelity** for the same stronger-cloth candidate accepted in runtime views. Relief, trim and broad value grouping remain coherent. No further material changes are requested.

Final normal-loop recording `docs/rpg-playtest/v13/ball-lightning/boss-motion.webm` was sampled at1FPS overview and8FPS over12.5–15.5seconds, producing `/tmp/rpg-ball-v8-motion-overview.png` and `rpg-ball-v8-motion-cast-sequence.png`. Release, travel/contact, supported collapse and erosion form a coherent progression; staged target loss reads and no miniature shrink, white victim flare or abrupt room-cut residue appears in the samples. No further timing redesign is indicated by this evidence. **Direct continuous playback/smoothness remains unverified**, so this does not grant complete motion acceptance. Recorded cadence approximately28.5FPS with33.3ms median/83.3ms p95 remains separate from the unrecorded actual-HUD49FPS result.


## Candidate review AA — compact small-landscape acceptance

Evidence `docs/rpg-playtest/v13/compact-landscape/rpg-landscape-compact-v2-{568,640}.png`: **static HUD presentation8/10 at568×320 and640×360**. A readable current-spell name, simplified shaded orbs and retained progress bar resolve the previous microtext/compressed-ornament problem while preserving coherent side controls and an unobscured play rectangle. Preserve this compact tier. World/model quality, other HUD layouts and continuous motion remain separate. Global gate remains FAILED.


## Candidate review AB — ordinary starter-room environment priorities

Evidence `web/test-results/regression/rpg-legacy-learner-plays-a-58469-out-changing-learning-rules-chromium/01-encounter.png` compared directly with approved `04-horde-viewport.png` and `05-fire-nova.png`. **Current first-room composition about6, masonry/source art about5, floor about6.** Ordinary density makes action readable, but repeated vent-like tomb lids, oversized smooth pier slabs, sparse unrelated rubble and uniform wet floor response create a regular display-corridor impression. The approved concepts have layered broken architecture, anchored prop groups and richer surface-scale relationships.

Three bounded changes with the highest return:

1. Author one asymmetric broken-gate composition. Damage the upper-left gate-side bay; let its fallen masonry form a coherent apron along that wall; use a low broken pier/stone cluster at the lower-left edge for foreground depth. Keep the central hero/enemy space clear and remove one or two repeated tomb placements rather than filling every bay. This is layout work and can begin with existing geometry.
2. Tie floor dressing to that composition. Use a broad dusty rubble transition from the breach, soot/ash immediately below braziers and a restrained damp path through the remaining low area. Preserve dry worn combat stone rather than giving the entire room similar gloss. These are material/dressing relationships, not a request for evenly scattered debris.
3. Replace the dominant source forms with a small coherent masonry kit: one worn pier, one recessed block-built wall/arch segment and one convincing damaged sarcophagus lid. Placement and extra noise cannot repair giant smooth slabs or parallel-grille tomb lids. Layout improvements alone will not meet8 while these source deficiencies dominate.

The current camera need not be widened. Finish one authored room slice before multiplying these patterns across all six rooms.


## Candidate review AC — Knight hero foundation rejected

Evidence `scripts/blender/previews/v2/knight-cc0-foundation-{neutral,high}.png`: **visible foundation5/10**. Broad unbroken breastplate, inflated gold scroll shapes, smooth boot/gauntlet forms and mannequin face repeat the present hero's weaknesses. Anatomy may be serviceable underneath, but pose, roughness and an added cloak would not raise these construction forms to8; most visible armor would need rebuilding. Licensing provenance and polygon count do not change that assessment.

Reject this as the visible production hero foundation. Seek an authored compact adventurer or fitted-armor base with believable layered equipment, joints, boots/hands and cloth tension already present, closer to the approved hooded hero. Reuse of a rig/anatomical base for technical work is separate from visible art acceptance; do not spend a full bake/variant pass on this appearance.


## Candidate review AD — starter Fire Nova v1 front

Evidence `/tmp/rpg-nova-v1-nova-{0.35,0.65,0.95,1.7}.png`: **front/form hierarchy6/10**. Low combustion pockets and removal of generic confetti improve clarity, but the nearly continuous white crest dominates as a neon hoop with flames attached. Break it into unequal hot sections with real dark gaps, vary radial thickness/position and shift most of the front to amber so only a few local contact accents approach white. Let turbulent pockets overlap the crest irregularly instead of lining the whole circumference. At0.65/0.95seconds, front-to-victim contact should be stronger than the empty lower semicircle. Preserve the clean interior; do not restore confetti. Generic airborne fire deaths/shrinking retain their separate below-gate status and should be addressed after the front form is convincing.


## Candidate review AE — hooded-warrior source screening

Evidence `/tmp/hero-source-hooded-warrior-preview.png`: **provisional8/10 for the visible authored appearance in this source preview**. Layered pauldrons, fitted etched cuirass, quilted cloth, straps and believable gloves/boots address the rejected Knight's construction weaknesses and are worth importing for fuller review. Preserve the layered equipment/material separation. A younger face or beard removal is optional character direction rather than an art-gate requirement and should not compromise the convincing head/hood fit. This screening does not accept imported geometry, back/high-camera views, rigging, optimized export or runtime readability. Source permission/pedigree did not affect the visual grade.


## Candidate review AF — imported authored warrior

Evidence `scripts/blender/previews/v2/authored-warrior-source-neutral-front-back.png` and `authored-warrior-source-high.png`: **shape/construction8, current material presentation7.5**. The imported views confirm coherent anatomy, fitted layered armor, quilted garment and a useful hood/cape silhouette. Continue adaptation without another source redesign.

The armor's stark black/white mottling obscures etched construction, especially the breastplate. Tune metal roughness/specular breakup toward broad controlled highlights that reveal the etching rather than pitted-chrome noise. Keep leather/cloth distinctly matte. The back cape is simple but adequate as a rest mesh; posed drape/lag must avoid a stiff-board appearance. Optimizing excessive eye geometry before garment detail is sensible, but efficiency does not affect the visual grade. Game-size readability, sword grip, rig and continuous animation remain unverified.


## Candidate reviews AG–AI — masonry screening, Nova v2 and gate v1

Masonry-source previews `/tmp/3td-Ruin_Pillar_01.jpg`, `3td-RuinArch_01.jpg` and `3td-RuinWallSegment_01.jpg`: **pillar3.5, arch4.5, wall5**. Reject the pack as an8-quality replacement foundation. Faceted extruded pillar shape, thin planar arch construction with arbitrary broken slabs and texture-driven flat wall depth repeat existing deficiencies. Placement/material tuning alone would not bridge the gap.

Nova v2 evidence `/tmp/rpg-nova-v2-nova-{0.35,0.65,0.95,1.3}.png`: **front/hierarchy6.5**. Amber exposure and dark sections improve the first candidate, but a long clean lower stroke and flame bands attached to one thin annulus still read as a segmented graphic ring. True zero-alpha crest gaps, evolving fuel and low curling lobes at unequal distances behind the front are needed; hot bases/darker translucent tips should add depth rather than merely widen a curved sheet. A brief rough local heat patch can ground contacts if it does not become another ring. Generic fire deaths remain separate.

Gate v1 evidence `/tmp/rpg-gate-v1-hud-{ordinary,upgraded}.png`: **composition6.5, floor6, masonry/tomb source5**. Fewer repeated west tombs and lower foreground structures improve asymmetry/combat clarity. The broken span still reads as a solid block wall with a huge loose cube. Create one clear dark opening/negative space and a graded rubble wedge: course-sized fallen stones at the wall, smaller fragments tapering into dust. Keep the center clear. The floor is less uniformly glossy, but broad dark/dusty wash flattens its relief and does not yet explain the collapse. Concentrate dust at the rubble apron and preserve readable dry worn central stone. Layout work does not remove the separate masonry-source blocker.


### Controlled warrior metal and Nova v3

`scripts/blender/previews/v2/authored-warrior-controlled-metal-high.png` confirms **8/10 source material presentation** in the supplied high-camera A/B. Broad controlled plate highlights reveal layered shoulder forms/chest etching and preserve matte cloth/leather separation. Proceed with bounded optimization/rig preparation; posed export and runtime remain unverified.

Nova v3 `/tmp/rpg-nova-v3-nova-{0.35,0.65,0.95,1.3}.png`: **front organization/hierarchy7; combustion volume6.5**. Irregular spacing, real crest gaps and localized contacts improve staging, but broad opaque yellow-orange blobs with dark holes read as a mottled sheet rather than hot gas. Highest-return correction is a temperature/density hierarchy within each pocket: narrow bright bases/cores, less opaque orange bodies and tapering wispy darker tips/trailing smoke. Reduce broad uniformly hot fill; curl/lean strands with outward flow rather than adding more small noise holes. Keep contact heat patches subordinate so they do not become orange spotlights.


## Candidate review AJ — gate v2 composition hold

Evidence `docs/rpg-playtest/v14/gate/ordinary.png`: **composition7, floor6.5**. The oversized loose cube is removed, the west break has real negative space, rubble is more plausibly anchored and central stone relief reads better after dust reduction. Hold this composition while improving the source kit; more minor placement work has lower value now. The breach is near the upper-left crop, so replacement jamb/ruin geometry should preserve a visible broken silhouette within the frame, but no camera/layout overhaul is needed first. Dominant masonry/tomb forms remain about5: believable block scale, mortar/recess depth, worn edges and coherent fracture are the next priority. These source deficiencies keep the room below8.


## Candidate review AK — Nova v4 and icy-bridge source screening

Nova v4 evidence `/tmp/rpg-nova-v4-nova-{0.35,0.65,0.95,1.3}.png`: **combustion/front presentation 7/10**. Increased transparency and cooling hierarchy improve depth, but broad mottled bands still dominate the left/lower arcs at 0.65/0.95 seconds. Replace the broad angular fuel envelope with individually tapered curling tongues inside the existing volume. Each tongue needs a compact hot root, narrowing curved body and disappearing tip; vary height/lean and leave depth gaps. First prove several convincing tongues at game pixel size, then distribute them along the already improved irregular radial front. Preserve restrained local contact heat and hit timing. Generic fire deaths and continuous motion remain separate unresolved scopes.

Icy-bridge source evidence `/tmp/cc0-icy-bridge-source.png`: **5.5/10 as rendered; rejected as the current dungeon masonry foundation**. The monumental slab-and-bar gate has a readable silhouette, but long smooth strips and shallow repeated blocks do not supply convincing masonry construction. The broad glossy bridge and stretched/noisy surrounding ice do not resolve the required layered joints, fractured courses and concentrated wear. A distant cold-region landmark would be a separate use case; importing this as the replacement kit would not advance the current world toward 8. Source permission does not affect this score.


## Candidate review AL — masonry pier and articulated hero study

Pier evidence `/tmp/rpg-masonry-pier-v1.png`, compared with `scripts/blender/previews/v2/pillar-study.png`: **construction 7, material 7/10**. Bonded block courses, segmented engaged shafts and actual crown fracture improve the original smooth slab pillar. Damage and roughness remain too evenly distributed, however; the crown resembles broken slabs placed on an intact shelf, and the loose ground fragment has little visible relationship to a missing piece. Author one coherent corner/upper-course failure with a matching fallen fragment and jagged remaining silhouette, preserving most supporting courses. Separate smoother worked shafts/trim from rough fracture interiors; concentrate dirt in joints and weathering near the base. One rocky crack scale currently blankets blocks, trim and breaks. This is source-only evidence; bake and runtime remain unverified.

Hero evidence `scripts/blender/previews/v2/authored-hero-cast-fixed.png`: **preserved construction/material and visible moderate-pose mesh integrity 8/10**. Gloves, pauldrons and elbow layers remain coherent without obvious tearing or stretched fingertips in this view. **Depicted cast gesture approximately 7**: both arms hover near the torso with limited directional extension or weight commitment. The intended release needs a more open reaching hand/arm and counterposed shoulder/torso, plus a believable closed weapon grip when drawn. Opposite/back pose views and actual release remain required; this static preservation pass does not approve the complete rig or animation.


## Motion-art review protocol — ordered real-loop evidence

Direct video playback is not the only feasible way to judge animation. Dense, timestamped, ordered frames from a real normal-loop recording can support an independent **motion staging/coherence** score without pretending to have watched continuous playback. Earlier statements that continuous playback was unverified remain factual, but should not be treated as a permanent barrier to evaluating the designed motion. No motion score is granted by adopting this protocol.

1. Record an actual answer-to-cast-to-aftermath sequence without manual stepping. Include about 0.5 seconds before release and at least one second after the last disappearance. Retain native presentation timestamps, capture frame rate, duplicate/dropped-frame information, exact build/fixture and simultaneous runtime cadence. An encoded frame rate alone is insufficient.
2. Inspect every decoded frame across the critical release/contact/settle/fade window, in short ordered sheets of 8–12 frames with timestamps and fixed native-resolution hero/target/orb crops. Inspect whole-screen frames approximately every 0.2 seconds for composition, HUD and room transitions. Review suspicious intervals as consecutive full-size frames. This is materially stronger evidence than a few named phase stills or sparse temporal sampling.
3. Grade each motion component independently: anticipation/release readability; trajectory, acceleration and effect identity; contact-to-response synchronization; supported weight and pose continuity; dissipation/erosion/cleanup; camera/HUD continuity. No complete effect passes while any component is below 8. Strong static form does not override weak motion.
4. Adjacent-frame landmark and visibility checks may locate unexplained root/foot/hand/orb jumps, unsupported sliding, one-frame silhouette changes, misplaced contact flashes or abrupt opacity cutoffs. They are diagnostic evidence rather than automatic art scores: convincing energy, weight and timing still require visual judgment.
5. Compare recording cadence with an unrecorded matching-mode run to separate capture loss from runtime stalls. Missing evidence exactly around contact or settling prevents that interval from passing; recapture it. Ordered frames cannot reconstruct an unrecorded transition.
6. State the result as motion staging/coherence at the observed sampling rate. A complete 25/30 FPS sequence can establish intentionally authored, coherent motion at that rate; it cannot establish perceived smoothness at 60 FPS. Runtime delivery/cadence remains a separate requirement, with explicit supported modes and limits.

For Ball Lightning, the existing final v8 single-orb boss recording is suitable for beginning this denser review. Updated four-orb real-loop evidence with the final asymmetric poses remains necessary; the historical v6 orbit clip predates those pose changes. Ordinary/modifier, portrait/landscape and fallback coverage should be selected to exercise genuinely different visible behavior rather than multiplying identical recordings. This protocol does not alter the global failed gate or preapprove any animation.


## Candidate review AM — Nova v6b and dense Ball motion review

Nova v6b `/tmp/rpg-nova-v6b-nova-{0.35,0.65,0.95,1.3}.png`: **visible combustion/front form 5.5/10**. The technically corrected compact volumes now read as regularly spaced soft orange beads and disconnected thin crest strokes. Recognizable combustion-body structure has been lost. Prove one tongue at native game camera size with a compact hot root, visibly narrowing directional body and translucent curled tip before distributing it around the front. It needs enough projected height/width for the silhouette to communicate combustion; restoring a broad tube or adding brightness would not solve this. Generic fire deaths remain separately below the gate.

Ball source: `docs/rpg-playtest/v13/ball-lightning/boss-motion.webm`, `boss-motion-telemetry.json`, `sources.json` and README. This is the actual full-quality 1440×900 veteran boss cast, 36 enemies, chains enabled, orbit disabled, final asymmetric poses, accepted wraith review override. No manual animation stepping. The 17.72-second file contains 443 decoded frames at regular 40ms presentation intervals. The critical 12.72–15.60-second window was inspected as **all 73 consecutive decoded frames**, using timestamped native-resolution fixed crops in `/tmp/ball-motion-review/dense-{00..09}.png`. Whole-screen context was inspected every0.2seconds from11.8 through17.4seconds. Derived timestamp and mean pixel-difference data are in the same temporary directory. This does not claim that all443 frames or direct continuous playback were inspected.

| Motion component, single-orb captured desktop scope | Score/status | Evidence and limit |
|---|---:|---|
| Anticipation and release communication | 7 | The orb appears below/left of the hero while the sword remains raised; the visible sequence lacks a convincing gather-to-release connection. Strengthen the authored cast gesture and localized formation/release relationship. |
| Orb trajectory, identity and observed acceleration | 8 in observed intervals | A distinct electrical volume follows a coherent curved sweep, with evolving internal energy and consistent directional progression. Short held states limit approval of the omitted intervening motion. |
| Contact-to-response synchronization | Incomplete; no8 claim | Local flashes and contractions are plausibly ordered in visible intervals, but a100ms runtime interval at attack age0.951 occurs around the first major energizing/contact transition. Do not infer the missing intermediate rendered states. |
| Supported collapse and pose progression | 8 in observed intervals | Body lowering/folding proceeds into the accepted asymmetric supported poses, retaining connected full-size silhouettes before erosion. No observed miniature shrinking or explosive throw. The longer interval at age1.705 limits microscopic continuity assessment within that exact gap. |
| Erosion/dissipation and cleanup | 8 | Consecutive frames show gradual silhouette loss, restrained residual energy and clean empty ground before the victory panel. No obvious pop to miniature scale or leftover effect batch appears. |
| Camera/HUD continuity during the effect | 8 scoped to continuity | Combat framing stays stable and the panel arrives after the effect clears. This does not approve the old hero art, complete HUD appearance or the victory reveal animation. |

The encoded file has no timestamp holes, but that does **not** imply every underlying renderer state was captured. No adjacent critical crop is byte-identical after video decoding; compression, small ambient movement and HUD changes make exact equality an inadequate duplicate test. Visible near-held images around13.08–13.16 and13.64–13.68seconds align qualitatively with telemetry intervals of133.4ms at attack age0.175,83.3ms at0.285,100ms at0.951 and116.8ms at1.705. The telemetry does not provide a precise video-frame-to-attack-age synchronization marker, so these associations are not asserted as exact clock mappings.

**Complete single-orb motion remains below acceptance** because the opening scores7 and critical opening/contact states are not adequately evidenced. This is a concrete, bounded result rather than a permanent inability to evaluate motion. Recapture the actual formation/release/contact sequence after the authored hero gesture is integrated, with enough real-loop temporal coverage to see the transition. The observed travel, pose progression and erosion do not currently need redesign. Updated final four-orb motion remains a separate pending scope; its old recording predates final pose changes. No60FPS delivery claim is made from25FPS recording, and unrecorded cadence is not substituted for animation evidence. Global gate remains FAILED.


## Candidate review AN — pier v2

Evidence `/tmp/rpg-masonry-pier-v2.png`: **construction 6.5, material 7.5/10**. Smoother worked shafts and trim now separate usefully from block faces. The broad diagonal fracture regresses the crown into a roof-like planar fin, however, while its fallen partner resembles a leaning stone board. Reduce the failure to one crown/capital corner, preserving enough intact horizontal capital and upper courses to explain the original architecture. Use several offset fracture facets, secondary chips and a short stepped break contour rather than a continuous sawn plane across the whole crown. Place the matching chunk heavily on a supporting face beside the footing, with smaller fragments connecting it to the base. Geometry is the dominant blocker; preserve the improved restrained material response. No bake/export/runtime acceptance.


## Candidate review AO — pier v3, hero opposite view and Nova single tongue

Pier `/tmp/rpg-masonry-pier-v3.png`: **construction 7.5, material 7.5/10**. The capital reads as architecture again and the fallen fragment has convincing support. The broken front corner still repeats a neat chamfer through several trim layers, resembling an intentional detail. Terminate the local layers unequally: a chipped projecting lip, a recessed coarse fracture and a few irregular edge losses, preserving the overall capital. Add restrained accumulated darkness in joints/base creases, cleaner worked faces and fresher fracture interior. Current map variation does not yet overcome nearly uniform clean pale value. This is bounded refinement, not another silhouette redesign.

Hero `scripts/blender/previews/v2/authored-hero-equipped-cast-pair.png`: **static back/shoulder/cape attachment and preserved construction 8; complete equipped pose 6.5**. No separate conspicuous seam failure appears. The casting hand foreshortens at waist level, the weapon glove is open and the long dark component reads as a scabbard. Raising the release toward shoulder height, closing the weapon grip and supplying an actual exposed blade are appropriate corrections. Cape motion remains unverified.

Nova `/tmp/rpg-nova-v7-single-nova-0.35-native-crop.png`: **single-tongue form 5.5**. A broad bright base and soft squat teardrop still lack convincing flame structure. Narrower/taller proportions and an asymmetric curling spine are the next proof; visible taper/curl at native pixels matters more than alpha or brightness. Only distribute/overlap the volumes after the individual tongue reads.


### Follow-up — Nova v8 tongue and hero release v3

Nova `/tmp/rpg-nova-v8-single-nova-{0.35,0.45,0.55}-native-crop.png`: **6.5/10 single-tongue form**. Taller/narrower structure now reads as a flame-shaped volume, but the root remains a round bulb and the upper body a blunt orange finger. Taper the upper third almost to zero projected width and carry a narrow hot channel from the root into the first bend. A restrained unequal concavity/transparent slit can separate core and sheath; avoid arbitrary all-over noise. No distributed-front acceptance yet.

Hero `scripts/blender/previews/v2/authored-hero-equipped-release-v3.png`: **depicted back-facing raised-hand release silhouette8; equipment integrity7**. Source construction remains8, but the front hilt lies above loose-looking fingers and the blade is nearly black. Center the handle through a convincingly closed palm/fingers/thumb and reveal a controlled steel facet highlight. The two panels show substantially different apparent hand heights; phase metadata was requested before treating them as opposite views of one pose. This does not approve runtime release/effect attachment or continuous animation.


### Pier v4 and hero-view metadata

Pier `/tmp/rpg-masonry-pier-v4.png`: **material/history7.5; broader construction direction7.5; current geometry7** because two round dark boolean chips resemble drilled eyes. Replace them with a single notch open to a real edge, as the implementer already identified. The visible history treatment remains too subtle at the supplied scale: concentrate slightly broader irregular dark/desaturated accumulation in the lowest courses and protected capital undersides, keeping projecting trim and exposed fracture cleaner. Do not outline every joint uniformly or add tiny holes.

The Blender implementer clarified that both panels of `authored-hero-equipped-release-v3.png` show the exact same cast release pose; the right is an evaluated mesh snapshot rotated180degrees around worldZ. Different apparent hand heights result from the high orthographic camera viewing the forward reach from opposite sides. No phase mismatch is claimed. The prior scoped8 game-facing release silhouette and7 equipment-integrity verdicts remain unchanged.


### Follow-up — Nova v9 and hero grip v5

Nova `/tmp/rpg-nova-v9-single-nova-{0.35,0.45,0.55}-native-crop.png`: **single-tongue form7**. Taper improves, but a bright oval root and smooth candle/drop body still dominate; the cooler slit does not visibly separate core and sheath. A through-depth unequal slit that actually resolves at native pixels can create a smaller offset lick beside the dominant spine. Preserve taper; keep the hot channel following the lower bend rather than pooled as an isolated bulb. No distributed-front acceptance.

Hero `scripts/blender/previews/v2/authored-hero-grip-v5.png`: **grip7.5**. All four fingers now curl, but the thumb floats away and leaves the grasp incomplete. Local thumb opposition/closure is the remaining correction, preserving knuckle volume. Blade response in `authored-hero-equipped-release-v4.png` now reads as steel with distinct facets and scores8 at that depicted scale. Complete combined equipped-pose acceptance still waits on the corrected grip view.


## Candidate review AP — pier v6 source acceptance

Evidence `/tmp/rpg-masonry-pier-v6.png`, compared directly with v5 and the previously reviewed v4: **source construction8, source material8/10**. The drilled-cavity artifact is removed. Stepped local layer loss reads as a damaged capital while intact bonded supporting courses and the grounded matching fragment preserve coherent construction. Broader lower-course/protected-ledge accumulation supplies enough history contrast without overwhelming the smoother worked stone. These changes resolve the specific prior source blockers; no further source microdamage pass is required.

This is a scoped pass for the supplied studio/game-elevation appearance. It does not accept optimized bake/export fidelity, unshown side/back faces, repeated placement or actual native dungeon integration. Preserve readable block depth, unequal capital termination and restrained worked/fractured/weathered surface hierarchy through export. The room/world gate remains below8 and global acceptance remains FAILED.


## Candidate review AQ — final local hero grip and Nova v10

Hero `scripts/blender/previews/v2/authored-hero-grip-v7.png`: **local grip8**. Thumb now opposes curled fingers and the handle reads as supported by a closed gloved grasp. Preserve this correction. `authored-hero-cleave-corrected-v6.png`: **broad attachment integrity8, swing key-pose staging7**. Blade direction is corrected, but torso/hips/feet remain nearly identical while the bent arm does most of the work. Add a modest torso/shoulder turn, longer forward/downward finish, supporting knee/weight shift and counterposed free arm. Final combined corrected-grip evidence and ordered motion remain pending.

Nova `/tmp/rpg-nova-v10-single-nova-{0.35,0.45,0.55}-native-crop.png`: **single form7.5**. Depth slit, elongated hot region and taper improve separation, but the volume still resembles a tidy candle lick and internal shape changes little across the three phases. Further isolated exposure/slit adjustments have lower value than a bounded2–3-lick composition proof with unequal, evolving lean/height and shared rolling ground combustion. Proceeding to that proof does not accept the single form or the full Nova. Avoid distributing identical upright candles around a ring; the next evidence must establish outward movement and evolving combustion at native camera size.


## Candidate review AR — first optimized pier reimport

Evidence `/tmp/rpg-masonry-glb-v6-front.png`, compared with accepted source `/tmp/rpg-masonry-pier-v6.png`: **visible construction/silhouette8; bake/material fidelity6.5; depicted overall asset7**. Near-black horizontal strokes around shaft segments and block joints resemble ink outlines and erase the source's softened recessed transitions. Some vertical joins are similarly hard black; fine crown/stone relief is also softened, but secondary. The implementer identified likely cross-projection between adjacent stones and proposed isolated matching-source/destination bake groups. That is an appropriate targeted correction; preserve source occlusion only once, inspect joint normals and avoid globally brightening the material to hide the artifact. No optimized export acceptance yet; source8 remains scoped.


### Combined hero release/strike v8

`scripts/blender/previews/v2/authored-hero-release-strike-v8.png`: **action staging7.5; source body/armor construction remains8**. Follow-through now shows useful torso turn and weight commitment, but the sword hand still finishes tucked near the waist with a sharply bent elbow. Extend it modestly forward/downward to clarify the finishing shoulder/forearm/blade line. The combined cast/windup views again appear loosely gripped, with finger shapes hanging below/away from the hilt. This may be projection, but the neutral close-grip8 cannot automatically transfer to these poses. Actual cast/windup close side views were requested to expose handle/palm contact before combined acceptance.


## Candidate review AS — corrected pier export and rear coverage

`/tmp/rpg-masonry-glb-v7-front.png`: **front construction8, material/bake fidelity8**. Matching source/destination projection groups resolve the black-outline regression while retaining the accepted source hierarchy. `/tmp/rpg-masonry-glb-v7-back.png` compared with `/tmp/rpg-masonry-source-v7-back.png`: **back material/export fidelity8; newly shown back construction7.5**. Both rear engaged shafts end in level smooth cuts two courses below the capital, reading as unfinished construction rather than authored damage. Carry them to the capital as the simplest correction, preserving the existing local front failure; deliberately shortened shafts would require believable fractured tops. This back deficit was independently identified and also reported by the implementer. Front acceptance does not transfer automatically to new coverage.

Nova `/tmp/rpg-nova-v11-group-nova-{0.35,0.45,0.55}-native-crop.png`: **small-group form6.5**. Roots merge into a bright three-lobed molten clump, and the dominant lick loses projected height. Establish one dominant hot spine, cooler/thinner secondary lick and much less emissive low connecting gas; separate roots enough to retain negative space. Keep the dominant silhouette tall enough as it leans, and taper the secondary endpoint into cooler gas instead of a round bright bead. No whole-wave acceptance.


## Candidate review AT — corrected rear pier and resolved hero grip evidence

Pier `/tmp/rpg-masonry-source-v8-back.png`: **rear source construction8, material8**. Both engaged shafts now meet the capital coherently, resolving the unfinished flat-top defect. Corrected export still requires fidelity review; native dungeon integration remains separate.

Hero `scripts/blender/previews/v2/authored-hero-release-strike-v9.png`: **static action staging8**. Forward finish, torso turn and supporting stance now form a coherent strike. Preserve this staging.

The clearer isolated actual-pose view `authored-hero-isolated-cast-windup-grips-v10.png` resolves the previous contact uncertainty as a real defect: **complete actual-pose grip6.5**. Four fingers extend almost straight across/in front of the vertical handle, with tips continuing beyond it, instead of wrapping around the far side. Cast view also has loose protruding digits beside the guard. The earlier local grip8 was based on an obscured rear/neutral view and is explicitly superseded for complete grip acceptance by this clearer evidence. Required visible construction: knuckles form an outer fist; middle/distal finger sections bend around the cylinder; fingertips return toward palm/thumb; the handle sits between palm and curled digits. A side contact/cross-section view after posing is needed, not merely distance-to-axis checks. No further body/action staging redesign is indicated.


## Candidate review AU — final pier export and Nova v12 group

Pier `/tmp/rpg-masonry-glb-v8-{front,back}.png`: **front/back construction8 and material/export fidelity8**. Rear shafts remain connected to the capital, and black projection outlines have not returned. Fine texture is somewhat softer at1k, but the worked-stone/block/fracture hierarchy remains convincing at the supplied scale. Ready for native dungeon placement review; no runtime gate is implied.

Nova `/tmp/rpg-nova-v12-group-nova-{0.35,0.45,0.55}-native-crop.png`: **group7**. Heat hierarchy improves, but the dominant root remains a soft glowing bulb with a thin tail. The next correction must change internal visible structure: an irregular ground-connected hot strip feeding narrow rising channels with a small resolved dark/translucent gap. Another scalar heat adjustment will not replace the smooth oval with combustion structure. If the analytic volume cannot resolve this at native pixels, an authored/simulated fire flipbook is a potentially stronger foundation; that option does not lower the8 gate or approve any current flame.


### Hero isolated grip v11

`scripts/blender/previews/v2/authored-hero-isolated-grips-v11.png`: **closed-grasp form8**. The clear side view now shows finger sections curving around the shaft and a coherent outer fist, resolving the straight-finger defect. A small dark oval on the upper exposed handle may be a glove/handle intersection; this requires verification in the full assembly. Wrist/forearm integrity is deliberately ungraded because the detail snapshot mask clips those regions. Full pose with the revised weapon axis remains pending.


## Candidate review AV — Nova group foundation and hero assembly

Nova `/tmp/rpg-nova-v13-group-nova-{0.35,0.45,0.55}-native-crop.png`: **small-group visible form8**. Unequal narrow hot channels and a resolved depth gap replace the glowing bulb; taper, cooler side gas and changing lean read as combustion. Preserve this foundation while testing uneven radial distribution. The full-front gate must show groups at unequal depths, clear quiet gaps, low outward rolling energy and localized contacts stronger than empty arc sections. This pass does not accept the complete wave, impact/death family or motion.

Hero `scripts/blender/previews/v2/authored-hero-full-equipped-v12.png`: **wrist/forearm attachment, weapon-direction preservation and action staging8** in supplied views. Revised weapon axis does not introduce a conspicuous wrist break, and the strike has a coherent forearm/blade line. `authored-hero-contact-v12.png` confirms the local glove protrusion through the upper handle remains a blocker; the implementer is correcting it. Keep the accepted broader assembly while repairing that local contact. No complete equipment or runtime acceptance yet.


## Candidate review AW — native piers, final hero contact and Nova full front

Native pier fixtures `/tmp/rpg-masonry-full-room{0,1}-{before,after}.png`, `rpg-masonry-full-room1-stormspire.png` and `rpg-masonry-full-room3-embercrypt.png`: **full-height wall/gate pier construction, material/readability and placement8** in reviewed warm/cool rooms. Block/shaft separation survives, lighting integrates coherently and no duplicated old-pier overlay is visible. **Miniaturized bridge torch-post use7.5**: scaling the many-course asset down creates tiny drums/blocks and needle-thin supports. A shorter post should use fewer courses with a proportionally substantial base/capital. Full-height acceptance does not approve those miniature placements. Other world art, arches/stumps and the fixture HUD remain separate.

Hero `scripts/blender/previews/v2/authored-hero-contact-v13.png`: **contact8**. Pointed glove protrusion through the handle is removed; curled fingers and the upper knuckle read as a coherent surface grip. Together with full assembly v12, depicted static source/equipment construction now meets8. Bake/export fidelity, runtime and ordered motion still need review.

Nova `/tmp/rpg-nova-v14-nova-{0.35,0.65,0.95,1.3}.png`: **full-front composition7**. Individual flame form survives, but near-equally spaced upright groups resemble candles marking a circle, while long thin crest segments dominate empty foreground. Concentrate the bounded group budget into3–4 unequal sweeping patches with overlapping radial depth and outward lean, retaining real quiet gaps. Faint cooling gas may connect a patch without recreating an opaque band. Bound crest fragment length in world/screen space so expansion does not stretch angular segments into long clean strokes. Preserve actor readability and local hit timing. Generic explosive deaths remain separately below the gate.


## Candidate review AX — short-post proportions and Nova v15 composition

Short support `/tmp/rpg-masonry-post-source-v1.png`: **visible proportion/construction8, material8 in shown area**. Three substantial courses and a proportionate base/capital read as a deliberately built shorter support, resolving the miniature-pier problem. Preserve this structure. A clipped top corner prevents complete silhouette review; final source/export evidence needs wider framing and opposite view, followed by native bridge placement. No further proportion redesign indicated.

Nova `/tmp/rpg-nova-v15-nova-{0.35,0.65,0.95}.png`: **full-front spatial composition8; rendered form7.5** because of visible horizontal sampling bands in tall channels. Unequal clustered patches, radial depth offsets, quieter foreground and short crest fragments establish a coherent advancing front; local contacts remain stronger than empty arc sections. Preserve this composition while correcting volume sampling. Clean front proof, supported fire deaths, viewport/fallback and ordered motion remain pending; this does not accept the complete Nova.


## Candidate review AY — clean Nova front, short-post source and optimized hero

Nova `/tmp/rpg-nova-v16-nova-{0.35,0.65,0.95}.png`: **clean rendered front8**. Adaptive sampling resolves conspicuous horizontal segmentation while preserving accepted channel form and composition. Freeze this foundation. Current localized straight-spoke contact fans remain approximately7, and generic airborne/disassembled fire deaths about4.5. Next scope is a supported full-size pressure-recoil/collapse with restrained ember/charcoal loss and a few directional contact fragments. Desktop front acceptance does not approve HUD/fallback or real-loop motion.

Short support `/tmp/rpg-masonry-post-source-v2-{front,back}.png`: **complete source construction8, material8**. Widened framing confirms capital/base integrity and coherent rear-shaft termination; three substantial courses resolve the former miniature-pier proportions. Ready for group-isolated bake and native bridge trial.

Hero raw reimport `scripts/blender/previews/v2/authored-hero-raw-export-{front-back,high}.png` and optimized `authored-hero-packed-export-{front-back,high}.png`: **static export construction/material fidelity8** in the actual cast pose. Layered armor, etched chest, controlled steel facets, quilted cloth and hood/cape remain coherent after optimization; no conspicuous texture or skinning regression appears at supplied scales. Native dungeon lighting/readability and ordered cast/cleave/walk motion remain pending, and other armor variants are not accepted by this base-character review.


## Candidate review AZ — short-post export and Nova aftermath

Short-post `/tmp/rpg-masonry-post-glb-v1-{front,back}.png`: **construction8, material/export fidelity7.5**. Main source structure survives, but a narrow black slit on the front-right upper plinth ledge and bright streaks across the rear-view left plinth ledges are new versus source-v2. They resemble local projection/normal seams rather than stone wear. Isolate/check closely stacked plinth pieces in the bake and remove artificial lines; no global brightness change is needed.

Nova `/tmp/rpg-nova-v17-nova-{0.65,0.95,1.15,1.3,1.55,1.7,2.3}.png`: **static supported connected death poses8, warm full-size erosion8 and localized hot-contact treatment8**. Straight-spoke fans and flying separated bodies are resolved. **Residual debris7.5**: pale gray chips near the right brazier at1.7seconds remain suspended after the adjacent body mostly vanishes. Make Nova fragments settle low/darken or disappear with the body so late aftermath reads as cooling ash. Preserve accepted front, poses and erosion. Actual HUD/fallback and ordered real-loop evidence are still required; these manually inspected fixed phases do not prove temporal smoothness.

## Candidate review BA — Nova v18 actual-HUD context and residue

Evidence: `/tmp/rpg-nova-v18-hud-{desktop,portrait,landscape}-{contact,fade}.png`, desktop `settle`, and fallback `contact`. Four real scratch tutor/reward solves with manually stepped inspection phases; these are contextual stills, not normal-loop animation evidence. The old public hero and unrelated world/character quality are excluded from this effect-specific score.

| Scope | Score | Visible assessment |
|---|---:|---|
| Desktop Nova context | 8 | Unequal flame patches and localized contacts remain readable around an open center without a room-wide bright wash. HUD does not conceal the principal target contacts. |
| Portrait Nova context | 8 | Upper and side contacts remain legible, with the main effect above the question panel. Edge cropping is present, but the visible wave and victims retain a coherent relationship. |
| Short-landscape Nova context | 8 | Smaller flame forms retain their warm channel hierarchy; side controls keep the effect space clear. This does not grade unrelated small character construction. |
| Revised late residue in these three views | 8 | The detached gray chips identified in v17 no longer punctuate the empty space. Remaining pale patches are coherent body remnants at differing erosion phases; smoke and fire recede without a second bright effect dominating. |
| Fallback chasm integration | 6.5 | Several flame tongues and broken ground-crest segments visibly occupy unsupported black chasm space. This breaks the physical relationship established by the floor-based combustion. |

Next correction: apply consistent floor support to the flame beds, floor crest and ground warmth, preserving the already accepted local shape. Verify the clean fallback render after the reported texture-decode warnings are resolved; no score is assigned to an unseen fix. Normal-loop opening/contact/settle/cleanup and upgraded echo coverage remain pending. **Complete Nova and the global gate remain unaccepted.**

## Candidate review BB — short-post v3 export and native bridge

The v3 GLB front/back reimport (`/tmp/rpg-masonry-post-glb-v3-{front,back}.png`) scores **8 construction and 8 material/export fidelity** against source v2. The front-right black plinth slit and thin bright rear ledge streaks are resolved. Source roughness, worked trim and deposits remain intact. Root traced the failed pixels to unbaked subpixel bevel charts; the visible result, rather than that diagnosis alone, supports the pass.

Native `/tmp/rpg-masonry-post-native-{warm,cool}.png`,1889×1312 client-only bridge/14-enemy fixtures, score **8 construction/proportions and bridge placement**. **Torch integration/material readability scores6.5**: the far upper-left and near foreground capitals become near-white luminous slabs and lose stone/bowl separation. Side-post torches show the appropriate restrained response. Correct the local light position/intensity or torch offset, preserving the accepted stone shader. Standard1440 viewport and other short-wall placements still require coverage.

## Candidate review BC — Nova fallback and bounded ordinary-loop motion

V19 fallback crossing contact/settle/fade scores **8**: fire, floor crest and ground warmth are supported by the crossing while the chasm stays empty. New evidence reports no instrumented bitmap decode failures; this does not establish the cause of earlier transient warnings.

V20 boss echo contact/echo/fade stills score **8 static composition**. The second front stays distinct without replacing the scene with a bright blanket. This is not an echo temporal score.

Motion source: `/tmp/rpg-nova-motion-video/page@79c696550ee4f8977c290c5bfcf8619b.webm`, with `/tmp/rpg-nova-v20-motion-evidence.json`. Reviewed all114 decoded native-timestamp frames PTS9.40–13.92s,40ms intervals, in10 ordered sheets under `/tmp/nova-motion-critic/`, plus native opening/contact detail crops and the full-clip overview. The entire14.32s video was not watched continuously; no claim is made about unobserved sub-frame motion. Recorded attacking cadence148 samples,median16.7ms,max66.7ms; unrecorded149 samples,median16.7ms,max66.6ms. Those metrics support provenance and do not supply an art score.

| Motion scope | Score | Evidence-based judgment |
|---|---:|---|
| Outward front evolution | 8 | Successive frames show a fast coherent expansion followed by cooling localized fuel patches rather than detached teleporting effects. |
| First contacts and recoil | 8 at recorded sampling | Contact flashes appear as the front reaches the visible actors, followed by recoil/folding. Native crops PTS10.16–10.40 cover the transition; no sub40ms synchrony claim. |
| Supported settling, full-size erosion and cleanup | 8 | Actors hold connected folded silhouettes before sequential erosion; no airborne gray-chip afterimage remains. The field is clear before travel. |
| Camera/HUD continuity during the effect | 8, effect context only | No disruptive camera shift or control overlay interrupts the attack. Unrelated loot beam, notification and locomotion art are excluded. |
| Opening with public old hero | 7 | Floor ignition starts abruptly as the sword rises; visible gather and directed release are weak. Incoming authored cast/gather integration must address this without redesigning the accepted front. |

Complete Nova remains unaccepted. Echo normal-loop evidence and corrected opening remain pending.

## Candidate review BD — native authored hero: static pass, motion blockers

Actual idle warm/cool desktop captures `/tmp/rpg-authored-hero-{embercrypt,stormspire}-normal-idle.png` score **8 static construction/material/readability**. The source's fitted torso, layered pauldrons, hood and split cloth remain distinct at game scale. This does not approve other appearances or viewports.

Ordered raw CDP evidence: `/tmp/rpg-authored-hero-embercrypt-normal-frames/`, with evidence/selected JSON beside it. Reviewed every frame26–68 for cast (43frames,1.527s,max92ms timestamp gap) and244–283 for cleave (40frames,1.402s,max68ms gap), in native hero crops under `/tmp/hero-motion-critic/`; full context at33/114/252 and selected travel frames119/143/176. These are actual real-solve sequences, not source pose playback. The reported nearest-sample alignment can differ by70ms at the opening, so precise contact synchronization is not inferred.

**Cast gesture/readability6.5:** the camera-facing figure brings its free hand only slightly away from its chest in the visible view; gather/release is weak and the body does not face the upper-screen enemies. **Cleave grounding/lunge6:** the arm sweep is visible, but the model translates sideways away from the fixed ground ring with almost unchanged planted-foot stance. **Travel direction/stride currently below gate, provisional6:** selected travel views show a front-facing figure moving backward toward the upper-screen gate; fully dense travel judgment remains pending.

Read-only implementation evidence already assigns `heroVisual.rotation.y` toward the destination and recorded walk clip time advances. Therefore the appropriate next audit is the source-forward/root/skin transform hierarchy and its actual visible effect, not simply adding another heading assignment. Root travel also covers roughly4.16 world units between selected114→119 (~0.17s); speed-to-stride matching needs review after hierarchy correctness. Source/export/static acceptance is retained, but **native motion is not accepted**.

## Candidate review BE — corrected post lighting and additional placement coverage

Latest durable evidence is `docs/rpg-playtest/v14/masonry/post/`: source/export front/back pairs, rejected export and lighting comparisons, and `native-room{0..5}-{region}.png` corresponding to the latest1440×1000 captures.

Room3 Embercrypt/Stormspire **torch/material integration now8**. Formerly overexposed capitals retain warm stone texture and separate bowl bases. All four bridge posts preserve the accepted proportions and supported placement. The correction is local; no deterioration of the accepted stone material is visible.

Room0/1/2/4/5 **visible short-cap and upper-support appearance/scale8**. Complete wall-post placement cannot be certified from these views: foreground walls, HUD and crystals obscure most shafts/footings. Their buried base contacts remain unverified; this is a coverage limit, not an observed new defect. No whole-world acceptance follows from these assets.

V21 Nova burning+echo boss echo/fade stills (`/tmp/rpg-nova-v21-burn-burn-boss-{echo,fade}.png`) retain **8 static composition/cleanup**. Additional burning does not obscure body forms or leave detached pale debris. Combined modifier temporal staging remains pending.

## Candidate review BF — corrected native hero action heading and planted strike

Evidence: `/tmp/rpg-authored-hero-embercrypt-heading-v2-frames/`, selected/evidence JSON and motion MP4. Reviewed every frame26–61 for cast (36frames,1.310s,max62ms frame interval) and236–273 for cleave (38frames,1.363s,max69ms). Native cropped ordered sheets are under `/tmp/hero-motion-critic-v2/`. Additional whole views110/124 establish travel direction and gate occlusion. This is bounded ordered-frame review, not direct continuous playback or sub-frame contact verification.

**Native cast facing/gesture/readability8:** the corrected back-facing orientation exposes the raised palm above the hood, directed toward the encounter. The return remains coherent and the supported lower body does not jump. **Native cleave staging/grounding8:** weapon/torso/knee movement remains connected and supported inside the ground ring; the previous sideways wrapper slide is gone. No source/material redesign was necessary. These scores supersede the initial native action6/6.5 within the corrected sequences only.

**Travel speed/stride still below gate6:** facing is now correct, but existing translation far exceeds the walk cycle. Implementer measured about1.18m ankle-path travel per0.8s cycle against an initial42m/s room transit; the visible mismatch is skating, regardless of technically advancing clip time. Align phase with actual distance and cap transit velocity with controlled arrival. Parts behind the gate remain occluded; no acceptance is inferred there.

Nova gather/release integration and exact effect synchronization are separate pending gates. Correct character poses do not automatically approve the complete spell opening.

## Candidate review BG — Nova CastOrigin opening v22

Fixed-phase native crops `/tmp/rpg-nova-v22-opening-authored-{0.08,0.13,0.18,0.23}-native-crop.png` score **6.5 for visible hand-to-floor connection**. A small shoulder-adjacent spark appears at0.08; the strand vanishes into/behind the torso at0.13; raised palm and floor warmth at0.18 still lack a clear causal bridge. This does not replace the prior whole-opening7 motion score with an inferred animation score.

Highest-return correction: sustain a compact palm ember through the hand rise, then route one tapered strand outside the body's silhouette into a small floor seed before the full wave. The proposed outward bow is appropriate for the occlusion, but the source should remain visible until the descending strand takes over. Broader glow or more particles would not fix continuity. Normal-loop timing remains pending; accepted front/contact/aftermath are unchanged.

## Candidate review BH — exposed wall footing diagnosis

Diagnostic `/tmp/rpg-masonry-post-bases-room1-side1.png` and `room3-side-1.png` retain the actual floor/wall/stepped aisle while removing foreground occlusion and changing to a closer reverse oblique native-elevation camera. **Footing integration6.5:** room1 post shafts terminate directly into the aisle, burying the plinth; room3's right short post exposes only its uppermost plinth step. The adjacent left tall pier also loses its base into the aisle.

Audit base offsets for both wall-mounted variants against the actual step surface, preserving floor-level bridge placements. These newly exposed contacts narrow previous normal-view placement acceptance; they do not change source/export material/construction8. Edge-on billboard flames in this diagnostic camera are excluded. Corrected base contact requires another diagnostic plus ordinary-view check after the height change.

## Candidate review BI — stride-v4 travel and rapid-answer staging

Stride-v4 source: `/tmp/rpg-authored-hero-embercrypt-stride-v4-frames/` and corresponding evidence JSON/MP4. Reviewed every106–144 (39frames,1.262s,max57ms gap) and286–349 (including final planted idle), every tenth145–285, plus full context110/153/250/300. Native ordered crops are under `/tmp/hero-stride-review/`.

**Visible level-ground travel and arrival8:** alternating feet track the passing paving credibly; acceleration no longer outruns the authored stride; speed eases into a planted idle without the old exponential skating. Source-distance math is supporting validation, not the basis of the art score. Gate/stair traversal around205–225 hides the boots in/behind the stair surface and architecture; actual root-height support needs separate verification. This pass excludes that occluded section and does not approve unrelated gate bloom or loot art.

Rapid-answer-v4 source: `/tmp/rpg-authored-hero-embercrypt-rapid-answer-v4-frames/`, evidence JSON and MP4. Reviewed all112–160 (49frames,1.931s,max125ms gap) in ordered whole-view sheets under `/tmp/hero-rapid-review/`. **Cut/local encounter staging8:** frame126 establishes the new room and hero position; subsequent wave/contacts remain local to that pack, with stable controls and no wrong-room attack. The125ms gap at125→126 and following~77ms gap prevent exact gather-onset approval. This is scene/target staging acceptance, not complete Nova timing or prior-loot notification acceptance.

## Candidate review BJ — corrected wall-pier footing contacts

Durable evidence: `docs/rpg-playtest/v14/masonry/post/base-contact-room{N}-side{S}.png`, especially room1-side1 and room3-side-1, plus all inspected room0/2/4/5 side1 views. Ordinary checks: `raised-room0-embercrypt.png`, `raised-room1-stormspire.png`, `raised-room3-{embercrypt,stormspire}.png`.

**Footing contacts and resulting ordinary-view integration8.** The stepped plinths now rest visibly on the preserved aisle rather than disappearing into it, for both tall and short previously exposed cases. Ordinary cap/shaft scale and bridge placements retain their established hierarchy. Diagnostic edge-on torch cards remain excluded. This supersedes the6.5 buried-footing blocker within these corrected placements and does not approve unrelated walls/arches/props.

## Candidate review BK — Nova opening v23–v26

V23 visible connection7: shoulder strand emerged but floor arrival stayed hidden. V24 improved to7.5 with a visible near-foot seed, yet multiple bright parallel hooks resembled a glowing wire glyph. V25 was an invalid intermediate: a reserved GLSL identifier prevented its intended seed shader from compiling, so it could not establish the submitted connection. No pass was assigned.

Corrected **v26 static palm-to-floor connection8** in `/tmp/rpg-nova-v26-opening-authored-{0.13,0.17,0.18,0.23}-native-crop.png`. A compact actual ground seed sits beneath the dominant taper and joins the first floor crest; the reduced secondary line no longer makes the connection compete with the main wave. Freeze this form for real-loop review. Its brevity means fixed-phase visibility does not prove perceptibility or timing in normal play. Whole-opening motion, echo/burn temporal staging and complete Nova remain pending; global gate still fails.


## Candidate review BL — v27 actual-loop Nova opening and echo/burn ordering

Reviewed every109 decoded native frame in each submitted range: `/tmp/rpg-nova-v27-normal-frames/` (video PTS12.9–17.3) and `/tmp/rpg-nova-v27-echo-frames/` (PTS14.7–19.1). Videos are `/tmp/rpg-nova-motion-video/page@2ed71097b0f50c9889c08b469bfc7a69.webm` and `page@62acc1a6c8afce9df91951cc1ad9a28c.webm`; provenance is `/tmp/rpg-nova-v27-authored-{motion,echo}-evidence.json`. Ordered context sheets under `/tmp/nova-v27-review/` were inspected completely. This is ordered-frame review at encoded25fps, not a claim of uninterrupted direct playback.

**Observed wave/echo/burn ordering and supported aftermath/cleanup8.** The second front expands after the first contact, settled actors maintain readable connected forms before erosion, and flame/body residue disappears before travel. The echo does not restart an explosive generic death or leave persistent pale fragments. Existing static form and contextual passes remain scoped.

**Complete opening NOT accepted.** The hand-to-floor transition is absent before the visibly expanded front. Runtime evidence confirms missing actual rendered states: normal recorded attack ages0.0506→0.1829, normal unrecorded0.0366→0.1816, echo0.0398→0.207. These are critical opening gaps, not merely a sparse reviewer extraction. Normal recorded/unrecorded cadence is about28Hz, and echo about22.6Hz; average cadence cannot reconstruct those omitted events. The static v26 opening remains8, but its intended temporal staging has not been demonstrated in normal play. Preserve the approved staging and resolve rendering stalls before resubmitting the opening; do not disguise the problem by retiming art.

## Candidate review BM — final gallery doorway route

Evidence: `/tmp/rpg-authored-hero-embercrypt-gallery-route-v5-frames/`, accompanying evidence JSON and motion MP4. Inspected every180–230 (51frames,1.900s,max43.6ms frame interval), plus240/250/260/270/275/280/290/300/310 and native full frame197. Reviewer crops are under `/tmp/hero-gallery-review/`. This was an ordinary-loop real scratch solve and subsequent travel, with no manual animation stepping.

**Doorway path grounding/clearance8.** Visible boots remain on level paving between the flanking stairs, the route retains its alignment through the pier depth, and the hero turns toward the boss mark after clearing the architecture. No observed stair penetration, ground jump or backward slide remains. This closes the previously excluded desktop route-support issue alongside the prior source/material/action/stride passes. It does not approve other hero appearances, phone presentation or exact spell-opening synchronization.

**Separate gateway visibility transition5:** frames218→219 remove the gateway abruptly while its plinths remain. The interval is27.1ms, so this is an observed scene pop, not a long capture gap. Strong white highlights also flash on the right door trim around210–217; shared lighting response deserves separate inspection. Neither defect changes the bounded hero route score, and neither is accepted as environment presentation.

After the current hero/masonry/Nova scoped work, the highest-impact remaining character target is the ordinary skeleton/revenant roster (historical3.5/4.5). Its toy-like skulls, limb construction and armor remain visible in most encounters beside the accepted hero and wraith. A shared authored anatomy/equipment foundation and grounded guarded poses should precede further small-detail polishing of accepted assets. The corresponding environment target is coherent thick wall/arch construction and landmarks; accepted piers do not lift those categories.


## Candidate review BN — substantial portal source v2

Source evidence: `/tmp/rpg-portal-source-front-v2.png` and `/tmp/rpg-portal-source-back-v2.png`. **Construction8:** thick jointed voussoirs carry a continuous molded face with a real recessed soffit, and the springing is visibly supported by imposts and substantial jambs. Both sides form a coherent portal rather than decorative strips pasted onto a wall. This is a source-construction judgment only.

**Material/history7.5:** clean mineral mottling is distributed too uniformly across broad faces, recessed molding and lower jambs. The portal lacks the accepted pier family's localized accumulation and exposed/protected surface distinction. Add restrained deposits in protected channels/imposts and lower-course dirt, with small coherent exposed-edge wear; retain quiet worked faces. Equal dark outer slots also merit subdued joint-fill/edge variation, preserving structural depth. Ornament density and unnecessary crown destruction would not solve this material deficit. Export and native integration remain unreviewed.


## Candidate review BO — actual-GLB Wayfarer portrait source

`web/public/assets/rpg/appearances/wayfarer.png` is the complete512×640 transparent render of the accepted packed hero. **Portrait source presentation8:** full blade and boots fit with margin; fitted layered armor, quilted cloth, leather and face remain distinct; lighting separates the silhouette without an intrusive cutout rim. No material or construction regression is visible. This approves the raster source only. Actual armor-card size/cropping/background/labels and equipped detail require native UI review; other appearance thumbnails remain below gate.


Cornea performance-candidate native comparison (`/tmp/rpg-cornea-authored.png` versus `/tmp/rpg-cornea-authored-no-transmission.png`): **rear-facing hero fidelity remains8**; silhouette, metal, cloak and general illumination are preserved. The eyes are not visible, so this does not approve the cornea/face change. A front portrait must show that the replacement surface preserves iris/pupil instead of creating an opaque pale shell. Enemy poses differ between these captures; this is qualitative hero fidelity, not a pixel-identical scene claim. Performance measurements earn no art-score credit.


Portal source v3 (`/tmp/rpg-portal-source-{front,back}-v3.png`): **construction8, material/history7.5**. Narrower outer gaps improve the arch. Darker lower courses are visible, but most new history reads as general base shading rather than spatially specific surface deposits. Repeated exposed faces still carry nearly identical mineral mottling, and protected molding channels do not clearly acquire a distinct aged surface. Highest-return remaining correction: broken uneven accumulation in one or two protected channels with a short gravity streak below an impost, and an irregular lower dirt patch spanning only part of several courses rather than a uniform height ramp. Keep the upper worked stone quiet and bright; additional ornament or damage geometry is unnecessary.


Front cornea-zero candidate `/tmp/wayfarer-raster-cornea.png` exposes a regression hidden in the rear view: **facial material fidelity7**. Pale opaque shells replace the authored gaze with blank eyes. Outfit and silhouette remain8, but the changed portrait does not retain full source acceptance. Next bounded candidate should discard that corneal shell while preserving the underlying iris; restoring a full-scene transmission pass is unnecessary to pursue this visual result. Accepted original portrait remains distinct from this rejected candidate.


Corrected alpha-discarded cornea `/tmp/wayfarer-clear-cornea.png` restores **source facial/static fidelity8**. The authored dark gaze is visible again without a pale shell. Complete portrait framing, materials and silhouette remain intact. This supersedes the rejected opaque cornea-zero portrait7 within this replacement only.

Actual desktop deployment `/tmp/rpg-wayfarer-card-desktop.png`: **Wayfarer unselected card layout/readability8**. The complete figure separates from its dark inset; title/body/button hierarchy is clear and the blade is not clipped. This does not approve the other three armor portraits, the entire armor section, the phone layout or Wayfarer-equipped state, none of which this capture establishes.


Public-asset Cinderbranch equip proof `/tmp/rpg-authored-hero-embercrypt-rare-blade-v1-cinderbranch.png`: **native equipped-blade/hero preservation8** in the shown idle view. The warm blade accent stays narrow and restrained without obscuring the grip or flattening the armor/cape silhouette. This approves preservation of the existing sword with its equipped accent; it does not establish a distinct modeled Cinderbranch silhouette or swing-trail behavior.


Portal v4 source (`/tmp/rpg-portal-source-{front,back}-v4.png`): **construction8, material8**. Broken lower-jamb deposits now cross courses asymmetrically, the protected channel treatment follows the molding depth, and upper worked faces remain quiet and distinct. Rear stone and footing separation remain coherent. This resolves the v3 material/history7.5 within the source study. Freeze for export fidelity review; no native or whole-world acceptance follows.


## Candidate review BP — v31 normal-loop Nova opening restored

Durable videos: `docs/rpg-playtest/v14/fire-nova/authored-normal-loop.webm` and `authored-echo-loop.webm`; provenance `retained-program-{normal,echo}.json` and README. Original temporary videos were `page@b8b7b504621ec101f780f650da1d9217.webm` and `page@2ebfecf86491b9af8a95c81663b85fb9.webm`. Reviewed every115 native decoded frame in `/tmp/rpg-nova-v31-normal-frames/` (PTS10.60–15.16) and `/tmp/rpg-nova-v31-echo-frames/` (PTS10.20–14.76), each40ms apart. All ordered sheets under `/tmp/nova-v31-review/` were inspected, with additional unscaled native opening crops: normal6–13 and echo13–20. Provenance is `/tmp/rpg-nova-v31-retained-{motion,echo}-evidence.json`.

**Opening temporal staging8, normal and echo/burn.** A compact palm gather precedes the descending strand and near-foot seed; the expanding floor front follows them visibly. The previously missing causal interval is now present in the actual recording, and finer renderer telemetry samples the relevant attack ages through0.08–0.17. This is supported by actual ordered appearance, not merely the higher reported cadence. No sub-frame synchronization or direct continuous-video playback is claimed.

**Complete reviewed desktop Nova sequence8** for normal14 enemies and echo/burn39: opening, wave travel, localized contacts, secondary-wave ordering, supported settlement, full-size erosion and cleanup remain coherent at the observed sampling. All effect residue clears before travel. The normal range also contains the start of another real cast after the scene cut; its opening remains coherent, but the range does not contain that second cast's entire aftermath. Existing portrait/landscape/fallback static passes remain static scopes; this is not an unseen cross-device motion certification. Loot beam/notifications and enemy-source quality are separate failed categories. This supersedes the v27 skipped-opening failure only for the corrected v31 evidence.

## Candidate review BQ — portal export v4 and skeleton anatomy foundation

Actual reimported portal `/tmp/rpg-portal-export-{front,back}-v4.png`: **construction8, material fidelity7**. The source's planar worked faces appear inflated/pillowy, with dark bands below almost every lower-jamb course, especially rear right. Outer voussoirs also show stronger rounded bulges. Local source deposits survive, but the bake changes the stone read. Compare normal-disabled, AO-disabled and flat-material diagnostic views to locate the cause before changing global brightness or roughness. Source8 remains separate; native promotion is not accepted.

Skeleton foundation `/tmp/authored-skeleton-foundation-{front,high}.png`: **anatomical source construction8**. Rib cage, pelvis, shoulder girdle, paired limb bones and articulated hands provide a credible basis. This is not a finished enemy-design, gameplay-material or native-readability pass. Next proof needs a guarded/hunched pose at actual game size, with controlled strengthening of fine limbs/hands only if necessary. Preserve torso negative spaces; use the skull's brow/cheek/jaw planes and asymmetric equipment mass to establish an enemy silhouette before decorative detail. The neutral medical-display stance/material is not accepted as finished gameplay presentation.


## Candidate review BR — current Frostfall baseline and Ball opening

Frostfall actual fixed-phase desktop evidence: `/tmp/rpg-next-v32-frost-baseline-desktop-{anticipation,release,contact,settle,fade}.png`, ages0.12/0.35/0.8/1.3/1.8 after a real scratch solve,17 enemies with shards modifier. **Visible effect form3.5, contact/death4; temporal staging unverified.** Release uses repeated opaque blue pendants with thin tails; contact becomes dotted vertical curtains. Later phases grow a dense field of large smooth pyramids around the hero while enemies fly apart in generic airborne fragments. This remains materially below the concept despite later source changes.

Highest-return direction: one irregular falling crystal volley with convincing internal depth, unequal fracture planes and selective bright edges; align each arrival with its actual target contact. Follow with local frost/fracture/vapor and supported frozen collapse. Prove one shard/contact at native size before multiplying. An unrelated second field of large hero-centered cones does not improve the causal hierarchy.

Ball v32 opening: reviewed every frame1–48 in `/tmp/rpg-ball-v32-frames/`, each40ms apart, with native-context crops under `/tmp/ball-v32-review/`. **Opening remains7.** The raised hand is almost empty; an orb appears down-left away from the hero atframe17, followed by generic shoulder sparkles. No visible transfer connects the two. Mature orb form/travel acceptance remains separate. A compact CastOrigin-bound charge and small forming orb beside the palm should transition continuously into the existing orbit before target contact, preserving mature orb shaders and authoritative hit times. A long bright cable or more generic dots would not resolve the source hierarchy. First-use draw preparation still needs to prevent the recorded release stall.

Portal v5 export (`/tmp/rpg-portal-export-{front,back}-v5.png`): **construction8, material fidelity7.5**. Broad inflated course shading is resolved. Local defects remain: the front crown joint becomes a black notch reaching into the molding; the rear left jamb has a dark diagonal slash across a lower course and a black strip above its plinth. These differ from sourcev4 and read as projection/chart defects, not intended age. Target those exact charts/groups before native integration; retain the corrected broad low-mesh normals.


Portal v5 diagnostic correction: inspected `/tmp/rpg-portal-corrected-low-flat-v5.png` after the textured review. The rear diagonal slash, above-plinth strip and crown-side wedge also survive in this untextured control. Therefore the preceding projection/chart hypothesis is insufficient; inspect local low geometry/corner normals first. Approximate850×1000 pixel targets: rear slash(309,565), rear strip(220,653), front crown notch(365,230) and seam(399,188). No score change is assigned to diagnostic evidence.


Skeleton guarded study v2: `/tmp/authored-skeleton-guard-high-v2.png` and direct192×192 `/tmp/authored-skeleton-guard-native-v2.png`. **Anatomical source8 retained; posed guard6.5, native silhouette/readability7.** Torso/pelvis masses survive the small render, but hands/forearms become faint threads. One open extended hand and one hanging arm read as presentation rather than a prepared opponent. Establish staggered foot/hip weight, subtle bilateral knee flexion, a compact forearm guard toward the lower chest and a definite opposite attack/weapon line. Modestly strengthen fine limb/hand readability without losing landmarks or rib/pelvis negative spaces. Harness ornament or larger pauldrons would not resolve the pose. This is a studio native-size proof, not actual dungeon integration.


Actual selected Wayfarer phone card `docs/rpg-playtest/v14/hero/wayfarer-card-phone.png`: **portrait/layout8**. Full blade/boots remain inside the inset; the figure separates from the dark surface, text spacing is comfortable, and the gold border with explicit Wearing label clearly communicates the selected state. This closes that phone/selected Wayfarer card coverage only; the other three old armor portraits and full collection remain below gate.


## Candidate review BS — Ball v33 charge and unchanged portal v6

Ball source evidence `/tmp/rpg-ball-v33-{single,orbit}-frames/`, native strips `/tmp/rpg-ball-v33-{single,orbit}-first.jpg`. Reviewed first24 decoded frames of both sequences at40ms spacing plus unscaled native strips; this review did not re-audit the entire100-frame aftermath. **Compact palm-charge visible form8:** a small controlled branching charge now sits on the raised hand, and mature orb form remains intact after separation. **Transfer timing still unaccepted:** single frame6→7 jumps directly from palm charge to near-foot volume, consistent with the reported actual age0.191→0.336 gap. Orbit similarly shows charge and separated volumes without establishing the omitted transfer interval. Freeze visible forms while diagnosing runtime stalls; no art retiming is justified.

Portal actual v6 reimport `/tmp/rpg-portal-export-{front,back}-v6.png` retains **construction8/material fidelity7.5**. Marked crown/jamb/plinth artifacts remain visibly unchanged. Root subsequently verified identical exported position/normal/UV buffers and embedded maps between v5/v6, explaining the lack of visual correction. An explicit low-corner normal fix should first establish changed flat-control appearance before another full bake.


Skeleton guard v3 (`/tmp/authored-skeleton-guard-v3-{high,native}.png`): **pose7, native silhouette7.5**. Staggered knees/feet and clearer hands improve readiness, but the long low arm still drags the silhouette down and the other claw hovers by the hip. The elevated camera does not show a compact chest guard. Move one hand visibly in front of the lower sternum with elbow clear of the rib edge; bring the opposite reaching endpoint nearer waist/chest height rather than knee. Preserve improved planted legs.

## Candidate review BT — next full-HUD target and portal flat correction

Current durable desktop HUD `docs/rpg-playtest/v14/hero/public-rare-blade-cinderbranch.png`, compared with concept04: **desktop combat-dock material/typographic hierarchy6**. Long empty black rails, many fine bright gold outlines and tiny labels over busy glass orbs compete with the playfield. The concept's dock reads as one dark crafted housing with clear spell names. Highest-return bounded correction: rebuild the desktop bottom surround as coherent worn dark iron with restrained brass edges, place level/spell-count labels on quiet readable plaques, and give spell names consistent readable slots. Preserve accepted icon art and functional question/input geometry. This does not regrade accepted menus or phone/landscape scopes.

Portal explicit flat v7 `/tmp/rpg-portal-explicit-flat-{front,back}-v7.png`: **construction/shading integrity8 in this diagnostic scope**. Rear slash, above-plinth band and broad crown-side dark wedge are gone. A narrow dark seam remains at the front molding crown joint, following the joint rather than spreading over a face; it is not the former broad defect. Proceed to textured fidelity proof while retaining source material. No texture/native acceptance follows from the flat diagnostic.


## Candidate review BU — completed Ball desktop sequence, portal export and dock

Ball v36 evidence: `/tmp/rpg-ball-v36-{single,orbit}-frames/`, every110 native frames per case at40ms spacing over PTS17.92–22.28, timing JSON in each directory; `/tmp/rpg-ball-v36-{single,orbit}-transfer.jpg` native strips. All frames were reviewed in ordered context sheets under `/tmp/ball-v36-review/`, with unscaled transfer inspection. Videos `/tmp/rpg-next-spell-video/page@546c18de2dbd7303240009aea190df0e.webm` and `page@1e68c27497ab2ec7cee26c701793953a.webm`; finer trace `/tmp/rpg-next-v36-ball-{final,orbit-final}-evidence.json`.

**Complete reviewed desktop Ball sequence8**, single26 enemies and four-orb48: charge follows the raised hand, the forming volume travels visibly down/out into its path, four volumes separate without a teleporting shared blob, contacts precede supported collapse, and full-size erosion/orb residue clears before travel. This resolves the prior skipped-transfer and four-orb temporal gaps at the recording's40ms sampling, supported by finer actual-render telemetry. It is not sub-frame certification or a cross-device motion benchmark. Existing portrait/landscape/fallback static scopes remain separate. Unrelated HUD/world/enemy source quality is excluded.

**Portal textured export v7 construction8/material fidelity8.** `/tmp/rpg-portal-export-{front,back}-v7.png` restores planar worked stone and sourcev4's restrained deposit pattern. Rear slash/plinth band and broad crown wedge are gone; the narrow molding joint stays coherent. Native placement/material review remains pending.

**Desktop dock v4 housing/material hierarchy and label readability8** in `/tmp/rpg-v36-desktop-dock-precast.png`. The continuous dark surround supports the orbs/cards as one unit; count plaques are quiet, values remain prominent, and spell names are readable. This approves only the depicted desktop bottom dock, not the entire HUD, notifications, question panel or unshown viewport states. This is a video-derived frame; retain a fresh lossless ordinary/locked-state screenshot for durable followup without treating compression as an art defect.

Skeleton guard v4 (`/tmp/authored-skeleton-guard-v4-{high,native}.png`): **articulation/pose6, native silhouette7.5**. Raised hands improve projected height but expose a problematic screen-right elbow/forearm arrangement: three parallel long rods with staggered rounded ends below the rib cage, rather than a clear connected elbow fold. Both flat-spread claws overlap the chest. Inspect actual humerus/radius/ulna pivot contacts in a close three-quarter view before more endpoint changes; keep one compact guard and open the opposite hand/elbow to preserve torso gaps. Equipment must not hide the attachment problem.

Shield source promotional preview `/tmp/cc0-lucian-shield-preview.png`: **provisional presentation7.5**, useful for import. Curved wood/rim/rear reinforcement are promising, but dense uniformly bright front engraving and repeated wood knots need native-scale assessment and restrained material response. Neither actual source import nor forearm strap mounting has been reviewed. No damage addition is required before intact construction reads correctly.


## Candidate review BV — user rejection reopens combat-impact acceptance

The user's latest direction explicitly rejects the current cheap effect-then-poof feel, limits visible enemies to10, and requires starter attacks that leave survivors. Previous Ball/Nova complete-sequence and impact8 judgments do not override that feedback and are withdrawn from the current ledger. This is not a minor optional polish request. Portal/dock polishing pauses while combat response is addressed.

Focused reconsideration uses the actual normal-loop Nova v31 and Ball v36 sequences already reviewed completely, with native contact frames `/tmp/rpg-nova-v31-normal-frames/frame-0021.jpg` and `/tmp/rpg-ball-v36-single-frames/frame-0037.jpg` inspected again. **Contact force/directional body response5; death payoff5; survivor readability unverified.** Flash and effect travel carry most of the event. Actors retain largely standing silhouettes around contact, then enter a shared contraction/erosion phase. The all-killed result provides no meaningful wounded-survivor response or decision to continue engaging that target. Cleaner shaders and technically correct event ordering do not make this satisfying combat.

Required next bounded proof: one ordinary starter cast against6–10 visible enemies, with some targets surviving. At each actual contact show a brief local flash/fracture and a directional shoulder/torso recoil followed by visible weight recovery. Survivors recover into guarded poses with a readable damaged cue; fatalities visibly lose support and settle before dissipation. Avoid using immediate global disappearance, floating damage numerals or larger bloom as substitutes for body response. Keep the room active until remaining enemies are defeated. Mature spell-form assets may be reused, but no new impact/temporal acceptance is assigned before actual normal-loop partial-kill evidence. Learning methodology is not part of this visual redesign.


## BW — User-priority partial-hit v1: first genuine survivors, impact still below gate

Evidence: `/tmp/partial-hit-v1-native/frame-0001.jpg` through `0249.jpg`, all decoded native frames reviewed in order, PTS 19.52–29.44 at 40 ms intervals, with native actor crops for frames 17–64 and full-size frames 50/170. Supporting `/tmp/partial-hit-v1-evidence.json`, `timing.json`, and lossless `/tmp/partial-hit-v1-after-1.png`. This is ordered-frame analysis, not a claim of directly playing continuous video or resolving sub-40 ms animation. Renderer telemetry includes finer actual rendered frames and ten hit events; frame timing does not itself earn an art score.

The behavioral change is visible and useful: first real starter answer changes six enemies from HP `[12,6,8,8,10,6]` to `[6,0,2,2,4,0]`. Four actors remain and a new question appears in the same room. The second answer defeats those four and starts travel. Telemetry reports at most seven visible enemies including the next encounter and no errors. This establishes the sampled partial-kill flow; it does not make the animation polished or certify every encounter/loadout.

| Current scope | Score /10 | Visible finding and highest-return correction |
|---|---:|---|
| Contact force and directional recoil | 6.5 | Individual flashes now accompany reactions, but native frames 27–34 show the center surviving skeleton leaning shallowly and returning nearly upright. The shoulder response does not clearly lead a delayed hip/knee catch. Author a readable directional shoulder displacement, counterposed support leg and slower weighted recovery; additional glow is not the missing ingredient. |
| Survivor recovery and damaged stance | 7 | Four survivors remain visibly active, distinct from the two lowering bodies, but their final guard is too close to the pre-hit idle silhouette. Keep a clear lowered shoulder/guard and supported stance after the transient recoil. Separate the left brute and revenant in projected space so neither response is hidden. |
| Death weight and physical support | 6 | Rear skeleton frames 35–49 folds into a compact crouch with unclear rib/hip/hand contact with the floor. Frame 50 exposes the suspended-looking compact pose; frame 170 shows a flattened brute with spread arms, bundled revenant and near-upright tilted wraith. The full-size hold exposes these puppet-like poses. Author an unmistakable supported fall for one skeleton, then adapt its support logic to each body type instead of making every character fold and fade. This is a visual support criticism, not a claimed numerical ground-intersection diagnosis. |
| Settled hold to erosion timing | 7 | Bodies remain full size before clearing at distinct times, improving outcome sequencing. However the long, motionless hold in weak final poses still makes erasure the dominant death payoff. Keep the useful staging while fixing the terminal pose; extending the hold again will not solve weight. |
| Damaged-enemy health-bar presentation | 6.5 | Lossless after-first-answer view has narrow dark amber fill only a few pixels high. The bars identify damage on deliberate inspection but lack glanceable contrast and clear remaining-health proportions. Increase the readable interior height/contrast with a restrained dark backing and keep bars clear of nearby actors and reward feedback. |
| Partial-outcome presentation | 7 | Four survivors and the new same-room question make continued combat understandable. The large reward toast covers the two bulky actors and duplicates floating XP; it persists into the next attack in this recording. Move one concise outcome summary outside the actor region and clear stale feedback when the next cast begins. |
| Clear-to-travel causal order | 8, bounded order only | The room does not advance after the partial hit; travel begins only after the second defeat sequence. This narrow ordering judgment does not approve death feel, loot effect art, the route beyond the recording or unrelated architecture visibility transitions. |

**No new complete combat-impact acceptance.** First priority is a convincing supported body response at individual contact, using a native-size survivor/death pair before another broad matrix. Mature Nova flame and Ball orb forms remain reusable; their old whole-sequence 8 scores do not override the user's rejection. Ball partial-hit presentation, phone/landscape health bars and boss/other-spell partial outcomes still need their own evidence.


## BX — Partial-hit v2: desktop outcome readable; body response still unfinished

Reviewed all 250 native decoded frames in `/tmp/partial-hit-v2-native/` in order, PTS 20.00–29.96 at 40 ms intervals, plus native actor crops through both impacts and lossless `/tmp/partial-hit-v2-after-1.png`. `/tmp/partial-hit-v2-evidence.json` records two real answers, the same six-to-four partial result then clear/travel, at most seven visible enemies and no errors. These are observed ordered frames and telemetry, not direct continuous-video playback or a claim to resolve events between recorded frames.

| Scope | Score /10 | Verdict |
|---|---:|---|
| Contact and asymmetric catch | 7.5 | The delayed knee/hip lowering now reads and the separated revenant is visible during recoil. However the response still looks like a coordinated posed bend rather than a shoulder impulse arrested by a clearly planted foot. Clarify shoulder lead, pelvis lag and the brief supported catch before recovery. |
| Survivor recovery | 7.5 | Slower recovery and wounded guard distinguish living actors from falling ones. The final stance is still relatively stiff; an uneven release through shoulder, elbow and supporting knee would improve the sense of retained weight without making the whole actor bob. |
| Skeleton broad low pose / apparent ground support | 7.5 | First death frames 44–61 reaches a much broader, lower rib-cage silhouette than the v1 crouch. The support direction is improved. It still needs final limb slack to look like a fallen body rather than an arranged collection of joint angles. Numerical floor bounds do not replace that judgment. |
| Skeleton/revenant death weight and settling | 7 | Second-cast frames 170–184 make the remaining problem clear: the revenant's low head/body is surrounded by arms and weapon held in a large upward V, with raised rigid limbs. Add a short final gravity-driven settle after support contact: supporting elbow yields, weapon forearm lowers and the opposite arm/knee relax at different times. Preserve the broad low torso and existing hold/erosion duration. |
| Guardian/wraith death | Still below gate | These body-specific deaths were explicitly unchanged and not submitted as solved. The flattened guardian and tilted standing wraith do not inherit a pass from skeleton changes. |
| Ordinary desktop health-bar visual readability | 8 | The 48×9 red fills, dark backing and restrained rim make remaining-health fractions readable at the native viewport without numeric clutter. Only the shown ordinary desktop actors are accepted; clipping/collision/boss/mobile cases remain separate. |
| Ordinary desktop formation and outcome feedback | 8 | Brute and revenant now have separate silhouettes; all four survivors are easy to count. The concise top notice no longer covers bodies or duplicates XP. The first notice is absent before the second cast. This accepts this desktop outcome presentation, not every HUD state or the lower-quality actor assets. |

The root's changes made after this recording—boss progress bar, boss header at 124 px, further-shortened messages and short-canvas health-bar clipping—are unreviewed by this evidence. **Complete combat-impact gate remains failed.**


## BY — Partial-hit v3: body-specific death review, no complete impact pass

All 250 native decoded frames `/tmp/partial-hit-v3-native/frame-0001.jpg` through `0250.jpg` reviewed in order, PTS 19.00–28.96 at 40 ms intervals, with native actor crops 28–63 and 153–188 and full-size frame 175. `/tmp/partial-hit-v3-evidence.json` supports the same two real answers, two kills/four survivors then clear, at most seven visible enemies and no recorded errors. No direct continuous-playback claim; sub-frame events cannot be reconstructed from this sampling. The 29 geometry/pose tests are technical evidence only.

| Scope | Score /10 | Visible result / next structural correction |
|---|---:|---|
| Contact force / planted catch | 7.5 | Separate timing is improved, but the native reaction still reads predominantly as upper-body tilt followed by coordinated crouch. The supporting foot does not provide a strong visual arrest of the shoulder impulse. Block a clear catch pose with pelvis over the planted rear foot and opposite shoulder counterturned, then connect the preceding impulse and following recovery around it. |
| Survivor recovery / distinction | 7.5 | Survivors recover more slowly into lowered guards and are clearly distinguishable from deaths. Their pose still feels stiff, with insufficient independent relaxation of the free shoulder/arm. Outcome correctness is not the remaining problem. |
| Skeleton death | 7.5 | Broad low torso and delayed arm settling improve the fall, but the final knees/upper limbs remain arranged upward rather than released unevenly under gravity. Resolve the final supported pose in a side and game-angle study before extending timing. |
| Revenant death | 7.5 | Frames 167–176 show weapon forearm lowering; the previous large upward V is reduced. The raised upper arms/legs still look deliberately held. A more convincing shoulder resting on one side, lowered weapon forearm and uneven slack legs would complete the body response. |
| Guardian death | 7 | Frames 162–175 lower the chest, but the final broad, nearly level form with spread arms resembles a tabletop. Show diagonal chest weight through one forearm and a folded knee; retain the body's mass instead of symmetrically flattening it. |
| Wraith death | 6.5 | After its hit, frames 159–175 return to almost the standing hood/robe height. Cape turn and hand slack do not clearly signal failed support before erosion. Needs unmistakable upper-body height loss/failed staff brace or a clearly staged spectral draining gesture. A uniform robe squash would introduce another cheap effect and is not the requested fix. |
| Cleanup and partial/clear ordering | 8, narrowly scoped | Full-size held bodies erode individually without lasting actor residue; survivors remain and the room changes only after the clear. This does not accept the preceding weak death poses, reward-beam art or overall hit feel. |
| Existing ordinary desktop HP/outcome presentation | 8, retained scope | Readable bars, separated actors and off-actor concise notice remain intact. No boss appears in this starter recording; newer boss-row presentation and phone/landscape remain unreviewed. |

**Global and complete impact gates remain failed.** The next efficient proof is a small body-specific key-pose strip at the game angle and a diagnostic side angle, followed by native motion. Repeated small changes to timing constants alone are not resolving the remaining silhouette/support defects.


BY contact clarification: the concrete example is surviving `enemy-2` in v3 frames 32/35/39/43/47/51, shown without resizing in `/tmp/partial-v3-review/survivor-catch-native.jpg`. Chest leans back at 35/39 and reverses into a forward crouch at 43, while neither foot clearly reads as a newly planted stop and chest/head rotate nearly together. The requested correction is a visible support event—back foot sets, pelvis continues briefly over that support, chest counterturns and settles. The local flash already identifies impact; a larger effect or independent FX retiming is not requested.


## BZ — Compact health/notice and boss framing: scoped passes, two remaining defects

Durable evidence is `docs/rpg-playtest/v15/compact-layout/`. Reviewed all four `v2-wounded-{pack,boss}-{390x844,844x390}.png`, both `v3-wounded-guardian-bar-{390x844,844x390}.png` and `v3-wounded-boss-landscape-camera.png`, plus README provenance. V2 follows a complete real-tutor expedition. V3 ordinary follows a real starter answer with guardian 6/12 HP; v3 boss is a normal browser load of the exact recorded authoritative 27/36 HP boss state restored into a disposable fixture. It is not a newly recorded live boss impact. No source-only approval or synthetic timing inference.

| Scope | Score /10 | Finding |
|---|---:|---|
| Ordinary portrait health-bar legibility, 390×844 | 8 | The red fractions are clear, the guardian bar is now present, and each of four bars belongs to an identifiable actor. |
| Ordinary short-landscape health-bar legibility, 844×390 | 8 | All four bars fit and retain legible fill/backing separation. This fixes the prior top-clipping problem; it does not approve the independent floating-XP overlap. |
| Compact subtitle-row notice, ordinary and boss | 8 | The concise enemy count replaces existing subtitle space without moving the heading or covering actors/boss. The shown states contain no stale discovery card. Visual placement is accepted; test assertions establish cleanup behavior separately. |
| Latest short-landscape boss header and formation framing | 8 | V3 saved-state proof has the ten actors below the boss header and above the dock; guardian and nearby damaged actors remain distinguishable. The prior v2 overlap is visibly resolved. This is a static framing pass, not a motion or model-art pass. |
| Portrait boss framing in available v2 proof | 7.5 | The rightmost skeleton is crowded against and partially clipped by the right edge around y330–380. Portrait needs its own horizontal extent check; the landscape fit does not establish this. No v3 portrait boss proof was supplied. |
| Compact transient reward unobstruction | 6.5 | The v3 ordinary 844×390 frame places large floating `+32 XP` over the guardian/revenant chest. Moving the toast did not solve this separate element. Use the existing XP strip for compact reward feedback or a measured non-actor slot, rather than another large label moving through the formation. |

Actor quality and contact/death scores remain unchanged. **Global gate still fails.**


## CA — Controlled impact key poses v4/v5: support clarified, other bodies still fail

V4 evidence `/tmp/hit-keyposes-v4-evidence.json` and its twenty native/side crops was reviewed before v5. V4 survivor and skeleton final silhouette scored7.5, with floor support unverified because the foreground wall obscured the side view. Guardian7.5 showed greater asymmetry but retained an active guard. Wraith6 was a regression: compressed cape/body became a frilled short skirt and tangled chest. No temporal grades were assigned.

V5 evidence `/tmp/hit-keyposes-v5-evidence.json` and **all24 native400×340 crops** were inspected in unscaled ordered native/side sheets. These are controlled renderer poses, not normal-loop animation. The new side camera exposes floor/feet; no automatic quality credit comes from the clean WebGL result or numerical support tests.

| Scope | Score /10 | Visible judgment |
|---|---:|---|
| Skeleton survivor support/catch key poses | 8, static only | Side .24/.34/.52 shows a separated foot, bent knee and pelvis lowering over support. This resolves the previous occluded support question without further pose edits. Actual impulse-to-plant-to-recovery timing must still be reviewed in normal playback; the old motion7.5 remains. |
| Skeleton final fallen silhouette/support | 8, static only | At .94 the rib cage/head and released limbs form a low extended body against the floor in both views. The side view removes the prior apparent suspension ambiguity. Source-model quality and fall/settle timing remain separate. |
| Revenant final pose | 7.5 | Low body and lowered weapon are clearer, but the cape remains a rigid raised flag above the fallen torso. Let it trail down toward the floor with the torso rather than retain its standing orientation. |
| Guardian final pose | 7.5 | Head turn and shoulder asymmetry help, but .94 still resembles an active crouch with the chest held over both arms. Roll/lower chest weight onto one loaded forearm and release the opposite shoulder/hand. |
| Wraith garment collapse | 6.5 | Fewer tangles improve v4, but the body still becomes a shortened flared skirt below an upright full-size chest/head. Use an intentionally shaped sideward/bowing cloth deformation preserving broad front/back panels and continuous trim; another stronger generic vertical compression is not the solution. |

**No complete impact pass.** Further skeletal foot retuning should wait for actual-loop timing evidence. Guardian/wraith need stronger terminal construction; body-specific defects cannot be averaged into the accepted skeleton pose.


## CB — Compact v4 closes the two identified static layout gaps

Reviewed all four durable `docs/rpg-playtest/v15/compact-layout/v4-{guardian,boss}-{390x844,844x390}.png`. Guardian proof follows a real starter answer; boss proof uses the exact previously recorded authoritative partial-boss state restored only into a disposable database and loaded normally. No new boss-impact motion is implied.

**Compact transient reward unobstruction8:** floating XP no longer crosses the ordinary actors. The existing subtitle notice and health bars remain readable. **Portrait boss framing8:** all ten actors fit inside the right edge with visible separation from the boss header and question controls. Prior ordinary HP/subtitle placement and landscape boss framing8 scopes remain intact. This does not approve the underlying enemy models, their animation, or every typography/detail component of the full compact HUD.


## CC — Authored skeleton source guard v5 remains below gate

Evidence `/tmp/authored-skeleton-guard-v5-{high,native,elbow}.png`, all three inspected. **Articulation7; purposeful guard/native readability7.** The elbow arrangement is improved from v4, but the compact arm still presents several nearly parallel long shafts ending at offset rounded tips without a clear elbow junction. Reduce extreme flexion enough to expose that junction in a three-quarter/side inspection before more endpoint changes or armor. The opposite fully splayed palm reads as presenting/waving; curl it into an asymmetric grasp and turn the palm inward while retaining arm/torso negative space. Native forearm/rib overlap remains limiting. This does not revoke the underlying authored anatomy foundation8, nor does it approve finished enemy materials, equipment or runtime integration.


## CD — Skeleton source v6 and corrected impact silhouette fixture

Skeleton source `/tmp/authored-skeleton-guard-v6-{high,native,elbow}.png`: **articulation/joint-chain readability8 in the shown views; grasp7.5; purposeful guard/native silhouette7.** Reduced flexion exposes a readable elbow chain. Preserve that improvement. The compact forearm now lies horizontally across the pelvis, and the opposite palm still faces upward like a presentation gesture. Move the compact upper-arm assembly at the shoulder so elbow sits beside the lower ribs and forearm rises diagonally to a projected lower-sternum hand; turn the opposite grasp toward the threat with slightly more closed outer fingers. A concrete equipped candidate can combine this correction with restrained harness/blade, provided equipment does not conceal joint construction and the grip is shown clearly. No finished enemy/export/runtime pass.

**Fixture correction:** renderer disclosed that earlier zero-delta death studies retained initial idle-hover and previous contact-light state. Consequently v5 apparent ground-support conclusions are provisional. The visible pose-shape observations remain useful, but are not ordinary-loop support evidence. V6/v6b are withdrawn intermediates and were not graded. Actual-loop v3 grades are independent and remain current for animation.

Reviewed all14 corrected native/side v6c crops listed in `/tmp/hit-keyposes-v6c-evidence.json`, including wraith pre-bend baseline and .55/.94 poses for wraith, guardian and revenant. Fixture explicitly clears those transient states; still a controlled silhouette study.

| Corrected v6c scope | Score /10 | Judgment |
|---|---:|---|
| Revenant final silhouette | 8, static only | Cape now trails with the low body instead of projecting upward as a rigid flag. Equipment/body shape reads fallen. Normal-loop fall and ground support remain unverified. |
| Guardian final silhouette | 8, static only | Rolled chest, lowered head and asymmetric arm arrangement read as a collapsed mass rather than the prior active crouch. This does not accept source-model quality or dynamic weight. |
| Wraith cloth continuity / final death silhouette | 7.5 | Continuous bending preserves long garment panels and avoids the compressed short-skirt regression. However both raised hands and head still create an intentional reaching gesture. Preserve the cloth shape, slacken the free elbow/wrist below the chest and let the crown/head yield below the shoulder line. A failed staff brace can remain distinct; further global garment compression is unnecessary. |

Next evidence must include actual-loop impulse, support, slack and cleanup. **Complete impact acceptance remains failed.**


## CE — Actual-loop v7 partial Nova and veteran Ball: scoped body passes, two impact blockers

Durable video/telemetry: `docs/rpg-playtest/v15/combat/starter-two-casts-v7.{webm,json}` and `veteran-ball-two-casts-v7.{webm,json}`. Reviewed **all241 Nova frames** in `/tmp/partial-hit-v7-native/` (PTS10.40–20.00) and **all266 Ball frames** in `/tmp/partial-ball-v7-native/` (PTS10.40–21.00), every decoded frame at40ms spacing. Every frame was inspected in ordered context sheets; additional unscaled native actor strips cover Nova survivor35–76, first deaths43–78, second-cast heavy bodies152–199/wraith154–201, Ball first heavy48–89/wraith47–94 and all second-room actor groups166–224. Frame-level timing files preserve source PTS. This is ordered-frame analysis, not direct continuous-video playback or sub40ms certification.

Both recordings use ordinary requestAnimationFrame and real tutor answers without pose overrides or manual stepping. Telemetry shows no errors and134 retained programs. Nova first cast leaves four of six enemies alive, second clears; maximum visible7. Veteran Ball defeats both six/seven-enemy packs, maximum visible8; **this does not establish Ball wounded-survivor behavior**. Technical success/cadence earns no art score.

| Reviewed scope | Score /10 | Evidence and judgment |
|---|---:|---|
| Nova skeletal survivor impulse / foot catch / recovery | 8 | Native35–76 now separates initial shoulder recoil, support-foot adjustment, pelvis lowering and slower return to an injured guard. The plant is readable at this camera; it no longer relies only on the controlled side pose. This scope does not include the guardian's weaker initial response. |
| Skeleton supported fall, final slack and hold | 8 | First-cast bodies visibly lose support and extend into low floor silhouettes before holding. Second-room Ball166–224 corroborates contact-before-fall, full-size bodies and individual clearing. Source toy-like anatomy remains separately below gate. |
| Revenant fall / equipment settle | 8 | Weapon and shield descend with the torso, and the cape no longer stays raised as a flag. Ball's opposite room view shows the supported low body and delayed terminal settle clearly. The repeated source pose does not certify other attack directions or the incoming replacement rig. |
| Guardian final collapse / settling | 8 | Nova162–174 and Ball183–195 roll the chest into an asymmetric low mass before a full-size hold. This resolves the prior active-crouch terminal silhouette in actual rendered motion. |
| Guardian initial contact force | 7.5 | Ball room2 frames169–175 show bright local contact while chest/shoulders remain nearly stacked; the later collapse carries most of the event. Add a clearly visible shoulder impulse opposed by planted lower mass before the existing fall, approximately10% torso width at native scale as a staging target. No larger bloom or global shader change is requested. |
| Wraith death release / held pose | 7.5 | The continuous cloth bend is preserved and height loss is clear, but Nova170–194 and Ball75–94 retain a forward-reaching hand at chest height beneath the bowed head. The held silhouette still looks deliberately active. Verify the actual visible hand/rig endpoint and show failed brace or slack upper-body release; keep the accepted long cloth bend. More uniform robe compression is unnecessary. |
| Full-size hold, erosion and clear-to-travel ordering | 8, narrow scope | Defeated bodies hold and clear individually; the partial Nova does not advance; cleared rooms begin travel after the defeat sequence. This does not approve weak wraith pose, loot beam art or gateway visibility pop. |
| Ball wounded-survivor response | Unverified | Both veteran casts exceed pack HP. Need a legitimate higher-HP encounter/loadout with at least one survivor; no artificial damage fixture or starter rebalance solely for capture. |

**Complete combat-impact gate remains failed.** Preserve the accepted skeletal/guardian aftermath while resolving the two bounded response defects and the missing Ball survivor evidence. Existing compact static UI passes do not establish compact motion.


## CF — Equipped skeleton source v7: credible grasp, fit and silhouette still unfinished

All `/tmp/authored-skeleton-equipped-v7-{high,arm,native}.png` inspected. **Visible grasp8; opposite threatening claw8; shown articulation8 retained. Complete upper-body/equipment presentation7.** The fitted hand now reads as holding the hilt, and the opposite hand has a purposeful grasp. However the belt is a detached hoop around the pelvis and the near-vertical blade cuts through face/crown silhouette. Fit belt to actual pelvis and establish a coherent buckle/strap junction; rotate hand and weapon together outward so the blade becomes a distinct diagonal beside the head with wrist continuity. Do not rotate the blade independently inside the accepted grasp. Final harness surface/material and optimized/native export remain unverified; fitting precedes texture/weathering polish.


## CG — Equipped skeleton v8 shown source presentation passes

All `/tmp/authored-skeleton-equipped-v8-{high,arm,native}.png` inspected. **Shown equipped-source construction/silhouette8.** Belt now follows the pelvis with a readable closure; blade clears the face, leaving head, opposite claw and weapon as distinct native silhouettes. Existing grasp/wrist continuity is preserved. Proceed to neutral-rest optimized derivation, retaining anatomical pivots and separate runtime guard offsets.

This pass covers the depicted source views only. Rear harness continuation/hidden grip side, actual optimized material fidelity, game lighting, supported articulation and motion need independent evidence. Source pedigree and high polygon count are not reasons for the score. Global impact and art gates remain failed.
