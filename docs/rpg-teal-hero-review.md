# Teal hero model review

Independent visual review of the player character requested on 2026-09-07. This review excludes the unchanged dungeon, enemy art, effects, and UI. A score of 10 means AAA character art; the requested acceptance threshold is 8/10. Concept quality does not establish model quality.

## Reference and baseline

The approved front/back concept uses a vivid teal hood, flowing cape and split tabard; bright silver armor with warm gold borders; brown leather belt, pouches, gloves and boots; and an approachable, younger face. Shortening the cape for gameplay readability is allowed.

Reference: `/home/houston/.codex/generated_images/01a071db-3c48-7bf1-8789-1318da3aa4bf/exec-4a397962-aed5-44b0-8471-d28d0b24139e.png`.

The existing model was inspected in `scripts/blender/previews/v2/authored-hero-packed-export-front-back.png`. Its armor construction is useful, but the dark red cloak, quilted skirt, heavy beard, muted metals and broad flat cape differ substantially from the approved direction. Baseline fit and presentation: **5.5/10**. This is a visual judgment, not a functional or animation failure.

## Acceptance criteria

- Teal fabric and gold/silver armor remain distinct and bright in the actual game view, without using emission to flatten the materials.
- The hood frames a readable, approachable face, with convincing eyes, hair, nose and mouth. Removing the beard must not expose unfinished geometry.
- The cape has visible drape and folds, a finished hem, and a silhouette that permits the legs and weapon to read during movement.
- Armor, leather and cloth have visibly different surface responses. Gold borders support the armor shapes instead of overwhelming the figure.
- Front, rear and game-camera views show coherent proportions and no obvious detached trim, intersections, missing surfaces or texture seams.
- The shipped asset retains its readable silhouette through at least idle, movement and a sword attack. Still renders alone cannot establish motion quality.

## Candidate 1 — 6/10, below acceptance

Inspected actual Blender renders `tmp/teal-hero/front-v1.png` and `tmp/teal-hero/back-v1.png`. The teal/silver/gold direction is apparent and removing the beard helps, but this model is not yet close enough to the approved character or the requested 8/10 standard.

The pale mint fabric is washed out beside the reference's rich blue-teal. The cape has some vertical folds and a finished hem, but its straight attachment below the exposed backplate reads as a rectangular hanging sheet. The tabard panels are similarly broad and rigid. All-gold pauldrons overpower the reference's silver centers and gold borders. The knee plates are visibly faceted, and the plain boots lack the reference's layered armor and straps. The face still reads as stern and middle-aged because of its long angular jaw, thin straight mouth, and little visible hair.

Highest-value revisions: richer teal with controlled highlights; a gathered shoulder/cowl transition and diagonal cape folds; narrower tapered tabard panels with cloth drape; silver pauldron centers; smooth shaped knee armor; gold hood and breastplate borders; and softer cheeks with visible hair and a friendlier mouth. Clean up the patchy chest surface so the steel reads as shaped armor instead of hammered foil.

No game-view or animation acceptance has been assessed for this candidate.

## Candidate 2 — 6.5/10, below acceptance

Inspected `tmp/teal-hero/front-v2.png` and `tmp/teal-hero/back-v2.png`. Silver shoulder centers, smoother knees, richer front teal, shorter rounded tabards and stronger cape folds improve the direction. The waist remains unresolved: garment tops obscure the belt and appear detached from it, with no clear central buckle or pouch silhouettes. The hood's gold border terminates in floating drawstring-like ends. The cape top projects into a raised arch behind one shoulder instead of resting on the body.

Next priorities are a belt over the garment tops, a readable gold buckle and leather pouches; attached hood edging; visible brown hair and a friendlier face; secondary cloth folds at the shoulder and waist; and a less satin-like fabric response. Teal trousers and layered boot/knee straps would tie the lower body to the concept. The cleaner breastplate still needs more fitted shaping and restrained gold side borders. The face continues to read as long, severe and middle-aged.

This score covers the supplied still renders only. No game-view or motion acceptance is implied.

## Candidate 3 — 6.5/10, below acceptance

Inspected `tmp/teal-hero/front-v3.png` and `tmp/teal-hero/back-v3.png`. The belt, pouch silhouettes, hair and teal trousers make the design more coherent, but the new pouches and oval buckle look primitive beside the authored armor. Hair visibly penetrates the hood. The rear cape shows isolated gold shapes around its upper-right and lower-middle regions that need checking for detached ornaments or intersections. The face remains severe, and the broad smooth cloth surfaces still lack the reference's natural layered drape.

The builder identified an overly low leather roughness and plans a material correction. That proposed fix is not yet reflected in this score. Pouch flap seams and believable strap attachments, a shaped square gold buckle, corrected hair placement, and attached cape decoration would improve the actual delivered mesh. Game-view and animation review remain pending.

## Candidate 4 — 7/10, below acceptance

Inspected `tmp/teal-hero/front-v4.png` and `tmp/teal-hero/back-v4.png`. Leather now reads as matte leather instead of shiny plastic. The open buckle, refined pouches, richer teal and less severe mouth are improvements; most stray cape ornament artifacts are gone.

Remaining high-impact defects are the rightmost hair tuft visibly crossing the hood rim onto its surface; a pinched, serrated-looking cape attachment beneath the hood; and comparatively unfinished torso and lower-body shapes. The breastplate is still a broad, inflated silver surface without the reference's fitted gold-edged construction. Smooth oval knee plates and plain boot shafts lack its layered straps and armor. The broad cape center needs secondary cloth structure beyond its large smooth waves.

This is an improved candidate, not an 8/10 acceptance. The exported game asset and movement have not yet been inspected.

## Packed export and first game captures — still below acceptance

Inspected actual packed-GLB renders `tmp/teal-hero/packed-front.png`, `tmp/teal-hero/packed-back.png`, and `tmp/teal-hero/packed-portrait.png`. **Exported model presentation: 7.5/10.** The fitted gold breastplate lines, boot bands and shoulder cowl improve the finish and the approved teal/silver/gold identity is clear. Remaining gaps are the smooth simplified cloth/cowl and knee shapes, modest rather than natural cloth layering, and a face that still reads older than the reference. This is substantially improved, but it does not meet the requested 8/10 threshold.

Also inspected actual browser captures `/tmp/teal-hero-gameplay/apprentice-wayfarer-native.png`, `inferno-wayfarer-fit.png`, and `inferno-wayfarer-front-diagnostic.png`. **Native game presentation: approximately 6.5–7/10.** The front diagnostic retains the color separation and fitted armor details. At the actual overhead camera, the hood/shoulder region becomes a very bright cyan-white patch and the cape loses much of its shape. The strongest next improvement is controlling the hero's local illumination/specular response so bright silver and teal retain their surface structure. Adding ornaments will not solve that presentation issue. The crown above the hood in the diagnostic is equipped Inferno gear according to the integration report, not unexplained mesh geometry.

The integration report at `/tmp/teal-hero-gameplay/report.json` records successful equip/save/reload checks, all four armor mounts, representative solved-math combat, and no application errors (one favicon 404 is listed separately). Root reports a packed asset of 64,169 triangles, approximately 6.55 MB, 19 bones and four animation clips, plus 27 passing focused tests and a passing production build. These technical checks do not establish visual acceptance. The critic inspected still captures, not a continuous animation recording.

## Final bounded lighting comparison — work in progress

Inspected actual local-game screenshots `tmp/teal-hero/game-light-32.png`, `game-light-18.png`, and `game-light-12.png`. Intensity 18 keeps the player readable and is a reasonable bounded adjustment, but the visible difference is modest. The bright shoulder hotspot and broad, comparatively flat cape remain at the native overhead scale. The comparison does not establish that lighting alone resolves the presentation gap.

Final scores for the reviewed revision:

- **Exported character model: 7.5/10.** Clear concept direction and improved construction, but still short of the reference's cloth drape, layered anatomy and approachable facial finish.
- **Actual native game presentation at hero-light intensity 18: 7/10.** Bright and identifiable, but shoulder highlights and weak cloth structure reduce the visible finish.
- **Critic's 8/10 threshold: not met.** No unchanged world, enemy, UI or spell-effect score is implied.

**User decision, 2026-09-07:** The user accepted the current model for use ("ok that's good") and requested the next tutorial task. This supersedes further model iteration for this session. User acceptance does not change the independent 7.5/10 model and 7/10 native-game scores or imply that the earlier 8/10 critical threshold was reached.

The remaining gap is principally natural cloth/cowl structure and surface detail that survives the overhead camera, with more convincing knee/boot construction and facial appeal. These scores should not be rounded up to acceptance.
