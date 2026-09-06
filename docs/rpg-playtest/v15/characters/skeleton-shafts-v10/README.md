# Skeleton shaft visibility comparison v10

Independent review passed the shown source preservation and exact packed export construction/material fidelity at 8. Radius/ulna and tibia/fibula shafts gain outward/depth cross-section while preserving the inward channel and terminal joint surfaces. Individual finger/metacarpal shafts gain width without changing their lengths or equipment pivots. The symmetric v9 expansion was rejected before baking because it narrowed the paired-bone gap.

This candidate keeps 47,310 triangles, 11 rigid joints and the reviewed Sword pivot/axis. It is 3,205,416 bytes with embedded maps and an opt-in `authoredEnemyHeight=1.85` metadata hint. Forty hand sources retain additional atlas area; 22 isolated normal projection groups preserve narrow carpal cavities. Front detail and high/back renders show the exact packed GLB, not retained source meshes.

Four actual-hook vertex sweeps cover 280 poses across both phase variants and grounded/electric paths. They retain the original model-space floor within floating-point tolerance. They do not establish world-space foot support or native motion acceptance.

Actual native presence, the support-foot catch, and final death slack remain pending. Prior v8 native evidence is retained separately. The next trial uses the World metadata height hook and skips legacy wrapper bob/roll only for the authored actor. No public skeleton has been replaced.

The reproducible opt-in source and staged bake recipe are in `scripts/blender/experiments/{authored_enemies,equipped_skeleton,bake_authored_enemy}.py` and the experiments README. Packed artifact/maps remain in the ignored `exports/skeleton-native-shafts-v10` directory.
