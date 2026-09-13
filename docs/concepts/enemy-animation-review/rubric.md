# Independent enemy animation review

Scope: idle, hit, and death motion for Skeleton, Revenant, Guardian, Vault Guardian boss, and Wraith. The user requires at least 8 out of 10. Each of the 15 enemy/state pairs must pass. A strong average cannot hide one failed state.

Review actual motion from the final game assets. A single peak pose cannot prove timing, foot contact, recovery, or a clean transition. The reviewer must see the complete supplied capture set, including failed attempts.

## Score for each enemy and state

| Item | Maximum | Required evidence |
| --- | --- | --- |
| Readable action and timing | 2 | Idle reads as alert life; hit has a clear impact and recovery; death loses support and reaches a stable end. |
| Weight and support | 2 | Feet stay planted when loaded. Hips and torso transfer weight. Heavy enemies move with visible mass. The Wraith may float, but its robe and staff move coherently. |
| Motion continuity | 2 | No sudden jump at start, loop, interruption, or end. Parts follow with controlled delay. Repeated hits do not reset into a bad pose. |
| Mesh and equipment integrity | 2 | No detached weapon, broken wrist, open mesh seam, severe joint collapse, or large body/weapon intersection. |
| Enemy character and game readability | 2 | Motion reads at the game camera and scale. The five enemies differ in useful ways. Effects do not hide the action. |

Score anchors: 0 means missing or broken; 1 means readable but mechanical or incomplete; 2 means convincing and clean in the reviewed sequence. Half points are permitted. Pass requires at least 8 and no critical failure.

Critical failures: the model stays rigid while the whole root wobbles; weapon detaches; body breaks unintentionally; feet visibly slide through a loaded stance; death freezes upright or shrinks away before a fall is readable; a supplied sequence hides the action with effects; no temporal evidence exists.

## Motion intent

- Skeleton: light, brittle, alert. Small head/shoulder motion at idle; quick off-axis hit and a supported recovery; clear loss of support at death.
- Revenant: armored and guarded. Shield/weapon weight affects stance; hit moves torso and knees with delayed equipment; death feels heavy and controlled before the final fall.
- Guardian: stone mass. Slow shifts at idle; restrained but readable impact through upper body; sequential knee/body fall with a heavy settled end.
- Vault Guardian boss: larger mass and authority than Guardian. Slower timing and wider support; clear delayed upper-body response; a distinct large collapse without foot skating.
- Wraith: spectral, with a continuous robe. Slow drift and layered arm/cloth motion; hit interrupts that drift; death loses structure instead of tipping a rigid cone.

## Evidence set

For each enemy: at least two full idle loops; hit through recovery from both sides; death through final settled pose. Use a view with a visible ground grid/contact shadow and a three-quarter camera. Include the native game camera with normal effects and at least one sequence without effects. Include a hit during idle and a lethal hit during hit recovery.

A frame sequence can support the review if sampling is fine enough to show the event timing. Idle: 8 or more samples over a complete cycle, plus loop boundary. Hit: before impact, onset, peak, catch, recovery, settled. Death: onset, recoil, loss of support, ground contact, settle, final state. A real-time clip is preferred for timing; contact sheets are useful for close inspection.

Keep gameplay timing separate from cosmetic animation. Verify that disappearance/erosion does not cut off the visible death. Record final asset hashes, pose implementation version, camera, sampling times, and measured renderer cost. Do not claim full-game performance from a one-model viewer.

## Initial architecture findings

The four current Tripo GLBs each contain one mesh and no skins, joint tags, or animation clips. The existing `EnemyAnimator` exits when the required named joints are absent. The Wraith has seven rigid joint tags and a custom cloth morph.

The current animator recognizes only `guardian` as brute; the boss ID requires separate handling. Ground support uses static mesh points and requires changes for deformed skin geometry. The world also applies whole-model feint, bounce, tilt, and death scaling; these can conflict with new grounded animation. The existing instancing path copies mesh transforms and morph weights, not bone palettes.
