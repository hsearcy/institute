# Ashsplitter source and export review

The independent art critic reviewed all four v2 source views and scored source
construction/material 8/10. The narrow isotropic bevel roughness resolves the
conspicuous parallel streaks from v1; the reinforced back, single-edged blade,
charcoal wrap, iron fittings and copper pins remain a distinct assembly.

These images are source evidence only. Exact export and native equipped
appearance remain unapproved. The global art gate remains failed.

The source recipe hash recorded for all four renders was
`93bb3a252d88bc77cdaa873bd9ffe25e368e68109fde88a0346691120e6b4b1c`.
The included authoring snapshots preserve the current recipe before the next
item is added; individual file hashes are in `manifest.json`.

The exact packed candidate has 4,662 triangles, one material and three embedded
1K PBR atlases in 769,000 bytes. Its geometry and attachment metadata pass the
structural validator. Exact reimport views and model-derived thumbnail are
included for independent review. The candidate normal transfer omits the
source procedural micro-bump while retaining modeled bevel/wrap normals and
source color/roughness, following the accepted starter transfer approach.
That prior acceptance does not approve this export.

Independent exact-export review: construction/silhouette8 and thumbnail
framing8, material/fidelity7.5. The rear facet has a diagonal shading crease
absent from source, and the tip material boundary is visibly stair-stepped.
This candidate is held out of public assets pending correction and another
exact-export review. Native proof has not been run.

See `corrected-v4/` for the independently accepted replacement export; the
initial candidate above remains as the rejected7.5 evidence.
