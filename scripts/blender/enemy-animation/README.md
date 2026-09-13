# Enemy skin preparation

The builder adds a small manual armature to the approved Tripo models. It keeps the source outer geometry, UVs, materials and embedded image bytes. It does not read the older procedural Skeleton model.

Reviewed rig exports are in `web/public/assets/rpg/animated/` and are installed in `web/public/assets/rpg/`. The approved static source models remain in `web/public/assets/rpg/candidates/*-tripo.glb`. The game and animation review page load the installed files.

## Build with bpy-dev Blender MCP

Run `build_rig.py` through `mcp__blender_bpy__execute_blender_code_for_cli`. Open `/tmp/institute-blender-mcp-smoke.blend` or a new empty Blender file. Set `KIND` to the enemy name and `REV` to a fresh revision number. Set `expected_output_blend` to the exact new checkpoint path that the script saves:

```python
KIND = 'skeleton'
REV = 18  # Use a fresh revision.
exec(compile(open('/home/hfsearcy/git/institute/scripts/blender/enemy-animation/build_rig.py').read(), 'build_rig.py', 'exec'))
```

Expected checkpoint: `docs/concepts/enemy-animation/skeleton/rig-v18.blend`. Each run writes the candidate GLB and `rig-metadata.json`. Use a fresh expected output checkpoint for each MCP call. This avoids live-scene synchronization.

Run `render_weights.py` with the same `KIND` and `REV` to import the exported GLB and render rest, 45-degree, rear and deep bend views. Its checkpoint is `bend-review-vREV.blend`. The deep bend test is a stress test; it is not the shipped motion.

Run `validate_prepared.py` through MCP with `OUTPUT` set to a fresh checkpoint path. It checks rest vertex positions, UVs, source triangle counts, normalized weights, influence limits and exact embedded image hashes. It writes `docs/concepts/enemy-animation/source-preservation.json`.

## Runtime contract

The glTF scene is Y-up, faces +Z, and has its feet at Y=0. Root extras include `animationRig: tripo-manual-v1`, `enemyKind`, `floorNormalized` and serialized `rigMetadata`. The metadata gives each bone's rest head, tail and parent in glTF coordinates.

- Pelvis → Spine → Chest → Head
- Chest → UpperArmL/R → ForearmL/R → HandL/R
- Pelvis → ThighL/R → ShinL/R → FootL/R
- Humanoids: HandR → WeaponR; Pelvis → Cloth
- Revenant: HandL → ShieldL

Use each bone's rest axes when applying model-space rotations. Foot heads are ankle pivots. The stone head and face belong to Chest so the large fused stones stay together; their Head and Spine bones have no direct surface weights, but the hierarchy still transfers Spine motion to Chest. Clone the skin and armature per actor. These GLBs contain no motion clips; the runtime supplies idle, hit and death motion.

## Motion limits

The source armor, cloth and stone bodies are fused surface meshes. Deep knee bends can stretch these surfaces. The stone models use a shallow forward fall. The Revenant also needs a shallow armored fall. Do not use the 110-degree stress test as a motion target. Broad seam cuts and added internal joint cores were tested and rejected; they are absent from the current candidates.

The Skeleton uses connected-surface regions to keep ribs with the torso, fingers with their arms, greaves with their legs, and the complete sword with its grip pivot. Small detached cloth pieces follow Cloth. Final motion approval comes from the separate runtime critic review, not from this build script.
