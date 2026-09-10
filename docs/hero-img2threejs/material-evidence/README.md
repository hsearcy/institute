# Concept material evidence

Source: `docs/concepts/math-dungeon-rpg/07-teal-hero.png` (1536 × 1024). Only this concept and the installed img2threejs skill were used. No existing character model, model texture, or Blender source was inspected or reused.

`*-pbr.json` and their map directories are unmodified outputs of the skill's `forge/stage1_intake/extract_pbr_evidence.py`, using a 0.7 threshold, single-image mode, and no low-confidence override. `*-patch.json` reconstruct the tool's exact material patch from those reports with its own `material_patch` function. `reference-pbr-patches.json` collects the referencePbr portion for spec integration. The score is the extractor's estimate, not a measured match to the finished 3D hero.

## Evidence and intended use

| Surface | Preferred report | Interpretation and limits |
| --- | --- | --- |
| Teal woven cloth | `cloth-clean-pbr.json` | The 95 × 139 crop is entirely cape cloth with visible folds. Use the palette and de-lit color as surface evidence; model the large folds in geometry. Estimated height/normal maps include lighting and must not be treated as measured weave. Dark cloth can share this evidence with an explicitly documented darker palette. |
| Satin steel | `steel-pbr.json` | The 66 × 53 breastplate crop supports metal identity, mottled color, and restrained surface scratches. Warm brown values are partly reflected lighting. Do not copy the generic extractor's high roughness estimate or the classifier's painted-metal identity literally. |
| Brown leather | `leather-refined-pbr.json` | The 42 × 72 boot crop improves on the original 25 × 27 crop. It shows leather color, a crease, and seam context. Individual leather pores are unresolved. Keep any procedural grain subtle and label it inferred. |
| Gold-colored metal | `gold-pbr.json` | The original 17 × 11 crop is too small and mixed to establish physical maps, despite the tool score. The inspected 71 × 64 `refined-crops/gold-context.png` confirms a gold-colored buckle surrounded by leather; the whole context crop must not be tiled as gold. Gold versus brass is uncertain. Use geometry, a conductor prior, and visible gold palette; extracted maps remain diagnostic evidence, pending render validation. |
| Skin/face | `face-pbr.json` | The 111 × 136 face crop also contains hood, hair, eyes, and shadows. It supports registered, de-lit face projection, not repeating skin texture or physical skin normals. The inspected 22 × 22 `refined-crops/skin-cheek.png` confirms warm cheek color but cannot resolve pores. Never map hood/hair colors across skin. Root owns projection and masks. |
| Chestnut hair | `hair-pbr.json` | The inspected 68 × 40 crop shows swept locks and directional warm highlights; its lower edge includes forehead and corners include hood. Use registered color guidance with an appropriate hair mask, plus continuous shell/clump geometry. Do not tile this patch, derive individual strands from its noise, or mistake painted highlight shapes for true normals. |

The first `cloth-refined.png` contains armor/background and was rejected as a material-only source. It remains in the crop inventory for provenance. `cloth-clean.png` replaces it. None of the enlarged output maps adds detail beyond the original pixels.

## Semantic reconciliation

The generic `analyze_texture.py` suggestions are not reliable material identities for these stylized, tightly cropped regions: it suggested painted metal for cloth and steel, and candy-coat for the mixed face. Preserve those raw files as evidence of the limitation; do not use those recipes as final materials.

Canonical registry identities and provisional starting values below are taken from `docs/materials/material-reference.json` in the installed skill, then interpreted against visible concept cues. Values are **inferred starting priors**, not recovered physical properties. Tune them with neutral, grazing, environment, and reference-matched renders.

| Surface | Registry identity | Provisional values |
| --- | --- | --- |
| Cloth | `fabric.woven-matte` | Metalness 0; roughness 0.85; sheen 0.65; sheen roughness 0.75; explicitly set a pale teal/off-white sheen color. |
| Steel | `metal.steel-polished` | Metalness 1; roughness approximately 0.23 as a satin-looking starting point; neutral steel albedo; no strong directional brushing unless render evidence supports it. |
| Leather | `leather.matte` | Metalness 0; roughness 0.62; clearcoat 0.08; clearcoat roughness 0.45. |
| Gold | `metal.gold` (gold-colored conductor; exact alloy uncertain) | Metalness 1; roughness 0.22; warm gold palette. |
| Skin | `skin.human` | Metalness 0; roughness 0.52; clearcoat 0.12; clearcoat roughness 0.35; IOR 1.4. Skin transmission is not a substitute for subsurface scattering. |
| Hair | `hair.human` | Metalness 0; roughness 0.45; anisotropy 0.65 along the locks; sheen 0.45; sheen roughness 0.35. These depend on correct tangent direction and an explicit warm, nonblack sheen color. |

Color maps use sRGB; roughness, normal, height, and AO maps use data color space. A full raw patch is not a safe blind merge: its luminance-derived roughness, normals, and AO may encode concept lighting and component boundaries. Keep semantic material priors and separate procedural microstructure from actual reference evidence. Face/hair projection must respect masks and registration.

## Outstanding gates

The extractor's numeric threshold can pass while the material-specific evidence remains insufficient. Gold physical maps and mixed face/hair physical maps do not have a defensible human-reviewed 0.7 confidence from this source. The final material/render gate is **pending**, not passed: there are no neutral, grazing, environment, and reference-matched render comparisons in this evidence package. No score was raised or warning removed to satisfy a schema.

Amber facets and the tiny eye/iris can reasonably be declared smooth optical surfaces with geometric color boundaries if their spec explicitly states that no source microsurface pattern is visible. That is a texture-evidence exception, not evidence of reconstructed unseen detail. Hidden undersurfaces likewise have no direct pixel evidence and should be identified as inferred.
