
## Review amendments (folded in before execution)

- `started` is derived from **presence of a `topic_mastery` row** (`MasteryLite` has no `attempts`); safe because the only writers are attempt-driven `recordTopicMastery` and `grantLegacyMastery` (which writes `mastered`, already out of the frontier).
- **`showProblem` splits into a gate + `presentProblem(p)`.** The demo runs BEFORE any of the problem's own presentation, so `setProblem` (and its 10s fair-try timer), `speak(p.spoken)`, the `shownAt` rebase, and `fetchBranches` all happen after `hideDemo()`. Otherwise `speak(demoScript)` preempts the read-aloud, resolves its `.then`, and rebases `shownAt` to the demo's start — inflating `solveMs` by the whole demo and poisoning fluency + `solveTag` on the first attempt of every new topic.
- **Double-fire guard is per-TOPIC, not per problem id:** `demoedTopics: Set<string>` on Game, added BEFORE awaiting `fetchDemo` (a fetch failure writes no `topic_demos` row, so the server would flag the next problem on that topic again).
- `newTopic` is stamped at the very END of `llmBranches` (after parse → stampTopic → costume → `freshLocal` regeneration), keyed off each branch's FINAL `topicId`, and set explicitly on both branches so an LLM-emitted flag can't survive.
- `needsDemo` also treats "has a `topic_mastery` row" as not-new (pre-taxonomy attempt rows have NULL `topic_id`).
- Overlay: `position: fixed; inset: 0; z-index: 50; pointer-events: auto` — above the pad and panels (inert by construction), below the parent dashboard (z 60).
- Task 1 test (a): both candidates in ONE domain with the current topic in a THIRD domain, so the different-domain key can't decide it.
