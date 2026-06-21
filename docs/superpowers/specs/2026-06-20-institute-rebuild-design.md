# Institute — design spec (browser rebuild)

**Status:** approved (design); ready for implementation planning
**Date:** 2026-06-20
**Supersedes:** the Expo/React-Native + Rails v1 (preserved on branch `web-dev-and-m6`)

## Goal

A math game for one specific 6-year-old learner that he *wants* to play. The
entire point is genuine math learning; the engagement loop is in service of that,
not the other way around. It's a **web app**, built **from scratch** — the only
thing carried over from before is the `.env` (API keys).

### The learner (drives everything)
- Age 6. Number sense solid; addition within 10 mastered.
- Finger-counts on sums beyond 10 → build mental fluency ("make a 10").
- Subtraction shaky. Skip-counting OK-not-mastered. Place value developing.
- Light exposure to ×/÷ and curious about them.
- Loves: **gemstones**, Minecraft, reading. Responds strongly to "challenge /
  win / level-up" loops (the same engine the banned dopamine-click games used —
  we steal the *engine*, not the brainrot: every action is real math).

## Core game — "Institute"

Setting: a **gem mine**. The core loop *is* the whole game:

1. A math problem surfaces, embedded in rock — one gem in the wall to mine. The
   tutor **reads it aloud** (voice).
2. He answers on a **number-pad of gems** (digits 0–9 as gems). Each digit he
   picks swings the **pickaxe** at that number-gem — entering the answer *is* the
   act of mining. He keys in the full numeric answer (e.g. 8 + 7 → "15").
   - **Right answer** → the target gem tears free in a burst of light + particles
     + a satisfying chime; the tutor cheers; it flies into his **collection** (a
     gem wall/cave that visibly fills).
   - **Wrong** → the gem holds firm / gentle fizzle; the tutor nudges/hints; try again.
3. The next problem (already pre-generated) surfaces immediately.

### Payoff is a first-class requirement (not end-of-project polish)
The v1 failure mode was a working loop with a flat payoff. This time the
gem-burst reveal, escalating **rarity** (common → rare → legendary), gem *types*
tied to skill areas (e.g. subtraction = sapphires, ×/÷ = diamonds), and the
growing, ownable **hoard** are design requirements with QA gates, not afterthoughts.

### Progression = the mine's depth
The skill ladder *is* the descent; mastering skills mines deeper into new biomes
with new gem types:
- Surface: **addition within 20** (push off finger-counting → make-a-10)
- Deeper: **subtraction** (the shaky one — friendly reps)
- Deeper: **skip-counting** + **place value** (tens & ones; place value literally
  sorts gems into tens-and-ones)
- Bedrock: a taste of **×/÷** (rare "legendary" gems)

## Adaptive tutor (the differentiator)

An LLM drives problem selection — the thing a hardcoded difficulty tree can't do
well, and the reason this isn't Math Blaster '88.

- **Speculative pre-generation hides all latency:** while he solves problem N, the
  backend already produces *both* branches — "N+1 if right" (build on it, faster/
  harder) and "N+1 if wrong" (reinforce, ease off). Whichever he does, the next
  gem is already loaded. (A 2-ply speculative tree; depth can grow later.)
- Inputs to difficulty/mastery decisions: **solve time, correct/incorrect, and
  running per-skill history**. Detects mastery and shaky skills over time.
- The tutor has a **voice** (ElevenLabs TTS): reads the problem, cheers, nudges —
  valuable for a 6-year-old still firming up reading.

## Architecture

- **Frontend:** Bun + Vite + TypeScript + **Three.js** (browser game). Bun is fine
  here — the v1 Bun incompatibility was Expo/react-native-web, both dropped. If
  Vite+Three.js snags on Bun during scaffolding, fall back to Node rather than fight.
- **Backend:** Bun + Hono + **`bun:sqlite`** (built-in; no native module).
  Endpoints:
  - `POST /next-problems` — LLM (Anthropic) generates the next problem(s) /
    branches for a given context.
  - `POST /tts` — ElevenLabs reads text aloud.
  - persists every attempt + per-skill mastery.
- **Shared TypeScript problem schema** across the front/back boundary — the v1
  tutor's worst bugs were JS↔Ruby schema mismatches; sharing types makes that
  class impossible. Validate at the boundary; never silently fall back to a static
  fixture and hide a failure.

### Data model (SQLite)
- `skills` — the categories + ladder.
- `attempts` — `(skill, correct, solve_ms, occurred_at)`.
- `mastery` — per-skill state (e.g. unstarted/practicing/mastered, difficulty).
The tutor reads recent history as context each turn.

### Answer input
- **Number-pad of gems.** Digits 0–9 are gems; selecting a digit swings a pickaxe
  at it, so keying in the answer *is* the mining action. He enters the actual
  numeric answer (multi-digit supported) — **producing** the answer, not
  recognizing it from choices. The correct full answer mines the target gem.
  **No multiple choice.** (LLM returns just the problem + the correct answer; no
  distractors.)
- Spoken-answer (mic/STT): designed-in, **deferred** (good future feature).

## MVP — what "v1-done" means
The core loop end-to-end with **two skills (addition within 20 + subtraction)**:
rock → problem (shown + spoken) → tap answer-gem → juicy burst → gem into a
visible collection → LLM adaptively serves the next with zero wait. Make *that*
feel genuinely great before widening.

## Deferred (designed-in, not built in MVP)
- Parent dashboard (history/mastery view — server-side data already supports it).
- Spoken (mic/STT) answers.
- Deeper biomes / full ×/÷ beyond the taste the MVP proves.
- Rarity tiers and gem-type taxonomy beyond what the MVP needs.

## Build methodology
Built start-to-finish through the **`threejs-game-director`** pipeline and its
sibling skills — gameplay systems, AAA graphics, UI design, asset generation
(3D/image/audio), debug/profile, and QA/release — with the visual scorecard and
asset-sourcing gates applied from the first commit (not bolted on later).

## Lessons carried from v1 (explicit anti-goals)
- Juice/payoff is a requirement, not polish.
- No silent fixture fallback masking a broken tutor — surface failures.
- One language across the boundary; shared, validated schema.
- One focused loop, not a fragmented hub of half-built minigames.
- Keep the backend thin (LLM + TTS + SQLite); no Rails/Hotwire/STT sprawl.
