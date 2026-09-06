# Authored skeleton remnant source v15 — candidate

Adds 4,904 source triangles for one curved leather shoulder cap/lame, one open-sided forearm cuff, and two short cloth panels. Both bands fit the actual strengthened radius/ulna cross-section and meet cuff edges. Skull, ribs, central pelvis gap, elbow/wrist joints and opposite side remain exposed. Existing anatomy/grasp source8 is retained.

Independent complete remnant construction is 8. The v15 material pass applies lighter abrasion only at actual cap/cuff lips, darker protected overlaps, and quieter compressed straps; independent source material review is 8. No native presence, final export, motion or performance acceptance is implied. Public skeleton remains unchanged.

Reproduce source with `equipped_skeleton.build_candidate(root, native_shafts=True, native_remnants=True)`. The optional geometry/material builder is `scripts/blender/experiments/skeleton_remnants.py`. Derive the neutral low candidate with `bake_authored_enemy.prepare_native_candidate(root, candidate_directory, source_candidate=source, native_remnants=True)`, then run its separate albedo, normal and ORM stages and `finish`. This recipe preserves enlarged hand charts, isolated carpal normal projection and the separate Sword joint. Pack with the existing candidate optimizer and validate with `validate_authored_enemy.py` before exact reimport review.

`construction-cap-back-v13.png` and `construction-cuff-front-v14.png` record the accepted attachment geometry before the v15 material-only pass. The three unprefixed views show v15 materials. Final exact export must include rear coverage.
