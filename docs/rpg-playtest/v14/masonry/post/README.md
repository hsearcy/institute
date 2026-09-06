# Short masonry support

The separately proportioned three-course post passes independent source,
export and corrected bridge integration review at 8/10. It is installed as
`web/public/assets/rpg/masonry-post.glb` at 19 short-support placements.

| Evidence | Construction | Material fidelity |
| --- | --- | --- |
| [Source front](source-front.png), [back](source-back.png) | 8 | 8 |
| [First export front](rejected-export-front.png), [back](rejected-export-back.png) | 8 | 7.5 |
| [Corrected export front](export-front.png), [back](export-back.png) | 8 | 8 |
| [First torch integration](rejected-torch-lighting.png) | 8 | 6.5 |
| [Corrected warm bridge](native-room3-embercrypt.png), [cool bridge](native-room3-stormspire.png) | 8 | 8 |

The first export introduced black slits and reflective streaks on the thin
plinth ledges. Ray queries through the defective rendered pixels located
unbaked albedo and ORM texels on bevel UV strips narrower than one pixel.
Changing projection distance did not resolve this. The corrected atlas widens
those narrow chart dimensions before repacking and baking. No geometry or
source-material change was needed.

The candidate has 5,570 triangles, one material, three embedded 1K PBR maps and
3,496,548 bytes. Its source has 31,558 triangles. Reconstruction uses
`build_masonry_pier(..., short=True)` and
`prepare_bake(..., minimum_chart_pixels=4)`. The full-height pier keeps its
previous reviewed bake settings.

Two bridge point lights initially bleached their supporting capitals. The
corrected local sources sit at 3.1m with intensities 16/14, instead of 2.6m and
32/28. Four torch bowls move up .16m to rest on their caps. The global stone
material and bloom settings are unchanged.

The final native fixtures use 1440×1000 at device scale 1, the normal camera
elevation and 14 client-only enemies. The HUD remains the real room-zero saved
question, `5 + ? = 8`; these are architecture checks, not progression evidence.
All 63 combined full/short placements are unique, all 19 posts use the candidate
geometry, and repeated installation adds no duplicates. The real 39-enemy
encounter was restored after capture.

An additional reverse-angle inspection exposed buried plinths at the stepped
side aisles ([rejected contact](rejected-buried-bases.png), 6.5/10). Both tall and
short side-wall supports now sit on the actual .53m aisle surface. All 33 aisle
anchors were corrected; the other 30 floor-level placements retain their height.
Actual world-space mesh bounds are checked in the gameplay regression.

Corrected base contacts and ordinary-view integration score 8/10 independently:
[room 1 contact](base-contact-room1-side1.png),
[opposite bridge side](base-contact-room3-side-1.png),
[ordinary warm room](raised-room0-embercrypt.png), and
[ordinary cool bridge](raised-room3-stormspire.png). The evidence folder also
contains the other inspected room contacts. This resolves the exposed footing
defect; unrelated walls, arches, props, actors and effects remain below the
required quality or unverified. This asset pass does not accept the whole game.
