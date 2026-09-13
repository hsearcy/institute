# Wraith v3 motion review

Result: idle 8, hit 8, death 8. Pass for the reviewed model viewer motion. Full-game interruption and integration checks remain outside this review.

| State | Action | Weight / spectral support | Continuity | Integrity | Character / readability | Total |
| --- | --- | --- | --- | --- | --- | --- |
| Idle | 1.5 | 1.5 | 1.5 | 2 | 1.5 | 8 |
| Hit | 1.5 | 1.5 | 1.5 | 2 | 1.5 | 8 |
| Death | 1.5 | 1.5 | 1.5 | 2 | 1.5 | 8 |

Idle has restrained upper-body drift and delayed robe motion. Hit from either side gives a clear recoil, followed by lower-robe movement and clean recovery. Death visibly yields through a continuous robe arc before the actual erosion removes it. No broken staff, open neck cut, or detached body group is visible in the inspected sequences. Motion remains readable at the game angle. The result is good; it is not an exceptional animation performance.

Evidence inspected: close idle/hit and game-left hit contact sheets; all 92 half-second samples from the 46.1-second browser recording; 22 dense samples each from deterministic right hit, left hit, and complete actual-dissolve death. The dense sheets use 10 samples per second from the supplied 30-frame-per-second clips. Review sheets are in `wraith-v3-sheets/`. This was sampled temporal inspection, not direct continuous video viewing and not a hardware frame-rate measurement. The live recording ends during initial death; the deterministic clip supplies the complete death instead.

Valid complete clips: `/tmp/wraith-coherent-v3-native/`. Its death receipt reports 66 frames over 2.2 seconds, actual game camera, dissolve enabled, no browser errors, 7 meshes, and 9,188 triangles. The exact source timestamps are printed in the frames. Native capture reports a Windows browser user agent.

File hashes recorded at review:

- `web/public/assets/rpg/wraith.glb`: `69171e7658908ebf9c02d38b9d58ace204b5971c9978c19904e6584b93694b50`
- `web/src/rpg/world/EnemyAnimator.ts`: `8fce0362ea21128aff02614c3f34d42166125f1d6de8ed5530575220a930f373`

No further Wraith motion revision is requested from this evidence. Recheck if final code or asset changes alter this motion. Root must still verify a hit during idle, lethal interruption during recovery, and the full game path.
