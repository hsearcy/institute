# Corrected Ashsplitter v4 export

Independent exact-export construction/material fidelity8 and standalone
thumbnail8. The rear crease disappeared after replacing unrestricted blade
decimation with a regular mesh following the same reviewed source profile.
Source-material boundaries are separated before UV projection, resolving the
diagonal texture staircase along the broad bevel.

5,160 triangles, one material, three embedded1K atlases,827,720 bytes.
SHA256:338e88f04c4b96d196331908fc2abcbe64f7d900987233a5a11cf3ecf8a81422.
The optional structured_blade and split_material_boundaries bake flags apply
to this export. Default source geometry and other item bakes retain their paths.
Geometry-only normal transfer still omits procedural micro-bump. A source
corner-normal-transfer diagnostic did not resolve the crease and was discarded;
no completed v3 bake is claimed.

Actual native/card/motion proof passed its independent8 gates; see ../runtime/.
