# Moonshard Staff: installed model

This sixth distinct item source uses a long silvered-ash shaft, an open forged
crescent and an off-center opaque moonstone held in a shaped metal setting.
The exact v2 model and its thumbnail are installed after independent source,
export, native idle, desktop card and weapon-motion reviews at 8. Its first
export preserved the head but scored 7.5 overall because the grip developed
broad dark folds; the structured low grip correction closes that defect.

The v1 source scored construction 6.5/material 6: straight thin spokes and a flat
oval setting resembled a mirror frame. Its shaft also intersected the grip.
V2 introduced two broad tapered braces and a continuous bezel around a deeper
stone, reaching shown-head construction 7.5/material 7. Small gaps remained
between wrap and ferrules; silver and stone still lacked distinct responses.

V3 seats the ferrules against both wrap ends and retains a narrower hidden shaft
inside the leather. The silver has a more directional reflection and localized
sheltering at brace/bezel junctions; the opaque blue stone has a separate broad
surface response. Rear head depth is now shown. Independent v3 review passed
construction 8 in the shown head/rear/grip coverage; material was 7.5 because
the central stone still reads as a uniformly glazed blue oval. V4 adds broad
mineral clouds beneath the uninterrupted polished surface, without micro-bump,
glitter, extra cracks or transmission. Its front/head material passed 8, with
v3 rear/grip construction 8 retained; that completed the source gate before the export correction described below.

`source-v4-head.png` and `source-v4-front.png` show the accepted current material.
V3 rear/grip views retain their geometry scope. `source-v2-front.png` is earlier
evidence and must not be mistaken for current material. Recipe snapshots in
`source-recipe-v3/` and `source-recipe-v4/` and their render JSON retain the exact
source hashes. The existing item IDs and learning/save protocol are preserved.
Moonstaff adds one public model and thumbnail; the other three modeled items
are unchanged.

The v1 no-normal and flat-material controls preserve the lower grip defect,
locating the correction in the low mesh surface/basis. V2 replaces the generic
decimation of only this grip with regular rings sampled from the accepted
source, retaining geometric wrap overlap and flat cap normals. The 11,302-triangle
packed candidate passes structural checks; corrected same-camera grip/head visual review
passes 8, combined with the unchanged prior full/rear coverage. The accepted head and source design are retained.

The public model is `web/public/assets/rpg/items/moonstaff.glb`, SHA
`3bef5aa838a2770636ab5b3cb80f7c0a362c4b77fd7e2ddd082508c99402520b`.
Its exact-model thumbnail SHA is
`12a97e9cbfb9f13332318eba861e1751989dc25ead36971b23f3df1714452ebb`.
The standalone 512px view and actual desktop 210px feature/92px card pass 8.
Weapon-only hand continuity, clearance and material/readability pass 8 through
the reviewed Cleave/Nova frames. This does not imply spell-effect acceptance or
subframe smoothness; the runtime folder records the full footage, paired
performance control and exact preview restoration.

The route-free installed check passed real UI switching across all four modeled
items, one actual Cleave and persisted-state reload. Full validation passed
369 tests across 48 files, plus the production TypeScript/Vite build. Logs and
installed-run evidence are in `runtime/`.
