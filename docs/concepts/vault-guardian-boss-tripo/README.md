# Vault Guardian Boss: Tripo model

New model generated from the character concept sheet. Uses the same H3 process as the Revenant.

| Asset | Triangles | Bytes |
| --- | ---: | ---: |
| Preserved Tripo source | 1,919,738 | 59,284,208 |
| Browser copy | 94,999 | 7,728,136 |

Task `eb6d496f-3b97-44e8-8792-c7e936028097`. Credits: 60.
Model version `v3.1-20260211`, detailed geometry, detailed PBR textures, original-image texture alignment. No face limit on generation. No paid post-process tasks. Exact request and input hashes: `task.json`.

Separate front and rear images were generated from the original character sheet and visually checked before upload. Side inputs were omitted. Prompts and images are in `reference/`; required skill and API references are in `reference-ledger.json`. Credential probe: `TRIPO_API_KEY=SET`. The H3 image API has no positive text prompt; the design requirements were applied to the reference images.

Source: `source/vault-guardian-boss-pbr_model.glb`. Candidate: `../../../web/public/assets/rpg/candidates/vault-guardian-boss-tripo.glb`. Blender file: `vault-guardian-boss-browser.blend`.

`reduce_candidate.py` reduces the source with Blender collapse decimation to about 95,000 triangles, retaining UVs and supplied PBR textures. `texture-check.json` verifies all embedded texture byte hashes match the source. Source downloads are unchanged. `source-stats.json` and `candidate-stats.json` contain structure, bounds, and hashes.

These are static review models. They have no rig or animation clips. The live game models are unchanged. Use the existing GLTFLoader review page; the candidate has no external file dependencies. Browser captures are in `browser/`.

[Open the review page](http://127.0.0.1:5191/skeleton-review.html?model=vault-guardian-boss)

To resume downloads without a new generation, run `rtk proxy python3 docs/concepts/vault-guardian-boss-tripo/tripo_task.py status` from the repository root.

## Game integration

Installed at `web/public/assets/rpg/vault-guardian-boss.glb`. The game uses whole-model motion for this static asset. The boss has its own final-encounter roster entry. Integration evidence: `../tripo-game-integration/`.
