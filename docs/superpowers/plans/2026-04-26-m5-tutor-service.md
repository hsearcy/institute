# M5 — Tutor Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the kid-app's hand-coded `FIXTURES["spell-cast"]` with LLM-generated round params, chosen by Claude from Sam's actual eligible-skill pool. Adds the Rails Tutor Service backend and persists kid-app skill state to local SQLite.

**Architecture:** New `apps/backend/` (Rails 8.1 on Ruby 3.4.7, Postgres, Hotwire+importmaps, Minitest) exposing one stateless endpoint `POST /tutor/next_round` that calls Sonnet 4.6 via [RubyLLM](https://rubyllm.com) with JSON-Schema-constrained structured output. Kid-app gets `expo-sqlite` + a 2-table schema (`skill_state`, `attempt`), a tutor client that POSTs eligible pool + plugin schemas, and outcome-persistence wired from `RoundResult.outcomes` back through `skill-engine.applyOutcome` into SQLite. Backend errors / offline → fall back to existing `FIXTURES`.

**Tech Stack:** Rails 8.1, Ruby 3.4.7, Postgres, Minitest, Hotwire+importmaps (Rails defaults), RubyLLM gem; TypeScript, pnpm workspaces, Vitest, Zod, `zod-to-json-schema`, `expo-sqlite`, react-three-fiber/native.

---

## Reference

- Spec: `docs/superpowers/specs/2026-04-26-m5-tutor-service-design.md`
- Parent design: `docs/superpowers/specs/2026-04-25-institute-design.md` (Voice pipeline, Mastery model, Eligible pool, Sync protocol)
- M2 plan (just completed): `docs/superpowers/plans/2026-04-26-m2-plugin-engine.md` — establishes plugin contract, FIXTURES pattern
- M1 plan: `docs/superpowers/plans/2026-04-25-m1-skill-engine.md` — taxonomy, mastery, SRS, eligible-pool pure functions

## Pre-flight notes

- **Ruby:** Pin `apps/backend/.ruby-version` to `3.4.7`. The repo currently defaults to 3.0.1 (root `.ruby-version`); the backend overrides per-directory via rbenv.
- **Rails 8:** brand-new install via `gem install rails` then `rails new`. Use `-d postgresql` (Postgres), default importmaps + Hotwire, default Minitest. `--skip-jbuilder --skip-action-mailbox --skip-action-mailer --skip-action-cable --skip-active-storage --skip-action-text` to keep the surface tight (we may add some back later milestones, but YAGNI for M5).
- **RubyLLM:** the gem name is `ruby_llm`. API: `RubyLLM.chat(model: "claude-sonnet-4-6").with_response_format(json_schema: <schema>).complete([messages])`. Configure once in `config/initializers/ruby_llm.rb`. Stub via dependency injection: `Tutor::Picker` accepts a `client:` keyword arg defaulting to `RubyLLM`.
- **AttemptOutcome shape change:** add `skillId: SkillId` to `@institute/skill-engine`'s `AttemptOutcome`. M2's spell-cast Scene sets a hardcoded `SKILL_ID` (the one M5 will replace dynamically). This is a breaking change to the type but every existing call site is in this monorepo.
- **Eligible pool seeding:** on first launch, Sam has zero rows in `skill_state`. The TS `eligiblePool` returns `[]`. The kid-app's eligible-pool wrapper handles this: when the pool is empty AND no rows exist, seed with `unstarted` rows for skills whose prereqs are trivially satisfied (i.e. `[]` prereqs), so the pool always has at least one stretch candidate.
- **Vitest + expo-sqlite:** expo-sqlite has no Node runtime. Tests for the repos use a thin in-memory adapter behind a tiny SQL interface — the repos take a `Db` interface, prod uses expo-sqlite, tests use `better-sqlite3` (devDependency).
- **No `cd backend` in commands:** every command in this plan uses absolute paths or stays at the repo root via `--chdir` / `pnpm --filter`. Don't change directories between commands; the harness resets cwd.
- **Auth:** dev-friendly — if `ENV["TUTOR_SHARED_SECRET"]` is unset on the backend, the controller skips auth entirely. When set, requires `Authorization: Bearer <secret>` header.

## File structure produced

```
apps/
├── backend/                                            # NEW (Rails 8.1)
│   ├── .ruby-version                                   # 3.4.7
│   ├── Gemfile
│   ├── Gemfile.lock
│   ├── bin/
│   ├── config/
│   │   ├── application.rb
│   │   ├── routes.rb                                   # post "/tutor/next_round"
│   │   ├── database.yml                                # postgres
│   │   └── initializers/
│   │       └── ruby_llm.rb
│   ├── app/
│   │   ├── controllers/
│   │   │   ├── application_controller.rb
│   │   │   └── tutor_controller.rb
│   │   └── services/
│   │       └── tutor/
│   │           ├── picker.rb
│   │           ├── prompt.rb
│   │           └── response_schema.rb
│   ├── test/
│   │   ├── controllers/tutor_controller_test.rb
│   │   ├── services/tutor/picker_test.rb
│   │   └── fixtures/files/
│   │       ├── valid_request.json
│   │       └── llm_response_skip_count_2.json
│   └── db/migrate/                                     # empty in M5
└── kid-app/
    ├── App.tsx                                         # MODIFY (persist outcomes)
    ├── package.json                                    # MODIFY (deps)
    └── src/
        ├── config.ts                                   # MODIFY (TUTOR_* env)
        ├── persistence/                                # NEW
        │   ├── db.ts
        │   ├── skillStateRepo.ts
        │   └── attemptRepo.ts
        ├── tutor/                                      # NEW
        │   ├── client.ts
        │   ├── eligiblePool.ts
        │   └── pluginSchemas.ts
        └── minigame/MiniGameMount.tsx                  # MODIFY (use tutor client + fallback)

packages/skill-engine/src/types.ts                      # MODIFY (add skillId to AttemptOutcome)
packages/skill-engine/test/mastery.test.ts              # MODIFY (fixtures include skillId)
packages/minigames/spell-cast/src/Scene.tsx             # MODIFY (set skillId on outcomes)
```

---

## Task 1 — Bootstrap Rails 8.1 app at `apps/backend`

**Files:**
- Create: `apps/backend/.ruby-version`
- Create: `apps/backend/` (Rails-generated tree)

- [ ] **Step 1.1: Ensure Ruby 3.4.7 + Rails 8.1 available**

```bash
RBENV_VERSION=3.4.7 ruby --version           # → ruby 3.4.7
RBENV_VERSION=3.4.7 gem list rails | grep -E "^rails " || \
  RBENV_VERSION=3.4.7 gem install rails
RBENV_VERSION=3.4.7 rails --version          # → Rails 8.1.x
```

- [ ] **Step 1.2: Generate the Rails app**

Run from repo root:

```bash
cd /home/hfsearcy/git/institute && \
  RBENV_VERSION=3.4.7 rails new apps/backend \
    --database=postgresql \
    --skip-jbuilder \
    --skip-action-mailer \
    --skip-action-mailbox \
    --skip-action-cable \
    --skip-active-storage \
    --skip-action-text \
    --skip-bundle \
    --skip-git
```

(`--skip-bundle` so we control the bundle step; `--skip-git` because we're already in a git repo.)

- [ ] **Step 1.3: Pin Ruby version for the backend dir**

```bash
echo 3.4.7 > /home/hfsearcy/git/institute/apps/backend/.ruby-version
```

- [ ] **Step 1.4: Bundle install**

```bash
RBENV_VERSION=3.4.7 bundle install --gemfile=/home/hfsearcy/git/institute/apps/backend/Gemfile
```

Expect: success. If there are platform/lockfile gripes, run once with `bundle lock --add-platform x86_64-linux` (run via `bundle --gemfile=...`).

- [ ] **Step 1.5: Create the Postgres dev/test databases**

```bash
RBENV_VERSION=3.4.7 bin/rails -C /home/hfsearcy/git/institute/apps/backend db:create 2>&1 | tail -5
```

If `bin/rails -C` is unfamiliar to your local Rails, fall back to:

```bash
( cd /home/hfsearcy/git/institute/apps/backend && RBENV_VERSION=3.4.7 bin/rails db:create ) 2>&1 | tail -5
```

Expect: `Created database 'backend_development'` and `'backend_test'` (or "already exists" — fine).

- [ ] **Step 1.6: Verify the app boots + the default Minitest runs**

```bash
( cd /home/hfsearcy/git/institute/apps/backend && RBENV_VERSION=3.4.7 bin/rails test ) 2>&1 | tail -10
```

Expect: 0 runs / 0 assertions / 0 failures (no app code yet). Exit 0.

- [ ] **Step 1.7: Verify rails server starts (smoke)**

```bash
( cd /home/hfsearcy/git/institute/apps/backend && RBENV_VERSION=3.4.7 bin/rails runner "puts Rails.version" ) 2>&1 | tail -3
```

Expect: `8.1.x` printed.

- [ ] **Step 1.8: Commit**

```bash
cd /home/hfsearcy/git/institute && \
  git add apps/backend && \
  git commit -m "chore(backend): bootstrap Rails 8.1 app (postgres, hotwire, importmaps, minitest)"
```

---

## Task 2 — Add `ruby_llm` gem + initializer

**Files:**
- Modify: `apps/backend/Gemfile`
- Create: `apps/backend/config/initializers/ruby_llm.rb`
- Create: `apps/backend/test/initializers/ruby_llm_test.rb`

- [ ] **Step 2.1: Add the gem to Gemfile**

Append to `apps/backend/Gemfile` (in the main group, after `rails`):

```ruby
gem "ruby_llm"
```

- [ ] **Step 2.2: Bundle**

```bash
RBENV_VERSION=3.4.7 bundle install --gemfile=/home/hfsearcy/git/institute/apps/backend/Gemfile
```

- [ ] **Step 2.3: Create the initializer**

Create `apps/backend/config/initializers/ruby_llm.rb`:

```ruby
RubyLLM.configure do |config|
  config.anthropic_api_key = ENV["ANTHROPIC_API_KEY"]
end
```

- [ ] **Step 2.4: Write a smoke test that the configuration is loaded**

Create `apps/backend/test/initializers/ruby_llm_test.rb`:

```ruby
require "test_helper"

class RubyLLMConfigTest < ActiveSupport::TestCase
  test "RubyLLM is loaded" do
    assert defined?(RubyLLM), "RubyLLM should be loaded"
  end

  test "anthropic_api_key reads from ENV" do
    # Just confirms our initializer wired through; we don't hit the API.
    assert_nothing_raised do
      RubyLLM.configuration.anthropic_api_key
    end
  end
end
```

- [ ] **Step 2.5: Run + commit**

```bash
( cd /home/hfsearcy/git/institute/apps/backend && RBENV_VERSION=3.4.7 bin/rails test test/initializers/ruby_llm_test.rb ) 2>&1 | tail -5
```

Expect: 2 runs / 2 assertions / 0 failures.

```bash
cd /home/hfsearcy/git/institute && \
  git add apps/backend/Gemfile apps/backend/Gemfile.lock apps/backend/config/initializers/ruby_llm.rb apps/backend/test/initializers/ruby_llm_test.rb && \
  git commit -m "feat(backend): add ruby_llm gem + initializer"
```

---

## Task 3 — `Tutor::Picker` service (TDD)

This is the core LLM-calling service. We test it with a stub LLM client to keep tests deterministic and fast.

**Files:**
- Create: `apps/backend/app/services/tutor/picker.rb`
- Create: `apps/backend/app/services/tutor/prompt.rb`
- Create: `apps/backend/app/services/tutor/response_schema.rb`
- Create: `apps/backend/test/services/tutor/picker_test.rb`
- Create: `apps/backend/test/fixtures/files/valid_request.json`
- Create: `apps/backend/test/fixtures/files/llm_response_skip_count_2.json`

- [ ] **Step 3.1: Create test fixtures**

`apps/backend/test/fixtures/files/valid_request.json`:

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
    },
    {
      "skillId": "add_within_5",
      "description": "Addition within 5",
      "masteryState": "learning",
      "currentDifficulty": 0.2,
      "attempts": 3,
      "correct": 2
    }
  ],
  "recentHistory": [
    { "skillId": "skip_count_2", "correct": true,  "occurredAt": "2026-04-26T12:00:00Z" },
    { "skillId": "skip_count_2", "correct": true,  "occurredAt": "2026-04-26T12:00:30Z" },
    { "skillId": "skip_count_2", "correct": false, "occurredAt": "2026-04-26T12:01:00Z" }
  ],
  "availablePlugins": [
    {
      "id": "spell-cast",
      "title": "Spell Cast",
      "supportedSkills": ["skip_count_2", "skip_count_5", "skip_count_10", "sequence_next"],
      "paramSchema": {
        "type": "object",
        "properties": {
          "enemyType": { "type": "string", "enum": ["goblin", "slime", "ghost"] },
          "sequence": { "type": "array", "items": { "type": "integer", "minimum": 0 }, "minItems": 1 },
          "intro": { "type": "string", "minLength": 1 }
        },
        "required": ["enemyType", "sequence", "intro"],
        "additionalProperties": false
      }
    }
  ]
}
```

`apps/backend/test/fixtures/files/llm_response_skip_count_2.json`:

```json
{
  "skillId": "skip_count_2",
  "pluginId": "spell-cast",
  "params": {
    "enemyType": "goblin",
    "sequence": [2, 4, 6, 8, 10],
    "intro": "A goblin appears! Cast sparks by 2s to defeat it."
  }
}
```

- [ ] **Step 3.2: Write failing tests**

Create `apps/backend/test/services/tutor/picker_test.rb`:

```ruby
require "test_helper"
require "json"

class Tutor::PickerTest < ActiveSupport::TestCase
  setup do
    @valid_request = JSON.parse(file_fixture("valid_request.json").read)
    @canned_llm_response = JSON.parse(file_fixture("llm_response_skip_count_2.json").read)
  end

  # Minimal stub. Tutor::Picker accepts a `client:` kwarg and calls
  #   client.chat(model:, messages:, response_schema:) → { content: <hash> }
  # Real impl wraps RubyLLM. Tests use this stub.
  class StubClient
    attr_reader :captured

    def initialize(reply:)
      @reply = reply
      @captured = nil
    end

    def chat(model:, messages:, response_schema:)
      @captured = { model:, messages:, response_schema: }
      { content: @reply }
    end
  end

  test "happy path: returns the LLM response shape" do
    client = StubClient.new(reply: @canned_llm_response)
    result = Tutor::Picker.call(@valid_request, client: client)

    assert_equal "skip_count_2", result.fetch("skillId")
    assert_equal "spell-cast",   result.fetch("pluginId")
    assert_equal [2, 4, 6, 8, 10], result.dig("params", "sequence")
  end

  test "passes the configured model name to the client" do
    client = StubClient.new(reply: @canned_llm_response)
    Tutor::Picker.call(@valid_request, client: client, model: "claude-sonnet-4-6")
    assert_equal "claude-sonnet-4-6", client.captured.fetch(:model)
  end

  test "builds a response schema that constrains skillId to the eligible pool" do
    client = StubClient.new(reply: @canned_llm_response)
    Tutor::Picker.call(@valid_request, client: client)
    skill_enum = client.captured.dig(:response_schema, :properties, :skillId, :enum)
    assert_equal ["skip_count_2", "add_within_5"], skill_enum
  end

  test "builds a response schema that constrains pluginId to available plugins" do
    client = StubClient.new(reply: @canned_llm_response)
    Tutor::Picker.call(@valid_request, client: client)
    plugin_enum = client.captured.dig(:response_schema, :properties, :pluginId, :enum)
    assert_equal ["spell-cast"], plugin_enum
  end

  test "rejects LLM response whose skillId is not in the eligible pool" do
    bad = @canned_llm_response.merge("skillId" => "make_10")
    client = StubClient.new(reply: bad)
    assert_raises(Tutor::Picker::InvalidResponse) do
      Tutor::Picker.call(@valid_request, client: client)
    end
  end

  test "rejects LLM response whose pluginId is not available" do
    bad = @canned_llm_response.merge("pluginId" => "block-tower")
    client = StubClient.new(reply: bad)
    assert_raises(Tutor::Picker::InvalidResponse) do
      Tutor::Picker.call(@valid_request, client: client)
    end
  end

  test "rejects LLM response whose chosen plugin doesn't support the chosen skill" do
    # spell-cast supports skip_count_*, sequence_next — NOT add_within_5
    bad = @canned_llm_response.merge("skillId" => "add_within_5")
    client = StubClient.new(reply: bad)
    assert_raises(Tutor::Picker::InvalidResponse) do
      Tutor::Picker.call(@valid_request, client: client)
    end
  end

  test "rejects LLM response whose params don't match the plugin's paramSchema" do
    bad = @canned_llm_response.deep_dup
    bad["params"]["enemyType"] = "dragon" # not in enum
    client = StubClient.new(reply: bad)
    assert_raises(Tutor::Picker::InvalidResponse) do
      Tutor::Picker.call(@valid_request, client: client)
    end
  end

  test "raises if no plugin in availablePlugins overlaps the eligible pool" do
    req = @valid_request.deep_dup
    req["availablePlugins"][0]["supportedSkills"] = ["place_value_tens"] # disjoint
    client = StubClient.new(reply: @canned_llm_response)
    assert_raises(Tutor::Picker::NoEligibleContent) do
      Tutor::Picker.call(req, client: client)
    end
  end

  test "raises on empty eligible pool" do
    req = @valid_request.deep_dup
    req["eligiblePool"] = []
    client = StubClient.new(reply: @canned_llm_response)
    assert_raises(Tutor::Picker::NoEligibleContent) do
      Tutor::Picker.call(req, client: client)
    end
  end
end
```

- [ ] **Step 3.3: Run — confirm failure**

```bash
( cd /home/hfsearcy/git/institute/apps/backend && RBENV_VERSION=3.4.7 bin/rails test test/services/tutor/picker_test.rb ) 2>&1 | tail -10
```

Expect: load error / NameError on `Tutor::Picker`.

- [ ] **Step 3.4: Implement `Tutor::Prompt`**

Create `apps/backend/app/services/tutor/prompt.rb`:

```ruby
module Tutor
  module Prompt
    SYSTEM = <<~SYS.strip
      You are a math tutor for a young child. You are picking the next math problem
      from a small set of skills the child is currently working on.

      Your job:
      1. Pick exactly ONE skill from `eligiblePool` that's appropriate next given recentHistory.
         - If the kid just got several wrong on a skill, prefer an easier one or the same one with easier params.
         - If the kid is on a streak, you can stretch them.
      2. Pick exactly ONE plugin from `availablePlugins` that supports the chosen skill.
      3. Generate `params` matching that plugin's paramSchema. The params should embody
         the chosen skill at the kid's `currentDifficulty`. For sequences, pick numbers
         within the kid's age-appropriate range. The `intro` field is a single short
         playful sentence the tutor will say (no emoji, no markdown).

      Return ONLY the JSON shape requested. No prose.
    SYS

    def self.user_message(payload)
      JSON.pretty_generate(payload)
    end

    def self.messages(payload)
      [
        { role: "system", content: SYSTEM },
        { role: "user",   content: user_message(payload) },
      ]
    end
  end
end
```

- [ ] **Step 3.5: Implement `Tutor::ResponseSchema`**

Create `apps/backend/app/services/tutor/response_schema.rb`:

```ruby
module Tutor
  # Builds the top-level JSON Schema we hand to the LLM as a structured-output
  # constraint. Constrains skillId / pluginId to the request's enums, and
  # selects the chosen plugin's paramSchema as the `params` constraint.
  #
  # For M5 we have exactly one plugin, so `params` is just that plugin's schema.
  # When more plugins land in M6, this becomes a oneOf.
  module ResponseSchema
    def self.build(payload)
      pool   = payload.fetch("eligiblePool")
      plugins = payload.fetch("availablePlugins")
      skill_ids  = pool.map { |s| s.fetch("skillId") }
      plugin_ids = plugins.map { |p| p.fetch("id") }

      params_schema =
        if plugins.length == 1
          plugins.first.fetch("paramSchema").deep_symbolize_keys
        else
          { oneOf: plugins.map { |p| p.fetch("paramSchema").deep_symbolize_keys } }
        end

      {
        type: "object",
        properties: {
          skillId:  { type: "string", enum: skill_ids },
          pluginId: { type: "string", enum: plugin_ids },
          params:   params_schema,
        },
        required: ["skillId", "pluginId", "params"],
        additionalProperties: false,
      }
    end
  end
end
```

- [ ] **Step 3.6: Implement `Tutor::Picker`**

Create `apps/backend/app/services/tutor/picker.rb`:

```ruby
require "json-schema"  # Add to Gemfile in next step if not present

module Tutor
  module Picker
    class NoEligibleContent < StandardError; end
    class InvalidResponse   < StandardError; end

    DEFAULT_MODEL = ENV.fetch("TUTOR_MODEL", "claude-sonnet-4-6")

    def self.call(payload, client: RubyLLMClient, model: DEFAULT_MODEL)
      validate_request!(payload)
      schema = ResponseSchema.build(payload)
      messages = Prompt.messages(payload)

      reply = client.chat(model: model, messages: messages, response_schema: schema)
      content = reply.fetch(:content)
      validate_response!(content, payload)
      content
    end

    def self.validate_request!(payload)
      pool = payload.fetch("eligiblePool", [])
      raise NoEligibleContent, "eligiblePool is empty" if pool.empty?

      skill_ids = pool.map { |s| s.fetch("skillId") }.to_set
      plugins   = payload.fetch("availablePlugins", [])
      overlap = plugins.any? { |p| (p.fetch("supportedSkills") & skill_ids.to_a).any? }
      raise NoEligibleContent, "no plugin supports any eligible skill" unless overlap
    end

    def self.validate_response!(content, payload)
      pool_ids   = payload.fetch("eligiblePool").map { |s| s.fetch("skillId") }
      plugin_map = payload.fetch("availablePlugins").to_h { |p| [p.fetch("id"), p] }

      skill_id  = content.fetch("skillId")
      plugin_id = content.fetch("pluginId")

      raise InvalidResponse, "skillId #{skill_id} not in eligible pool"  unless pool_ids.include?(skill_id)
      raise InvalidResponse, "pluginId #{plugin_id} not available"        unless plugin_map.key?(plugin_id)

      plugin = plugin_map.fetch(plugin_id)
      raise InvalidResponse, "plugin #{plugin_id} does not support skill #{skill_id}" unless plugin.fetch("supportedSkills").include?(skill_id)

      errs = JSON::Validator.fully_validate(plugin.fetch("paramSchema"), content.fetch("params"))
      raise InvalidResponse, "params failed paramSchema validation: #{errs.join('; ')}" unless errs.empty?
    end
  end
end
```

- [ ] **Step 3.7: Add `json-schema` gem (for params validation)**

Append to `apps/backend/Gemfile`:

```ruby
gem "json-schema"
```

Then bundle:

```bash
RBENV_VERSION=3.4.7 bundle install --gemfile=/home/hfsearcy/git/institute/apps/backend/Gemfile
```

- [ ] **Step 3.8: Add a thin `RubyLLMClient` adapter (default real client)**

Create `apps/backend/app/services/tutor/ruby_llm_client.rb`:

```ruby
module Tutor
  # Thin adapter over RubyLLM with the exact interface Picker expects:
  #   chat(model:, messages:, response_schema:) → { content: <hash> }
  module RubyLLMClient
    module_function

    def chat(model:, messages:, response_schema:)
      raw = RubyLLM
        .chat(model: model)
        .with_response_format(json_schema: response_schema)
        .complete(messages)
      # RubyLLM returns the parsed structured-output payload; normalize the wrapper.
      content = raw.respond_to?(:content) ? raw.content : raw
      content = JSON.parse(content) if content.is_a?(String)
      { content: content }
    end
  end
end
```

Wire it as the default in `picker.rb` — change the default arg:

```ruby
def self.call(payload, client: RubyLLMClient, model: DEFAULT_MODEL)
```

- [ ] **Step 3.9: Run tests — should pass**

```bash
( cd /home/hfsearcy/git/institute/apps/backend && RBENV_VERSION=3.4.7 bin/rails test test/services/tutor/picker_test.rb ) 2>&1 | tail -10
```

Expect: 10 runs / 10+ assertions / 0 failures.

If JSON::Validator complains about a top-level `additionalProperties` key not being honored, that's fine — we don't set it on the inner paramSchema (the kid-app's Zod-generated schema sets it).

- [ ] **Step 3.10: Commit**

```bash
cd /home/hfsearcy/git/institute && \
  git add apps/backend && \
  git commit -m "feat(backend): Tutor::Picker — LLM-driven problem selection with JSON-Schema validation"
```

---

## Task 4 — `TutorController#next_round` (TDD)

**Files:**
- Create: `apps/backend/app/controllers/tutor_controller.rb`
- Modify: `apps/backend/config/routes.rb`
- Create: `apps/backend/test/controllers/tutor_controller_test.rb`

- [ ] **Step 4.1: Write failing controller tests**

Create `apps/backend/test/controllers/tutor_controller_test.rb`:

```ruby
require "test_helper"
require "json"

class TutorControllerTest < ActionDispatch::IntegrationTest
  setup do
    @valid_request    = JSON.parse(file_fixture("valid_request.json").read)
    @canned_response  = JSON.parse(file_fixture("llm_response_skip_count_2.json").read)
  end

  # Tiny stub injected via Tutor::Picker's DI
  class StubPicker
    def self.call(payload, **_)
      raise @raise if @raise
      @reply
    end
    class << self
      attr_accessor :reply, :raise
    end
  end

  test "POST /tutor/next_round returns 200 + LLM body on happy path" do
    StubPicker.reply = @canned_response
    StubPicker.raise = nil
    with_picker(StubPicker) do
      post "/tutor/next_round", params: @valid_request, as: :json
    end
    assert_response :ok
    body = JSON.parse(response.body)
    assert_equal "skip_count_2", body["skillId"]
    assert_equal "spell-cast",   body["pluginId"]
    assert_equal [2, 4, 6, 8, 10], body.dig("params", "sequence")
  end

  test "returns 422 on missing eligiblePool" do
    bad = @valid_request.deep_dup.tap { |h| h.delete("eligiblePool") }
    post "/tutor/next_round", params: bad, as: :json
    assert_response :unprocessable_entity
  end

  test "returns 502 when picker raises InvalidResponse" do
    StubPicker.reply = nil
    StubPicker.raise = Tutor::Picker::InvalidResponse.new("nope")
    with_picker(StubPicker) do
      post "/tutor/next_round", params: @valid_request, as: :json
    end
    assert_response :bad_gateway
  end

  test "returns 422 when picker raises NoEligibleContent" do
    StubPicker.reply = nil
    StubPicker.raise = Tutor::Picker::NoEligibleContent.new("empty")
    with_picker(StubPicker) do
      post "/tutor/next_round", params: @valid_request, as: :json
    end
    assert_response :unprocessable_entity
  end

  test "auth: when TUTOR_SHARED_SECRET is set, request without bearer is 401" do
    StubPicker.reply = @canned_response
    StubPicker.raise = nil
    with_env("TUTOR_SHARED_SECRET" => "supersecret") do
      with_picker(StubPicker) do
        post "/tutor/next_round", params: @valid_request, as: :json
      end
    end
    assert_response :unauthorized
  end

  test "auth: when TUTOR_SHARED_SECRET is set, request with correct bearer is 200" do
    StubPicker.reply = @canned_response
    StubPicker.raise = nil
    with_env("TUTOR_SHARED_SECRET" => "supersecret") do
      with_picker(StubPicker) do
        post "/tutor/next_round",
          params: @valid_request,
          headers: { "Authorization" => "Bearer supersecret" },
          as: :json
      end
    end
    assert_response :ok
  end

  test "auth: when TUTOR_SHARED_SECRET is unset, no bearer required" do
    StubPicker.reply = @canned_response
    StubPicker.raise = nil
    with_env("TUTOR_SHARED_SECRET" => nil) do
      with_picker(StubPicker) do
        post "/tutor/next_round", params: @valid_request, as: :json
      end
    end
    assert_response :ok
  end

  private

  # Swap Tutor::Picker for the test stub for the block's duration.
  def with_picker(stub)
    original = TutorController.picker
    TutorController.picker = stub
    yield
  ensure
    TutorController.picker = original
  end

  def with_env(vars)
    originals = vars.transform_values { |_| :__missing__ }
    vars.each_key { |k| originals[k] = ENV.key?(k) ? ENV[k] : :__missing__ }
    vars.each { |k, v| v.nil? ? ENV.delete(k) : ENV[k] = v }
    yield
  ensure
    originals.each { |k, v| v == :__missing__ ? ENV.delete(k) : ENV[k] = v }
  end
end
```

- [ ] **Step 4.2: Run tests — confirm failure (route + controller missing)**

```bash
( cd /home/hfsearcy/git/institute/apps/backend && RBENV_VERSION=3.4.7 bin/rails test test/controllers/tutor_controller_test.rb ) 2>&1 | tail -10
```

Expect: routing or NameError failures.

- [ ] **Step 4.3: Add the route**

In `apps/backend/config/routes.rb`, inside the `Rails.application.routes.draw do` block, add:

```ruby
post "/tutor/next_round", to: "tutor#next_round"
```

- [ ] **Step 4.4: Implement the controller**

Create `apps/backend/app/controllers/tutor_controller.rb`:

```ruby
class TutorController < ApplicationController
  # CSRF doesn't apply: this is a JSON API consumed by the kid-app, not a form.
  skip_before_action :verify_authenticity_token, raise: false
  before_action :authenticate_bearer!

  REQUIRED_KEYS = %w[profile currentZone eligiblePool recentHistory availablePlugins].freeze

  # Class attribute to enable picker DI in tests.
  class << self
    attr_accessor :picker
  end
  self.picker = Tutor::Picker

  def next_round
    payload = request.request_parameters
    missing = REQUIRED_KEYS - payload.keys
    if missing.any?
      return render json: { error: "missing keys: #{missing.join(', ')}" }, status: :unprocessable_entity
    end

    result = self.class.picker.call(payload)
    render json: result, status: :ok
  rescue Tutor::Picker::NoEligibleContent => e
    render json: { error: e.message }, status: :unprocessable_entity
  rescue Tutor::Picker::InvalidResponse => e
    Rails.logger.warn("Tutor::Picker invalid response: #{e.message}")
    render json: { error: "llm response failed validation" }, status: :bad_gateway
  rescue => e
    Rails.logger.error("TutorController error: #{e.class} #{e.message}\n#{e.backtrace.first(10).join("\n")}")
    render json: { error: "internal error" }, status: :internal_server_error
  end

  private

  def authenticate_bearer!
    secret = ENV["TUTOR_SHARED_SECRET"]
    return if secret.nil? || secret.empty?

    header = request.headers["Authorization"].to_s
    expected = "Bearer #{secret}"
    return if ActiveSupport::SecurityUtils.secure_compare(header, expected)

    render json: { error: "unauthorized" }, status: :unauthorized
  end
end
```

- [ ] **Step 4.5: Run tests**

```bash
( cd /home/hfsearcy/git/institute/apps/backend && RBENV_VERSION=3.4.7 bin/rails test test/controllers/tutor_controller_test.rb ) 2>&1 | tail -10
```

Expect: 7 runs / 0 failures.

- [ ] **Step 4.6: Run the full backend suite**

```bash
( cd /home/hfsearcy/git/institute/apps/backend && RBENV_VERSION=3.4.7 bin/rails test ) 2>&1 | tail -10
```

Expect: all green.

- [ ] **Step 4.7: Commit**

```bash
cd /home/hfsearcy/git/institute && \
  git add apps/backend/app/controllers apps/backend/config/routes.rb apps/backend/test/controllers && \
  git commit -m "feat(backend): TutorController#next_round endpoint with bearer auth"
```

---

## Task 5 — Add `skillId` to `AttemptOutcome`; update spell-cast

**Files:**
- Modify: `packages/skill-engine/src/types.ts`
- Modify: `packages/skill-engine/src/mastery.ts` (only if any field references need updating — likely no change)
- Modify: `packages/skill-engine/test/*.ts` (any fixtures that build an AttemptOutcome)
- Modify: `packages/minigames/spell-cast/src/Scene.tsx` (set skillId)

This is a breaking change to the `AttemptOutcome` shape but every callsite is in this monorepo.

- [ ] **Step 5.1: Add the field to `AttemptOutcome`**

In `packages/skill-engine/src/types.ts`, change `AttemptOutcome` to:

```ts
export type AttemptOutcome = {
  /** Which skill this attempt was for. M2 used a placeholder; M5 sets it from the round. */
  skillId: SkillId;
  correct: boolean;
  hinted: boolean;
  scaffolded: boolean;
  difficulty: number; // 0..1
  occurredAt: Date;
};
```

- [ ] **Step 5.2: Update test fixtures in skill-engine**

Find every place a literal `AttemptOutcome` is constructed in `packages/skill-engine/test/`. Add `skillId: "<some_skill>"` to each. Use this command to find them:

```bash
grep -nR --include='*.ts' "correct: " packages/skill-engine/test/ | head -40
```

For each match, add `skillId: "skip_count_2"` (or whatever skill the test is asserting on; arbitrary value is fine for ones that don't care).

- [ ] **Step 5.3: Update spell-cast Scene to set skillId**

In `packages/minigames/spell-cast/src/Scene.tsx`, the outcomes push currently lacks `skillId`. The Scene doesn't yet know which skill it's exercising — that's a Round-level concept. For M5 we add a `skillId` prop to the Scene plumbed in from `MiniGameMount` (which gets it from the tutor response).

Modify the `Props` type:

```ts
type Props = SceneProps<SpellCastParams> & {
  onHandleReady?: (h: SpellCastSceneHandle) => void;
  /** The skill this round is exercising. Set by the tutor response (or fallback). */
  skillId: string;
};
```

In the `submitAnswer` body, change the outcome push to:

```ts
outcomesRef.current.push({
  skillId,
  correct: r.correct,
  hinted: false,
  scaffolded: false,
  difficulty: 0.4,
  occurredAt: new Date(),
});
```

(Adjust function destructuring to include `skillId` from props.)

- [ ] **Step 5.4: Update SceneProps to allow extra props**

`SceneProps<P>` in `@institute/plugin-engine` is fine as-is — Scene accepts a superset.

- [ ] **Step 5.5: Run tests**

```bash
cd /home/hfsearcy/git/institute && pnpm -r test 2>&1 | tail -20
```

Expect: all green. If skill-engine fixtures fail with a "missing skillId" error, fix the missed fixture.

```bash
cd /home/hfsearcy/git/institute && pnpm -r typecheck 2>&1 | tail -10
```

Expect: exit 0.

- [ ] **Step 5.6: Commit**

```bash
cd /home/hfsearcy/git/institute && \
  git add packages/skill-engine packages/minigames/spell-cast && \
  git commit -m "feat(skill-engine): add skillId to AttemptOutcome; thread through spell-cast Scene"
```

---

## Task 6 — Add `expo-sqlite` + create `db.ts`

**Files:**
- Modify: `apps/kid-app/package.json` (add `expo-sqlite`, dev `better-sqlite3` for tests)
- Create: `apps/kid-app/src/persistence/db.ts`

- [ ] **Step 6.1: Install expo-sqlite + better-sqlite3 (dev)**

```bash
cd /home/hfsearcy/git/institute && \
  pnpm --filter @institute/kid-app add expo-sqlite && \
  pnpm --filter @institute/kid-app add -D better-sqlite3 @types/better-sqlite3
```

- [ ] **Step 6.2: Create the `Db` interface and migration runner**

Create `apps/kid-app/src/persistence/db.ts`:

```ts
/**
 * Minimal SQL interface our repos use. Two implementations:
 *   - Production: thin wrapper around expo-sqlite (apps/kid-app uses this)
 *   - Tests: thin wrapper around better-sqlite3 (in-memory)
 *
 * Why not import expo-sqlite directly: expo-sqlite has no Node runtime, so
 * Vitest tests would die at import time. The Db interface keeps the repos
 * Node-testable.
 */
export type SqlRow = Record<string, unknown>;

export interface Db {
  exec(sql: string): void; // multi-statement DDL
  run(sql: string, params?: unknown[]): void; // INSERT/UPDATE/DELETE
  all<T = SqlRow>(sql: string, params?: unknown[]): T[]; // SELECT
  get<T = SqlRow>(sql: string, params?: unknown[]): T | undefined; // SELECT … LIMIT 1
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS skill_state (
  profile_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  state TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  recent_window_json TEXT NOT NULL,
  current_difficulty REAL NOT NULL,
  srs_interval_days INTEGER NOT NULL,
  srs_ease REAL NOT NULL,
  next_review_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (profile_id, skill_id)
);

CREATE TABLE IF NOT EXISTS attempt (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  correct INTEGER NOT NULL,
  hinted INTEGER NOT NULL,
  scaffolded INTEGER NOT NULL,
  difficulty REAL NOT NULL,
  occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS attempt_profile_occurred ON attempt(profile_id, occurred_at DESC);
`;

const SCHEMA_VERSION = 1;

/** Apply schema. Drops and recreates if version mismatch (dev-only data loss is fine). */
export function migrate(db: Db): void {
  db.exec(SCHEMA);
  const row = db.get<{ version?: number }>("SELECT version FROM schema_version LIMIT 1");
  const current = row?.version;
  if (current === undefined) {
    db.run("INSERT INTO schema_version (version) VALUES (?)", [SCHEMA_VERSION]);
    return;
  }
  if (current !== SCHEMA_VERSION) {
    // M5 ships v1; future bumps drop+recreate. Sam's mastery is rebuilt on next play.
    db.exec("DROP TABLE skill_state; DROP TABLE attempt; DROP TABLE schema_version;");
    migrate(db);
  }
}

/** Lazy production adapter using expo-sqlite. Tests construct their own Db. */
export async function openExpoDb(name = "institute.db"): Promise<Db> {
  const sqlite = await import("expo-sqlite");
  // expo-sqlite Next API
  const conn = await sqlite.openDatabaseAsync(name);
  return {
    exec(sql) { conn.execSync(sql); },
    run(sql, params = []) { conn.runSync(sql, params as unknown as never[]); },
    all<T = SqlRow>(sql: string, params: unknown[] = []) {
      return conn.getAllSync(sql, params as unknown as never[]) as unknown as T[];
    },
    get<T = SqlRow>(sql: string, params: unknown[] = []) {
      return (conn.getFirstSync(sql, params as unknown as never[]) as unknown as T) ?? undefined;
    },
  };
}
```

- [ ] **Step 6.3: Verify build**

```bash
cd /home/hfsearcy/git/institute && pnpm --filter @institute/kid-app typecheck 2>&1 | tail -5
```

Expect: exit 0.

- [ ] **Step 6.4: Commit**

```bash
cd /home/hfsearcy/git/institute && \
  git add apps/kid-app/package.json apps/kid-app/src/persistence/db.ts pnpm-lock.yaml && \
  git commit -m "feat(kid-app): persistence/db.ts (expo-sqlite + Db interface)"
```

---

## Task 7 — `skillStateRepo` (TDD)

**Files:**
- Create: `apps/kid-app/src/persistence/skillStateRepo.ts`
- Create: `apps/kid-app/test/persistence/skillStateRepo.test.ts`

- [ ] **Step 7.1: Test-helper: in-memory Db using better-sqlite3**

Create `apps/kid-app/test/persistence/inMemoryDb.ts`:

```ts
import Database from "better-sqlite3";
import type { Db } from "../../src/persistence/db";

export function inMemoryDb(): Db {
  const db = new Database(":memory:");
  return {
    exec: (sql) => { db.exec(sql); },
    run: (sql, params = []) => { db.prepare(sql).run(...params); },
    all: <T,>(sql: string, params: unknown[] = []) =>
      db.prepare(sql).all(...params) as T[],
    get: <T,>(sql: string, params: unknown[] = []) =>
      db.prepare(sql).get(...params) as T | undefined,
  };
}
```

- [ ] **Step 7.2: Write failing tests**

Create `apps/kid-app/test/persistence/skillStateRepo.test.ts`:

```ts
import { describe, test, expect, beforeEach } from "vitest";
import { migrate, type Db } from "../../src/persistence/db";
import { inMemoryDb } from "./inMemoryDb";
import { saveSkillState, loadSkillState, loadAllSkillStates } from "../../src/persistence/skillStateRepo";
import { initialSkillState } from "@institute/skill-engine";

let db: Db;
beforeEach(() => {
  db = inMemoryDb();
  migrate(db);
});

describe("skillStateRepo", () => {
  test("loadSkillState returns undefined when nothing saved", () => {
    expect(loadSkillState(db, "sam", "skip_count_2")).toBeUndefined();
  });

  test("save then load round-trips", () => {
    const s = initialSkillState("sam", "skip_count_2");
    saveSkillState(db, s);
    const loaded = loadSkillState(db, "sam", "skip_count_2");
    expect(loaded).toBeDefined();
    expect(loaded!.skillId).toBe("skip_count_2");
    expect(loaded!.profileId).toBe("sam");
    expect(loaded!.state).toBe("unstarted");
  });

  test("save is idempotent (UPSERT semantics)", () => {
    const s = initialSkillState("sam", "skip_count_2");
    saveSkillState(db, s);
    saveSkillState(db, { ...s, attempts: 5, correct: 4 });
    const loaded = loadSkillState(db, "sam", "skip_count_2")!;
    expect(loaded.attempts).toBe(5);
    expect(loaded.correct).toBe(4);
  });

  test("recentWindow round-trips through JSON column", () => {
    const s = initialSkillState("sam", "skip_count_2");
    s.recentWindow = [
      { skillId: "skip_count_2", correct: true, hinted: false, scaffolded: false, difficulty: 0.4, occurredAt: new Date("2026-04-26T12:00:00Z") },
    ];
    saveSkillState(db, s);
    const loaded = loadSkillState(db, "sam", "skip_count_2")!;
    expect(loaded.recentWindow).toHaveLength(1);
    expect(loaded.recentWindow[0]!.correct).toBe(true);
    expect(loaded.recentWindow[0]!.occurredAt).toBeInstanceOf(Date);
    expect(loaded.recentWindow[0]!.occurredAt.toISOString()).toBe("2026-04-26T12:00:00.000Z");
  });

  test("nextReviewAt round-trips (Date or null)", () => {
    const s = initialSkillState("sam", "skip_count_2");
    s.nextReviewAt = new Date("2026-04-27T00:00:00Z");
    saveSkillState(db, s);
    expect(loadSkillState(db, "sam", "skip_count_2")!.nextReviewAt!.toISOString()).toBe("2026-04-27T00:00:00.000Z");

    saveSkillState(db, { ...s, nextReviewAt: null });
    expect(loadSkillState(db, "sam", "skip_count_2")!.nextReviewAt).toBeNull();
  });

  test("loadAllSkillStates returns rows for one profile only", () => {
    saveSkillState(db, initialSkillState("sam", "skip_count_2"));
    saveSkillState(db, initialSkillState("sam", "add_within_5"));
    saveSkillState(db, initialSkillState("alex", "skip_count_2"));
    expect(loadAllSkillStates(db, "sam")).toHaveLength(2);
    expect(loadAllSkillStates(db, "alex")).toHaveLength(1);
  });
});
```

- [ ] **Step 7.3: Run — confirm failure**

```bash
cd /home/hfsearcy/git/institute && pnpm --filter @institute/kid-app test test/persistence/skillStateRepo.test.ts 2>&1 | tail -10
```

Expect: module not found.

- [ ] **Step 7.4: Implement the repo**

Create `apps/kid-app/src/persistence/skillStateRepo.ts`:

```ts
import type { Db } from "./db";
import type { AttemptOutcome, MasteryState, SkillId, SkillState } from "@institute/skill-engine";

type Row = {
  profile_id: string;
  skill_id: string;
  state: string;
  attempts: number;
  correct: number;
  recent_window_json: string;
  current_difficulty: number;
  srs_interval_days: number;
  srs_ease: number;
  next_review_at: string | null;
  updated_at: string;
};

function rowToState(row: Row): SkillState {
  const window: AttemptOutcome[] = JSON.parse(row.recent_window_json).map((o: Omit<AttemptOutcome, "occurredAt"> & { occurredAt: string }) => ({
    ...o,
    occurredAt: new Date(o.occurredAt),
  }));
  return {
    profileId: row.profile_id,
    skillId: row.skill_id,
    state: row.state as MasteryState,
    attempts: row.attempts,
    correct: row.correct,
    recentWindow: window,
    currentDifficulty: row.current_difficulty,
    srsInterval: row.srs_interval_days,
    srsEase: row.srs_ease,
    nextReviewAt: row.next_review_at ? new Date(row.next_review_at) : null,
    updatedAt: new Date(row.updated_at),
  };
}

export function loadSkillState(db: Db, profileId: string, skillId: SkillId): SkillState | undefined {
  const row = db.get<Row>(
    `SELECT * FROM skill_state WHERE profile_id = ? AND skill_id = ?`,
    [profileId, skillId],
  );
  return row ? rowToState(row) : undefined;
}

export function loadAllSkillStates(db: Db, profileId: string): SkillState[] {
  return db
    .all<Row>(`SELECT * FROM skill_state WHERE profile_id = ?`, [profileId])
    .map(rowToState);
}

export function saveSkillState(db: Db, s: SkillState): void {
  db.run(
    `INSERT INTO skill_state (
       profile_id, skill_id, state, attempts, correct, recent_window_json,
       current_difficulty, srs_interval_days, srs_ease, next_review_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(profile_id, skill_id) DO UPDATE SET
       state = excluded.state,
       attempts = excluded.attempts,
       correct = excluded.correct,
       recent_window_json = excluded.recent_window_json,
       current_difficulty = excluded.current_difficulty,
       srs_interval_days = excluded.srs_interval_days,
       srs_ease = excluded.srs_ease,
       next_review_at = excluded.next_review_at,
       updated_at = excluded.updated_at`,
    [
      s.profileId,
      s.skillId,
      s.state,
      s.attempts,
      s.correct,
      JSON.stringify(
        s.recentWindow.map((o) => ({ ...o, occurredAt: o.occurredAt.toISOString() })),
      ),
      s.currentDifficulty,
      s.srsInterval,
      s.srsEase,
      s.nextReviewAt?.toISOString() ?? null,
      s.updatedAt.toISOString(),
    ],
  );
}
```

- [ ] **Step 7.5: Run tests — should pass**

```bash
cd /home/hfsearcy/git/institute && pnpm --filter @institute/kid-app test test/persistence/skillStateRepo.test.ts 2>&1 | tail -10
```

Expect: 6 pass.

- [ ] **Step 7.6: Commit**

```bash
cd /home/hfsearcy/git/institute && \
  git add apps/kid-app/src/persistence/skillStateRepo.ts apps/kid-app/test/persistence && \
  git commit -m "feat(kid-app): skillStateRepo (UPSERT, JSON columns for recentWindow)"
```

---

## Task 8 — `attemptRepo` (TDD)

**Files:**
- Create: `apps/kid-app/src/persistence/attemptRepo.ts`
- Create: `apps/kid-app/test/persistence/attemptRepo.test.ts`

- [ ] **Step 8.1: Failing tests**

Create `apps/kid-app/test/persistence/attemptRepo.test.ts`:

```ts
import { describe, test, expect, beforeEach } from "vitest";
import { migrate, type Db } from "../../src/persistence/db";
import { inMemoryDb } from "./inMemoryDb";
import { appendAttempt, loadRecentAttempts } from "../../src/persistence/attemptRepo";
import type { AttemptOutcome } from "@institute/skill-engine";

let db: Db;
beforeEach(() => {
  db = inMemoryDb();
  migrate(db);
});

const sample = (overrides: Partial<AttemptOutcome> = {}): AttemptOutcome => ({
  skillId: "skip_count_2",
  correct: true,
  hinted: false,
  scaffolded: false,
  difficulty: 0.4,
  occurredAt: new Date("2026-04-26T12:00:00Z"),
  ...overrides,
});

describe("attemptRepo", () => {
  test("loadRecentAttempts returns [] when empty", () => {
    expect(loadRecentAttempts(db, "sam", 10)).toEqual([]);
  });

  test("append + load round-trip", () => {
    appendAttempt(db, "sam", sample());
    const rows = loadRecentAttempts(db, "sam", 10);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.correct).toBe(true);
    expect(rows[0]!.occurredAt).toBeInstanceOf(Date);
  });

  test("loadRecentAttempts is most-recent first and respects limit", () => {
    appendAttempt(db, "sam", sample({ occurredAt: new Date("2026-04-26T12:00:00Z"), correct: true }));
    appendAttempt(db, "sam", sample({ occurredAt: new Date("2026-04-26T12:01:00Z"), correct: false }));
    appendAttempt(db, "sam", sample({ occurredAt: new Date("2026-04-26T12:02:00Z"), correct: true }));
    const rows = loadRecentAttempts(db, "sam", 2);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.occurredAt.toISOString()).toBe("2026-04-26T12:02:00.000Z");
    expect(rows[1]!.occurredAt.toISOString()).toBe("2026-04-26T12:01:00.000Z");
  });

  test("scopes to profile", () => {
    appendAttempt(db, "sam",  sample());
    appendAttempt(db, "alex", sample());
    expect(loadRecentAttempts(db, "sam",  10)).toHaveLength(1);
    expect(loadRecentAttempts(db, "alex", 10)).toHaveLength(1);
  });
});
```

- [ ] **Step 8.2: Implement**

Create `apps/kid-app/src/persistence/attemptRepo.ts`:

```ts
import type { Db } from "./db";
import type { AttemptOutcome } from "@institute/skill-engine";

type Row = {
  skill_id: string;
  correct: number;
  hinted: number;
  scaffolded: number;
  difficulty: number;
  occurred_at: string;
};

export function appendAttempt(db: Db, profileId: string, o: AttemptOutcome): void {
  db.run(
    `INSERT INTO attempt (profile_id, skill_id, correct, hinted, scaffolded, difficulty, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      profileId,
      o.skillId,
      o.correct ? 1 : 0,
      o.hinted ? 1 : 0,
      o.scaffolded ? 1 : 0,
      o.difficulty,
      o.occurredAt.toISOString(),
    ],
  );
}

export function loadRecentAttempts(db: Db, profileId: string, limit: number): AttemptOutcome[] {
  return db
    .all<Row>(
      `SELECT skill_id, correct, hinted, scaffolded, difficulty, occurred_at
       FROM attempt WHERE profile_id = ?
       ORDER BY occurred_at DESC LIMIT ?`,
      [profileId, limit],
    )
    .map((r) => ({
      skillId: r.skill_id,
      correct: !!r.correct,
      hinted: !!r.hinted,
      scaffolded: !!r.scaffolded,
      difficulty: r.difficulty,
      occurredAt: new Date(r.occurred_at),
    }));
}
```

- [ ] **Step 8.3: Run tests + commit**

```bash
cd /home/hfsearcy/git/institute && pnpm --filter @institute/kid-app test test/persistence/attemptRepo.test.ts 2>&1 | tail -5
```

Expect: 4 pass.

```bash
cd /home/hfsearcy/git/institute && \
  git add apps/kid-app/src/persistence/attemptRepo.ts apps/kid-app/test/persistence/attemptRepo.test.ts && \
  git commit -m "feat(kid-app): attemptRepo (append-only, recent-first reads)"
```

---

## Task 9 — `pluginSchemas.ts` (TDD)

Convert each registered plugin's Zod paramSchema to JSON Schema for the API payload.

**Files:**
- Modify: `apps/kid-app/package.json` (add `zod-to-json-schema`)
- Create: `apps/kid-app/src/tutor/pluginSchemas.ts`
- Create: `apps/kid-app/test/tutor/pluginSchemas.test.ts`

- [ ] **Step 9.1: Add dep**

```bash
cd /home/hfsearcy/git/institute && \
  pnpm --filter @institute/kid-app add zod-to-json-schema
```

- [ ] **Step 9.2: Failing tests**

Create `apps/kid-app/test/tutor/pluginSchemas.test.ts`:

```ts
import { describe, test, expect } from "vitest";
import { register, clearRegistry } from "@institute/plugin-engine";
import { plugin as spellCastPlugin } from "@institute/minigame-spell-cast";
import { getAvailablePlugins } from "../../src/tutor/pluginSchemas";

describe("getAvailablePlugins", () => {
  test("returns id, title, supportedSkills, paramSchema (as JSON Schema) for one plugin", () => {
    clearRegistry();
    register(spellCastPlugin);

    const list = getAvailablePlugins();
    expect(list).toHaveLength(1);
    const p = list[0]!;
    expect(p.id).toBe("spell-cast");
    expect(p.title).toBe("Spell Cast");
    expect(p.supportedSkills).toEqual(expect.arrayContaining(["skip_count_2"]));

    const schema = p.paramSchema as { type: string; properties: Record<string, unknown>; required: string[] };
    expect(schema.type).toBe("object");
    expect(Object.keys(schema.properties)).toEqual(expect.arrayContaining(["enemyType", "sequence", "intro"]));
    expect(schema.required).toEqual(expect.arrayContaining(["enemyType", "sequence", "intro"]));
  });

  test("returns [] when no plugins registered", () => {
    clearRegistry();
    expect(getAvailablePlugins()).toEqual([]);
  });
});
```

- [ ] **Step 9.3: Implement**

Create `apps/kid-app/src/tutor/pluginSchemas.ts`:

```ts
import { listPluginIds, getPlugin } from "@institute/plugin-engine";
import { zodToJsonSchema } from "zod-to-json-schema";

export type AvailablePlugin = {
  id: string;
  title: string;
  supportedSkills: string[];
  paramSchema: unknown;
};

/**
 * Snapshot the registered plugins as JSON-Schema-shaped data the backend can
 * forward to the LLM as a structured-output constraint. Pure read of the
 * registry — call after plugins are registered (i.e. after MiniGameMount's
 * ensureRegistered() runs at least once, OR call register(...) up-front).
 */
export function getAvailablePlugins(): AvailablePlugin[] {
  return listPluginIds().map((id) => {
    const p = getPlugin(id)!;
    return {
      id: p.manifest.id,
      title: p.manifest.title,
      supportedSkills: [...p.manifest.supportedSkills],
      paramSchema: zodToJsonSchema(p.manifest.paramSchema, { target: "jsonSchema7" }),
    };
  });
}
```

- [ ] **Step 9.4: Run tests + commit**

```bash
cd /home/hfsearcy/git/institute && pnpm --filter @institute/kid-app test test/tutor/pluginSchemas.test.ts 2>&1 | tail -5
```

Expect: 2 pass.

```bash
cd /home/hfsearcy/git/institute && \
  git add apps/kid-app/package.json apps/kid-app/src/tutor/pluginSchemas.ts apps/kid-app/test/tutor/pluginSchemas.test.ts pnpm-lock.yaml && \
  git commit -m "feat(kid-app): pluginSchemas — Zod→JSON Schema snapshot for tutor API"
```

---

## Task 10 — `eligiblePool` wrapper (TDD)

**Files:**
- Create: `apps/kid-app/src/tutor/eligiblePool.ts`
- Create: `apps/kid-app/test/tutor/eligiblePool.test.ts`

- [ ] **Step 10.1: Failing tests**

Create `apps/kid-app/test/tutor/eligiblePool.test.ts`:

```ts
import { describe, test, expect, beforeEach } from "vitest";
import { migrate, type Db } from "../../src/persistence/db";
import { inMemoryDb } from "../persistence/inMemoryDb";
import { saveSkillState } from "../../src/persistence/skillStateRepo";
import { initialSkillState } from "@institute/skill-engine";
import { computeEligiblePool } from "../../src/tutor/eligiblePool";

let db: Db;
beforeEach(() => {
  db = inMemoryDb();
  migrate(db);
});

describe("computeEligiblePool", () => {
  test("seeds a stretch skill when profile has zero rows", () => {
    const pool = computeEligiblePool(db, "sam", new Date("2026-04-26T12:00:00Z"));
    expect(pool.length).toBeGreaterThan(0);
    // every entry should have description from taxonomy
    expect(pool[0]!.description).toBeTruthy();
    expect(pool[0]!.skillId).toBeTruthy();
  });

  test("includes practicing skills", () => {
    const s = initialSkillState("sam", "skip_count_2");
    s.state = "practicing";
    s.attempts = 5;
    s.correct = 4;
    saveSkillState(db, s);

    const pool = computeEligiblePool(db, "sam", new Date());
    const ids = pool.map((p) => p.skillId);
    expect(ids).toContain("skip_count_2");
  });

  test("each entry includes mastery context fields", () => {
    const s = initialSkillState("sam", "skip_count_2");
    s.state = "practicing";
    s.attempts = 12;
    s.correct = 9;
    s.currentDifficulty = 0.4;
    saveSkillState(db, s);

    const pool = computeEligiblePool(db, "sam", new Date());
    const entry = pool.find((p) => p.skillId === "skip_count_2")!;
    expect(entry.masteryState).toBe("practicing");
    expect(entry.attempts).toBe(12);
    expect(entry.correct).toBe(9);
    expect(entry.currentDifficulty).toBeCloseTo(0.4);
  });

  test("caps pool size to 6", () => {
    // Save 10 practicing skills
    const ids = ["counting_1_5", "counting_1_10", "counting_1_20", "skip_count_2", "skip_count_5", "skip_count_10", "add_within_5", "sub_within_5", "add_within_10", "sub_within_10"];
    for (const id of ids) {
      const s = initialSkillState("sam", id);
      s.state = "practicing";
      saveSkillState(db, s);
    }
    const pool = computeEligiblePool(db, "sam", new Date());
    expect(pool.length).toBeLessThanOrEqual(6);
  });
});
```

- [ ] **Step 10.2: Implement**

Create `apps/kid-app/src/tutor/eligiblePool.ts`:

```ts
import type { Db } from "../persistence/db";
import { loadAllSkillStates, saveSkillState } from "../persistence/skillStateRepo";
import {
  TAXONOMY,
  eligiblePool,
  initialSkillState,
  getSkill,
  type SkillId,
  type MasteryState,
} from "@institute/skill-engine";

export type EligiblePoolEntry = {
  skillId: SkillId;
  description: string;
  masteryState: MasteryState;
  currentDifficulty: number;
  attempts: number;
  correct: number;
};

/**
 * Compute the eligible pool for the profile, reading skill_state from `db`.
 *
 * On a fresh profile (no rows yet), seed `unstarted` rows for every skill
 * with no prereqs and persist them, so the stretch logic always has at
 * least one candidate. (Without this, `eligiblePool([], ...)` returns []
 * because the stretch picker requires prereq states to exist.)
 */
export function computeEligiblePool(db: Db, profileId: string, now: Date): EligiblePoolEntry[] {
  let states = loadAllSkillStates(db, profileId);

  if (states.length === 0) {
    for (const skill of TAXONOMY) {
      if (skill.prereqs.length === 0) {
        const seed = initialSkillState(profileId, skill.id);
        seed.updatedAt = now;
        saveSkillState(db, seed);
      }
    }
    states = loadAllSkillStates(db, profileId);
  }

  const ids = eligiblePool(states, TAXONOMY, now);
  const byId = new Map(states.map((s) => [s.skillId, s] as const));

  return ids.map((id) => {
    const s = byId.get(id);
    const skill = getSkill(TAXONOMY, id);
    return {
      skillId: id,
      description: skill?.description ?? id,
      masteryState: s?.state ?? "unstarted",
      currentDifficulty: s?.currentDifficulty ?? skill?.difficultyBand[0] ?? 0,
      attempts: s?.attempts ?? 0,
      correct: s?.correct ?? 0,
    };
  });
}
```

- [ ] **Step 10.3: Run tests + commit**

```bash
cd /home/hfsearcy/git/institute && pnpm --filter @institute/kid-app test test/tutor/eligiblePool.test.ts 2>&1 | tail -5
```

Expect: 4 pass.

```bash
cd /home/hfsearcy/git/institute && \
  git add apps/kid-app/src/tutor/eligiblePool.ts apps/kid-app/test/tutor/eligiblePool.test.ts && \
  git commit -m "feat(kid-app): computeEligiblePool — reads skill_state, seeds prereq-free skills"
```

---

## Task 11 — `tutor/client.ts` (TDD)

**Files:**
- Create: `apps/kid-app/src/tutor/client.ts`
- Create: `apps/kid-app/test/tutor/client.test.ts`

- [ ] **Step 11.1: Failing tests**

Create `apps/kid-app/test/tutor/client.test.ts`:

```ts
import { describe, test, expect, beforeEach, vi } from "vitest";
import { requestNextRound } from "../../src/tutor/client";

const VALID_RESPONSE = {
  skillId: "skip_count_2",
  pluginId: "spell-cast",
  params: { enemyType: "goblin", sequence: [2, 4, 6, 8, 10], intro: "ready?" },
};

const baseRequest = {
  baseUrl: "http://localhost:3000",
  bearerToken: undefined as string | undefined,
  payload: {
    profile: { id: "sam", name: "Sam", age: 6 },
    currentZone: "hub",
    eligiblePool: [{ skillId: "skip_count_2", description: "x", masteryState: "practicing" as const, currentDifficulty: 0.4, attempts: 1, correct: 1 }],
    recentHistory: [],
    availablePlugins: [{ id: "spell-cast", title: "Spell Cast", supportedSkills: ["skip_count_2"], paramSchema: {} }],
  },
};

describe("requestNextRound", () => {
  beforeEach(() => { (globalThis as { fetch?: unknown }).fetch = undefined; });

  test("returns parsed response on 200", async () => {
    (globalThis as { fetch: unknown }).fetch = vi.fn(async () => new Response(JSON.stringify(VALID_RESPONSE), { status: 200, headers: { "content-type": "application/json" } }));
    const r = await requestNextRound({ ...baseRequest, fallback: () => { throw new Error("should not fall back"); } });
    expect(r).toEqual(VALID_RESPONSE);
  });

  test("includes Authorization header when bearerToken is set", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(VALID_RESPONSE), { status: 200 }));
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    await requestNextRound({ ...baseRequest, bearerToken: "supersecret", fallback: () => ({ pluginId: "spell-cast", skillId: "x", params: {} }) });
    const init = (fetchMock.mock.calls[0]![1] ?? {}) as { headers?: Record<string, string> };
    expect(init.headers!["Authorization"]).toBe("Bearer supersecret");
  });

  test("falls back on non-2xx", async () => {
    (globalThis as { fetch: unknown }).fetch = vi.fn(async () => new Response("oops", { status: 502 }));
    const r = await requestNextRound({ ...baseRequest, fallback: () => ({ skillId: "fb", pluginId: "spell-cast", params: { fallback: true } as never }) });
    expect((r.params as { fallback: boolean }).fallback).toBe(true);
  });

  test("falls back on network error", async () => {
    (globalThis as { fetch: unknown }).fetch = vi.fn(async () => { throw new Error("offline"); });
    const r = await requestNextRound({ ...baseRequest, fallback: () => ({ skillId: "fb", pluginId: "spell-cast", params: { fallback: true } as never }) });
    expect((r.params as { fallback: boolean }).fallback).toBe(true);
  });

  test("falls back when baseUrl is empty (offline / dev no-backend)", async () => {
    const fetchMock = vi.fn();
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    const r = await requestNextRound({ ...baseRequest, baseUrl: "", fallback: () => ({ skillId: "fb", pluginId: "spell-cast", params: { fallback: true } as never }) });
    expect(fetchMock).not.toHaveBeenCalled();
    expect((r.params as { fallback: boolean }).fallback).toBe(true);
  });

  test("falls back on malformed (non-JSON) response", async () => {
    (globalThis as { fetch: unknown }).fetch = vi.fn(async () => new Response("not json", { status: 200, headers: { "content-type": "text/plain" } }));
    const r = await requestNextRound({ ...baseRequest, fallback: () => ({ skillId: "fb", pluginId: "spell-cast", params: { fallback: true } as never }) });
    expect((r.params as { fallback: boolean }).fallback).toBe(true);
  });
});
```

- [ ] **Step 11.2: Implement**

Create `apps/kid-app/src/tutor/client.ts`:

```ts
import type { EligiblePoolEntry } from "./eligiblePool";
import type { AvailablePlugin } from "./pluginSchemas";
import type { AttemptOutcome } from "@institute/skill-engine";

export type TutorRequestPayload = {
  profile: { id: string; name: string; age: number };
  currentZone: string;
  eligiblePool: EligiblePoolEntry[];
  recentHistory: Array<Pick<AttemptOutcome, "skillId" | "correct"> & { occurredAt: string }>;
  availablePlugins: AvailablePlugin[];
};

export type TutorResponse = {
  skillId: string;
  pluginId: string;
  params: unknown;
};

export type RequestNextRoundOpts = {
  baseUrl: string;
  bearerToken?: string;
  payload: TutorRequestPayload;
  fallback: () => TutorResponse;
  /** Default 10s. */
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT = 10_000;

export async function requestNextRound(opts: RequestNextRoundOpts): Promise<TutorResponse> {
  if (!opts.baseUrl) return opts.fallback();

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.bearerToken) headers["Authorization"] = `Bearer ${opts.bearerToken}`;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT);
    const res = await fetch(`${opts.baseUrl}/tutor/next_round`, {
      method: "POST",
      headers,
      body: JSON.stringify(opts.payload),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return opts.fallback();
    const json = (await res.json()) as TutorResponse;
    if (!json || typeof json !== "object" || !json.pluginId || !json.skillId || json.params === undefined) {
      return opts.fallback();
    }
    return json;
  } catch {
    return opts.fallback();
  }
}
```

- [ ] **Step 11.3: Run tests + commit**

```bash
cd /home/hfsearcy/git/institute && pnpm --filter @institute/kid-app test test/tutor/client.test.ts 2>&1 | tail -5
```

Expect: 6 pass.

```bash
cd /home/hfsearcy/git/institute && \
  git add apps/kid-app/src/tutor/client.ts apps/kid-app/test/tutor/client.test.ts && \
  git commit -m "feat(kid-app): tutor client with bearer auth + fallback"
```

---

## Task 12 — Wire `MiniGameMount` to call the tutor client

**Files:**
- Modify: `apps/kid-app/src/minigame/MiniGameMount.tsx`
- Modify: `apps/kid-app/src/config.ts`

This task changes the mini-game mount from synchronous (uses FIXTURES directly) to async (awaits the tutor response, falls back to FIXTURES on any failure).

- [ ] **Step 12.1: Add tutor env config**

Modify `apps/kid-app/src/config.ts` — append at the bottom:

```ts
/** Tutor backend base URL. Empty means "always use fixtures." */
export const TUTOR_BASE_URL: string =
  (process.env.EXPO_PUBLIC_TUTOR_BASE_URL ?? "").trim();

/** Bearer token sent to tutor backend. Empty disables the header. */
export const TUTOR_SECRET: string =
  (process.env.EXPO_PUBLIC_TUTOR_SECRET ?? "").trim();

/** Hardcoded for M5 — multi-profile picker is later. */
export const PROFILE = { id: PROFILE_ID, name: "Sam", age: 6 } as const;
```

- [ ] **Step 12.2: Refactor `MiniGameMount` to async fetch + state**

Replace `apps/kid-app/src/minigame/MiniGameMount.tsx` with:

```tsx
import { useEffect, useState } from "react";
import { plugin as spellCastPlugin } from "@institute/minigame-spell-cast";
import { register, getPlugin, validateParams, type RoundResult } from "@institute/plugin-engine";
import { Scene as SpellCastScene, type SpellCastSceneHandle } from "@institute/minigame-spell-cast";
import { FIXTURES } from "./fixtures";
import { PROFILE, TUTOR_BASE_URL, TUTOR_SECRET } from "../config";
import type { PortalId } from "../config";
import { openExpoDb, migrate, type Db } from "../persistence/db";
import { computeEligiblePool } from "../tutor/eligiblePool";
import { loadRecentAttempts } from "../persistence/attemptRepo";
import { getAvailablePlugins } from "../tutor/pluginSchemas";
import { requestNextRound, type TutorResponse } from "../tutor/client";

let registered = false;
function ensureRegistered() {
  if (registered) return;
  try { register(spellCastPlugin); }
  catch (e) { if (!(e instanceof Error) || !/already registered/i.test(e.message)) throw e; }
  registered = true;
}

let dbPromise: Promise<Db> | null = null;
function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = (async () => { const db = await openExpoDb(); migrate(db); return db; })();
  }
  return dbPromise;
}

type Props = {
  portalId: PortalId;
  onComplete: (r: RoundResult) => void;
  handleRef: React.MutableRefObject<SpellCastSceneHandle | null>;
};

export function MiniGameMount({ portalId, onComplete, handleRef }: Props) {
  ensureRegistered();
  const plugin = getPlugin(portalId);
  const [round, setRound] = useState<TutorResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!plugin) {
        onComplete({ status: "aborted", outcomes: [], durationMs: 0 });
        return;
      }
      const fallback = (): TutorResponse =>
        portalId === "spell-cast"
          ? { skillId: "skip_count_2", pluginId: "spell-cast", params: FIXTURES["spell-cast"] }
          : { skillId: "skip_count_2", pluginId: portalId, params: {} };

      let payload;
      try {
        const db = await getDb();
        const eligible = computeEligiblePool(db, PROFILE.id, new Date());
        const recent = loadRecentAttempts(db, PROFILE.id, 10).map((a) => ({
          skillId: a.skillId,
          correct: a.correct,
          occurredAt: a.occurredAt.toISOString(),
        }));
        payload = {
          profile: { id: PROFILE.id, name: PROFILE.name, age: PROFILE.age },
          currentZone: "hub",
          eligiblePool: eligible,
          recentHistory: recent,
          availablePlugins: getAvailablePlugins(),
        };
      } catch (e) {
        console.warn("MiniGameMount payload build failed; falling back", e);
        if (!cancelled) setRound(fallback());
        return;
      }

      const response = await requestNextRound({
        baseUrl: TUTOR_BASE_URL,
        bearerToken: TUTOR_SECRET || undefined,
        payload,
        fallback,
      });
      if (cancelled) return;

      const validated = validateParams(plugin, response.params);
      if (!validated.ok) {
        console.error("MiniGameMount: response.params failed schema validation; using fallback", validated.error);
        setRound(fallback());
        return;
      }
      setRound({ ...response, params: validated.value });
    })();
    return () => { cancelled = true; };
  }, [portalId, plugin, onComplete]);

  if (!plugin || !round) return null;

  // M2 expedient cast — Scene is generic per plugin. Refactor in M6.
  const Scene = plugin.Scene as unknown as typeof SpellCastScene;
  return (
    <Scene
      params={round.params as never}
      skillId={round.skillId}
      onComplete={onComplete}
      onHandleReady={(h) => { handleRef.current = h; }}
    />
  );
}
```

- [ ] **Step 12.3: Verify typecheck**

```bash
cd /home/hfsearcy/git/institute && pnpm --filter @institute/kid-app typecheck 2>&1 | tail -5
```

Expect: exit 0.

- [ ] **Step 12.4: Commit**

```bash
cd /home/hfsearcy/git/institute && \
  git add apps/kid-app/src/minigame/MiniGameMount.tsx apps/kid-app/src/config.ts && \
  git commit -m "feat(kid-app): MiniGameMount — fetch round via tutor client, fall back to fixtures"
```

---

## Task 13 — Wire `App.tsx#onRoundComplete` to persist outcomes

**Files:**
- Modify: `apps/kid-app/App.tsx`

The kid-app currently only `console.log`'s outcomes. Now: persist them through `skill-engine.applyOutcome` + `scheduleNextReview`, then write to SQLite.

- [ ] **Step 13.1: Add the persistence call**

In `apps/kid-app/App.tsx`, replace the `onRoundComplete` callback body. Imports to add at the top:

```tsx
import { applyOutcome, scheduleNextReview, getSkill, TAXONOMY, initialSkillState, type AttemptOutcome } from "@institute/skill-engine";
import { openExpoDb, migrate } from "./src/persistence/db";
import { loadSkillState, saveSkillState } from "./src/persistence/skillStateRepo";
import { appendAttempt } from "./src/persistence/attemptRepo";
import { PROFILE } from "./src/config";
```

Replace the existing `onRoundComplete` with:

```tsx
const onRoundComplete = async (result: { status: "completed" | "aborted"; outcomes: AttemptOutcome[]; durationMs: number }) => {
  console.log("[round complete]", result);
  sceneHandleRef.current = null;
  setMode({ kind: "hub" });
  try {
    const db = await openExpoDb();
    migrate(db);
    for (const outcome of result.outcomes) {
      const skill = getSkill(TAXONOMY, outcome.skillId);
      if (!skill) { console.warn("unknown skill in outcome:", outcome.skillId); continue; }
      const prev = loadSkillState(db, PROFILE.id, outcome.skillId) ?? initialSkillState(PROFILE.id, outcome.skillId);
      const next = applyOutcome(prev, outcome, skill.difficultyBand);
      const scheduled = scheduleNextReview(next, outcome);
      saveSkillState(db, scheduled);
      appendAttempt(db, PROFILE.id, outcome);
    }
  } catch (e) {
    console.error("failed to persist outcomes", e);
  }
};
```

(The `result` parameter type narrows from `unknown[]` to `AttemptOutcome[]` — matches what RoundResult actually is.)

- [ ] **Step 13.2: Verify typecheck + tests**

```bash
cd /home/hfsearcy/git/institute && pnpm -r typecheck 2>&1 | tail -5
```

Expect: exit 0.

```bash
cd /home/hfsearcy/git/institute && pnpm -r test 2>&1 | tail -10
```

Expect: all green.

- [ ] **Step 13.3: Commit**

```bash
cd /home/hfsearcy/git/institute && \
  git add apps/kid-app/App.tsx && \
  git commit -m "feat(kid-app): persist round outcomes via skill-engine + repos"
```

---

## Task 14 — Manual checklist + tag

**Files:**
- Modify: `apps/kid-app/test/manual-checklist.md`

- [ ] **Step 14.1: Append M5 section**

Append to `apps/kid-app/test/manual-checklist.md`:

```markdown
---

## M5 manual on-device checks

After M5 ships, with the backend running locally (see below):

### Setup
1. From repo root: `( cd apps/backend && RBENV_VERSION=3.4.7 ANTHROPIC_API_KEY=... bin/rails server -b 0.0.0.0 -p 3000 )`
2. In another terminal: `EXPO_PUBLIC_TUTOR_BASE_URL=http://<dev-machine-lan-ip>:3000 pnpm --filter @institute/kid-app start --tunnel`
3. (Optional) Set `EXPO_PUBLIC_TUTOR_SECRET=...` and same `TUTOR_SHARED_SECRET=...` on the backend env to test auth.

### Checks
- [ ] **First-ever Spell Cast tap:** loading delay ~2-4s (LLM call), then a goblin appears with a sequence Claude picked. The intro line should be playful and short.
- [ ] **Different sequence per round:** play 3 rounds back-to-back. The goblin's sequence varies (skip_count_2 vs skip_count_5 vs sequence_next, etc.).
- [ ] **Mastery influence:** finish 3 quick perfect rounds on the same skill. The next round should bias toward a stretch skill or a harder difficulty.
- [ ] **Backend offline (kill the rails server):** tap the portal — should fall back to FIXTURES (`[2,4,6,8,10]`) within ~1s, no crash.
- [ ] **Bad bearer token (when secret set):** spoof the wrong secret — kid-app should fall back to FIXTURES. Backend log shows 401.
- [ ] **Persistence:** complete a round; quit Expo Go; relaunch; play again. The recentHistory POST'd to the backend should include the prior round's outcomes.
- [ ] **Backend logs show `Tutor::Picker invalid response`** never (or rarely) — that's the LLM violating the schema and indicates a prompt fix is needed.

If anything fails:
- Check `apps/backend/log/development.log` for the LLM raw response.
- Confirm `EXPO_PUBLIC_TUTOR_BASE_URL` is reachable from the device (browser-test the URL on the tablet first).
- Confirm the on-device SQLite has rows: `sqlite3 ~/.expo/devices/<id>/institute.db "SELECT * FROM skill_state"` (or equivalent inspection).
```

- [ ] **Step 14.2: Commit**

```bash
cd /home/hfsearcy/git/institute && \
  git add apps/kid-app/test/manual-checklist.md && \
  git commit -m "docs(kid-app): M5 on-device verification checks"
```

- [ ] **Step 14.3: Tag**

```bash
cd /home/hfsearcy/git/institute && git tag m5-tutor-service
```

---

## What this milestone proves

After M5:

1. The kid-app persists mastery state to local SQLite per profile.
2. The Rails Tutor Service is the chokepoint for LLM calls; provider/model is one env var to swap.
3. New plugins added to the kid-app become available to the LLM with no backend changes (their JSON Schema is sent per request).
4. The kid-app degrades gracefully — if the backend is unreachable, kid plays a hand-coded round; no crash, no stuck state.
5. The skeleton is in place for M6 (more mini-games + Forest zone), M7 (parent dashboard against the same backend), and post-V1 self-hosted LLM (just swap the model id and provider config).

## Out of scope for this plan (handled in later milestones)

- Voice (mic, STT, kid-speech normalizer, TTS) — M4
- Event log sync from device → backend (analytics) — M6
- Pre-fetch of next round during current — M6
- Other 3 mini-games (Block Tower, Cookie Share, Door Code) + Forest zone — M6
- Parent dashboard UI + parent auth — M7
- Self-hosted LLM (vLLM, Ollama) — post-V1
- LLM response caching — revisit if cost/latency is a real problem
