# First skeleton motion check

Status: failed preliminary evidence. No formal score. The rig and motion were still in work. These images do not identify the final asset hash.

Evidence: six actual browser captures in `first2-skeleton/`, from the first2 capture run. Reviewed idle at 0 seconds; hit at 0.1, 0.3, and 0.65 seconds; death at 0.65 and 1.6 seconds. This is a limited frame sample, not a complete motion review.

- Hit at 0.1 seconds gives a clear head and chest recoil. However, the weapon wrist and forearm pull into flat strips. At 0.3 seconds, a stretched triangle remains at the weapon-side knee.
- Death at 0.65 seconds pulls large strips across the knee and cloth. At 1.6 seconds the distortion is worse. This is a critical mesh failure.
- Death ends this sample in a crouch, with the trunk above the pelvis and both feet apparently raised. It does not show a convincing supported fall. The plain floor has no contact marks, so exact foot height is not established from this image.
- Hit recovery at 0.65 seconds is readable, but the failed weights prevent an assessment of clean secondary motion.

Required next evidence: revised skin weights; death with clear loss of support and a stable end; visible floor grid or contact shadow; full idle cycle; both hit directions; final game-scale motion. Root and the rig builder received the defects. Do not use this report to grade their later revisions.
