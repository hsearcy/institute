# Public CC0 lich foundation — accepted wraith source

Creator-hosted source: [Samfa12-tech / The-Horde-RT-demo](https://github.com/Samfa12-tech/The-Horde-RT-demo).
Asset: `assets/models/enemies/meshy/lich_placeholder_merged_animations_v01.glb`.
Author describes this as a Meshy-created lich and publishes an explicit CC0
statement plus a screenshot showing this exact source with its CC0 license.
The evidence is retained here; no account, purchase or new generation was used.

Pinned source commit: `463aed23d879ea673600bd1121fd0989a518599b`.

Source SHA-256:
`049979a83aca55358f54af8d3af1f7d518607bef634474a4ef015bfdff947a42`
(14,940,452 bytes).
License evidence SHA-256:
`6094e4d9a27a25022a1426c297f069db60f779cc77526cfe6b154421f6db96ee`.

Run `python scripts/blender/sources/cc0-lich/fetch.py` to restore the ignored
source cache. The downloader uses the public GitHub LFS download endpoint and
checks the fixed content hash; source data is not packaged in the game.

The production `wraith.glb` now uses this foundation after independent 8/10
reviews of source appearance, moderate articulated pose, optimized GLB fidelity,
and native-camera warm/cool dungeon readability. Those reviews do not imply that
other models or every continuous animation have passed.

The source has 9,188 triangles and nine biped clips. The adaptation preserves its
UVs, replaces unsuitable metallic/emission defaults with matte cloth response,
adds cloth normal/roughness detail and separates seven rigid upper-body regions.
The held staff follows the left forearm. Biped skin/clips are not exported.

Credit: “Lich foundation created and animated with Meshy, shared CC0 by
Samfa12-tech; adapted for Embercrypt.”
