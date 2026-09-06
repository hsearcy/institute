# Independent art review — v13 baseline

Reviewer: independent `art_critic` subagent, separate from implementation. Reviewed 2026-09-05. Baseline code commit: `ff25a45`; the new uncommitted wraith is explicitly identified below. This is a visual critique, not a learning-system or gameplay correctness certification.

**Acceptance gate: FAILED.** The user requires every art category to score at least 8/10, with 10 meaning AAA graphics and 1 meaning garbage. Current evidence does not support that claim. Overall presentation is approximately **4.5/10**; that number is descriptive and must never average away a failing asset or category. Some source illustrations reach 8, but current real-time graphics and their integration do not.

Scores are subjective art-direction judgments, grounded in the listed visible evidence. They are not precision measurements. 8 means cohesive, highly polished production art at the intended gameplay distance, with convincing materials, intentional silhouettes/composition, clean integration, and no conspicuous prototype geometry or presentation. Stylization can score 8–10; photorealism is not required. Being procedural, child-friendly, technically functional, or improved over the previous pass does not lower the bar.

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

Evidence: twelve `/tmp/rpg-v13-skills5-{ember,frost,storm}-{phone-partial,phone-lower-mastered,phone-detail,desktop-lower-mastered}.png` captures, plus previously reviewed unchanged desktop upper states.

**Desktop trees: 8/10 in all three schools. Phone trees: 8/10 in all three schools.** Mixed-case mobile labels in consistent slots resolve the prior overlap, stabilize rank placement and retain readable names. Upper partial-state and lower mastered captures now cover the full branch layouts and all deployed upgrade illustrations. Selected, learnable, locked and mastered states are visually distinguishable. No further tree redesign is needed for this visual gate.

Phone Details composition also scores 8, but the illustration rendering in the three supplied phone-detail captures remains **7.5/10 pending a sharpness check**: the Living Inferno, Twin Guardians and Overcharge pictures and inner bezels appear noticeably blurred while surrounding text/controls remain sharp. Matching desktop detail illustrations are crisp. Requested root to inspect settled styles/rendering for a transition, scaling or filtering artifact and supply a settled phone detail capture. If that blur persists in ordinary display, fix it; if it is a transient capture artifact, new settled evidence can close this point. This is a narrow remaining issue, not a request to rework the accepted tree layouts.

These scores apply to the skill-tree menu only. They do not promote the separate spellbook, inventory, HUD, victory, world or effects categories.

## Candidate review L — gathered wraith mantle

Evidence: `scripts/blender/previews/v2/wraith-gathered-clay-{front-back,isometric}.png`. **Shape-only 6/10, still unaccepted.** The narrower asymmetric mantle, bent torso axis and paired forearm bones move the silhouette materially closer to an authored creature. A conspicuous waist discontinuity, open rear neckline, stretched smooth cloth strips and crude skull/hand anatomy remain. Repairing the seam alone will not bridge the gap to 8.

The authorized search for an authored openly licensed sculpt foundation is a reasonable change in approach: repeated procedural adjustments have improved broad composition but are plateauing in anatomical and cloth specificity. Preserve the candidate as a pose/asymmetry reference rather than a production replacement. Any new foundation must be judged under neutral and gameplay lighting at the actual high camera; a detailed marketplace or studio render is not automatic acceptance. Public runtime asset remains unchanged.

## Candidate review M — settled larger phone skill details

Evidence: `/tmp/rpg-v13-skills6-{ember,frost,storm}-phone-detail.png`. **All three phone Details presentations: 8/10.** Increasing the illustration to 144 pixels makes the detailed art appreciable at the supplied phone resolution while preserving a coherent hierarchy. The previously observed small-image softness no longer materially weakens the presentation. The root reports no active transform/filter/animation and identical decoded PNG/lossless-WebP pixels; this is a presentation-size improvement, not a claim that source compression or a browser defect was fixed.

**The reviewed skill-menu visual category now meets 8 across desktop and phone trees, partial/mastered state fixtures, lower branches and detail panels.** Preserve these reviewed captures and verify the fresh application load uses the final CSS. This acceptance is limited to the skill menu; it does not transfer to HUD, spellbook, equipment, victory, world, models or complete spell effects.
