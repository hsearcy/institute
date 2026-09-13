# Enemy animation integration

The game and `web/enemy-animation-review.html` use the same installed models. Skeleton, Revenant, Guardian, and Vault Guardian Boss now have independent skin skeletons. Wraith uses continuous cloth deformation. The approved source textures and mesh surfaces are retained.

Idle motion, directional hits, and deaths differ by enemy. Feet use surface contact and leg IK. Deaths blend from the last living pose. Skin transforms update before surface checks, including moved and scaled actors. Skin materials and shadows share death erosion. Encounter changes dispose each old actor skeleton texture. Cached support samples reduce repeated actor setup.

## Verification

- `bun test server shared scripts web/unit-tests`: 508 pass, zero failures across 64 files. See `unit-tests.log`.
- `bun run --cwd web build`: TypeScript and production build pass.
- Focused real-game check: `cd web` then `RPG_TEST_CDP_URL=http://127.0.0.1:9222 bun x playwright test --config playwright.enemy-review.config.ts`. The optional CDP endpoint uses a new context in Windows Brave. Omit it for local headless Chromium. The test uses a disposable tutor database.
- Final browser run: one test passed in 23.9 seconds. About 60 FPS over a four-second foreground sample at 1440 × 1000, full quality, ten actors, 222 draw calls and 1,408,658 triangles. This is a desktop sample, not a mobile performance claim. See `runtime-audit.json` and `active-dungeon.png`.
- The focused browser check covers all five types, both hit sides, death during recovery, idle motion, independent clones, erosion, removal, and encounter reset. It compares the learning state before and after presentation checks.
- Final full-mesh floor minima at 1.6 and 2.2 seconds: Skeleton -4 mm, Revenant 0 mm, Guardian 0 mm, boss -2 mm. Scaled and translated actor tests permit 6 mm times actor scale.
- The independent critic report is `final-visual-review.md`. Its motion score is a visual judgment based on temporal samples. It is separate from the runtime checks.

The older full-expedition browser test stopped at its existing guide/starter UI assumptions. It is not reported as passing. The focused browser test checks the changed animation path directly.

## Review

Open `/enemy-animation-review.html` on the local Vite server. Select an enemy and pose, then press Play. Use the time slider, camera views, impact side, and Dissolve option to inspect motion. The page starts paused. `installed-files.json` records final file hashes. Source and rig records are in `../enemy-animation/`. Approved static models remain in `web/public/assets/rpg/candidates/*-tripo.glb`.
