# Enemy animation pass

Preserve the approved Tripo surfaces. Add Blender armatures and weights to the four static models; retain the Wraith rig. Use independent actor skeletons. Give each enemy distinct idle, impact, recovery, and death timing. Keep feet on the floor and equipment attached during active motion. Preserve combat outcomes and encounter counts.

1. Builder: prepare and bend-check rig candidates and rest metadata.
2. Root: add bone animation, skin-compatible runtime loading, actor motion, and a deterministic motion review page.
3. Dissolve agent: add per-skinned-actor material/depth erosion with independent uniforms.
4. Critic: review every enemy/state sequence, both hit directions and reset; require at least8/10 for each pair. Revise from concrete defects.
5. Verify game-scale playback, contact, build, relevant tests, and renderer cost. Install reviewed files and record limits.

Technical contract: keep source textures and triangle counts; no model regeneration. Budget target: <=300 desktop draw calls for a normal room, with current high-detail triangle cost measured separately. Avoid per-frame geometry copies. Shared source geometry/textures, independent bone poses and dissolve uniforms. Current boss-room baseline:191 draws and1.445M triangles on desktop. The new rigs can increase draws; measure before completion.

References read: 3D generator skill and API notes; graphics builder skill, visual scorecard, technical art and implementation blueprint. Existing Tripo task records establish external asset sourcing. No new image generation is needed because the user approved model appearance.
