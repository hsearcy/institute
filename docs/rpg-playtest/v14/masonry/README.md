# Worn pier — source and export review

These are Blender renders from authored geometry and pinned CC0 stone maps,
not generated concept art. Camera, lighting and exposure match between views.

| Evidence | Independent score | Scope |
| --- | --- | --- |
| [Source front](source-front.png) | Construction8, material8 | Elevated source view only |
| [First GLB reimport](first-export-front.png) | Construction8, material6.5 | Rejected export: harsh black joints |
| [Corrected GLB front](corrected-export-front.png) | Construction8, material8 | Joint projection fixed |
| [First rear coverage](short-shaft-export-back.png) | Construction7.5, material8 | Rear shafts stop prematurely |
| [Corrected rear source](corrected-source-back.png) | Construction8, material8 | Shafts now reach the capital; rebake pending |
| [Final export front](final-export-front.png), [back](final-export-back.png) | Construction8, material8 | Complete corrected full-height export |
| [Native gate](native-gate.png), [room1 warm](native-room1-warm.png), [room1 cool](native-room1-cool.png) | Construction8, material/readability8, placement8 | Full-height piers only |
| [Miniature bridge posts](rejected-miniature-posts.png) | Construction7.5 | Rejected scale-down; prior short supports retained |

The source has52,466 triangles. The first high-to-low candidate has11,068
triangles, one material, embedded1K albedo/normal/ORM maps and3,398,996 bytes.
These technical counts do not establish visual acceptance.

The first bake selected every source mesh together; projection across narrow
joints can hit neighboring stones. The corrected experimental baker retains a
shared destination atlas but separates nearby projection sources into batches.
The final full-height export has11,804 triangles, one material and3,181,224 bytes.
It is now installed as `web/public/assets/rpg/masonry-pier.glb`. The renderer
removes the matching procedural batches and old prop overlays, preserving
fallback architecture if the model is missing. A repeated installation created
no additional piers in the browser check. Short posts require their own geometry;
the rejected miniature variant is excluded from this installation.

Native images are1440×1000 at device scale1/full rendering quality. They use
client-only14-enemy room fixtures with the actual saved HUD/question unchanged;
the room1/cool/crossing headings therefore still show the real room0 session.
They establish pillar appearance and placement only, not gameplay progression or
UI acceptance. The saved question `5 + ? = 8` remained unchanged, and the renderer
was restored to the real39-enemy encounter after capture. Other walls, arches,
stumps, floor, actors and complete scene composition remain separate art gates.

Reconstruction: `scripts/blender/detailed/masonry_pier.py`.
Map provenance: `scripts/blender/sources/rock-face-03/README.md`.
Review ledger: `docs/rpg-art-review-v13.md`.
