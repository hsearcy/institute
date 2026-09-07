# Distinct equipment candidates

All 23 stable `RPG_ITEMS` IDs are listed in `catalogue.json`. Apprentice now uses
an accepted distinct held model; remaining items still use the legacy visual
fallback while their candidates are developed. These sources replace that limitation without changing
item IDs, stats, inventory, learning or save data.

Every design has a different silhouette, construction and material hierarchy.
Rarity adds craftsmanship, not an undifferentiated glow. Source details must
survive the actual isometric camera, so native equipped reviews are required.

The first study covers the starter Runeblade and early Cinderbranch, Glacier Fang
and Thunder Rod. Apprentice v4 is installed in the runtime; the other candidates remain held.
Its scoped reviews are recorded below.
Candidate scenes, renders and exports live in ignored `tmp/item-models/`.

The first four-model study was independently rejected: sword silhouette /
construction / material scored 6 / 5.5 / 4.5; Cinderbranch 5 / 4 / 4; Glacier Fang
5.5 / 4.5 / 4; Thunder Rod 5.5 / 4.5 / 4.5. Their primitive construction must not
be multiplied into the remaining catalogue. V2 concentrates on a continuous
forged blade/hilt and grown, fused wood fork. Its sword scored 7 / 7 / 5.5 and
branch 6.5 / 6.5 / 4.5: improved construction, still below the gate. V3 corrects
the abrupt fuller termination, padded leather overlap, antler-like branch tip,
and undifferentiated wood/coal response. No export is approved.

V3 retained the same scores; subtle shader changes did not resolve construction.
V4 therefore changes the actual surfaces: a densely modeled continuous forged
bevel/fuller's curved termination and scan-displaced raised bark plates aligned
to the branch growth paths, plus a clearly oblique exposed break.

V4b blade construction passed 8; the hilt remained 7.5/material 6.5. Wood/fork and
bark reached 7.5, with coal/cleft only 5.5. V5 preserved the blade, improved hilt
material to 7 and coal to 7, but still showed an unseated guard/ferrule and a
wire-like hot crack. V6 closes that actual gap and cuts irregular fractures into
the coal, with interrupted hot interiors. Hilt construction reached 8; coal
remained 7 because the channel still read as an engraved lightning emblem.

**Apprentice v7 shown source construction and surface passed independent 8** in
front, close hilt and rear views. It fixes the final radial pommel wedges with a
continuous convex surface. Preserve this source basis for the low-target bake.
**Exact Apprentice export v2 construction/material fidelity also passed 8** in
front, back, high and close-hilt views. The original bake amplified procedural
micro-bump into sandpaper grain. V2 projects modeled wrap/bevel normals while
preserving albedo and roughness variation; source materials are restored afterward.
Native grip/attachment/scale passed 8 across 12 poses. The v2 guard created a
white highlight/halo during Cleave (material 7.5). V3 raised only crossguard
roughness to .54, but native material stayed 7.5. Packed UV and runtime scalar/
color-space audits confirmed those values were correctly loaded. V4 therefore
uses blackened forged iron only on the guard: base-color multipliers
(.32,.36,.38), metallic .65, roughness .54. V4 studio and native material passed 8,
with attachment/scale 8 retained; exact candidate and thumbnail are installed.
V3 albedo and normal bytes are identical to v2; ORM AO/metal channels are also
identical. Standalone v3 thumbnail framing/material passed 8 after using a
32-degree three-quarter view and 28-degree diagonal roll. Actual cell review
passed 8 at 210px feature and 93px card sizes. Weapon-only grip, continuity
and material also passed 8 across three actual Cleave intervals at the observed
recording sampling. A fresh first-cast warmup proof independently passed weapon
continuity/smoothness 8 at 25fps video sampling: actual active-frame median 16.8ms,
maximum 23.7ms, and stable 144 programs. The prior 98.9ms opening-gap recording
remains preserved; no Cleave effect acceptance is inferred. Exact evidence is
`docs/rpg-playtest/v15/items/apprentice-v4/first-cast-warmup.{json,webm}`. Cinderbranch
remains below gate: wood/fork 7.5 and coal integration 7; its tidy fracture must
be replaced by an irregular fractured mass before export. V8 eliminated the
engraved glyph but read as soft clay (coal 7); v9 made a manufactured cross of
flat plates (coal 6.5). V10 uses uneven short cellular fracture planes, scalloped
lips and reference-informed charcoal layers; coal reached 7, still too occluded.
V11 opens the same mass toward the camera but remains coal 7: two broad nearly
rectangular faces need a substantial missing corner and brittle stepped layers.

Glacier v4 source establishes actual shell thickness and layered overlap, scoring
form/depth 7 and material 6.5. Its nested parallel strips still read as a blade
inset; the next candidate replaces one with a broad oblique terminating fracture
behind an open side window. Thunder v3 construction remains 6.5/material 7;
electrode seating and formed contact ends require a close proof. Neither is
export-approved.

The next Cinderbranch/Thunder source render returned a closed Blender connection
before producing any of its three PNGs. Host Blender PID 1298288 exited 143;
there was no coredump entry. No scene cleanup executed and no accepted artifact
was overwritten. The parent recovered a fresh Blender session and preserved the
old autosave with SHA-256 `fe35a008b6bc18856baeab26b7944c9aa57dc05eccb6e26c517db42ab959be5b`.
The termination remains unexplained; no crash-core or OOM journal entry was found.
Current sources rebuild independently without loading the old study scenes.

New source scenes record their item IDs, owner and combined source recipe hash.
`scene_lifetime.py` can archive explicitly selected obsolete item source scenes
with their dependencies before removing only exclusive geometry. It does not
purge global orphans or touch character, accepted export or bake scenes. No such
cleanup was needed in the fresh recovered session.
They reuse the accepted thin leather construction, with distinct silhouettes.
Glacier v3 remained form 6.5/material 6; color contrast alone did not establish
internal depth. Its next candidate uses an ordinary alpha-blended outer hull,
offset opaque core and two thin internal fracture laminae at different depths,
with no transmission pass. Thunder v3 reached material 7 but construction stayed
6.5; close formed-contact and mounting proofs remain required.

### References and provenance

The source construction reference is the Met's public-domain
[Claymore, object 54.46.10](https://www.metmuseum.org/art/collection/search/27515):
continuous forged flats, distinct cutting bevel, purposeful tang/guard junction.
It is a visual reference, not geometry incorporated into the model.

Cinderbranch source relief/color uses
[Pine Bark by Dimitrios Savva / Poly Haven](https://polyhaven.com/a/pine_bark),
explicitly CC0 on its asset page. `fetch_references.py` restores and SHA256-checks
the exact three 1K maps in ignored `tmp/item-models/references/`. Bark is bound to
the authored fork's arclength/angle coordinates, displaced into actual source
geometry, and charred locally. The underlying fork geometry is project-authored.
The eventual optimized item must embed its baked maps and have no network dependency.

Charcoal construction is compared with [Texturelabs Wood 139, Burnt wood
ash](https://texturelabs.org/textures/wood_139/): broken layered plates, scalloped
fracture lips and short deep gaps. This is a visual reference only; its bitmap is
not incorporated into the model or baked maps.

## Attachment contract

Rigid meshes are authored in meters with grip center at `(0,0,0)`, blade/shaft
toward Blender `+Z`, and the presentation face toward `-Y`. GLTF conversion gives
`+Y` toward the tip and `+Z` toward the presentation face. Each root carries
`itemId`, `attachment`, `sourceUnits`, plus named `Grip` and `Tip` empty nodes.
Exact node names are recorded as `gripNode`/`tipNode`; the empty itself also has
`attachmentRole` so Blender's scene-wide name suffixes cannot break a mount.
The runtime must use the complete grip transform relative to the measured
holding hand; guessing from a hand bone origin can produce an open or offset grip.

The authored hero has `hand.R`; older armor variants have `arm.R` and require
separate calibrated transforms. Their embedded sword meshes must be hidden only
after the replacement is ready. The source scabbard remains at the hip.

The character artist measured the deployed hero's exact hand-local grip as
`(-0.03460448, 0.16085970, -0.04303135)`. Its drawn blade points along glTF world
`+Z` in rest, whereas these item's tip axis is local `+Y`; integration therefore
needs a complete orientation, not just that translation. The parent agent owns
the compatible mounts. `sourcePart=equipped_sword` identifies both authored blade
and hilt; older variants use `Sword_Baked` and `Sword_Glow`.

Each source root also has preview azimuth, elevation and framing-margin metadata.
Final inventory thumbnails must be rendered from the accepted exact item GLB,
with consistent framing and a clear silhouette, so the unlock is recognizable in
the inventory as well as in the hero's hand.

`inferno`, `wardenheart`, `thunderbell`, and `stormorbit` are worn crown/chest/belt
objects. They retain the starter weapon for melee. This is presentation metadata,
not new equipment slots. The single existing equipped item remains authoritative.
Worn objects need head/chest/hip fit reviews across all four appearances.

## Review and runtime constraints

1. Review source front, back and game-elevation views independently.
2. Export rigid geometry with embedded textures and no transmission extension.
3. Review the exact reimported GLB and native equipped idle/cast/cleave grip.
4. Verify unique geometry, bounds, attachment nodes, material count and all 23 IDs.

Aim for 2–8k triangles per held object, at most 12k for exceptional silhouettes,
and 1–3 runtime material groups after baking. Source studies may use more groups.
Broad bevels and directional wear should support form; texture noise must not
replace construction. Crystal depth uses colored facets and roughness, without
whole-scene refraction. Emission stays localized and subordinate to spell effects.

Combat v8 ownership has returned to the parent agent. Its two bounded actual-loop
clips are preserved under `docs/rpg-playtest/v15/combat/` and are under independent
review; item work does not imply acceptance of remaining reaction or cadence issues.

## Staged candidate pipeline

`bake_items.py` prepares an isolated per-item scene and compact low target, copying
the exact corner normals into isolated projection targets. It reuses the measured
joined-source helper, preserves Generated coordinates and growth UVs, bakes true
Principled base color via emission (so metallic surfaces do not darken), and uses
zero per-group dilation. Its candidate exporter retains the grip metadata and
separate emissive crack geometry and constant-material alpha shells.
`pack_candidate.py` pads all completed atlases
globally before compression and verifies untouched geometry payloads. These
helpers have completed the first Apprentice candidate: 62,936 source triangles
became 4,746 runtime triangles in one material with a 1K atlas. The packed GLB is
1,311,748 bytes in the v4 guard variant; attachment, geometry, UV bounds and
embedded-map checks pass. Native grip/scale and guard material passed 8.
`review_candidate.py` reimports those exact bytes into an isolated studio scene.
Its `thumbnail` function frames the actual geometry from embedded metadata and
renders a transparent inventory preview. Current candidate files are
`tmp/item-models/apprentice/apprentice-v4.glb` and
`tmp/item-models/apprentice/apprentice-v4-thumbnail.png`; the original rejected
normal-transfer candidate remains preserved beside them.

## Catalogue delivery runner

`export_catalogue.py` exports the eighteen outstanding IDs using the same source
builders and PBR projection path. Load it in Blender and call `run_item(item_id)`
to advance through source preparation, three bake channels and raw export. Its
45-second limit applies between stages; `run_next(item_id)` performs exactly one
stage. `run_items(ids)` isolates individual failures and continues the selection.

Each item's source snapshot, stage receipts, topology repair audit and raw export
are retained in `tmp/item-models/catalogue-v1/<id>`. Closed inward or inconsistent
source winding is repaired before the independent preflight, with every evaluated
vertex position preserved. Nonmanifold geometry fails; open surfaces remain open.
The runtime triangle cap includes emissive and alpha parts, and the final exporter
preserves the authored distal tip for bent weapons and worn objects.
Catalogue UV packing uses bounding rectangles and cardinal rotations to avoid
the unbounded concave packing search; direct legacy bake calls retain their
original packing options. Stage timing receipts make slow operations visible.

Run `python scripts/blender/items/export_catalogue.py --pack` outside Blender to
pad and pack completed raw GLBs and produce structural review receipts. Then call
`thumbnail(item_id)` inside Blender to render the exact packed bytes. These
commands never install public assets or assign visual acceptance scores. Blender's
live namespace retains partial bake stages; after restarting Blender an unfinished
item is rebuilt from its saved source, while completed raw exports remain skipped.

The September 7 catalogue run produced all eighteen missing packed GLBs and
matching transparent 512px thumbnails. Structural validation passed for every
candidate: 1,500–11,968 triangles, one or two materials, embedded PBR maps and
valid attachment markers. The eighteen GLBs total 16,225,004 bytes; thumbnails
add 2,338,584 bytes. These measurements do not imply an 8/10 art score.

To reproduce in a Blender MCP code call:

```python
import importlib.util
from pathlib import Path
path = Path('/home/houston/git/institute/scripts/blender/items/export_catalogue.py')
spec = importlib.util.spec_from_file_location('item_catalogue', path)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
runner.run_items(max_seconds=45)
```

Repeat the bounded call until `runner.status()` reports all raw exports complete,
run the CPU `--pack` command above, then call `runner.thumbnail(item_id)` for each
ID in `runner.ITEMS`. A raw export, packed GLB, thumbnail and exact SHA receipt are
separate stages. The saved `source.blend` and source winding audit remain beside
each candidate; the Glacier counterweight required a closed-winding correction.
`surfaces.py` also accepts both Blender tessellator return formats (vertex indices
and Vector values), fixing Cinderbranch's cap without changing its authored shape.
