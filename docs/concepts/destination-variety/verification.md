# Destination checks

Four new areas, each with six distinct room layouts and named stages. All unlock with zero clears. Mixed relic pools retain first reward and progression gates. Existing vault difficulty and save IDs are preserved. Existing imported enemy, boss, hero and weapon assets are reused.

Validation:
- 340 unit and server tests pass across44files. Includes all24 formations, arrival routes, real geometry floor support, coastal shore height, final-stage terrain, resource cleanup, region starts, old-save compatibility and mixed relic coverage.
- Production build passes.
- Real Windows Brave:25scene views (24outdoor + original vault),4 real solved-question casts, natural travel from stage1 to2 in every outdoor region, desktop1440x900 and phone390x844. No page/console/game-resource errors. The optional missing favicon is excluded by exact URL; other HTTP errors fail.
- Final terrain width and depth checked on all4 phone views. Menu previews use actual canvas images. Tests use disposable data; framing checks change only an isolated browser's in-memory view.
- Two focused worker reviews covered data/UI and layout/scene safety. Review found buried coastal water; ground now descends below the sea. Map lookup guards unknown inherited keys. Phone terrain edge extended.

Performance: Outdoor whole-frame draw calls40–85, triangles600,518–1,720,374. Vault baseline128calls/968,692triangles. These are short local captures, not a device benchmark. Imported characters dominate whole-frame triangles; environment draw calls remain below baseline. Existing adaptive render quality remains active.

Asset sources: Three CC0 Poly Haven terrain sets, six1K JPGs,5.58MB total, plus four in-game scene previews (up to960x600, with adaptive render resolution). Exact links and hashes: web/public/assets/rpg/outdoors/sources.json. Trees, rocks, paths, rails, roots, ruins, foliage and fountain use batched authored geometry. Shared maps/materials are disposed on destination change; only nearby rooms draw. Existing combat audio retained.

Workflow record: Design and loop contract in plan.md. Director, gameplay, graphics, UI, debug and QA skills read; layout/data workers completed their phases. Generator skills read; new character generation was outside this environment-only task. Existing imported actors retained; terrain photos sourced externally. Gameplay design/layout, graphic architecture/model/render/technical-art and QA references used. Visual harness added for captures and interaction; no strict screenshot baselines because browser timing, shaders and celebration overlays vary. Canvas-image previews prove rendered output; scene capture is supporting visual evidence. No premium/AAA rating claimed.

Local URL: http://127.0.0.1:5188/ . Choose an expedition to enter a new area. Changes are local; not pushed in this task.

## Foliage revision

Replaced large flat polygon leaves with curved pointed leaves arranged in three-dimensional twig sprays. Each leaf has a folded midrib and shaded edges. Foliage geometry is assembled per crown before room batching to limit construction overhead. Ten outdoor geometry/support/disposal tests pass; production build passes. Browser phone views and scene previews regenerated for forest and garden.
