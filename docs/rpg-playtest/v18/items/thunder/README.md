# Thunder Rod: accepted source and exact export

Thunder Rod now has a distinct three-terminal copper assembly, fitted dark root
ferrules, cobalt porcelain and a wrapped grip. This directory preserves the
source and export reviews. Native attachment, actual inventory cards and motion
are separate parent-owned proofs; this archive does not infer those passes.

The independent critic scored source construction 8 in v7 front/back/contact
coverage and source material 8 in v8 front/contact coverage. V8 makes the actual
contact faces and short adjacent necks dark and rough, while retaining clean
copper middles. V7 material remained 7.5: the intended transition was too faint.
The retained attribute audit verifies populated heat/shelter arrays, so this
was a visible material deficiency rather than a missing-data diagnosis.

All five exact packed v1 views passed construction/material fidelity 8. The
standalone 512px model-derived thumbnail also passed 8. The thumbnail uses
explicit azimuth 32°, elevation 12°, roll 28° and margin 1.18; rendering restored
the original GLB preview metadata afterward. The asset bytes were unchanged.

- Exact candidate: `tmp/item-models/thunderrod/thunderrod-v1.glb`
- SHA-256: `f5c813c5e8aa5753b1746db0038605414abf829b6ce0784407c45d048875378c`
- 9,300 triangles, one mesh/material, three embedded 1024px PBR maps, 1,270,772 bytes.
- No transmission, skins or animations. UV bounds and structural validation pass.
- Meters; actual palm Grip at origin; glTF +Y toward Tip, +Z presentation face.

`source-recipe/` contains the exact three-file source recipe from the v8 build.
The separate compressed Blender snapshot remains in ignored candidate storage
at `tmp/item-models/thunderrod/thunder-v8-source.blend`, SHA-256
`9ea40eff0b2d62e267b9358192cd3948ee074d1081e429974c88d9fbb4227ab7`.
No large Blender archive is duplicated here.

The existing item baker prepared 49,028 source triangles into ten projection
groups. This candidate used `geometry_normals_only=True`: modeled wrap/bevel
relief was projected while procedural micro-bump was excluded; color, roughness
and named heat masks remained. Base color used emission baking, with zero local
margin and final global padding. The packed geometry payloads were unchanged.
The exact-export review, rather than this implementation choice, establishes
the scoped fidelity pass. Loaded preparation predates the optional structured
blade controls subsequently added for Ashsplitter.

The JSON files retain source hashes, preparation parameters, render provenance
and structural results. Old failed studies remain in ignored candidate storage.
