# Solid enemy idle and hit check

Status: not approved. Source evidence is `/tmp/enemy-motion-idlehit/`. The eight contact sheets in `idlehit-preliminary/` preserve all 104 supplied samples in time order. Idle covers 0 to 18 seconds. Hit covers 0 to 2.2 seconds, with dense onset samples. Rigs: Skeleton 13, Revenant 6, Guardian 10, boss 11. This set predates the recovery support-travel correction.

The reviewer inspected all eight sheets, then full-size Guardian and Revenant hit at 0.11 seconds and Skeleton idle at 6 seconds. Contact sheets support action comparison; they do not prove clean joints at full size or continuous playback.

| Enemy | Provisional idle | Provisional hit |
| --- | --- | --- |
| Skeleton | 6.5 | 7 |
| Revenant | 6.5 | 6.5 |
| Guardian | 6.5 | 7 |
| Vault Guardian boss | 6.5 | 6.5 |

These are work-in-progress estimates, not final rubric approvals. Full-size review of both directions, normal game scale, actual playback, and corrected final assets remains necessary.

All four idle sequences are restrained and mostly stable. Head turns and small chest motion are visible. There is little change in weight or enemy character. Suggested secondary actions: a small Skeleton head tick and weapon settle; a Revenant shield weight adjustment; a slow stone shoulder load shift. Keep soles stable.

Hit recoil is clear. All four peak at 0.045 to 0.11 seconds and return close to rest by 0.35 seconds. Heavy enemies need delayed chest and arm recovery. Boss timing is too close to Guardian timing. Add visual follow-through from about 0.2 to 0.6 seconds without changing gameplay stun.

Revenant hit at 0.11 seconds has flat strips below the shield near the thigh and a small isolated fragment below the sword wrist. Builder received these defects. The other inspected peak frame, Guardian, has substantially cleaner arms.
