
## Review amendments (folded in before execution)

- `reportSkip` only fires when `firstAttempt === null` (a skip after a wrong answer would double-record the problem); the server also ignores a skip whose `problemId` already has an attempt row. The walkthrough + advance still happen either way.
- `reportSkip` fires BEFORE the walkthrough fetch (no ordering race with the next `fetchBranches`; records even if the LLM call fails).
- Skip rows always carry `topic_id` (the `/mastery` skips aggregation groups on it).
- The choice row is an absolutely-positioned overlay with `pointer-events: auto` — never in normal flow (would squeeze the pad on short screens, re-opening the bug fixed in `5027ad7`).
- `.replay.not-sure` gets its OWN opacity/`.avail`/`.busy` rules (the existing ones are scoped to `.replay.explain`); the 🔊 binding tightens from `.replay:not(.explain)` to an explicit class.
- Walkthrough sentence-trim at 550 (matches the working explain code's headroom under the 600 cap).
- `MasteryTopic` in `web/src/game/tutor.ts` gains `skips` for the dashboard chip.
- Accepted behavior: skipping a MASTERED topic resets its review interval to 1 day and can demote it via windowed accuracy. Correct ("he didn't know it") but noted so it isn't mistaken for a bug.
