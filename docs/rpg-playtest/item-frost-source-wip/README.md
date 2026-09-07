# Frost weapons and wearable relics — private source WIP

Nine distinct builders live in `scripts/blender/items/frost_and_relics.py`:
Rimepiercer, Hailcaller, Winterbranch, Staff of Endless Winter, Tideglass Blade,
Crown of the Inferno, Winter Warden's Heart, Bell of Thunder and Orb of the Stormkeeper.

All nine first sources passed evaluated mesh topology checks with no open or
rejected parts. This is a construction safeguard, not visual acceptance.
The sources are private; no public GLB, thumbnail or runtime mapping is changed.

First-trio v1 independent review was below 8 for all three: fitted spear socket,
mace fracture hierarchy/growth bed, and wood-to-frost attachment require revision.
The next CPU recipe contains those bounded corrections; their renders are pending.
The other six await first independent construction/material review. The initial
staff render clipped its crown and is excluded from complete coverage.

Source artifacts and full per-mesh reports are preserved under ignored disk-backed
`tmp/item-models/frost-set-v1` and `tmp/item-models/frost-relics-v1`, including compact
source `.blend` libraries. Source, exact export and native fit remain separate gates.

Worn origins: Inferno uses its circlet center; pendant/bell/orbit use their top
suspension point and carry an explicit physical `distalTip` below it. Blender +Z is
up and -Y is the presentation face; glTF conversion produces +Y up and +Z front.
Root owns actual hero socket fit. No worn item has passed native validation yet.
