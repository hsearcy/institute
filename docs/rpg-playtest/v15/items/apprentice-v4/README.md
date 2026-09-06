# Apprentice sword v4: installed item and actual three-cast proof

The installed1.31MB model contains4,746 triangles and one material. Independent
source/export/native-static and actual210px/93px inventory reviews score8.
Weapon-only grip, continuity and material across three actual Cleaves score8 at
observed recording sampling. This does not certify Cleave's spell effects.

Actual HP: `[12,6,8,8,10,6] → [3,0,0,8,10,6] → [0,0,0,0,1,6]`, then room1.
Eight hits, maximum seven visible enemies, no page/shader/context errors.
Repeated same-item equip retained the mount; switching to an unregistered item
restored the base blade; remounting succeeded. The actual inventory displays the
model-derived thumbnail. Family saves and learning algorithms were untouched.

The original recording has a98.9ms first-cast gap and renderer programs140→144.
The first warmup revision reduced this to73.7ms but left one late program.
The recorded cache-key difference identified normal-attribute presence as the
remaining mismatch: the live ribbon has position/UV only, the warmup had normals.
Matching that geometry produced stable144 programs and active frame intervals
median16.8ms/maximum23.7ms in a fresh actual first-cast proof. No page/shader/context
errors. Independent ordered first-cast weapon review scores8 for observed continuity
and smoothness at the recording sampling (25fps). No frozen opening, detached
hilt, axis flip or material halo was visible. This is one fresh cast and does
not imply complete Cleave effects/impact/choreography acceptance. Frame intervals include
recording and browser work and are not isolated GPU timings.
Other items and legacy armor appearances are outside this acceptance scope.
