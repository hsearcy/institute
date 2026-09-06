# Blender Studio anatomy foundation (CC0)

These sources are **experimental inputs**, not production assets. Their quality
and open license do not constitute visual acceptance. The public game wraith is
still built by `detailed/characters.py`.

Upstream: [Blender Human Base Meshes](https://www.blender.org/download/demo-files/)
and the official [blender-assets repository](https://projects.blender.org/blender/blender-assets).
The public project and embedded asset metadata identify the assets as **CC0 –
Public Domain**. The repository's exact license is retained in
`LICENSE-CC0.txt`.

The release ZIP download currently presents a browser challenge. These are the
same project's published, split anatomy sources fetched through its standard
anonymous Git LFS download endpoint, not an account or download restriction
bypass. They are pinned by content hashes rather than labelled as release v1.4.1.

Repository snapshot: `0a12785f3f22c7b6cbbf9cbdd2a680a02280ae3e`, retrieved 2026-09-05.
Exact upstream paths, file sizes and SHA-256 hashes are in `fetch.py`.

- `realistic-skull.blend`: asset **Skull - Realistic**, by **Paul Kotelevets and
  Tonatiuh de San Julián**. Embedded description: realistic scan-data model with
  multiresolution details. 11,684 base vertices, 11,634 base polygons; Multires
  modifier. Successfully inspected/appended with Blender MCP in Blender 4.5.13.
- `realistic-skeleton.blend`: official **Skeleton - Realistic** source. By **Paul Kotelevets**, verified from embedded CC0 asset metadata. Separate
  named bones include the humerus, radius, ulna, carpals and every finger
  segment, suitable for authored poses and the existing rigid-part renderer.
  Successfully inspected/appended through Blender MCP in Blender 4.5.13.

Run `python scripts/blender/sources/blender-studio/fetch.py` to restore the
hash-verified cache. The narrowly ignored `*.blend` inputs stay outside Git;
license, provenance, downloader and eventually accepted derived game assets are
tracked. Existing user scenes must be preserved when appending source objects.
