# The Sunken Vault operations

The RPG uses the existing tutor API, curated learning graph, mastery, spaced review, demonstrations, hints, retries, and skip plumbing. Game progress lives in five additive SQLite tables, `rpg_profiles`, `rpg_claims`, `rpg_cast_claims`, `rpg_misses`, and `rpg_upgrades`, beside the existing tables. Starting the new game gives an existing learner a new level-one hero while retaining all of their learning and original gems/items. RPG levels never unlock math topics or change difficulty.

## Isolated local playtest

From the repository root:

```sh
bun install
bun --no-env-file scripts/rpg-local-server.ts
```

In a second terminal:

```sh
TUTOR_PROXY_TARGET=http://127.0.0.1:8799 VITE_PROFILE_ID=rpg-playtest bun --no-env-file run --cwd web dev
```

Open `http://127.0.0.1:5188`. The server binds localhost and uses `/tmp/institute-rpg-playtest.db`; it explicitly overrides inherited tutor credentials with an offline local endpoint and disables ElevenLabs. Deterministic fallback problems and written demonstrations remain playable. `rpg-playtest` starts a new hero with existing mastered/practicing topics, overdue reviews, demonstrations, and legacy equipment. To inspect all fifteen spells and regions, restart Vite with `VITE_PROFILE_ID=rpg-archmage`. Newly seeded `rpg-veteran` profiles also have all spells and relics, with room to upgrade their skill trees. Seeding preserves existing fixture profiles; it never replaces their saved progress. Profile overrides apply only in development; production retains `sam`.

The fixture seeder is restart-safe and preserves subsequent play. `bun --no-env-file scripts/seed-rpg-demo.ts` creates the fixtures without listening on a port. Choose a fresh scratch database with `RPG_TEST_DB=/tmp/institute-rpg-another.db`; only paths inside the system temporary directory are accepted. `RPG_TEST_PORT` can change the local tutor port. No real profile database or Ares service is touched.

## Upgrade the existing Ares installation

The exact Ares URL, service definition, working directory, and reverse-proxy configuration must be obtained from its current deployment. This checkout does not contain them. The development scope uses local legacy-save verification; no live Ares upgrade or verification is included. The following checklist is available for the eventual deployment operator.

1. Record the running tutor service's **working directory**, `DB_PATH`, environment file, and service user before changing the checkout. The existing server default is relative `data/institute.db`; changing the working directory changes which database it opens. Prefer retaining the existing launch command and working directory exactly. Keep the existing database file and profile ID `sam`.
2. Take a consistent SQLite backup using SQLite's online backup mechanism (for example, the SQLite CLI `.backup` command), or stop the tutor before copying its database. Keep the previous release available for rollback.
3. Check out the RPG branch in the existing deployment, run `bun install`, and rebuild the client with `bun run --cwd web build`. Preserve the existing deployment's `VITE_TUTOR_URL` if one is configured. Do not build production with local testing settings.
4. Retain all existing reverse-proxy API routes and add **`/rpg`** to the same tutor upstream used for `/tutor`, `/state`, and `/mastery`. The development Vite proxy already includes it. The Bun tutor serves APIs; keep using the existing static-file server for the built web client.
5. Restart the existing tutor/static services with their original environment. The RPG creates its missing RPG tables automatically. Existing learning tables and all old API endpoints remain in place.
6. Before submitting answers, compare `/mastery?profileId=sam` and `/state?profileId=sam` with the previous deployment. Check `/rpg/state?profileId=sam` responds, the normal web URL opens the RPG, and the hero resumes after refreshing. The original mining client remains available via `?mode=mine` for comparison.

RPG cast writes are transactional and unique per learner/problem ID. Each receipt records its expedition and room, which must match on replay. Rooms now contain six to ten enemies with persistent health, so several completed problems can power casts in the same room. The new `rpg_cast_claims` table permits those casts; the older encounter-unique `rpg_claims` table remains untouched and is also checked before applying damage or granting rewards. Replaying either kind of receipt cannot grant it twice. Old active RPG saves receive a deterministic current-room health snapshot when read; their existing XP, skills, items, and learning progress remain unchanged. The existing tutor attempt endpoint remains unchanged and is not idempotent; the new client can reconcile uncertain responses using the read-only `/rpg/attempt-status` endpoint. A rollback to the pre-RPG client/server can leave the unused RPG tables in place.

## Verification

```sh
bun test server/src/rpg.test.ts server/src/rpg.integration.test.ts
bun test server shared scripts web/unit-tests
```

RPG tests seed legacy data, verify additive initialization and unchanged mastery/review/gem/equipment/demo rows, reopen a saved database, exercise real tutor correct/retry/skip outcomes, and verify profile isolation, ownership checks, idempotent old and new receipts, partial damage across repeated casts, and room loot only after the final enemy falls.

The RPG preserves the legacy three-wrong-answer shield/streak outcome through `/rpg/miss`, which runs the same calculation with an atomic per-problem receipt. Voluntary help remains penalty-free. Skill upgrades also carry request IDs so a lost response cannot spend another skill point when retried.

An isolated browser recovery suite starts its own offline tutor on `8819`, Vite on `5209`, and a fresh temporary database:

```sh
bun --no-env-file --cwd web x playwright test --config playwright.recovery.config.ts
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an existing Chromium executable if using a locally installed browser instead of Playwright's bundled one. Set `RPG_TEST_GPU=1` on a Linux machine with working OpenGL to use hardware rendering in the isolated headless test browser; the default uses software rendering for CI portability. The suite deliberately drops committed HTTP responses and reloads the page to test pending answers, adaptive branches, elapsed thinking time, worked help, shields, skill points, next-question failures, partial-room enemy HP, and partial-boss health-meter recovery. Duplicate replay checks compare HP, XP, inventory, mastery, and legacy rewards.

The expanded spellbook suite uses a separate temporary archmage profile, tutor on `8829`, and Vite on `5219`. It learns every skill branch through the UI, casts all fifteen abilities through the real tutor and reward endpoints, checks equipment modifiers, and reloads saved spell selections during three expeditions. Every room is cleared through as many real tutor casts as needed; an animation-frame audit includes both living and dying enemies in the ten-enemy limit:

```sh
bun --no-env-file --cwd web x playwright test --config playwright.spellbook.config.ts
```

See the [playtest record](rpg-playtest.md) for the completed checks and actual game screenshots.
