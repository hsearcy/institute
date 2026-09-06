# Candidate gameplay review, 2026-09-06

**The global art gate remains failed. No new independent scores are assigned here.**
All three existing agents report a service usage limit; the root agent completed
these local checks and observations. These are implementation evidence, not a
substitute for the requested independent 8/10 review.

## Skeleton v10: actual combat

Follow-up verification correction: these temporary harnesses referenced a then
undefined `world.traveling` property. Their `afterTravel` snapshot does not prove
arrival. Combat/room-state claims below remain valid; the corrected full-crossing
evidence and actual travel readout are documented in `../v17/README.md`.

`skeleton-v10/actual-two-casts.webm` records two actual Fire Nova answers with the
candidate GLB substituted by browser routing. The public skeleton is unchanged.
`manifest.json` identifies the exact candidate bytes. The source/export reviews
are in `../v15/characters/skeleton-shafts-v10/`.

- Model metadata selects 1.85 m height in DungeonWorld during both initial
  replacement and encounter creation. Only opted-in skeletons use this path.
- Three skeletons expose the authored guard hierarchy, including the Sword pivot.
  Their world wrapper adds neither legacy bob nor roll. Sampled lowest foot
  vertices were within 0.09 mm of the floor.
- First cast: `[12,6,8,8,10,6]` becomes `[6,0,2,2,4,0]`; four enemies survive.
  Second cast clears the room and advances to seven enemies in room two.
- Ten hit callbacks, at most seven visible enemies, no page/shader/request errors,
  and no WebGL context loss. Program count remains 144 throughout.
- During instrumented, recorded attacks, frame intervals have median 17.8 ms,
  95th percentile 22.5 ms, and maximum 92.5 ms (first cast, attack age 2.0993 s).
  This is not an isolated GPU benchmark or a performance approval.

Root observation: the richer anatomy remains thin at normal viewport scale.
Native silhouette, final arm relaxation, and motion still require independent
review. Do not transfer the source/export score to gameplay automatically.

## Frostfall v8: lossless material capture

`frostfall-v8/native.png` and `detail.png` show the same actual cast frozen after
render, followed by a camera-only enlargement in the game's existing lighting.
The simulation resumes to finish the cast. Authoritative HP changes from
`[12,6,8,8,10,6]` to `[3,0,0,0,1,0]`, with six contacts and no recorded errors.

The material uses the orthographic camera's view direction and a lower-world
reflection patch, replacing the prior overhead patch that missed visible facets.
One hull-intersected oblique interior plane replaces the overlapping sheets.
Root observation: visibility improves over v7, but broad pale faces still look
flat. Material quality remains unapproved; this capture does not regrade contact
or fracture choreography.

## Paving: controlled relief comparison

`paving/baseline.png`, `localized.png`, `relief-8mm.png`, and `relief-18mm.png`
share a frozen frame and unchanged camera/light. The latter two combine the
existing localized dampness candidate with tangent normals derived from the
source paving texture. No candidate is installed on the production floor.

The extraction closes small mortar gaps, removes isolated dark components, and
builds a ten-texel rounded shoulder. It wraps image operations at tile edges.
This fixes the earlier conversion of every dark fleck into a deep circular pit.
`bevel-v2-normal.png` deliberately exaggerates the view with 3x zoom and a low
grazing light; `bevel-v2-native.png` returns to normal framing and lighting.
Their height parameter is 35 mm, unlike the restrained final comparison.

Root observation: 35 mm still looks carved and trenched; 8–18 mm is more natural.
The visual gain is modest at native scale, and broad chipped stone edges remain
unfinished. Preserve these as candidates, not accepted world art.

## Checks and next work

- `bun test server shared scripts web/unit-tests`: 364 passed, zero failed.
- `bun run --cwd web build`: passed after fixing the typed-array annotation.
- Fourteen changed/new Blender Python sources parse successfully.
- Playtests use disposable local fixtures. No family save, learning algorithm,
  production database, or Ares deployment was changed.

Next: independent review of these exact captures when available; improve native
character silhouettes and remaining item models; resolve ice's broad flat faces;
continue world/FX/UI work against the original concept. The remaining 23-item
coverage and all-art quality requirement are not satisfied by this checkpoint.
