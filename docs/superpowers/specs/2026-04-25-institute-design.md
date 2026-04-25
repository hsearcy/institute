# Institute — Design Spec

**Date:** 2026-04-25
**Status:** Draft for review
**Author:** Houston Searcy (with Claude)

## What this is

A voice-first, AI-driven, math-focused educational game for kids ages 4–6. The user's son (turning 6) is a strong reader who is bored by existing learning apps (Synthesis, Sage Teacher) and is drawn to Minecraft and "click for dopamine" browser games. His daughter (turning 4) is a beginning reader.

The goal is to build something that **competes for the same attention** those games capture, and channels it into structured math practice using current best-evidence learning science (mastery + spaced repetition + interleaving + immediate feedback + zone of proximal development).

It runs on Fire tablets (and any other Android/iOS device the family has).

## Non-goals (explicitly out of V1)

- Reading / literacy / phonics (math focus first; structure is reusable for other subjects later but that is not V1).
- Multiplayer or social features.
- Cloud accounts for the kids (parent owns the account; profiles are scoped under it).
- LLM-generated mini-game *code* (LLM populates parameters of hand-written templates).
- Wake-word ("Hey Spark!") voice activation.
- App-store distribution (Apple App Store / Google Play / Amazon Appstore). V1 is sideloaded onto the Fire tablets; store presence is V2+ if useful.
- Marketing-quality polish on the parent dashboard (functional > beautiful for V1).

## Headline decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Client tech | React Native + Expo | Cross-platform, fast iteration via Expo Web in browser, single codebase to Fire tablets and any iPhone/iPad. |
| 3D | react-three-fiber + expo-gl + drei | Standard 3D-in-Expo stack; user has prior Three.js experience. |
| Aesthetic | Stylized low-poly (Astroneer / Slime Rancher flavor) | Looks premium, kid-friendly, runs on weaker GPUs, asset-pipeline-friendly with Kenney/Synty packs + Meshy. |
| Backend | Rails + Postgres | User's strength; centralizes AI calls so kid app never holds API keys. |
| Local store | SQLite via `expo-sqlite` | Offline-first; canonical source of truth for kid-facing state. |
| AI providers | Pluggable interfaces (LLM / STT / TTS) | Dev-mode managed APIs for fast iteration; prod-mode self-hosted on user hardware or Hetzner. |
| Initial AI providers (dev) | Anthropic LLM, Deepgram STT, ElevenLabs TTS | Lowest activation energy for getting the loop working end-to-end. |
| Mini-game model | Plugin folders implementing a manifest + scene + evaluator | Engine + LLM choreograph; plugins render. New game = new folder. |
| AI's role | Tutor dialogue, problem selection from eligible pool, content generation, parent insights | LLM does *not* drive mastery scheduling — that is deterministic SRS + mastery thresholds. |
| Voice default | Auto-on during a problem; mic indicator doubles as manual toggle | Avoids false triggers from sibling chatter; still feels "always-on" inside a problem. |
| World shape | Hub world + branching themed zones (visible) + daily quest + spaced repetition (under the hood) | Zones give kid-legible progression; SRS + mastery do the actual learning-science work. |
| V1 audience | 6yo first; architected for 2 profiles from day 1 | Faster ship; 4yo content is additive (same skill tree, starts earlier). |
| V1 mini-games | Spell Cast, Block Tower, Cookie Share, Door Code | Spans skip-counting, addition, division/sharing, and in-world +/− gates. Spell Cast is the user's son's most-likely hit. |

## Architecture

Three deployables.

```
┌─────────────────────────────────────────────────────────────┐
│                  KID APP (React Native + Expo)              │
│                                                              │
│  ┌────────────────┐ ┌─────────────────┐ ┌────────────────┐  │
│  │ 3D World       │ │ Mini-game       │ │ Voice Layer    │  │
│  │ (R3F + drei)   │ │ Plugin Engine   │ │ STT + normalize│  │
│  └────────────────┘ └─────────────────┘ └────────────────┘  │
│                                                              │
│  ┌────────────────────────────┐ ┌─────────────────────────┐ │
│  │ Local Store (expo-sqlite)  │ │ Sync Worker             │ │
│  │ profiles, mastery, SRS,    │ │ push events, pull config│ │
│  │ session log, inventory     │ │ resilient to offline    │ │
│  └────────────────────────────┘ └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                          ↕  HTTPS (Tailscale or public TLS)
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (Rails + Postgres)               │
│                                                              │
│  - Parent auth + dashboard (web)                            │
│  - Tutor Service: orchestrates problem selection, calls LLM │
│  - Session ingestion + analytics                            │
│  - Weekly LLM-generated parent summaries                    │
└─────────────────────────────────────────────────────────────┘
                          ↕  Provider interface (swappable)
┌─────────────────────────────────────────────────────────────┐
│  LLM Provider     │  STT Provider     │  TTS Provider       │
│  Anthropic / vLLM │  Deepgram / faster│  ElevenLabs / Kokoro│
│  (Llama, Qwen)    │   -whisper        │  / Piper / XTTS     │
└─────────────────────────────────────────────────────────────┘
```

### Why these boundaries

- **Kid app is offline-first.** Math practice should not break when wifi drops. Local SQLite is the source of truth for kid-facing state; the backend gets eventually-consistent copies via the sync worker.
- **Backend centralizes AI calls.** Tablets never hold API keys. Prompt and template changes deploy once. Sessions feed analytics for the parent dashboard.
- **AI is behind interfaces.** A `LlmProvider`, `SttProvider`, `TtsProvider` trio. Dev = managed APIs. Prod = self-hosted. The rest of the system never knows which is which.

### Rejected alternative: kid app calls AI directly

Faster (skips a hop), but: (a) kid tablets would hold API keys, (b) prompt/template changes require app updates, (c) loses the analytics ingest path. The extra hop is worth it.

## Mini-game plugin framework

Every mini-game lives in `packages/minigames/<id>/` and exports:

```ts
// manifest.ts
export const manifest = {
  id: "spell-cast",
  title: "Spell Cast",
  supportedSkills: ["skip_count_2", "skip_count_5", "skip_count_10", "sequence_next"],
  paramSchema: {
    enemyType:        "enum: goblin | slime | ghost",
    sequence:         "number[]",          // target answers, in order
    sequencePrompt:   "string",            // tutor intro hint
    hpPerCorrect:     "int",
    timeLimitSeconds: "int?",
  },
  assets: ["models/goblin.glb", "models/slime.glb", "fx/spark.glb", "audio/zap.mp3"],
};

// scene.tsx — the 3D React-Three-Fiber scene + UI overlay.
export function Scene({ round, onAnswer, onComplete }: SceneProps) { ... }

// evaluate.ts — pure function: was this voice/text answer correct for this step?
export function evaluate(round, currentStep, answerText): { correct: boolean; normalized: number; partial?: boolean } { ... }
```

**Schema validation:** `paramSchema` is implemented with [Zod](https://zod.dev) — runtime-checked, TypeScript-typed, shared between client and backend. The strings in the example above are illustrative; the real schema is a Zod object.

### Round lifecycle

1. Engine selects an eligible template for the kid's current zone + due skills.
2. LLM is asked to fill the template's `paramSchema`, given recent history and skill target. LLM also returns a `tutorIntro` line.
3. Engine validates the response against the schema. If invalid, falls back to a hand-authored round in the same template.
4. `Scene` mounts. Tutor speaks `tutorIntro` (TTS).
5. Mic auto-on. Voice answer → STT → normalize → `evaluate()`.
6. Scene reacts (animation/FX). Tutor reaction (TTS).
7. On round complete, engine updates mastery + SRS + writes session event.

### Why this shape

- New mini-games = new folder; engine unchanged.
- LLM only fills schemas; it cannot ship arbitrary code to a child's device.
- Schema validation is a hard boundary: any malformed LLM output falls back to a deterministic round.
- Skill targeting is explicit, so SRS scheduling has a known set of tools to deliver any given skill.

### V1 plugin roster

| Plugin | Skills targeted | Notes |
| --- | --- | --- |
| `spell-cast` | skip_count_2/5/10, sequence_next | Combat/magic. The user's son is into spells; this is the engagement anchor. |
| `block-tower` | add_within_10, add_within_20, sums_to_n | Stack blocks; tower height = answer. |
| `cookie-share` | counting, equal_sharing, beginning_division | "Give 6 cookies to 3 friends." Doubles as 4yo counting. |
| `door-code` | sub_within_10, sub_within_20, missing_addend | The in-world chest/gate pattern from the mockup. Quick, single-shot. |

## Math skill taxonomy & adaptive difficulty

### Skill taxonomy (V1)

A flat list of named skills, each with prerequisites and a difficulty band. Approximately 30–40 skills cover ages 4–6.

```
counting_1_5         (no prereqs)
counting_1_10        ← counting_1_5
counting_1_20        ← counting_1_10
number_recognize_1_10
number_compare       ← counting_1_10
add_within_5         ← counting_1_10, number_recognize_1_10
add_within_10        ← add_within_5
sub_within_5         ← add_within_5
sub_within_10        ← sub_within_5, add_within_10
add_within_20        ← add_within_10
sub_within_20        ← sub_within_10
skip_count_2         ← counting_1_20
skip_count_5         ← counting_1_20
skip_count_10        ← counting_1_20
missing_addend       ← add_within_10
equal_sharing        ← counting_1_20
sequence_next        ← skip_count_2 OR add_within_10
... (and so on, ~30 total)
```

Stored as a TS module + a Postgres table for analytics.

### Mastery model

Per `(profile, skill)`:

- `attempts`, `correct`, `recent_window` (rolling last 8 attempts)
- `mastery_state ∈ { learning, practicing, mastered, review }`
- `next_review_at` (datetime; SM-2-style spacing)
- `current_difficulty` (0.0–1.0, EWMA of recent problem difficulties)

Transitions:

- `learning → practicing`: 1 correct on the easiest band of the skill.
- `practicing → mastered`: 4 of last 5 correct, no hints used, at the skill's full difficulty band.
- `mastered → review`: schedule next review per SM-2 (interval doubles on success, resets on failure).
- Any state → `learning`: 2 unhinted wrongs in a row at currently-targeted difficulty. Voice tap-fallback attempts count as scaffolded and do **not** trigger demotion (the tap grid is a recovery aid, not a graded attempt).

### Today's eligible pool

Computed each session by deterministic rules:

1. All skills with `next_review_at <= now` (due reviews).
2. All skills currently in `learning` or `practicing`.
3. One "stretch" skill: the easiest skill the kid has *not* started, whose prereqs are all `practicing` or higher.
4. Cap the pool size to keep the LLM's choice space tight (e.g., 6 skills max).

### LLM's role at problem-selection time

Given:
- The eligible pool (with current mastery state per skill)
- Recent answer history (last ~10 problems)
- The current zone / mini-game context
- The kid's profile (age, name, tutor personality)

The LLM picks a `(skill, mini-game template)` pair and generates the round params + `tutorIntro`. Mastery scheduling is *bounded* by the deterministic rules; the LLM only chooses within the pool.

### Why hybrid (and not pure-LLM or pure-SRS)

- Pure LLM judgment is unverifiable, hard to debug, and drifts.
- Pure SRS feels like a worksheet — no narrative, no voice variation.
- Hybrid: the structure guarantees correct *coverage*; the LLM provides the *voice*. You can debug the structure separately from the voice.

## Voice pipeline

End-to-end on the kid app:

```
mic stream → silence detection → STT → kid-speech normalizer
                                                  ↓
                                          evaluate() per template
                                                  ↓
                          (correct?) → mastery update → tutor TTS reaction
                          (wrong?)   → confidence check → confirm or scaffold
```

### Defaults

- **Listening mode:** auto-on during a problem; mic indicator is a manual toggle (settings can switch the profile to always-on or tap-to-talk).
- **Visual feedback:** pulsing mic icon + reactive waveform during listening; brief "I heard 'seven'" confirmation after STT returns.
- **Low-confidence STT:** show a confirmation rather than counting it wrong ("Did you say five or nine?").
- **2 wrong in a row:** surface a tap-to-answer grid (1–10 buttons) so the kid is never stuck in voice purgatory.

### Kid-speech normalization

A separate module before answer evaluation. STT returns text; normalizer maps to numeric answer.

- Word-to-number: "seven" → 7, "twenty-one" → 21.
- Toddler-isms: "free" → 3, "tree" → 3 (only when context expects a number), "tin" → 10, "twee" → 3, "fife" → 5.
- Compound speech: "five plus two" → 7 (only if the prompt asked for a sum).
- Fuzzy match against expected answer space (so "noyne" maps to 9 if 9 is one of the eligible answers).

This is testable in isolation with a fixture file of recorded-then-transcribed kid utterances.

### Provider choice (V1 dev → prod)

| Provider | Dev | Prod option |
| --- | --- | --- |
| LLM | Anthropic API | Self-host (Ollama or vLLM): Llama 3.1 8B or Qwen 2.5 7B |
| STT | Deepgram (nova-2) | faster-whisper (small or medium) self-hosted |
| TTS | ElevenLabs streaming | Kokoro (preferred) or Piper or XTTS-v2 self-hosted |

All three behind interfaces in the Rails backend. Swap = config + env var change.

## World, zones, and engagement loop

### Spatial structure

- **Hub:** small "base camp" 3D scene. Tutor lives here. Customizable cosmetics over time.
- **Zones:** themed areas branching off the hub (V1 ships with **Forest**; **Caves** unlocks at 10 mastered skills; **Sky-island** at 20).
- Each zone contains 2–4 interactable objects (chests, doors, NPCs, mini-game portals).

### Daily loop

On launch, the tutor offers "Today's Quest" — a short curated set of 5–8 problems pulled from today's eligible pool. Completing it earns:

- **Gems** (cosmetic currency)
- **Streak** advance (consecutive days with quest completed)
- A new spawn or detail in the world (small visible reward)

After the quest, the kid is in **free play** — explore zones, trigger mini-games, solve in-world gates. Free-play problems still target the eligible pool, but the kid feels in charge.

### Streak mechanics

- Visible streak counter.
- 1 free "freeze" per week (forgiveness — Duolingo learned this lesson the hard way; kids feeling shame about missed days is anti-engagement).
- No global leaderboards, no comparisons.

### Cosmetics & inventory

- Tutor outfits, hero outfits, base decorations, pet companions.
- Earned via gems (daily quest) and via specific mastery milestones.
- Pure cosmetics, no gameplay advantage — keeps the focus on math.

## Data model & sync

### Local SQLite (canonical for kid-facing state)

Tables (sketch):

- `profile(id, name, age, dob, tutor_personality, voice_mode, created_at)`
- `skill_state(profile_id, skill_id, attempts, correct, mastery_state, next_review_at, current_difficulty, updated_at)`
- `session(id, profile_id, started_at, ended_at, daily_quest_completed)`
- `event(id, session_id, kind, payload_json, occurred_at, synced_at)` — append-only log of everything (round shown, answer given, hint shown, etc.)
- `inventory(profile_id, item_id, acquired_at)`
- `gem_balance(profile_id, balance, updated_at)`

### Backend Postgres

- Mirrors local data per-profile.
- Owns parent account + auth, plus aggregated analytics across profiles.
- Caches generated content for replay & cost reduction.

### Sync protocol

Two distinct flows:

- **State (device-authoritative):** mastery, SRS, sessions, events, inventory, gem balance. Append-only events flow device → server, idempotent via client-generated UUID. The device is the source of truth; the server is a downstream consumer for analytics + parent dashboard.
- **Config (server-authoritative):** parent-dashboard toggles (voice mode, pause new content), skill-curve tweaks, template versions, prompt updates. Flow server → device on session start and on reconnect.

No bidirectional state. No conflict resolution needed because state and config never overlap.

## Parent dashboard (V1 minimum)

Separate web app served by Rails. Login with the parent's email.

V1 surfaces:

- Per profile: skills mastered (list), current weak spots (top 3 by recent error rate), recent sessions (date, duration, problems answered).
- Weekly LLM-generated summary in plain English ("Sam practiced 4 days this week, made progress on subtraction within 10, struggles when crossing 5").
- Toggle: voice always-on / auto-on / tap-to-talk per profile.
- Toggle: pause new content (lock to current pool) — useful for travel / sick days.

V2+ (out of V1):

- Configure problem types or set time limits.
- Voice transcripts.
- Per-skill drill-down charts.
- Multi-parent accounts.

## 3D rendering & asset pipeline

### Rendering stack

- **react-three-fiber** for declarative scenes.
- **@react-three/drei** for camera, controls, basic helpers.
- **expo-gl** as the WebGL surface inside Expo.
- **No** physics engine in V1. (Add `@react-three/rapier` if a future mini-game needs it.)

### Performance budget (Fire HD 10, 2023, as floor)

- < 5k tris per character; < 30k tris per scene total.
- Baked lighting only (no realtime shadows).
- One directional light + ambient + emissive materials. No post-processing.
- Texture max 1024×1024, atlased where possible.
- Target 30fps minimum on Fire HD 10; 60fps on iPhone / newer Android.

### Asset strategy

- **Free first:** Kenney.nl asset packs (CC0), Mixamo (free animations), Quaternius packs.
- **AI-gen for one-offs:** Meshy (user is willing to pay) for unique props the free packs lack.
- **Hand-make rarely:** only if free + AI cannot deliver something specific.
- All assets normalized to GLB. Asset bundles preloaded per zone.

### Asset bundle layout

```
packages/assets/
├── world/
│   ├── hub/
│   ├── forest/
│   ├── caves/
│   └── sky/
├── characters/
│   ├── hero-male/
│   ├── hero-female/
│   ├── tutor-cat/
│   ├── tutor-robot/
│   └── tutor-dragon/
├── enemies/
├── fx/
└── audio/
```

## Repo layout

```
institute/
├── apps/
│   ├── kid-app/              # React Native + Expo
│   └── parent-dashboard/     # Static or simple JS, served by Rails
├── packages/
│   ├── minigames/            # plugin folders
│   │   ├── spell-cast/
│   │   ├── block-tower/
│   │   ├── cookie-share/
│   │   └── door-code/
│   ├── shared/               # types, skill taxonomy, normalizer
│   └── assets/               # 3D models, audio, textures (Git LFS)
├── backend/                  # Rails app
└── docs/superpowers/specs/   # this doc + future specs
```

A monorepo (npm workspaces or pnpm). Rails lives alongside but is a sibling, not a workspace.

## Testing strategy

- **Skill taxonomy + SRS scheduling:** pure unit tests against deterministic state transitions. Property-based tests for invariants (e.g., never schedule a skill whose prereqs are unmet).
- **Kid-speech normalizer:** fixture file of recorded utterances → expected normalized output. Easy to grow over time as your kids actually use it.
- **Mini-game `evaluate()`:** unit tests per template.
- **Plugin schema validation:** test that bad LLM output is rejected and fallback content is served.
- **Backend Tutor Service:** integration tests with a mocked LLM provider (deterministic responses).
- **End-to-end on device:** Expo Go on a Fire tablet; manual + recorded test scripts for the voice loop. The voice path is genuinely hard to automate cheaply at V1.

## V1 milestones

| Milestone | Demonstrates |
| --- | --- |
| M1 — Skill engine + SRS, no UI | Run a console session: pick eligible pool, simulate answers, verify scheduling. |
| M2 — Plugin engine, no AI | Hard-coded `spell-cast` round runs end-to-end with on-screen tap input. |
| M3 — 3D scene + tutor character | Hub world renders on Fire tablet at 30fps with a placeholder tutor. |
| M4 — Voice in/out | Auto-on mic + STT + normalizer + TTS reaction wired to M2 round. |
| M5 — LLM in the loop | Backend Tutor Service picks problem from eligible pool, fills template params, returns to client. |
| M6 — All 4 mini-games + Forest zone | Kid can complete a daily quest in the Forest, get gems, see streak advance. |
| M7 — Parent dashboard MVP | You can log in and see what your son did this week. |
| **V1 ship** — sideload to Sam's Fire tablet, start collecting real data. |

## Open questions to resolve during implementation

- Specific Rails auth choice (Devise vs Rails 8 native auth) — defer to start of M5.
- Exact LLM choice for prod self-hosting — defer until after M5 has real prompts.
- Whether to use Tailscale or public TLS for tablet ↔ backend — defer until M7.
- Cosmetic art direction (which Kenney/Synty packs to standardize on) — pick during M3.
- 4yo profile activation date — after V1 ships and you see how the 6yo version actually plays in practice.

## Risks

- **3D performance on Fire HD 10.** Mitigation: aggressive perf budget, profile early in M3, fallback to lower-poly assets.
- **Kid speech recognition accuracy.** Mitigation: kid-speech normalizer with a growing fixture set; 2-strike fallback to tap input; confirmation on low-confidence STT.
- **LLM latency over the network.** Mitigation: backend caches `(prompt-hash → response)`; pre-fetches the next problem during the current one; can pre-render fallback rounds entirely offline.
- **Scope creep.** Mitigation: this doc names the V1 scope explicitly; new ideas go to V2 backlog, not V1.
- **The kid hates it anyway.** Mitigation: ship M2 (hand-coded round + 3D scene + voice) early enough to put it in his hands and learn before the full system is built.
