# Exact portal abutment export candidate

The reviewed V4 source is reduced from195,584 to32,518triangles, with one mesh/material and three embedded2048px maps. The exact GLB is5,503,784bytes; its hash, embedded image dimensions, bounds, samplers and primitive count are in `glb-audit.json`. There are no skins, animations or transmission extensions.

The source material graphs remain in their original object coordinates. Eight disjoint projection groups prevent rays from projecting onto neighboring stones. Each color/normal/ORM batch was observed separately through Blender MCP, and every stage restored caller Scene. The explicit broad worked-face normal option retains the curved shaft basis and copies the same normals into low projection batches. Existing baker callers keep their prior defaults.

The exporter emitted its generic multiple image-node sampler warning for the packed ORM channels. The actual GLB has one common linear/mipmap sampler and three expected maps. This warning is retained in the execution evidence; it is not by itself a texture fidelity verdict.

The exact GLB has been reimported into a fresh scene using the source camera/lights/world/ground. Its front, rear and joint renders are complete: independent overall construction8, export fidelity/material7. The new black triangle and bevel slivers persist without the normal map and disappear in the flat-material control. Soft mottled transfer also persists without normals. No portal abutment is installed in the game. Source8 does not establish export or native8; whole-world remains6.5.

At joint pixel(601,225), the exact low surface has black albedo/ORM texels and a neutral normal. Its source is only0.318mm away and the projection ray hits. The isolated UV chart measures1.135×1.933pixels, area1.097pixels: no bake sample filled it. The original atlas occupies only9.428% of its area across1636charts, with18,944/32,518triangles under one pixel area. These measured results identify texture allocation/selection as the next correction; they do not justify altering the reviewed source geometry.

V2 preparation widened tiny charts, but mesh selection alone left zero UVs selected. `pack_islands` reported FINISHED without repacking. An explicit UV-select experiment raised occupied area to50.111%. V3 prepares projection batches after that correction, with six-pixel chart minima before packing, six-pixel atlas margin and two-pixel bake dilation. Actual packed minimum chart extent is9.297pixels. The corrected bake remains pending; no source/export/native grade transfers to it.
