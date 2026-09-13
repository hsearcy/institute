# Revenant: Tripo source model

The first Tripo generation succeeded. This is a new model made from the approved
Revenant concept. The current game model is not an input. The live game asset is
not changed.

| Asset | Triangles | File size | Purpose |
| --- | ---: | ---: | --- |
| `source/revenant-pbr_model.glb` | 1,896,848 | 57,852,512 bytes | Unchanged Tripo source |
| `../../../web/public/assets/rpg/candidates/revenant-tripo.glb` | 95,000 | 6,644,900 bytes | Browser review candidate |

The source and candidate each have one mesh and one PBR material. The source
has three embedded 4096 by 4096 textures. The candidate keeps these textures.
Neither model has a rig or animation clips. The source has no external file
dependencies. Exact counts and hashes are in `source-stats.json` and
`candidate-stats.json`.

Task: `2a61a568-b810-4bf8-8b94-5b0c8f91edab`. The API reports 60 credits.
Provider preview: `source/revenant-rendered_image.webp`.

The browser candidate was reduced with Blender collapse decimation through
bpy MCP. `reduce_candidate.py` records this process. UVs and supplied textures
are retained. The candidate faces glTF +Z; the source faces +X. The final saved
Blender checkpoint is `revenant-front.blend`. `revenant-browser.blend` is the
first reduced checkpoint, before the direction correction. No second Tripo
generation or paid post-process task was used.

The final GLB was loaded in the browser review page without runtime errors.
Front, side, back, and three-quarter views are saved under `browser/`. The front
view is now correct. The armor layers, red cloth, sword, and broken shield remain
clear after reduction. `texture-check.json` confirms that all three embedded
texture files have the same byte hashes as the source textures. A source hash
check also confirmed that the downloaded source GLB did not change.

Open [the local model viewer](http://127.0.0.1:5191/skeleton-review.html?model=revenant)
while the development server is running.

## Reference and method

- Original: `../enemy-character-references/02-revenant.png`.
- Original design prompt: the `revenant` entry in `../enemy-character-references/prompts.json`.
- Input files: `reference/front.png` and `reference/back.png`.
- The built-in image tool made each input from the original sheet. These are
  generated extractions, not exact pixel crops. Both passed a visual check before
  upload. Each image has one complete figure and no text.
- The front and rear inputs keep the sword in the right hand and the shield on
  the left arm. They show damaged charcoal iron armor, dull bronze edges, bone
  elbows, a narrow teal visor, red cloth, a broken kite shield, and a chipped sword.
- H3 accepts a front, left, back, right list with absent side views. The original
  side view is angled. It was omitted to avoid an incorrect camera constraint.
- The image API has no documented positive text prompt. Design instructions
  were used to prepare the inputs; unsupported prompt fields were not sent.
- Detailed geometry and detailed PBR textures were selected. No face limit or
  low-poly step was applied to the source generation. Image autofix is off to
  keep the checked references. Automatic scale and image alignment are on.
- `task.json` records the exact request settings, input hashes, and task ID.
  `status.json` records the latest API state and downloaded file hashes. Neither
  file contains a key or temporary download URL.

## Reference ledger

| Read | Reference | Purpose |
| --- | --- | --- |
| Yes | `threejs-3d-generator/SKILL.md` | Generation workflow |
| Yes | `threejs-3d-generator/references/api-notes.md` | Request and download rules |
| Yes | `threejs-3d-generator/references/threejs-integration.md` | GLB checks |
| Yes | `imagegen/SKILL.md` | Prepare separate reference images |
| Yes | [Official H3 multi-view API](https://docs.tripo3d.ai/model-generation/multiview-to-model-v3-0-v3-1.html) | View order and supported settings |
| Yes | [Official H3 image API](https://docs.tripo3d.ai/model-generation/image-to-model-v3-0-v3-1.html) | Compare the input methods |
| No, not required | `threejs-3d-generator/references/image-generator-workflows.md` | Gemini image generator was not used |

Credential probe result: `TRIPO_API_KEY=SET`.

## Runtime limits

This is a static candidate. The game uses named rigid joints through
`EnemyAnimator`; an ordinary Tripo mesh has no such joint contract. A later
articulation and performance pass is required before live game use. No rig,
animation, or model conversion API task is part of this request.

## Resume

From the repository root:

```sh
rtk proxy python3 docs/concepts/revenant-tripo/tripo_task.py status
```

This reads the existing task and downloads its output after success. It does not
start another generation. The API key is read from `.env` in memory.

## Game integration

Installed at `web/public/assets/rpg/revenant.glb`. The game uses whole-model motion for this static asset. The boss has its own final-encounter roster entry. Integration evidence: `../tripo-game-integration/`.
