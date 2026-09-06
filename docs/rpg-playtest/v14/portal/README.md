# Recessed portal — source/export accepted; native placement pending

The [v4 front](source-front-v4.png) and [rear](source-back-v4.png) source study
passes independent construction and material/history review at 8. Earlier v2/v3
studies had construction 8 but material/history 7.5. It has thick, jointed radial stones, a continuous
molded face, a recessed soffit and supporting jambs/imposts. The corrected material places broken deposits in an actual recessed radial
channel and below one impost, with an uneven lower-jamb patch crossing several
courses. The upper worked faces stay quiet. Export and native integration are
not approved.

Rebuild the isolated study with
`scripts/blender/experiments/masonry_portal.py::build_masonry_portal(repo_root)`.
It creates its own scene and derives fresh material graphs from the reviewed
limestone pier builder; it does not install a runtime asset. The MCP caller must
restore its previous Blender scene after building/rendering.

The runtime still uses the old arch. Its separate abrupt visibility transition
is recorded as a world-rendering defect in the independent review ledger.


The first export scored 7 for material fidelity: flat untextured diagnostics
also showed inflated course faces. An opt-in weighted-normal pass after
simplification and preserved corner normals through projection-group extraction
restored the broad planes. The v5 reimport improves to 7.5 but still has a dark
crown notch and two localized lower-jamb artifacts. Neither export is installed.
The v5 candidate is 21,896 triangles, one material, three 1K maps and 3,484,856
bytes. Flat untextured controls retain the same localized marks. Ray inspection
found a nearly downward corner normal on each affected vertical face: collapsed
bevels inherited smooth edges across the bottom of a stone. The next candidate
recomputes sharp edges from the simplified geometry before weighting normals,
then rebakes all maps against that same basis. The accepted source stays fixed.


The v6 sharp-edge flag experiment produced identical geometry, normal, UV and
image buffers to v5, so its 7.5 score is unchanged. An explicit v7 corner repair
changes only severe normal departures on broad worked faces. Flat front/rear
controls remove the diagonal slash, plinth band and broad crown wedge and pass
shading-integrity review at 8. The textured v7 reimport subsequently passes construction and material fidelity
at 8. It has 21,896 triangles, one material, three 1K maps and 3,474,404 bytes.
Native placement remains pending; no public portal asset is installed. Work on
its integration is paused for the user’s persistent-health/impact priorities.
