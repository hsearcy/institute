# First Tripo hero candidate

Generated September 12, 2026 from the approved character concept only. No previous Blender models, materials, rigs, or procedural hero geometry were used.

## Inspect

- Local viewer: http://localhost:5188/tripo-hero.html (Vite dev server).
- Asset: `web/public/assets/rpg/tripo-hero.glb`.
- Front and rear preview images: `front.png`, `back.png` in this directory.
- The game still uses its existing hero. This candidate has no skeleton or animations and is not integrated into gameplay.

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

## Actual output and verification

- 9,171,548-byte GLB, 94,750 triangles, one mesh and one PBR material.
- Embedded base color: 8192 x 8192 JPEG; ORM and normal maps: 4096 x 4096 JPEG each.
- No skin or animation clips. The sword is included in the same mesh.
- Loaded successfully through Three.js GLTFLoader in Chromium; four captured views, zero page errors, one model draw call.
- Viewer rotates the instance from the exported +X forward axis to +Z, centers it, and measures the upper vertices for the face camera. The downloaded GLB is unchanged.
- Web TypeScript and production build pass. The inspection page is a development entry, separate from the production game's index entry.

## Independent art review

Static appearance: **8.0/10 overall**, where 10 is AAA quality. Strong concept likeness in silhouette, teal/gold/steel colors, layered armor, pouches, tabard, boots and sword. Detailed review rated front/three-quarter approximately 8.5; close-up face and rear approximately 7.5. This is not a claim that every detail is finished or the model is ready for animation.

Remaining art gaps: missing gold border/motifs on the rear cape, a lower/heavier cape silhouette, noisy/crumpled metal surfaces, angular and soft facial details, and fingers/grip that need closer inspection.

Before gameplay integration: inspect/separate held equipment, rig and animate this new mesh, check deformation and casting/equipment sockets, optimize texture memory, and test in the actual dungeon. Do not reuse prior Blender work for this candidate.

## API references

- [Image-to-model settings](https://developers.tripo3d.ai/en/docs/generation-image-to-model/standard)
- [Multiview requirements](https://developers.tripo3d.ai/en/docs/generation-multiview-to-model/standard)
- [Pricing](https://developers.tripo3d.ai/en/pricing)

Raw API responses and additional captures remain in ignored `assets/tripo-hero-2026-09-12/` locally. No key is stored there.
