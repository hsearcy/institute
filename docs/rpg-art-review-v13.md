# Independent art review — v13 current gate and baseline history

Reviewer: independent `art_critic` subagent, separate from implementation. Reviewed 2026-09-05. Baseline code commit: `ff25a45`; the new uncommitted wraith is explicitly identified below. This is a visual critique, not a learning-system or gameplay correctness certification.

**Acceptance gate: FAILED.** The user requires every art category to score at least 8/10, with 10 meaning AAA graphics and 1 meaning garbage. Current evidence does not support that claim. The initial baseline presentation was approximately **4.5/10**. That historical descriptive number is not a current aggregate score and must never average away a failing asset or category. The ledger below records current scoped acceptance; historical scores remain below for traceability.

Scores are subjective art-direction judgments, grounded in the listed visible evidence. They are not precision measurements. 8 means cohesive, highly polished production art at the intended gameplay distance, with convincing materials, intentional silhouettes/composition, clean integration, and no conspicuous prototype geometry or presentation. Stylization can score 8–10; photorealism is not required. Being procedural, child-friendly, technically functional, or improved over the previous pass does not lower the bar.

## Current acceptance ledger

**Global gate: FAILED. No complete game-wide art or animation acceptance.** A score applies only to the specified evidence and scope. Source/static/layout passes do not transfer to runtime readability, animation, other assets or other viewports.

| Accepted scope | Score | Latest reviewed evidence |
|---|---:|---|
| Skill menu, desktop and phone; all three schools, partial/mastered branches and details | 8 | `docs/rpg-playtest/v13/rpg-v13-skills{4,5,6}-*.png`; `phone-detail-fresh-load.png` |
| Grimoire static presentation, desktop/phone, all schools, viewing/selected/locked/tracked states | 8 | `docs/rpg-playtest/v13/grimoire/rpg-grimoire-v2-*.png` |
| Victory static presentation, desktop/phone, new/duplicate/rare/XP-only, low-level/no-point states | 8 | `/tmp/rpg-treasure-v1-*.png`; `/tmp/rpg-treasure-v2-{rare-desktop,no-item-desktop,phone}.png` |
| Equipment relic section static states, desktop/phone; all 23 desktop crops, shown phone upper/lower rows, unowned/rare/legendary equipped states | 8 | `docs/rpg-playtest/v13/equipment/rpg-equipment-v3-{fresh-desktop,phone-top,phone-lower,phone-locked,legendary-desktop}.png` |
| Revised short-landscape HUD layout/hierarchy only | 8 | `/tmp/rpg-landscape-v4-open.png`; `/tmp/rpg-ball-v5-ordinary-landscape-{contact,latecontact}.png` |
| Compact small-landscape static HUD presentation at568×320 and640×360 | 8 | `/tmp/rpg-landscape-compact-v2-{568,640}.png`; readable current-spell name, simplified orbs, no XP microtext |
| Ball Lightning main orb visible form at full-quality desktop, single and orbit variants | 8 | `docs/rpg-playtest/v13/rpg-ball-v4-{single-0_7,orbit-1_1}.png`; `/tmp/rpg-ball-v5-ordinary-desktop-contact.png` |
| Ball Lightning fallback orb form and revised landscape orbit context | 8 | `/tmp/rpg-ball-v6-orbit-{fallback,desktop,landscape}-contact.png`; fallback late-contact confirms recovered strand separation |
| Ball Lightning portrait four-orb framing/form at 390×844 and 360×780 | 8 | `/tmp/rpg-ball-v7-safe-orbit-{portrait,portrait-small}-{contact,latecontact}.png`; lower orbitals remain above the question panel |
| Ball Lightning full-scale erosion/dissolution material treatment in reviewed desktop phases | 8 | `/tmp/rpg-ball-v5-ordinary-desktop-{latecontact,fade}.png` |
| Refined lich/wraith source and final GLB static appearance; depicted moderate rigid pose | 8 | `scripts/blender/previews/v2/lich-refined-study-{front-back,high-view}.png`; `lich-rigid-pose-comparison.png`; `wraith-cc0-exported-game-angle.png` |
| Final wraith runtime static readability at1.85 in reviewed Embercrypt/Stormspire camera | 8 | `/tmp/rpg-wraith-midtone-v2-{embercrypt,stormspire}-185.png`; stronger localized cloth curve restores broad panel separation |
| Ball Lightning depicted static settled death poses | 8 | `/tmp/rpg-electric-ground-v8-grounded-{1.75,2.2}.png`; asymmetric knee/brace variants retain full-size support before erosion |
| Spell/relic/skill illustration source art | 8 | `web/public/assets/rpg/ui/{spells-v2,relics-v2,skills-v3}.png`, `wildfire-v3.png`; deployment acceptance only where reviewed separately above |

| Failing or unverified scope | Current grade/status | Main remaining gap / evidence |
|---|---:|---|
| Hero variants, skeleton, revenant, guardian/boss | 3.5–5 baseline; no accepted replacement | Authored anatomy, armor/cloth construction, convincing silhouettes and materials still needed. Individual grades below. |
| World, architecture, floor, lighting, landmarks and props | 4–6 baseline; no accepted replacement | Repeated blocky structures, weak authored material/prop composition. Individual grades below. |
| Ball Lightning complete effect | Not accepted | Reviewed orb, dissolve, static death-pose and viewport/fallback components all reach8; continuous-motion art review remains unresolved. Unrecorded actual-HUD stress cadence is much better than recorded footage; see latest evidence below. |
| Other fourteen spells, shared non-Ball impacts/deaths and loot effects | 3–5 baseline or unverified | Every family has its own unresolved form/contact/temporal gaps; see individual table below. No whole-spell temporal acceptance. |
| Desktop/portrait combat HUD, notifications | Below gate / full review pending | Safe portrait orbit framing passes separately; accepted landscape presentation does not approve all other HUD layouts or notifications. |
| Armor selection section | 5 historical; still below gate in current partial view | `docs/rpg-playtest/v13/equipment/rpg-equipment-v3-phone-lower.png`: generic default shield and simplistic character thumbnails remain; accepted relic section does not approve armor. |
| Animation, reveal transitions, character locomotion/casting/death, performance modes | Unverified for full acceptance | Normal Ball clip sampled at 1/8 FPS shows ordered progression, not continuous playback/smoothness approval. Recorded rAF timing is separate from visual quality and encoded video FPS. |
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

New implementer-reported actual-HUD unrecorded stress evidence `/tmp/rpg-ball-v7-hud-unrecorded-evidence.json`:48-enemy four-orb boss cast to victory, medianrAF16.7ms/p9533.4ms and about49.1FPS mean, compared with roughly47FPS isolated unrecorded. This supports the conclusion that the earlier14.8FPS recording was not representative in the controlled follow-up. It is cadence evidence, not a GPU-cost or animation-art score.


## Candidate review X — equipment relic-state acceptance

Evidence `docs/rpg-playtest/v13/equipment/rpg-equipment-v3-{fresh-desktop,phone-top,phone-lower,phone-locked,legendary-desktop}.png`: **reviewed static relic section8/10 on desktop and phone**. Fresh desktop, upper/lower phone collection, unowned/locked state with rare equipped detail and legendary Phoenix detail retain coherent framing, readable labels and clear equipped identity. All23 deployed collection illustrations are covered on desktop; shown phone crops remain consistent. These client-only state fixtures do not prove equip/reward behavior or animation.

The separate armor section remains below gate: its generic default shield and simplistic character thumbnails are visible unchanged at the bottom of the phone-lower image. Relic-section acceptance must not be presented as complete equipment/armor-screen acceptance.


## Candidate review Y — smallest landscape HUD

Evidence `/tmp/rpg-landscape-small-568.png` at568×320 and `rpg-landscape-small-640.png` at640×360. **Layout hierarchy remains8**: side controls preserve a clear play rectangle. **Complete HUD typography/detail remains about7 at568 and7.5 at640**. Spell captions, skill-tree label and XP detail become microtext, and ornate orb detail compresses into visual noise. A compact presentation tier should simplify orb ornament, show readable short spell labels around10–12px or a single readable current-spell name, and omit nonessential XP microdetail while retaining the bar/level. Control fit does not close this visual gap. The39-actor world crowding and old public wraith retain their separate model/world grades.

Accepted equipment relic-state evidence is now preserved under `docs/rpg-playtest/v13/equipment/` with the v3 basenames and `evidence.json` fixture provenance. References above use the durable paths. Functional test counts do not affect these visual scores.


## Candidate review Z — static wraith integration and asymmetric electrical poses

Evidence `/tmp/rpg-wraith-midtone-v2-{embercrypt,stormspire}-185.png`: **runtime wraith static readability8/10 at1.85 in these native-camera views**. Broad skirt panels now separate from deep recesses without whitening crown/bone/trim. This closes the previously weak material-value integration in the reviewed conditions. Preserve the stronger localized cloth candidate. Source/export/moderate-pose passes remain intact; continuous motion and other camera/light conditions remain separately unverified.

Evidence `/tmp/rpg-electric-ground-v8-grounded-{1.75,2.2}.png`: **depicted static electrical death-pose presentation8/10**. The lower-knee and hand/shield brace variants break the repeated bilateral-squat pattern, preserve connected full-size bodies and support the accepted restrained erosion. No further static redesign is requested. Normal-loop release/settle/fade timing remains the next independent gate. This does not approve the underlying low-scoring skeleton/revenant/guardian model art or other spells' shared deaths.


### Exact cloth-v2 export and final Ball sampled timing

Exact final reimport `scripts/blender/previews/v2/wraith-cc0-cloth-v2-exported-game-angle.png` confirms **8/10 static/export fidelity** for the same stronger-cloth candidate accepted in runtime views. Relief, trim and broad value grouping remain coherent. No further material changes are requested.

Final normal-loop recording `/tmp/rpg-ball-v8-final-motion-motion/page@6a8c075e3df3fd54252ba445a55a7d8c.webm` was sampled at1FPS overview and8FPS over12.5–15.5seconds, producing `/tmp/rpg-ball-v8-motion-overview.png` and `rpg-ball-v8-motion-cast-sequence.png`. Release, travel/contact, supported collapse and erosion form a coherent progression; staged target loss reads and no miniature shrink, white victim flare or abrupt room-cut residue appears in the samples. No further timing redesign is indicated by this evidence. **Direct continuous playback/smoothness remains unverified**, so this does not grant complete motion acceptance. Recorded cadence approximately28.5FPS with33.3ms median/83.3ms p95 remains separate from the unrecorded actual-HUD49FPS result.


## Candidate review AA — compact small-landscape acceptance

Evidence `/tmp/rpg-landscape-compact-v2-{568,640}.png`: **static HUD presentation8/10 at568×320 and640×360**. A readable current-spell name, simplified shaded orbs and retained progress bar resolve the previous microtext/compressed-ornament problem while preserving coherent side controls and an unobscured play rectangle. Preserve this compact tier. World/model quality, other HUD layouts and continuous motion remain separate. Global gate remains FAILED.
