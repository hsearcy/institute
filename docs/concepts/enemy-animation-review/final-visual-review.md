# Final enemy motion visual review

Result: all 15 enemy/state pairs meet 8 out of 10 in the reviewed model viewer. This is a visual motion approval. It is not full-game release approval or a frame-rate measurement.

| Enemy | Final rig | Idle | Hit, both sides | Death |
| --- | --- | --- | --- | --- |
| Skeleton | 17 | 8 | 8 | 8 |
| Revenant | 15 | 8 | 8 | 8 |
| Guardian | 17 | 8 | 8 | 8 |
| Vault Guardian boss | 15 | 8 | 8 | 8 |
| Wraith | Existing mesh, motion v3 | 8 | 8 | 8 |

The result is good, with restrained procedural motion. It does not claim exceptional acting or the quality of a hand-animated film character. Each pair receives action 1.5, support 1.5, continuity 1.5, visible integrity 2, and character/readability 1.5. No critical failure remains visible in the reviewed state sequences.

Skeleton scans with its head, recoils quickly, and loses strength into a slumped kneel with delayed sword movement. Revenant has a guarded stance, equipment follow-through, and a shield-side fall that preserves its continuous armor and cloak. Guardian falls forward with its stone forms intact. Boss has slower final contact and heavier arm recovery. Wraith has continuous robe motion, delayed hem response, and a yielding spectral death before disappearance.

## Evidence and limits

The reviewer inspected temporal samples from actual browser captures. Contact sheets preserve every selected sample in time order. Idle coverage includes 18 to 20 seconds. Hit and death clips cover 2.2 seconds. Dense event review used ten samples per second from supplied exact 30-frame-per-second clips. This is sampled temporal inspection, not direct continuous video viewing. Wraith also has 92 half-second samples from a live browser recording. That recording ends before full death, so its deterministic full death clip supplies the ending.

The review first used staged evidence. A final live recapture closes the changed-rig gap: Skeleton 17, Revenant 15, and Guardian 17 were each captured again through 18 seconds of idle and 2.2 seconds of both hit directions. All 117 new screenshots were inspected as nine time-ordered sheets in `final-live/`, with full-size Revenant right-hit and Guardian left-hit checks at 0.11 seconds. Motion remains consistent with the prior approval. Final death and contact checks already use these same rigs; boss 15 and Wraith were unchanged. The 8 out of 10 verdict stands.

A small isolated dark sliver remains below the Revenant sword hand in the full-size right-hit frame. It does not interrupt the grip or main silhouette at game scale. This minor residual does not meet the critical-failure threshold. No large shield fan, knee strip, or exposed stone wrist cut is visible in the final live samples.

Key preserved evidence:

- `solid-v3-playback/`: all four game-angle idle and right-hit sequences.
- `solid-left-final/`: all four opposite-side hit sequences.
- `solid-death-final/`: Skeleton final close/game death and stone game death. Its Revenant 14 sheet is failed evidence and must not be used for approval.
- `solid-death-wide/`: corrected Revenant 15 close/game death and uncropped stone close deaths.
- `final-contact/`: stone ground contacts and corrected Revenant final poses.
- `wraith-v3-sheets/`: close/game samples, live-recording samples, both hit sides, complete actual-dissolve death.
- `final-live/`: final installed Skeleton 17, Revenant 15, and Guardian 17 idle/right-hit/left-hit recapture. Raw screenshots remain in `/tmp/enemy-final-live-right/` and `/tmp/enemy-final-live-left/`.

Source clips remain in `/tmp/enemy-solid-playback-native-v3/`, `/tmp/enemy-solid-left-final/`, `/tmp/enemy-death-final-close/`, `/tmp/enemy-death-final-game/`, `/tmp/enemy-death-final-wide/`, and `/tmp/wraith-coherent-v3-native/`. Receipts report no browser errors for the supplied deterministic clips. Exact source timestamps are printed in those clips. The sheets are review aids; their derived labels identify sample intervals and do not replace the embedded timestamps.

Live game integration, idle-to-hit and hit-to-lethal interruption, actor independence, support measurements, resource disposal, and room rendering cost are separate technical checks. Root reports that final runtime verification passed for all five live enemies, with 508 tests and a successful build. This reviewer did not run those checks. Root reports final full-mesh minimum heights relative to floor: Skeleton -0.004 m, Revenant 0 m, Guardian 0 m, boss -0.002 m. Contact images show a stable supported end; millimeter floor clearance comes from those vertex measurements, not visual estimation.

## Files at final review

| File | SHA-256 |
| --- | --- |
| `web/public/assets/rpg/animated/skeleton.glb` | `18727681ab1c74c1c88b0094402ff30c88c48ba559bb9cbd3bef348db348a884` |
| `web/public/assets/rpg/animated/revenant.glb` | `19773c4287fe51118909eb7629996a8437f4923e56e1d5c77507372f3dabed45` |
| `web/public/assets/rpg/animated/guardian.glb` | `1a1ef4349df16a77398a91f8ad53356583908821839b48a54c43edab85df9812` |
| `web/public/assets/rpg/animated/vault-guardian-boss.glb` | `8858d615e07e70ad95c03875da466c58de4533b60a77482933e34a6525931862` |
| `web/public/assets/rpg/wraith.glb` | `69171e7658908ebf9c02d38b9d58ace204b5971c9978c19904e6584b93694b50` |
| `web/src/rpg/world/SkinnedEnemyAnimator.ts` | `2cf7df462033071aef11112efb79318ee5112fecb414fd63f5514b2fbda95efd` |
| `web/src/rpg/world/EnemyAnimator.ts` | `8fce0362ea21128aff02614c3f34d42166125f1d6de8ed5530575220a930f373` |

The installed live Skeleton, Revenant, and Guardian GLBs were independently hashed after recapture and match the corresponding animated candidate hashes above. The implementation hash includes final transformed-wrapper matrix refresh and the 0.12-second cached-living-pose death blend. Root verified those integration changes separately; settled viewer poses remain consistent.

No further visual revision is requested from the reviewed evidence. Preserve failed review reports as the record of defects that led to the final motion.
