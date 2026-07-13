# Explain Button + Soft-Edge Safety Net Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) A kid-tappable "teach me" button that has the LLM explain the current problem aloud — strategy-focused, Socratic, never stating the answer — so a parent doesn't have to sit beside him. (2) Soft taxonomy edges become a remediation safety net: two consecutive misses on a topic route the wrong-branch down to a prerequisite topic for a confidence problem.

**Architecture:** The curate script additionally contracts SOFT edges into a `helpPrereqs` field on each curated topic (advisory, never gating unlocks). A new pure helper `rescueTopic(topic, mastery)` picks the remediation target; `llmBranches`/`localBranches` use it for the wrong branch when the miss streak on the current topic is ≥1 (i.e. the NEXT miss would be the 2nd consecutive). A new `POST /tutor/explain` endpoint generates a ≤60-word spoken explanation (cached per problem id, local-hint fallback); the client adds a 🎓 button beside the existing speaker icon that fetches + speaks it.

**Tech Stack:** unchanged. **Branch:** worktree `feat/explain-safety-net` off master.

---

## Design decisions (settled)

1. **`helpPrereqs`** = contraction over the union (hard+soft) edge graph, minus the topic's hard `prereqs`, minus self. Stored in `topics.json`; zod field `helpPrereqs: z.array(z.string())`. Unlock logic is untouched (hard only).
2. **Rescue rule (wrong branch only):** if the child's most recent attempt (before the current problem) was a MISS on this same topic — meaning missing the current problem would make ≥2 consecutive misses — and the topic has any prereq (hard ∪ help) that is CURATED, the wrong branch serves that prereq instead of the same topic: pick the prereq with `mastered` state first (confidence), else any, at difficulty `max(0.25, itslastDifficulty − 0.1)`. Spoken form gets a warm framing prefix ("Let's warm up with one you know!") via the normal spoken field. Right branch logic unchanged. One-shot: the rescue problem itself is a normal problem for that prereq topic (attempts recorded normally; if it's mastered, it counts as a review — free reinforcement).
3. **Rescue never recurses visibly:** if the prereq topic itself gets missed, the standard wrong-branch logic applies to IT next round (its own prereqs). Roots with no prereqs keep today's behavior (same topic, easier).
4. **Explain endpoint:** `POST /tutor/explain` `{ profileId, problem }` (ProblemSchema) → `{ text }`.
   - LLM (same model/env knobs): system prompt = explain ONE problem to a 6-year-old in ≤60 spoken words, concrete strategy with his actual numbers, warm, no emoji/markdown, MUST NOT state or imply the final numeric answer, end with a small leading question. User content includes the topic brief (name/description/evidence via `topicById(problem.topicId)`) when available.
   - **Answer-leak guard (trust math over the model):** if the explanation text contains the answer as a standalone number token (`\b${answer}\b`), regenerate once; if it leaks again, fall back to the local hint. (Numbers from the prompt itself are fine — only the answer is forbidden.)
   - In-memory cache `Map<problemId, string>` (cap ~50) so repeated taps don't re-bill.
   - Fallback on any LLM failure: `problem.hint ?? "Read it again slowly — what is it asking?"`.
5. **Client:** a `🎓` button beside the existing 🔊 speak control (same size/style family). Tap → disable button + subtle pulse → `fetchExplain(problem)` → `speak(text)` (existing TTS path) → re-enable. No effect on rewards/streaks (the explanation never contains the answer). If offline → speaks the local hint.
6. **No reward changes. No dashboard changes.** (`helpPrereqs` additive in /mastery payload only if free.)

## File structure

| File | Change |
|---|---|
| `scripts/contract-graph.ts` | Generalize: `contractEdges(edges, curated, strengths)` — accept which strengths to follow |
| `scripts/contract-graph.test.ts` | Cases for union-strength contraction |
| `scripts/curate-topics.ts` | Emit `helpPrereqs` (union-contract minus hard minus self) |
| `shared/src/topics.ts` | `helpPrereqs` in TopicSchema; `ExplainRequestSchema`/`ExplainResponseSchema` in `shared/src/index.ts` |
| `shared/src/topics.test.ts` | helpPrereqs resolve + disjoint from prereqs |
| `server/src/rescue.ts` (new) | Pure `rescueTopic(topic, masteryLite[]) : Topic \| null` |
| `server/src/rescue.test.ts` (new) | Rescue pick order |
| `server/src/index.ts` | wrong-branch rescue wiring in `llmBranches` + `localBranches` (needs "last attempt was a miss on current topic" from `recentAttempts`); `/tutor/explain` endpoint + guard + cache |
| `server/src/integration.test.ts` | rescue-over-HTTP + explain fallback tests |
| `web/src/game/tutor.ts` | `fetchExplain(problem)` (never-throw) |
| `web/src/game/Game.ts` / `hud.ts` | 🎓 button next to the speak icon; wire to fetch+speak |

## Tasks (each: failing test → implement → green → commit)

### Task 1: strength-aware contraction
- Test: union contraction finds ancestors through soft hops; hard-only unchanged (existing tests must keep passing with default arg).
- `contractEdges(edges, curated, strengths: ReadonlySet<string> = new Set(["hard"]))`.
- Curate script: `const help = contractEdges(deps, curatedIds, new Set(["hard","soft"]))`; per topic `helpPrereqs = help.get(id).filter(p => p !== id && !prereqs.includes(p))`. Regenerate topics.json; verify hard `prereqs` byte-identical to current; eyeball: Mystery Master helpPrereqs must include Mystery Number (`mt_ezc2m_0dzN`); Rounding Ranger's must include Hundreds & More (`mt_aPBzD28_mT`) and/or the within-100 chain.
- topics.test: every helpPrereq id resolves; `expect(t.helpPrereqs).not.toContain(t.id)`; disjoint from `t.prereqs`; update `TOPICS.length` if unchanged (still 35).

### Task 2: `rescue.ts` (pure)
```ts
/** The topic to fall back to when the child keeps missing `topic`, or null. */
export function rescueTopic(topic: Topic, mastery: MasteryLite[], all: Topic[]): Topic | null
```
Candidates = `[...topic.prereqs, ...topic.helpPrereqs]` resolved against `all`. Prefer state==="mastered" (most recently updated is fine — order stable), else first unlocked... keep simple: mastered first, else any candidate. Tests: prefers mastered; null when no candidates; ignores unknown ids.

### Task 3: wrong-branch rescue wiring
- In `nextProblems`/`llmBranches` + `localBranches`: compute `const lastMissedHere = recent[0] && recent[0].topic_id === current.topicId && !recent[0].correct` (extend `recentAttempts` row already has `correct`). If `lastMissedHere`, `wrongTopic = rescueTopic(curTopic, masteryLite, TOPICS) ?? curTopic`, difficulty `max(0.25, (mastery.lastDifficulty ?? 0.4) − 0.1)`. LLM prompt line for the wrong branch when rescuing: "…he has missed this twice, so REBUILD from an easier prerequisite topic (a warm-up he already knows):" + topicBlock. Stamp authority as usual.
- Integration test: profile misses the same topic twice via /tutor/attempt (correct:false ×2), then /tutor/branches with that topic current → `b.wrong.topicId` equals one of current's prereqs∪helpPrereqs; `b.right.topicId` unaffected. Use `mt__we2TDqnJx` (Add&Take-10: prereqs bonds9+addtake5) for determinism.

### Task 4: `/tutor/explain`
- Shared: `ExplainRequestSchema = { profileId, problem: ProblemSchema }`, response `{ text: string }`.
- Server: endpoint per design decision 4 (LLM call mirrors `llmBranches` plumbing — plain text completion, max_tokens ~200, temperature 0.7; no tool use). Answer-leak regex on standalone token; one retry; fallback `problem.hint`.
- Integration test (dead LLM env): returns 200 with the local hint text (fallback path), and caches (two calls → same object fast — just assert equality).
- Sanity: keep the endpoint tolerant — a stale client without topicId still gets a generic explanation prompt.

### Task 5: client 🎓 button
- `tutor.ts`: `fetchExplain(p: Problem): Promise<string | null>` never-throws.
- Find the existing speak/re-read control in Game.ts/hud.ts (`grep -n "speak\|spoken\|🔊\|voice" web/src/game/hud.ts Game.ts`), add a sibling button `#explain-btn` matching its style, `aria-label="Explain this problem"`, content 🎓. Click: guard re-entry, fetch, `speak(text)` (existing audio helper), re-enable on end/error. Fallback string when fetch null: speak `problem.hint` if present.
- `bun run --cwd web build` green.

### Task 6: verification
- Full suite `bun test server shared scripts` green ×3.
- Scratch server + real LLM: POST /tutor/explain for a Number Bonds problem → text is ≤60ish words, warm, does NOT contain the answer token; log it in the report.
- Browser: load game (vite + VITE_TUTOR_URL), screenshot 🎓 button present beside speaker; click it; console clean. Whole-screen screenshot.
- Merge to master, push, update vault/memory. Remind: ares needs pull + **web rebuild** + restart (client changed this time).

## Risks
- Explain must never leak answers → regex guard + fallback; test the guard with a canned leaking string via unit test of the guard function (export `leaksAnswer(text, answer)` from index or small module).
- Rescue changes the "wrong branch never switches topics" invariant deliberately — ONLY on a 2nd consecutive miss; update the plan-of-record comment in select.ts docstring.
- `recentAttempts(profileId, n)` rows: confirm `correct` is selected (it is — used by adaptivePlan).
