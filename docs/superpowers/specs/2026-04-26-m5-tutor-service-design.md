# M5 — Tutor Service (LLM-in-the-loop) — Design

**Goal:** Replace the kid-app's hand-coded `FIXTURES["spell-cast"]` with LLM-generated round params chosen from the kid's actual eligible-skill pool. Adds the Rails backend (Tutor Service) and persists kid-app skill state to local SQLite.

**Demonstrates:** A round of Spell Cast where the goblin's number sequence is chosen by Claude based on what Sam has been working on, his current mastery, and what's due for SRS review — not a hardcoded `[2,4,6,8,10]`.

## Scope (locked)

- Thin backend: one endpoint `POST /tutor/next_round`. No event ingestion, no auth (M7), no caching, no parent dashboard.
- Kid-app + backend land together in M5. Kid-app gets expo-sqlite + skill-state persistence + outcome wiring + eligible-pool computation.
- Plugin schemas are sent with each request (kid-app is the source of truth via `zod-to-json-schema`).
- LLM model: Claude Sonnet 4.6 via [RubyLLM](https://rubyllm.com), structured output constrained by the plugin's JSON Schema.
- Failure handling: any backend error/offline → kid-app falls back to existing `FIXTURES["spell-cast"]`. Sam never gets stuck.

## Out of scope (later milestones)

- Auth (parent login, API tokens beyond a dev bearer secret) — M7
- Event log / sync from kid-app to backend — likely M6 or split-out
- Parent dashboard UI — M7
- Caching of LLM responses — revisit if cost/latency proves a problem
- Pre-fetch of next round during current — M6
- Self-hosted LLM provider (vLLM/Ollama) — post-V1
- The other 3 mini-games — M6

## Architecture

```
┌─ Kid app (RN/Expo) ────────────────────────────────────────┐
│  expo-sqlite                                               │
│    skill_state(profile_id, skill_id, mastery_state, ...)  │
│    attempt(profile_id, skill_id, correct, hinted, ...)    │
│       ↑                                                    │
│  RoundResult.outcomes → skill-engine.applyOutcome → write  │
│       ↓ (next round requested)                             │
│  computeEligiblePool(profileId) → POST /tutor/next_round   │
│       ↓                                                    │
│  validateParams(plugin, response.params) → MiniGameMount   │
│       (on error/offline → FIXTURES fallback)               │
└────────────────────────────────────────────────────────────┘
                          ↕  HTTPS
┌─ Backend (Rails 8 + Postgres) ─────────────────────────────┐
│  TutorController#next_round                                │
│       ↓                                                    │
│  Tutor::Picker.call(payload)                               │
│       ↳ RubyLLM.chat(model: sonnet-4-6,                    │
│           response_format: json_schema(plugin.paramSchema),│
│           messages: [system + tutor prompt])               │
│       ↓                                                    │
│  Validate response → return JSON                           │
└────────────────────────────────────────────────────────────┘
```

Backend is **stateless** for M5: no DB writes, no auth model. Postgres is set up because Rails defaults to it; we use it only for Rails internals (cache, schema migrations infrastructure) — no app tables in M5.

Kid-app is **device-authoritative** for state. Eligible pool computed locally each request from local SQLite.

The network call is synchronous from the kid-app's POV (loading screen between portal tap and Scene mount). Single attempt, ~10s timeout, fall through to fixtures on any error.

## Data model

### Kid-app (expo-sqlite)

Two tables, per profile:

```sql
CREATE TABLE skill_state (
  profile_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  state TEXT NOT NULL,             -- 'unstarted'|'learning'|'practicing'|'mastered'|'review'
  attempts INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  recent_window_json TEXT NOT NULL,-- JSON array of last 8 AttemptOutcome
  current_difficulty REAL NOT NULL,
  srs_interval_days INTEGER NOT NULL,
  srs_ease REAL NOT NULL,
  next_review_at TEXT,             -- ISO 8601 or NULL
  updated_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, skill_id)
);

CREATE TABLE attempt (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  correct INTEGER NOT NULL,        -- 0/1
  hinted INTEGER NOT NULL,         -- 0/1
  scaffolded INTEGER NOT NULL,     -- 0/1
  difficulty REAL NOT NULL,
  occurred_at TEXT NOT NULL
);
CREATE INDEX attempt_profile_occurred ON attempt(profile_id, occurred_at DESC);
```

`skill_state` mirrors `SkillState` in `@institute/skill-engine` (1:1 with the existing TS type). `attempt` is the device-side recent-history log; the last ~10 are sent to the backend per request. (Append-only event log per the design lands in a later milestone.)

The `RoundResult.outcomes` from a completed round flows through:
1. `skill-engine.applyOutcome(currentState, outcome)` → new `SkillState`
2. `skill-engine.scheduleNextReview(...)` if state transitioned
3. Persist new state + insert into `attempt`

### Backend (Postgres)

No app tables in M5. Standard Rails infra only (`schema_migrations`, `ar_internal_metadata`).

## API contract

### `POST /tutor/next_round`

**Request:**
```json
{
  "profile": { "id": "sam", "name": "Sam", "age": 6 },
  "currentZone": "hub",
  "eligiblePool": [
    {
      "skillId": "skip_count_2",
      "description": "Skip count by 2s to 20",
      "masteryState": "practicing",
      "currentDifficulty": 0.4,
      "attempts": 12,
      "correct": 9
    }
  ],
  "recentHistory": [
    { "skillId": "skip_count_2", "correct": true, "occurredAt": "2026-04-26T12:00:00Z" }
  ],
  "availablePlugins": [
    {
      "id": "spell-cast",
      "title": "Spell Cast",
      "supportedSkills": ["skip_count_2", "skip_count_5", "skip_count_10", "sequence_next"],
      "paramSchema": { "type": "object", "properties": { ... }, "required": [...] }
    }
  ]
}
```

**Response:**
```json
{
  "skillId": "skip_count_2",
  "pluginId": "spell-cast",
  "params": { "enemyType": "goblin", "sequence": [2, 4, 6, 8, 10], "intro": "..." }
}
```

**Errors:** Any non-2xx response (400 invalid request, 502 LLM failure, 504 timeout, 500 unknown) → kid-app falls back to FIXTURES.

**Auth:** A simple `Authorization: Bearer <token>` header verified against `ENV["TUTOR_SHARED_SECRET"]`. The kid-app reads the same value from its env / Expo config. Skips auth entirely if the env var is unset (dev convenience).

## Backend internals

### `Tutor::Picker.call(payload)`

1. Parse + validate request shape via a strong-params-style PORO.
2. For each plugin in `availablePlugins`: filter to those whose `supportedSkills` overlap `eligiblePool`'s skill IDs.
3. Build the LLM messages:
   - **System prompt:** "You are a math tutor for a 6-year-old named Sam. Pick the most appropriate problem from the eligible pool given his recent history. Generate playful, kid-appropriate flavor text."
   - **User prompt:** JSON-rendered `{ profile, eligiblePool, recentHistory, currentZone, availablePlugins }`
4. Call RubyLLM with structured output. The response schema is a top-level object:
   ```json
   {
     "type": "object",
     "properties": {
       "skillId": { "type": "string", "enum": [<all skill ids in eligible pool>] },
       "pluginId": { "type": "string", "enum": [<all available plugin ids>] },
       "params": <oneOf: each plugin's paramSchema>
     },
     "required": ["skillId", "pluginId", "params"]
   }
   ```
5. Validate the response: skillId is in the eligible pool, pluginId is in available plugins, plugin supports the chosen skill, params validates against that plugin's paramSchema.
6. On validation failure: log, raise — controller returns 502.

### Why structured output (not function calling)

RubyLLM's `with_response_format(json_schema:)` directly constrains LLM output. Function/tool calling is overkill — there's no tool to invoke, just one constrained generation.

### RubyLLM config

`config/initializers/ruby_llm.rb`:
- `RubyLLM.configure { |c| c.anthropic_api_key = ENV.fetch("ANTHROPIC_API_KEY") }`
- Default model id: `claude-sonnet-4-6` (read from `ENV["TUTOR_MODEL"]`, defaults to `"claude-sonnet-4-6"`)

## Kid-app changes

### New: `apps/kid-app/src/persistence/`
- `db.ts` — opens expo-sqlite, runs migrations
- `skillStateRepo.ts` — load/save `SkillState` for a profile
- `attemptRepo.ts` — append + read recent attempts

### New: `apps/kid-app/src/tutor/`
- `client.ts` — `requestNextRound({ profileId, pluginIds, fallback }) → params`
- `eligiblePool.ts` — wraps `skill-engine.eligiblePool` with persistence reads
- `pluginSchemas.ts` — `getAvailablePlugins() → [{ id, paramSchema: JsonSchema }]` using `zod-to-json-schema`

### Modified: `apps/kid-app/src/minigame/MiniGameMount.tsx`
Replace the inline `FIXTURES["spell-cast"]` lookup with:
```ts
const params = await requestNextRound({
  profileId: PROFILE_ID,
  pluginIds: ["spell-cast"],
  fallback: () => FIXTURES["spell-cast"],
});
```

### Modified: `App.tsx#onRoundComplete`
After the round, write `RoundResult.outcomes` into `skill_state` + `attempt` via `skill-engine.applyOutcome` + the repos. (Currently the outcomes are only `console.log`'d.)

### Config
- `EXPO_PUBLIC_TUTOR_BASE_URL` env (e.g. `http://192.168.x.x:3000`) — required to use backend; if unset, always use FIXTURES.
- `EXPO_PUBLIC_TUTOR_SECRET` env — bearer token sent to backend.

### A note on AttemptOutcome

The existing `AttemptOutcome` type in `@institute/skill-engine` doesn't carry a `skillId` (M2 Scene's outcomes are skill-agnostic). For M5 we add `skillId` to `AttemptOutcome` so the persistence layer knows where each outcome belongs. This is a minor addition the existing skill-engine logic ignores for backward compatibility.

## File structure produced

```
apps/
├── backend/                           # NEW (Rails 8)
│   ├── Gemfile
│   ├── Gemfile.lock
│   ├── bin/
│   ├── config/
│   │   ├── application.rb
│   │   ├── routes.rb                  # POST /tutor/next_round
│   │   ├── database.yml               # postgres
│   │   └── initializers/
│   │       └── ruby_llm.rb
│   ├── app/
│   │   ├── controllers/
│   │   │   ├── application_controller.rb
│   │   │   └── tutor_controller.rb
│   │   ├── services/
│   │   │   └── tutor/
│   │   │       ├── picker.rb
│   │   │       ├── prompt.rb
│   │   │       └── response_schema.rb
│   │   └── ...
│   ├── test/
│   │   ├── controllers/tutor_controller_test.rb
│   │   ├── services/tutor/picker_test.rb
│   │   └── fixtures/...
│   └── db/migrate/                    # empty for M5
└── kid-app/
    ├── src/
    │   ├── persistence/               # NEW
    │   │   ├── db.ts
    │   │   ├── skillStateRepo.ts
    │   │   └── attemptRepo.ts
    │   ├── tutor/                     # NEW
    │   │   ├── client.ts
    │   │   ├── eligiblePool.ts
    │   │   └── pluginSchemas.ts
    │   ├── minigame/MiniGameMount.tsx # MODIFY
    │   └── config.ts                  # MODIFY (TUTOR_* env)
    └── App.tsx                        # MODIFY (wire outcomes)

packages/skill-engine/src/types.ts     # MODIFY (add skillId to AttemptOutcome)
packages/minigames/spell-cast/src/Scene.tsx # MODIFY (set skillId on outcomes)
```

## Testing strategy

### Backend (Minitest, Rails defaults)
- `test/services/tutor/picker_test.rb` — `Picker.call` with a stubbed RubyLLM client (using `RubyLLM.stub_chat` or similar). Cover: happy path, plugin filtering by skill overlap, validation failures (skillId not in pool, params don't validate), LLM error.
- `test/controllers/tutor_controller_test.rb` — full request/response: 200 happy, 400 bad payload, 502 LLM failure, 401 missing/wrong token (when env set), bypasses auth when env unset.
- A live-LLM smoke test guarded by `ENV["LIVE_LLM"]=1`, off by default.

### Kid-app (Vitest)
- `persistence/skillStateRepo.test.ts` — round-trip a SkillState through SQLite (using `expo-sqlite` mock or in-memory SQLite).
- `tutor/eligiblePool.test.ts` — given a seeded set of skill_state rows, computes the correct pool.
- `tutor/client.test.ts` — fetches with bearer header; falls back to provided fallback on network error / non-2xx; validates response against provided schema.
- `tutor/pluginSchemas.test.ts` — converts SpellCastParams Zod to a sane JSON Schema (round-trip through ajv to verify).

### Integration
- Add a new manual checklist section ("M5 manual on-device check"): start backend locally, point kid-app at it via tunnel/LAN, tap Spell Cast, confirm goblin's sequence varies between rounds and uses skills Sam has actually been practicing.

## Risks

- **LLM output non-conformance.** RubyLLM's structured output is reliable but not perfect. Mitigation: server-side post-validation against the same JSON Schema; on failure, return 502 and let kid-app fall back to fixtures.
- **First-time empty state.** Sam has no skill_state rows on day one — `eligiblePool` returns `[]`, backend has nothing to choose from. Mitigation: when the pool is empty, `eligiblePool` seeds with all "stretch" candidates (skills whose prereqs are trivially satisfied) so the LLM always has something to pick.
- **Latency feels bad.** Sonnet 4.6 ~2-4s. Mitigation for M5: just show the loading screen. M6 adds pre-fetch.
- **expo-sqlite migration churn.** Schema changes mean device data loss in dev. Mitigation: M5 ships v1 of the schema; bump version + drop tables on schema mismatch (data loss is fine — Sam's mastery state is rebuilt on next play).

## What success looks like

After M5:

1. Tap the Spell Cast portal on the Pixel.
2. Backend (running on dev machine) receives a request with Sam's actual current eligible-skill pool.
3. Sonnet 4.6 picks `skill_count_2` (or `add_within_5`, or whatever's most appropriate) and generates a plausible sequence + intro line.
4. Goblin appears, Sam plays the round, answers feed back into local skill_state.
5. Next round: same flow, possibly a different skill (because his recent history changed).
6. Backend offline / Wi-Fi off → fall back to fixtures, no crash, no stuck state.
