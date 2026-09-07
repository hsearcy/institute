# Answer power and teaching-only skips — independent QA

2026-09-07. The browser reviewer did not implement the gameplay, clock, or UI changes.

The scratch browser test uses a new `/tmp` database, API port 8977, web port 5277, and a separate Chromium context over the dedicated CDP endpoint. It never uses the family save or the user's running preview on 5188/8799.

`bun --no-env-file scripts/playtest-rpg-answer-power.ts` runs real tutor requests, answer submissions, server combat, and reload recovery. Only attack-clock age, one HTTP response delivery, and narration audio delivery are controlled. Scene animation and combat results remain real. The narration fixture uses a valid short local audio clip to exercise playback completion; it is not a voice-quality assessment.

Checks cover:

- “I don't know” and the three-wrong-answer walkthrough advance to the next learning question without an RPG resolve request, rendered attack, XP, HP change, kill, or room change.
- Correct answers produce actual combat receipts at 100%, 90%, 80%, 50%, and 30% power. Damage scales to 9, 8, 7, 5, and 3 for the starting sword. Correct-answer XP remains 32.
- Pausing freezes the power clock. Hint, replay, pause, and reload preserve its accumulated time. A lost combat response reuses the exact submitted timing and existing receipt, without duplicate damage or XP.
- Initial narration holds the clock at zero until audio finishes; muted questions start immediately.
- The desktop answer input, attack button, and help controls stay in the existing single row. The power label and help options remain visible on a 390-pixel phone without horizontal overflow.

## Visual critique

**8/10 for the changed attack-button percentage label only** on the requested scale (10 = AAA, 1 = garbage). The gold text fits the existing engraved button, the fixed numerical width avoids jitter, and desktop and phone captures show clean alignment with no clipping. The small label preserves the compact layout the user requested. It is restrained functional UI rather than a new visual effect; a subtle future visual treatment could make the power changes more noticeable without adding another row.

This rating does not apply to the unchanged world, character models, spell effects, or the full HUD. Browser checks of narration timing do not establish tutor voice quality.

Final browser artifacts are in `docs/rpg-playtest/answer-power-2026-09-07/`.
