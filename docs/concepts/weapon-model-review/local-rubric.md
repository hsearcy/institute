# Local Blender weapon acceptance rule

The current task requires at least 6/10 against the supplied concept for each of the 23 items. Local Blender construction is the chosen method. A model can use the concept image for surface color. Its shape must still work as a complete three-dimensional object.

## Score

Use the same score as the baseline review. Do not award points for effort, source complexity, or the choice of tool.

| Part | Maximum | Minimum useful result |
|---|---:|---|
| Silhouette | 3 | The main blade curve, head, guard, or worn frame matches the concept. The item remains distinct from the others. |
| Proportions | 2 | Head, shaft, grip, guard, and end fitting have the correct relative sizes. Side thickness suits the object. |
| Material | 2 | Metal, leather, wood, and crystal are distinct. Light changes show surface form. Color is clear at game size. |
| Concept detail | 2 | The main identifying fittings are present. Examples include the Phoenix wings, Thunder Rod orb, and Skybreaker split. Small engraving can be simplified. |
| Construction | 1 | Parts meet correctly. The object has usable edges, a complete back, and stable surfaces from all views. |

A total of 6 is necessary. It is not sufficient if one of the failures below is present. Record each component score and the exact rejected feature. Do not round a score below 6 up to a pass.

## Failures that prevent acceptance

- A single image plane, two crossed image planes, or a thin cutout represents a part that must have volume.
- A blade has no usable edge thickness or bevel. A staff, branch, orb, grip, or bell becomes a flat slab in the side view.
- The front image contains a painted hole, fork, chain gap, or open frame that the geometry closes.
- A large part vanishes from the back, shows reversed text, or has stretched front artwork across its edge.
- A dark outline or the concept background remains around the model. Separate parts have visible gaps, floating fittings, or overlapping flickering faces.
- Painted highlights dominate so strongly that the model looks lit from a different direction from the player.
- A defining feature is absent or has the wrong form. More texture detail does not correct this.
- The native equipped view has a failed grip, incorrect orientation, severe body intersection, or a worn item in the wrong attachment.

These are visible failures, not a ban on simple geometry. A forged blade can be thin. Its bevel, thickness, guard, and grip must remain clear. Small engraved lines can remain in a texture. Large wings, hooks, sockets, straps, and open cages need geometry when their depth changes the outline or overlap.

## Surface projection checks

Check the projection on the exact exported GLB. The source render alone cannot pass the model.

1. Inspect front, side, back, and three-quarter views. Inspect the opposite three-quarter view if the item is asymmetric.
2. Check broad curved surfaces for stretched pixels. Check both sides of the blade and all sides of cylindrical shafts.
3. Check the edges separately. Use material color or a suitable edge texture instead of extending the entire front image across the thickness.
4. Check the back against the back concept. A complete plain rear surface can lose detail points; an incorrect or incomplete rear surface cannot pass construction.
5. Change the light direction or turn the object. Metal response must follow the geometry. Strong painted light and shadow must not substitute for surface relief.
6. Inspect a small native game view. Main shapes and material contrast must survive the reduction in size. Fine texture that disappears at this size cannot compensate for a weak shape.

## Evidence before installation

Keep the candidate out of production until review is complete. Record its file hash, item ID, score, defects, and evidence paths. Preserve failed candidate views so that the next pass can be compared with them.

The review has two parts. First, inspect the exact exported GLB with its actual textures from the required views. Second, inspect it on the player in native idle, cast, and cleave poses where applicable. Inspect worn items on all four appearances as required by `scripts/blender/items/README.md`.

The root agent owns the technical checks: all 23 IDs, unique geometry, bounds, grip and tip markers, embedded textures, triangle and material counts, and attachment rules. Technical success does not add visual points. Visual success does not replace technical checks.

Inferno remains a crown. Wardenheart remains a chest object. Thunderbell and Stormorbit remain worn objects. They must retain the existing equipment behavior and starter melee weapon.

## First candidate priorities

Correct the large baseline failures first. Restore the hooked and notched blades; restore the large staff heads relative to their shafts; model the main guards and sockets; give the four worn objects complete frames and backs. Then correct material contrast and add the main concept ornaments. Use the baseline per-item notes in `before-review.md` as the correction list.

This document defines the review method. It approves no candidate.
