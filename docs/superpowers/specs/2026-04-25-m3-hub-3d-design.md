# M3 — 3D Hub + Placeholder Tutor — Design Spec

**Date:** 2026-04-25
**Status:** Draft for review
**Author:** Houston Searcy (with Claude)
**Parent spec:** `docs/superpowers/specs/2026-04-25-institute-design.md` (V1 milestones → M3)

## What this is

The first milestone that produces something **visual and on-device**. M3 builds the kid-facing Expo app's first 3D scene: a hub world the kid sees on launch, populated with placeholder geometry for the four mini-game portals and a placeholder tutor. No voice, no AI, no actual mini-games — those are M4, M5, M6.

The point: prove the 3D pipeline works on the Fire HD 10 at the chosen perf budget, establish the visual identity, validate the asset workflow, and give the kid something cool enough that he confirms the 3D direction is right.

## Non-goals (explicitly out of M3)

- Hero movement of any kind. Camera can orbit; the hero stands still. (See *Decisions deferred* below.)
- Real tutor character model — placeholder geometry only.
- Functional mini-games — portals only log + show a "coming soon" toast on tap.
- Voice / STT / TTS (M4).
- LLM integration (M5).
- Profile picker — `PROFILE_ID` is hardcoded in `config.ts`. The picker is a separate flat-2D screen and lives in a later milestone.
- Music or sound effects.
- Texture atlasing / advanced material work.
- Realtime shadows or post-processing.

## Decisions (locked during brainstorming)

| Decision | Choice | Why |
| --- | --- | --- |
| App tech | React Native + Expo (already chosen at design-spec level) | Established in main spec. |
| 3D stack | `react-three-fiber` + `expo-gl` + `@react-three/drei` | Standard 3D-in-Expo stack. |
| Aesthetic | Stylized low-poly | Locked in main spec. |
| Movement model (M3) | None — fixed-position hero, swipe-orbit camera, direct portal taps | Fastest to ship; isolates "does 3D work for us" from movement complexity. |
| Movement direction (post-M3) | Virtual joystick (Minecraft-style) — skip tap-to-move entirely | The user's son already plays Minecraft on tablet; joystick is familiar to him. |
| Hub polish bar | "Looks like an actual hub" — ground + cliffs + a few decor pieces + central focal point + 4 portals + tutor + skybox + fog. **Not** sterile, **not** post-processed. | Sterile is too dev-test to validate the 3D direction; polished is overbuilt for a placeholder milestone. |
| Asset source | Kenney Nature Kit (CC0). Tutor procedural. | Free, consistent, works at the perf budget. Meshy / Synty deferred. |
| Perf target | ≥30 fps on Fire HD 10 (2023) | Locked in main spec. Stretch: 60 fps on iPhone. |
| Profile model | `PROFILE_ID = "sam"` hardcoded in `config.ts` for M3 | Profile picker is a different milestone. |

## Architecture

A new Expo app `apps/kid-app/` joins the Bun-workspace monorepo as a peer of `packages/skill-engine`.

```
apps/kid-app/
├── package.json              # @institute/kid-app, deps on @institute/skill-engine
├── app.json                  # Expo config: orientation landscape, splash, icon
├── tsconfig.json
├── App.tsx                   # Root: Suspense boundary + <HubScene />
├── src/
│   ├── world/
│   │   ├── HubScene.tsx      # The R3F <Canvas>, lights, fog, sky, scene graph
│   │   ├── components/
│   │   │   ├── Ground.tsx    # Textured plane + cliff borders
│   │   │   ├── Tutor.tsx     # Placeholder capsule-with-eyes + idle bob
│   │   │   ├── Portal.tsx    # Glowing pillar with floating label, pulse anim
│   │   │   ├── SkyDome.tsx   # Gradient sky + distance fog
│   │   │   └── Decor.tsx     # Trees + rocks scattered (Kenney Nature Kit)
│   │   ├── hooks/
│   │   │   ├── useFps.ts     # frame-time → FPS readout
│   │   │   └── useAssets.ts  # preload GLB models via drei.useGLTF
│   │   └── camera.ts         # camera position/lookAt math + orbit clamping
│   ├── ui/
│   │   ├── LoadingScreen.tsx # Suspense fallback during asset load
│   │   ├── FpsOverlay.tsx    # corner FPS readout, dev-only
│   │   └── Toast.tsx         # "Coming soon" toast on portal tap
│   └── config.ts             # PROFILE_ID, perf flags, portal definitions
└── assets/
    ├── nature/               # GLB subset of Kenney Nature Kit (3-5 unique trees, 2-3 rocks)
    └── tutor/                # nothing for M3 — tutor is procedural
```

### Why this structure

- `world/` owns the 3D scene; `ui/` owns 2D overlays. Clean separation between "things rendered by R3F" and "things rendered by React Native UI."
- Each component file under `world/components/` is small and has one job. None should exceed ~80 lines in M3.
- `hooks/` and `camera.ts` are pure logic, unit-testable without GL.
- `config.ts` centralizes the things you'd tweak (portal positions, FPS overlay flag, hardcoded profile id) — no magic strings scattered through components.

## Scene composition

### Spatial layout (top-down sketch)

```
                        (sky / fog beyond)
              cliff/water perimeter (~30u radius)

                           tree
                             tree   rock
              tree
                          [HERO]
                  [TUTOR]  *
                                   tree
                rock
                    [PORTAL_1]  [PORTAL_2]  [PORTAL_3]  [PORTAL_4]
                       SC        BT          CS         DC
                                  (180° arc in front of hero)
                  tree                                     tree
                            (camera looking from south, ~45° pitch)
```

### Per-element budgets

| Element | Polycount | Notes |
| --- | --- | --- |
| Ground plane | < 200 tris | Subdivided plane with subtle low-poly noise |
| Cliff perimeter | < 1500 tris | Boxy shapes, hand-placed or extruded |
| SkyDome | < 50 tris | Inverted hemisphere with vertex-color gradient |
| Hero | < 500 tris | Capsule body + sphere head + 4 limb capsules |
| Tutor | < 300 tris | Capsule body + 2 eye spheres + mouth quad |
| 4 portals | < 600 tris each (2400 total) | Pillar + floating label background; text is sprite/canvas |
| Decor (~10 trees + 5 rocks) | ~3000 tris total | Kenney models, no LOD |
| **Total budget** | **< 30k tris** | Comfortable headroom under main spec's 30k limit |

### Lighting

- 1 directional light (warm-ish, ~6500K, intensity ~1.0)
- 1 ambient light (cool-ish, intensity ~0.4)
- No realtime shadows
- Materials use `MeshStandardMaterial` initially; downgrade to `MeshLambertMaterial` if perf demands it

### Animation

- Tutor: `useFrame` sine bob on Y axis (±0.1 unit, ~1.5s period). Eye blink every 3–5s (random).
- Portals: `useFrame` sine pulse on emissive intensity + slight scale (±2%, 1s period). Each portal phase-offset so they don't pulse in unison.
- Hero: idle is a static pose for M3; subtle breathing animation acceptable if cheap.
- Camera: free-orbit on swipe (see below); no autonomous camera motion.

## Camera & interaction

- `PerspectiveCamera`, fov ~50°, initial position computed from `(distance=10, pitch=45°, yaw=0°)` relative to hero.
- Swipe horizontally on the canvas → updates `yaw` by `dx * 0.005` rad. Yaw is clamped to `[-π/6, +π/6]` (±30°) so the kid can't get lost behind the hero.
- No pinch-zoom, no vertical orbit.
- Tap-handling via R3F's `onPointerDown` → raycast. Hits on:
  - **Portal:** call `onPortalTap(portalId)` → currently shows `<Toast>` "Coming soon — Spell Cast!" for 2s.
  - **Tutor:** play a wave animation (placeholder for future TTS dialogue).
  - **Anything else:** ignored.

## Asset pipeline

- Source: pick a small subset of [Kenney Nature Kit](https://kenney.nl/assets/nature-kit) — exact files specified in M3's plan.
- Format: convert/keep as `.glb`. Commit to `apps/kid-app/assets/nature/`.
- Loading: drei's `useGLTF` inside a Suspense boundary. `useAssets` hook preloads everything at app start; the `<LoadingScreen>` is the Suspense fallback.
- Total asset weight target: < 5 MB for M3.
- No Git LFS for M3 (size is small); revisit at M6 if assets grow.

## Performance instrumentation

- `useFps` hook: rolling 60-frame window, returns current FPS rounded.
- `<FpsOverlay>`: top-right, semi-transparent, shows `FPS / frame_ms`. Visible only when `__DEV__` or `config.showFps === true`.
- A `?perfHud=1` URL parameter (Expo Web only) toggles drei's built-in `<Stats />` panel for deeper diagnosis when needed.
- A short manual perf-test checklist (see *Testing*).

## Testing strategy

3D scene testing is hard. The plan separates by what's *actually* testable:

### Unit-testable (pure logic)

- `useFps.ts` — frame-timing math given mocked `performance.now()`.
- `camera.ts` — yaw clamping, position computation given inputs.
- `config.ts` — portal definitions are well-formed.
- `useAssets.ts` — state-machine transitions for asset loading (loading → ready, error path).

These get `bun:test` unit tests in a sibling `apps/kid-app/test/` directory.

### Component smoke tests (no GL)

- Render `<HubScene>` with React Test Renderer (R3F supports this in headless mode). Assert:
  - No throw.
  - Expected counts of `<Portal>`, `<Tutor>`, `<Ground>` instances in the scene tree.
- Tap a `<Portal>` (simulated event) → `onPortalTap` called with correct id.

These are integration-flavored unit tests. They do **not** verify visual rendering — that's manual.

### Manual on-device checklist

A short, written checklist run on a real Fire HD 10 (2023) before declaring M3 done:

- [ ] Cold launch < 5 seconds to interactive scene.
- [ ] Sustained ≥30fps measured via overlay during 60 seconds of "do nothing" idle.
- [ ] Sustained ≥30fps during continuous swipe-orbit for 30 seconds.
- [ ] No memory leak over a 5-minute session (Expo dev tools memory plateau).
- [ ] All 4 portal labels legible at the Fire HD 10's screen size and viewing angle.
- [ ] Cliffs prevent the camera from "seeing the void" beyond the hub edges.
- [ ] Kid verdict: positive ("cool", "play it again", or stronger).

The checklist file lives at `apps/kid-app/test/manual-checklist.md` and is updated each time M3 changes meaningfully.

## Success criteria

M3 is done when:

1. The Expo app builds and runs in Expo Web (`bun run --filter @institute/kid-app web`) and on a Fire HD 10 via Expo Go.
2. All unit tests pass (`bun test` from repo root).
3. The component smoke tests pass.
4. The manual on-device checklist is fully checked.
5. The user's son has interacted with it and given verbal approval.

## Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| `expo-gl` stability on Fire OS varies by version | Run on the actual Fire HD 10 early in M3 implementation, not at the end. If broken, fall back to a WebView-based renderer (very last resort). |
| Asset import quirks (Kenney files sometimes have unexpected scale/material settings) | Inspect each GLB in a desktop viewer (e.g., [gltf-viewer.donmccurdy.com](https://gltf-viewer.donmccurdy.com/)) before committing. Normalize scale to 1 unit ≈ 1m. |
| Text rendering in 3D space is finicky | Use drei's `<Text>` (SDF text) for portal labels — battle-tested and cheap. |
| Initial cold-launch time blown by asset preload | Defer non-critical decor to a second async load wave; show LoadingScreen only for hero + tutor + portals. |
| FPS measurement is itself expensive | Measure on a 60-frame rolling window; update the visible overlay only every 10 frames. |

## Open questions deferred to implementation

- **Exact Kenney files to use.** Pick during plan execution; document in the asset directory's README.
- **Hero geometry source.** May start as procedural primitives; if it looks awful, swap to a simple Mixamo-rigged placeholder (still no animation in M3).
- **Whether to add a tiny ambient audio loop.** Nice-to-have; defer unless asset count is trivial.

## Repo placement

This spec at `docs/superpowers/specs/2026-04-25-m3-hub-3d-design.md`. Plan to follow at `docs/superpowers/plans/2026-04-25-m3-hub-3d.md`. Implementation on a feature branch `m3-hub-3d`.
