# Wraith development studies and review candidates

The accepted production model is now built by `../detailed/wraith_cc0.py`.
It uses the audited CC0 lich foundation documented in `../sources/cc0-lich`.
The runtime GLB and matching production atlas sources are outside this directory.

Independent review accepted the source appearance, moderate reaching pose,
optimized GLB reimport, and native-camera Embercrypt/Stormspire readability at
8/10. The final readable-cloth revision is retained in production; the game's
other art and unreviewed continuous motion are separate acceptance questions.

## Rejected foundations

`previous_layered_wraith.py` preserves the former canonical builder (5/10).
`wraith_sentinel.py` and `cc0_anatomy.py` preserve experimental cloth/anatomy work.
They are not imported by the full build and are never automatic fallbacks.

The procedural studies progressed from disconnected garments (4.5/10), through
continuous waist/collar experiments (5/10), narrower simulated mantle (5.5/10),
asymmetric gathered drape (6/10), to authored Blender Studio bones (6.5/10).
The anatomy improved, but the segmented garment never reached the required gate.
Rejected/obsolete PNG evidence is archived locally in ignored `rejected-previews`;
large anatomy caches are also ignored and reproducibly fetched from their source.

## Accepted foundation and export studies

`lich_foundation.py` preserves the baseline CC0 adaptation, initially 7.5/10 and
then 8/10 after coherent normals and restrained material response. Accepted
front/back, elevated and moderate-pose previews remain under `../previews/v2`.

`bake_lich_candidate.py` and `optimize_lich_candidate.py` produce the temporary
review GLB with authored UVs. `bake_wraith_cloth_lift.py` bakes a localized Body/Cape
albedo adjustment. `pack_wraith_cloth_lift.py` replaces that one texture payload
and asserts every other binary buffer view remains byte-identical. The first
lift stayed at7.5 runtime; the stronger revision reached8 in both reviewed rooms.

`finalize_wraith.py` records the one-time accepted installation, including the
canonical UV/atlas/specular bake hooks and seven-joint validator. It is deliberately
not called by any build and refuses to apply twice. Regular rebuilds use the
canonical source directly. Temporary review GLBs and raw bake exports are ignored;
the shipped public GLB embeds all required textures and needs no external service.

All Blender work uses a new scene and the exact MCP user prompt:
`use blender mcp to create high quality models.`

## Accepted authored default hero

The CC0 hooded-warrior source, controlled metal response, equipped cast/strike
assembly, corrected v13 glove contact, raw GLB and packed GLB each passed the
independent 8/10 review at the depicted angles. These scoped static passes do not
approve continuous motion or runtime readability. Actual native-camera warm/cool
static captures also passed 8. Ordered motion exposed an inherited Euler-axis
heading reversal and a legacy Cleave wrapper slide; the corrected native cast
and planted Cleave sequences now pass 8. Capped distance-driven locomotion now passes8 on visible level ground and
arrival; rapid-answer local encounter staging also passes8. The final offset
doorway route/level passage also passed 8. The accepted packed default is now
public; the three older armor variants remain unchanged.

`build_authored_hero_candidate.py::build_authored_hero_candidate(root)` composes
the isolated source reconstruction, 19-bone rig, four sampled clips, UV-preserving
material conversion, export, texture packing and exact contract validation. The complete
entrypoint has also been executed into a separate verification directory: all
non-image buffer payloads are byte-identical and all 27 texture images are
pixel-identical to the reviewed packed export (JSON names differ by 72 bytes). It writes only ignored `exports/hero`
artifacts and restores the previous Blender scene. Missing source caches fail
with the provenance fetch instructions; there is no rejected-source fallback.

The packed candidate has 62,593 triangles, 19 joints, 27 embedded images and is
8,294,568 bytes. `idle` lasts 3.2s, `walk`0.8s, and `cast`/`cleave` 1.1s; each begins
at 0. Gather and release are authored at 0.08s/0.18s, with `CastOrigin` parented to
`hand.L`. Horizontal travel belongs to the game. The standalone candidate
validator checks exact bone hierarchy, weights, embedded textures and clip times;
the numerical motion report complements, but never replaces, visual review.

Accepted source/contact/full-pose and raw/packed reimport evidence remains under
`../previews/v2`. Earlier failed grip studies are historical evidence, not the
current source state. Provenance and ignored cache restoration are documented in
`../sources/cc0-hooded-warrior`.

The final cornea material discards its clear outer shell, preserving the separate
textured iris without `KHR_materials_transmission`. A same-world runtime A/B
measured26.57ms with transmission versus12.11ms without it; removing the redundant
scene pass reduced319 draws/1.467M triangles to181 draws/734k triangles. Opaque
cornea replacement failed portrait review because it hid the gaze; the final
alpha-discarded shell restored portrait8. No geometry, atlas, skin or animation
payload changed. The canonical material conversion and packer both apply this
rule, and validation rejects transmission or an opaque corneal shell.

Actual packed-GLB `appearances/wayfarer.png` passed independent source portrait8.
Native ordered recordings, frame timing and scoped acceptance notes are retained
in `docs/rpg-playtest/v14/hero`. These are not final device-performance benchmarks.

## Masonry source and review workflow

The accepted full-height pier is now canonical in
`../detailed/masonry_pier.py::build_masonry_pier(repo_root)` and
`../detailed/rebuild_masonry_pier.py`. Source, optimized front/back export and
native room0/1 warm/cool placements scored 8/10. The separate three-course post
now also passes source/export and corrected native bridge integration at 8.
Its canonical call uses `short=True`; its bake uses `minimum_chart_pixels=4`
to prevent unbaked subpixel bevel strips. Nineteen short supports use the new
asset. Obscured wall footings remain a review coverage limit.

`../detailed/bake_masonry.py` joins only optimized destination meshes. Separate
nonadjacent projection batches preserve source coordinates and prevent rays from
hitting neighboring courses. The first all-source bake failed6.5 because it
introduced black joint outlines. The corrected full-height model contains11,804
triangles with three embedded1K PBR maps and one material (3,181,224 bytes).

Staged `prepare_bake`, `bake_channel` and `finish_bake` calls keep each MCP step
observable. Retain state/functions in `bpy.app.driver_namespace` between calls;
MCP call-local variables do not persist. Restore the previous Blender scene when
handing it to another agent. `preview_masonry_study.py` provides matching studio
views. Intermediate exports belong in a temporary directory; the canonical
rebuild installs only the accepted full-height variant into public assets.

## Authored enemy anatomy studies (not production)

`authored_enemies.py` imports the pinned Blender Studio CC0 anatomy cache into
separate review scenes. The authored rib cage, pelvis, paired limb bones and
hands passed independent foundation review at8; this does not approve an enemy
or replace either public skeleton/revenant asset. Guard v6 reached8 for shown
elbow articulation; its guard intent remained7. The equipped v8 revision below
is the accepted source successor. Packed v8 now passes shown export construction
and material fidelity at8; native runtime review and public promotion are pending.

`render_guard_review(repo_root, prefix, window_id, detail=True)` rebuilds from the
cache, writes high-angle/native-size/close-arm PNGs and pose metadata, and always
restores the caller's active scene. `/tmp/blender-assets-window.json` records its
busy/idle state and completion. These static studies are separate from native
runtime rig, material and motion acceptance. Restore a missing upstream cache
with `python scripts/blender/sources/blender-studio/fetch.py`.

`equipped_skeleton.py` now builds the reviewed v8 equipped source. Its fitted
harness, blade/head separation, grasp and shown articulation passed source8.
This supersedes the earlier guard-only assessment above without granting a
runtime pass. The warrior hilt uses the pinned CC0 source under
`../sources/cc0-hooded-warrior`; the skeleton cache remains Blender Studio CC0.

The staged candidate recipe is durable in `bake_authored_enemy.py`. Through
Blender MCP, with sole scene ownership:

```python
import sys, bpy
from pathlib import Path
root = Path('/home/houston/git/institute')
sys.path.insert(0, str(root / 'scripts/blender/experiments'))
import bake_authored_enemy as baker
source = baker.prepare(root, root / 'scripts/blender/experiments/exports/skeleton-source', size=1024)
joined = baker.joined_source_comparison(source, root / 'scripts/blender/experiments/exports/skeleton-joined')
baker.separate_held_weapon(joined)
expanded = baker.enlarged_hand_chart_comparison(joined, root / 'scripts/blender/experiments/exports/skeleton-hand-charts')
state = baker.isolated_carpal_normal_control(expanded, root / 'scripts/blender/experiments/exports/skeleton-candidate')
state['exclude_bone_micrograin'] = True
bpy.app.driver_namespace['authored_enemy_bake'] = (baker, state)
```

Call `baker.bake(state, channel, batch_index)` for each projection group and each
of `albedo`, `normal`, `orm`; `len(state['normal_batches'])` gives the normal
group count and `len(state['batches'])` gives the other channel counts. Calls
restore the previous scene, and completed batches are restart-safe
within the same Blender session. Then `baker.finish(state)` exports
`skeleton-candidate.glb` plus its three original maps and rig/source report into
that ignored directory. A fresh Blender process must rerun preparation.

The candidate uses neutral anatomical joint bases for the existing foot-support
solver. Reviewed hand pronation/grasp remains in neutral mesh geometry; guarded
body/limb transforms are recorded separately as Y-up metadata. Ten anatomical
joints keep neutral bases. An eleventh rigid `Sword` joint is parented to
`ArmLowerR` at the actual grasp, with local Y calibrated along the blade so the
weapon can settle independently. Part identities survive the atlas join/split;
there are no skins.

Outside Blender, pack only the explicit candidate (never all public models):

```python
import sys
from pathlib import Path
sys.path.insert(0, 'scripts/blender/detailed')
from optimize_assets import optimize
folder = Path('scripts/blender/experiments/exports/skeleton-candidate')
optimize(folder / 'skeleton-candidate.glb', texture_directory=folder, normal_size=1024)
```

This candidate uses1K color/normals and512px ORM; resolution remains subject to
export/native review. The earlier2K partial bake remains an isolated comparison.
Joining each nonadjacent high-source projection group preserves per-object
Generated shader coordinates in an attribute, along with source UVs/materials.
The first1K albedo group matched all149,331 covered reference pixels exactly
while reducing measured bake time from77.13s to2.41s. Geometry is unchanged:
275,073 high-source triangles and47,310 candidate triangles. These measurements
do not grant normal-map, final model or runtime acceptance.

The first packed candidate retained construction8 but received material7.5:
metal hilts darkened and finger-root normal seams became too strong. The baker
now emits Principled Base Color for albedo instead of baking its diffuse lobe,
so metallic colors are not attenuated. Isolated groups use zero bake margin;
the complete atlas is padded globally afterward, preventing a group's dilation
from overwriting another group's islands. Non-source review meshes are hidden
during baking so duplicate geometry cannot contaminate AO. The corrected
material candidate still requires independent export/native review. Excluding
bone micrograin alone did not remove the wrist seams. The next isolated control,
`isolated_carpal_normal_control`, splits the seven disconnected carpal components
inside each hand source for projection; ordinary nonadjacent-object grouping
cannot isolate those neighboring bones. It preserves geometry and UV coordinates.
Use its `normal_batches` count for staged normal calls. Retain the same-camera
source reference when assessing the result; neither control grants acceptance.

The v8 candidate, independently accepted for shown export fidelity at8, starts from a fresh
joined state with the Sword split, then calls `enlarged_hand_chart_comparison`
and `isolated_carpal_normal_control` in that order. It sets
`exclude_bone_micrograin=True`. All three channels must be rebaked after the UV
change. Forty hand sources receive about35× their original atlas area
(0.0018591→0.0655849 of the atlas), without changing geometry or map resolution.
UV selection is explicit before packing; resulting bounds are .003..996.
Earlier controls exposed stale RNA handles after edit mode and unselected UVs
leaving islands unpacked. Both preparation and the area check now enforce these
conditions; the failed v6/v7 controls are excluded from candidate review.
Durable accepted studio evidence and exact-artifact metadata are retained under
`docs/rpg-playtest/v15/characters/skeleton-export-v8/`.

`review_authored_enemy.py` reimports the exact candidate into an isolated scene
and can apply its separate guard metadata. Reimport front/back/three-quarter,
neutral pivots, native guarded pose and
actual support/motion checks are still required before canonical/public use.

`web/scripts/audit-authored-enemy.ts` loads actual GLB vertices and runs the
existing animator's cached opt-in `AuthoredEnemyGuard` hook. From the repo
root, run `bun web/scripts/audit-authored-enemy.ts candidate.glb report.json`.
It checks three alive/recoil states and 67 ordered fall samples. This exposed
an intermediate blade penetration missed by static endpoints; the helper now
releases the authored Sword toward the ground before the legacy .62s settle.
Optional fourth/fifth arguments select the actor phase and collapse type; phases
`.7` and `2.7` cover both fall variants, with `grounded` and `electric` paths.
This numeric audit complements, and does not replace, native motion review.

The actual v8 dungeon proof is retained under
`docs/rpg-playtest/v15/characters/skeleton-native-v8/`. Native presence scored 7
at height 1.65 and 7.5 at 1.85; export 8 does not transfer to this native gate.
`equipped_skeleton.build_candidate(root, native_shafts=True)` is an opt-in
comparison that widens only paired forearm/shin and individual hand shafts.
The inner paired-bone gap and terminal joint surfaces are protected; default
builders retain the reviewed v8 geometry. Its source and native reviews remain
pending. For a reviewed comparison, pass `native_shafts=True` into bake `prepare`;
`source_candidate=(scene, collection, joints, anatomy)` can reuse the exact
reviewed scene rather than rebuilding it. The exported root then declares
`authoredEnemyHeight=1.85`; this is a candidate-only height hint, not permission
to resize legacy actors or install the new skeleton. Retain all standard
hand-chart, isolated projection, export, vertex-support and native checks.
