# Portal assembly study — candidate remains below the art gate

The uniform-scale portal and adjoining masonry improve the detached arch/duplicate footing problem, but this study is **not accepted or installed**. Independent review: structure/integration 7, calibrated wall materials 7; whole-world 6.5 remains unchanged. The shown portal itself previously scored 7.5 at this camera. The original user requirement is 8+ for every art category, so these scores do not authorize promotion.

`before.png` and `native.png` show the same frozen local frame at 1440×900, with the production camera, light settings and actor positions. `detail.png` moves the camera and increases zoom for diagnosis; it is not gameplay framing. `flat-control.png` removes the wall's textures to expose geometry. All browser experiments used separate disposable profiles on existing Chromium 9222, API 8959/Vite 5249; the persistent child's preview was not reset. Session 59581 completed successfully with no browser errors. All disposable browser contexts and servers were closed.

## What this experiment establishes

- Replaced six old main arches and twelve flanking piers; removed twelve old wall/approach-step batches, five thin back-wall niches and seven overlapping ruined-wall props. Existing content was removed only inside this disposable browser context.
- The real portal GLB is uniformly scaled. Minimum theoretical floor passage from source plinth dimensions is 2.826 m in the shortest room. Actual route animation/collision clearance still requires verification; these dimensions are not a traversal pass.
- New wall courses follow the outside of the arch; a smaller copy forms a deep blind niche. The central floor remains level.
- V3/v4 exposed overlapping bevel shoulders and coping widths. V4's plain-material control verifies their correction; it also exposed stepped coping and alternating return ends. V5 aligns the broad returns and clips the crowns, but the resulting fracture profile is still extruded unchanged through depth and remains unconvincing.
- Reusing the portal's rock-face-03 material family did not automatically match its baked appearance. An audit sampled 66 front-facing jamb triangles through the actual GLB UVs: median linear RGB(.147,.133,.112), versus(.258,.235,.212) for the new plain material map. V5 uses the measured component ratios(.5695,.5665,.5275), improving the independent material score from 6 to 7. This is a material calibration, not a light or exposure change. Localized shelter/base history remains incomplete.

The next source study is `scripts/blender/experiments/portal_abutments.py`: preserve the reviewed arch and its actual material graphs, construct adjoining bonded courses, and cut a few real oblique fracture planes across the wall's depth. No facade candidate has been added to `web/public` or loaded by the production game.

## Evidence limits and reproduction

The FPS field in `evidence.json` is invalid as a performance measure: animation was deliberately stopped for matched screenshots. This study does not establish frame rate, shadow-fade traversal, other rooms/biomes, transparent spell behavior, learning compatibility, or complete-world visual acceptance. The geometry recipe creates all six rooms, but only room 0 was visually inspected here. The last diagnostic retains UI that obscures part of the base; later actual traversal proof must cover the whole opening.

`manifest.json` records exact artifact bytes and hashes. `recipe/` contains exact local experiment snapshots, including the Vite loader that tags old wall/step batches in a served copy of DungeonWorld without editing its file. To reproduce on this workstation, restore each snapshot to its original `source` path from the manifest, restore the portal at `tmp/rpg-portal-bake-v7/worn-pier-review.glb`, retain the reviewed rock-face-03 source maps, then run:

```sh
QA_LABEL=portal-facade-v5-recheck MATCHED_STONE=1 FLAT_CONTROL=1 node tmp/rpg-portal-facade-proof.mjs
```

The scripts have local absolute paths and require the existing 9222 browser and free 8959/5249 ports. Use a new label to avoid reusing a disposable database. Node syntax checks passed. The scripts were exercised in Chromium; no production code was changed by this study.
