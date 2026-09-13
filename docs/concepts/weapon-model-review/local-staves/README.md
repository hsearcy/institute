# Local staff candidates

Six concept-derived models: cinderwand, moonstaff, phoenix, wintercrown, tempest, winterbranch.

Run `prepare_staves.py` and `pad_albedo.py` for these six IDs with the local image-processing Python environment. Then run `scripts/blender/weapon-local/staves.py` through bpy-dev Blender MCP in a background checkpoint. The recipe reads the original crop records and the shared trace JSON. It creates one closed mesh per item, with rounded cross-sections based on the silhouette distance field. The original concept provides the surface color. No provider model or old model geometry is used.

Editable sources and per-item build records are under `../local/{id}/`. Candidate GLBs are under `web/public/assets/rpg/items/candidates/`. `structural.json` records validated file hashes. `browser-v3/` contains four final exact-export views per item. `browser/` preserves the failed first set; `browser-v2/` preserves the edge correction before grip-marker changes. The browser score labels in these first captures are the old-model scores, not candidate scores.

Limits: front and back share the projected concept color. Side surfaces inherit edge colors. These are solid models, but they do not reconstruct unseen concept details. Independent visual review is required before installation.
