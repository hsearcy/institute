# Grouped broken wall silhouette v7

Uninstalled candidate; scoped geometry7.5, whole world6.5. Independent reviewer says preserve this arrangement while correcting newly exposed surfaces. Left repeated sloping teeth have become a broad missing section. Right continuous ramp is replaced by distinct surviving masonry groups, missing beds, and unequal corner breaks. Original arch and lower aligned courses remain.

The export retains only explicitly supported upper groups and six localized fracture planes. It records actual surviving source IDs, asserts every remaining edge manifold and positive total signed volume. Two parts share the former atlas; newly cut surfaces use a native wall material control with vertex colors disabled. Exact candidate GLB included. This is not a finished baked model.

Native runs all completed with six enemies, errors[], and exact full preview state/running restoration. No learning code, server save, or production asset changes. Static captures are not performance tests.

Diagnostics: removing old runtime AO clears dark bands on the newly uncovered arch extrados, but broad level tops remain dark. Removing the old normal map afterward also leaves the dark tops. GLB sampling finds upward normals and dark albedo within those top UV charts: interior RGB roughly53–65, edge samples87–103. masonry_portal.py's source material embeds an AO-driven shelter tint into Base Color. Evidence therefore calls for recomputing the newly exposed surfaces against the changed surrounding geometry, rather than further silhouette changes or globally disabling the accepted maps. No finished material score is claimed.

The v7-normal run provides same-frame architecture A/B/C: assembly-detail (original maps), ao-control (AO intensity0), normal-control (AO intensity0 and normal map removed). Actor phase and problem text vary across separate runs, so compare architecture within each run. The native camera still crops the main arch crown; close view does not certify a full traversal.

Invocation: QA_LABEL=portal-composition-v7-normal COMPOSITION_V2=1 COMPOSITION_V4=1 COMPOSITION_V5=1 COMPOSITION_V6=1 COMPOSITION_V7=1 MATCHED_STONE=1 PORTAL_AO_CONTROL=1 PORTAL_NORMAL_CONTROL=1 node tmp/rpg-portal-abutments-proof.mjs. V7 uses the v6 procedural outer-wall helper with a different Blender source subset. Follow-up: recompute changed shelter/albedo and occlusion while preserving accepted unaffected surfaces, then review whole native composition and traversal/performance before installation.
