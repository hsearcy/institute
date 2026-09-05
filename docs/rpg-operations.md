# The Sunken Vault operations

The RPG uses the existing tutor API, curated learning graph, mastery, spaced review, demonstrations, hints, retries, and skip plumbing. Game progress lives in four new SQLite tables, `rpg_profiles`, `rpg_claims`, `rpg_misses`, and `rpg_upgrades`, beside the existing tables. Starting the new game gives an existing learner a new level-one hero while retaining all of their learning and original gems/items. RPG levels never unlock math topics or change difficulty.

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

The exact Ares URL, service definition, working directory, and reverse-proxy configuration must be obtained from its current deployment. This checkout does not contain them. Tailnet SSH access was denied by Ares's policy during development, so an Ares upgrade has not been performed or verified.

1. Record the running tutor service's **working directory**, `DB_PATH`, environment file, and service user before changing the checkout. The existing server default is relative `data/institute.db`; changing the working directory changes which database it opens. Prefer retaining the existing launch command and working directory exactly. Keep the existing database file and profile ID `sam`.
2. Take a consistent SQLite backup using SQLite's online backup mechanism (for example, the SQLite CLI `.backup` command), or stop the tutor before copying its database. Keep the previous release available for rollback.
3. Check out the RPG branch in the existing deployment, run `bun install`, and rebuild the client with `bun run --cwd web build`. Preserve the existing deployment's `VITE_TUTOR_URL` if one is configured. Do not build production with local testing settings.
4. Retain all existing reverse-proxy API routes and add **`/rpg`** to the same tutor upstream used for `/tutor`, `/state`, and `/mastery`. The development Vite proxy already includes it. The Bun tutor serves APIs; keep using the existing static-file server for the built web client.
5. Restart the existing tutor/static services with their original environment. The RPG creates its four tables automatically. Existing learning tables and all old API endpoints remain in place.
6. Before submitting answers, compare `/mastery?profileId=sam` and `/state?profileId=sam` with the previous deployment. Check `/rpg/state?profileId=sam` responds, the normal web URL opens the RPG, and the hero resumes after refreshing. The original mining client remains available via `?mode=mine` for comparison.

RPG encounter writes are transactional and keyed by both problem ID and expedition encounter, so retrying a completed reward cannot grant it twice. The existing tutor attempt endpoint remains unchanged and is not idempotent; the new client can reconcile uncertain responses using the read-only `/rpg/attempt-status` endpoint. A rollback to the previous client/server can leave the unused RPG tables in place.

## Verification

```sh
bun test server/src/rpg.test.ts server/src/rpg.integration.test.ts
bun test server shared scripts web/unit-tests
```

RPG tests seed legacy data, verify additive initialization and unchanged mastery/review/gem/equipment/demo rows, reopen a saved database, exercise real tutor correct/retry/skip outcomes, and verify profile isolation, ownership checks, and idempotent encounter receipts.

The RPG preserves the legacy three-wrong-answer shield/streak outcome through `/rpg/miss`, which runs the same calculation with an atomic per-problem receipt. Voluntary help remains penalty-free. Skill upgrades also carry request IDs so a lost response cannot spend another skill point when retried.

An isolated browser recovery suite starts its own offline tutor on `8819`, Vite on `5209`, and a fresh temporary database:

```sh
bun --no-env-file --cwd web x playwright test --config playwright.recovery.config.ts
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an existing Chromium executable if using a locally installed browser instead of Playwright's bundled one. Set `RPG_TEST_GPU=1` on a Linux machine with working OpenGL to use hardware rendering in the isolated headless test browser; the default uses software rendering for CI portability. The suite deliberately drops committed HTTP responses and reloads the page to test pending answers, adaptive branches, elapsed thinking time, worked help, shields, skill points, and next-question failures.

The expanded spellbook suite uses a separate temporary archmage profile, tutor on `8829`, and Vite on `5219`. It learns every skill branch through the UI, casts all fifteen abilities through the real tutor and reward endpoints, checks equipment modifiers, and reloads saved spell selections during three expeditions:

```sh
bun --no-env-file --cwd web x playwright test --config playwright.spellbook.config.ts
```

See the [playtest record](rpg-playtest.md) for the completed checks and actual game screenshots.
