# Tripo hero — playable integration

Generated September 12, 2026 from the approved character concept only. No previous Blender models, materials, rigs, or procedural hero geometry were used.

## Inspect

- Local viewer: http://localhost:5188/tripo-hero.html (Vite dev server).
- Asset: `web/public/assets/rpg/tripo-hero.glb`.
- Front and rear preview images: `front.png`, `back.png` in this directory.
- The RPG uses `web/public/assets/rpg/tripo-hero-game.glb`, with idle, walk, cleave and cast animations.
- Animated inspector: http://localhost:5188/tripo-hero.html?asset=game.
- All earned armor styles use this new model with elemental tints; existing weapons and wearable items mount on its new skeleton.

## Generation

Source: `docs/concepts/math-dungeon-rpg/07-teal-hero.png`, using its existing unmodified left-half crop `docs/hero-img2threejs/reference/front.png`. The rear concept was used for review, not generation: both illustrations have three-quarter views and their cape directions conflict, making them unsuitable as a calibrated front/back input pair.

Tripo task: `73d2557b-ad1c-41e9-baa3-e639d47acd2d`.

```
POST https://openapi.tripo3d.ai/v3/generation/image-to-model
model: v3.1-20260211
geometry_quality: detailed
texture_quality: extreme
texture: true
pbr: true
texture_alignment: original_image
enable_image_autofix: false
face_limit: 100000
model_seed: 20260912
texture_seed: 20260912
```

The reference was uploaded through Tripo's authenticated file endpoint. Credentials remain in the local ignored `.env`; they are absent from this document and the viewer.

Created at `2026-09-12T10:58:10.587301Z`, completed at `2026-09-12T11:02:32.382063Z`: approximately 4 minutes 22 seconds of provider processing. Cost: 70 credits ($0.70). Exactly one model-generation task was submitted.

## Original static output and verification

- 9,171,548-byte GLB, 94,750 triangles, one mesh and one PBR material.
- Embedded base color: 8192 x 8192 JPEG; ORM and normal maps: 4096 x 4096 JPEG each.
- No skin or animation clips. The sword is included in the same mesh.
- Loaded successfully through Three.js GLTFLoader in Chromium; four captured views, zero page errors, one model draw call.
- Viewer rotates the instance from the exported +X forward axis to +Z, centers it, and measures the upper vertices for the face camera. The downloaded GLB is unchanged.
- Web TypeScript and production build pass. The inspection page is a development entry, separate from the production game's index entry.

## Original static art review

Static appearance: **8.0/10 overall**, where 10 is AAA quality. Strong concept likeness in silhouette, teal/gold/steel colors, layered armor, pouches, tabard, boots and sword. Detailed review rated front/three-quarter approximately 8.5; close-up face and rear approximately 7.5. This is not a claim that every detail is finished or the model is ready for animation.

Remaining art gaps: missing gold border/motifs on the rear cape, a lower/heavier cape silhouette, noisy/crumpled metal surfaces, angular and soft facial details, and fingers/grip that need closer inspection.

The integration below separates equipment, adds a fresh rig and animations, repairs cape deformation and tests the result in the dungeon. No previous Blender hero assets were reused.

## API references

- [Image-to-model settings](https://developers.tripo3d.ai/en/docs/generation-image-to-model/standard)
- [Multiview requirements](https://developers.tripo3d.ai/en/docs/generation-multiview-to-model/standard)
- [Pricing](https://developers.tripo3d.ai/en/pricing)

Raw API responses and additional captures remain in ignored `assets/tripo-hero-2026-09-12/` locally. No key is stored there.

## Playable asset pipeline

The game asset contains 94,750 triangles, 14 meshes/materials, two skins and four animation clips. Segmentation provides 1024px base-color, normal and ORM maps per part. Unused export resources are pruned without changing any referenced geometry or image bytes; the playable download is approximately 11 MB.

Fresh provider tasks:

- Semantic segmentation: `ab4af039-29c5-49b6-81d2-ecff03495ab0`, v2.0-20260430, balanced, 40 credits.
- Initial Mixamo rig: `48f447b2-1bce-483e-8e6d-52934e4f6982`, 25 credits. Retargeting rejected this skeleton specification; it is not used by the game.
- Native Tripo rig: `b2cf2e29-0960-44bc-8cbd-aa22b94cf9e2`, v1.0-20240301, 25 credits.
- Native animation batch: `3fbcc266-7e55-4b13-9ee2-cf51b00eaad9`, idle/walk/slash/cast-a-spell, 40 credits.

Integration generation cost: 130 credits ($1.30), plus the original 70-credit model. Rig checks were free. No additional image-to-model generations were submitted.

The source sword's blade, guard, pommel and handle were separated from the hand by exact UV triangle correspondence. The new sword mounts rigidly to the right hand; replacement game items hide it, while wearable items retain it. Palm, head, chest and belt sockets were measured directly on this new mesh. The original Tripo rig incorrectly assigned most cape weights to the sword hand, so the cape now uses Spine02 and three newly created cloth hinges. Geometry and textures remain unchanged.

Processing scripts, in order (raw input files remain in ignored `assets/tripo-hero-2026-09-12/integration/`):

1. `scripts/prepare-tripo-equipment.py` — transfer the exact handle mask, attach the source sword, insert measured equipment sockets and normalize forward direction.
2. `scripts/finish-tripo-hero.py` — correct the provider's displaced Hip translation, trim the walk to one measured stride cycle, retime slash contact to 0.18 seconds, and trim casting to a left-hand gesture with an idle recovery.
3. `scripts/rig-tripo-cape.py` — repair cape skinning and add secondary motion to the four clips.
4. `scripts/prune-tripo-glb.py` — remove unreferenced resources and verify that every live binary payload is preserved.

Idle (15.333 seconds) and walk (1.167 seconds) have matching loop endpoints. Cleave (1.2 seconds) and cast (1.25 seconds) play once. Runtime movement speed is calibrated from this rig's animated feet. The playable skeleton, animation and texture sources are all from this Tripo pipeline.

## Gameplay validation

- Production TypeScript/Vite build passed.
- Twenty focused tests passed for fresh-hero normalization, material ownership, gait calibration, attachment transforms and weapon/wearable switching.
- Chromium loaded all four animation clips without page errors; deterministic pose captures include front, back, face, walking, sword contact and casting.
- A real correct answer on the local `rpg-veteran` fixture triggered Ball Lightning, earned 32 XP, cleared the room and continued into the guardian room.
- Learning code, server persistence and progression data formats were not changed. No Ares verification or live-child progress mutations were performed.

The required hero download has an explicit retry screen. Startup waits for the asset before restoring a problem, so a failed download cannot silently discard the saved dungeon checkpoint.

- Local browser equipment sweep passed for all 23 owned items, including swords, staffs and wearable relics. All four appearance IDs keep the new model.
- Forced hero-download failure preserved the exact saved checkpoint and made no POST requests. Retry restored the same problem, expedition and room. No legacy hero assets loaded; no page errors occurred.
- A real Heavy Cleave answer damaged the guardian-room enemies using the new animation and equipped weapon.

Equipment measurements, the exact handle triangle mask, cape checks and lossless pruning report are retained in `metadata/`. The cape counter-rotates during the torso's cleave lean so the hem hangs down instead of following the chest horizontally.

## Integrated visual review

Independent reviewer: **8.0/10 at the actual dungeon viewport** after the cleave cape correction. Revised contact poses keep the cape hanging behind the body with a visually continuous shoulder attachment. Teal cloth, gold armor, weapons and casting gestures remain readable in the dungeon. Close-up limitations remain in the loose supporting-hand grip, relatively simple cloth motion and softer face/metal texture detail. The visual score covers rendered appearance and sampled deformation; real-time playback was exercised by the separate local gameplay checks.
