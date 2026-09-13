# Skeleton concept model

This work uses the supplied skeleton reference sheet. It does not read or reuse the game's old skeleton mesh. The body, equipment, cloth, and rigid joint structure are newly authored. The skull uses a new CC0 anatomy source.

## Sources

- Reference: `docs/concepts/enemy-character-references/01-skeleton.png`.
- Skull: Vladimir Petkovic, Khronos `ScatteringSkull`, CC0. The source file, pinned commit, source README, and hash are in `../sources/scattering-skull/`.
- Steel: Amal Kumar, Poly Haven `rusty_metal_04`, CC0. The source maps and provenance are in `../sources/rusty-metal-04/`.
- No Tripo task was used. Its credential probe returned `TRIPO_API_KEY=MISSING`. The user requested the bpy-dev Blender MCP workflow.

## Build chain

The build ran through `mcp__blender_bpy__execute_blender_code_for_cli`, using Blender 5.2.1. Each call used a fresh output checkpoint. The MCP response supplies hashes for the input and output `.blend` files.

1. `build.py`: builds the body and equipment, fits the CC0 skull, simulates pinned cloth, adds compression folds, and assigns source materials. Output: `skeleton-concept-v15.blend`.
2. `atlas_stage_1.py`: creates a shared UV atlas and bakes base color through emission. This preserves the color of metallic surfaces.
3. `atlas_stage_2.py`: bakes tangent-space normals.
4. `atlas_stage_3.py`: bakes ambient occlusion.
5. `atlas_stage_4.py`: bakes roughness.
6. `atlas_stage_5.py`: bakes metallic values, including the steel map.
7. `fit_head.py` reduces the skull and eyes by 15% around the neck attachment. It preserves the body and UV data. Then `atlas_stage_6.py`: assigns the baked material, joins surfaces by joint, and adds the game's joint tags. No mesh reduction follows the bake.
8. `package.py`: writes JPEG base color and packed ambient-occlusion/roughness/metallic channels. Normal data stays PNG.
9. `revise_helmet_hands.py` opens `head-fit-v21.blend` and builds a fitted helmet with an arched brow and swept temple/nape edge. It rebuilds the hands with consistent palm and thumb directions. Output: `helmet-hands-v25.blend`.
10. `fit_sword.py` raises the sword 5.8 cm so the fingers hold the leather grip. Output: `details-source-v26.blend`.
11. `head_atlas.py`, with `STAGE=1` through 5 in separate calls, bakes the head and hands to a separate 2K atlas. Output checkpoints: `detail-v26-stage-1.blend` through `detail-v26-stage-5.blend`.
12. `head_finish.py` packages three replacement surfaces in `clean-details-v26.blend`. `merge_head.py` opens the accepted `skeleton-concept-v23.blend`, replaces only the head and hand surfaces, and raises the sword. It retains the body image bytes.
13. `pack_details.py` writes `skeleton-concept-v27.blend` and the final candidate GLB. Detail base color stays 2K; normal is 1K and packed ORM is 512.
14. `render.py` and `render_focus.py`: import the exported GLB and makes all review views. The source scene is not used as a substitute for export checks.

The separate bake calls keep each operation below the MCP CLI time limit. For another build, use fresh checkpoint output paths and set `ROOT` in the scripts to the checkout location. Keep the previous review output until comparison is complete.

Run the read-only contract check with:

```sh
rtk proxy python3 scripts/blender/validate_skeleton_candidate.py
```

## Review

The independent critic's records are in `docs/concepts/skeleton-model/reviews/`. They include failed versions and the specific requested changes. Final acceptance must refer to the final exported GLB and all views, including runtime poses.

The following faults found during the review are relevant to later work:

- Do not use a different planar texture direction on every bone face. It causes visible color changes at polygon edges. Bake continuous 3D texture coordinates instead.
- Do not simplify geometry after baking tangent-space normals. Keep thin skull surfaces and UV boundaries intact, then bake the final mesh.
- Set `AtlasUV` as the active render UV and pass it explicitly to each bake. The active edit UV alone is not sufficient. Keep all source texture vectors and source normal-map tangent bases on `SurfaceUV`.
- Give the skull enough atlas area. In the failed shared atlas it occupied only 0.44%, leaving most face polygons below one texel. A separate detail atlas removed the black triangle patches without changing skull geometry.
- Bake albedo through emission. A diffuse-color bake can make a metallic surface black. Restore the source shader before the other channel bakes.

Final candidate: `web/public/assets/rpg/candidates/skeleton-concept.glb`. Final editable file: `docs/concepts/skeleton-model/skeleton-concept-v27.blend`. The contract check passes with 95, 393 triangles, 18 meshes, 3 materials, 6 embedded images, and 7,594,076 bytes. The body image hash comparison is in `body-texture-comparison.json`; MCP checkpoint receipts are in `mcp-checkpoints.json`.

The critic's 8/10 pass is scoped to the user's final head, helmet, and hand corrections. It is not a claim that the whole model equals the Wraith.

The output remains a candidate asset. This build does not change the live game manifest.
