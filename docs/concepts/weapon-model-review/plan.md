# Weapon concept match review

Scope: all 23 saved equipment IDs, including the four worn relics shown in the weapon concept gallery. Compare exact live GLBs with the existing concept sheets. Upgrade each item below 6/10. Keep gameplay IDs, stats and saved inventory unchanged.

Rubric: silhouette 3, proportions 2, materials 2, concept detail 2, construction 1. A score of 6 must retain the identifying form and usable construction. A missing grip or broken surface prevents installation regardless of total score.

Steps: capture all four model views; independent concept review; isolate original front references; build failed models locally in Blender; pack to the existing equipment contract; review exact candidate files; verify equipped idle/cast/cleave and worn attachment; install approved assets and derived thumbnails; run asset audit, unit tests, build and browser checks.

Asset strategy: original concept → front reference crop → local solid Blender geometry with projected surface detail → measured scale and grip. New images are not needed because all 23 reference sheets already exist. No changes to lighting, shaders or gameplay are planned. Target at most 12k triangles, three materials and 3 MB per model, matching the existing validator. Keep emission modest and rely on shape and surface detail.

References read: threejs-aaa-graphics-builder/SKILL.md, references/visual-scorecard.md, references/technical-art.md; threejs-3d-generator/SKILL.md, references/api-notes.md, references/threejs-integration.md. The user requested a scoped 6/10 concept match, not an overall AAA rating.

Credential probe: TRIPO_API_KEY=SET. The key remains in .env and is never written into assets or logs. Generation receipts store task IDs and settings, not signed URLs. Original live GLBs, thumbnails and installation manifest are preserved in original-models/.

## Current state

All 23 original models were below the requested concept-match threshold. Local Blender replacements were built and reviewed from four angles. The user paused further refinement, viewed the candidates, and explicitly approved installing all 23 on 2026-09-12. The exact approved hashes are in accepted.json; this is user acceptance, not a claim that every candidate passed the unfinished critic review.

All 23 replacements and 512px inventory images are installed. Original assets remain in original-models/. The installation manifest records source files and hashes. The review page loads the installed models by default; candidate=1 selects the matching review copies.
