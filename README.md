# Institute

**The Sunken Vault** is a browser dungeon RPG powered by Institute's existing adaptive math tutor. Solve a problem to unleash a spell through a horde, collect rare equipment, gain experience, and grow three skill trees across three expeditions.

The world keeps moving while you think, but combat waits for your answer. Travel and targeting are automatic. Fire Nova, Frostfall, and Chain Lightning have distinct effects and upgrades; each six-encounter expedition ends with a guardian and loot.

The learning graph, mastery rules, spaced review, prerequisite rescue, demonstrations, spoken hints, and original reward system remain in place. Existing learners start a new RPG hero while keeping their learning progress and gem collection. The original mine and shops remain available at `?mode=mine`.

- `web/` — Bun + Vite + TypeScript + Three.js client
- `server/` — Bun + Hono + bun:sqlite tutor server (Anthropic LLM problem generation with deterministic fallback and answer verification)
- `shared/` — zod schema contract shared across the boundary
- `scripts/` — taxonomy import/curation tooling

```bash
bun install
bun run dev:server   # tutor server on :8787
bun run dev:web      # game on :5188, API proxy to :8787
bun test server shared scripts web/unit-tests
```

For a safe local preview with seeded existing learning progress, run `bun --no-env-file scripts/rpg-local-server.ts`, then in another terminal:

```sh
TUTOR_PROXY_TARGET=http://127.0.0.1:8799 VITE_PROFILE_ID=rpg-playtest bun --no-env-file run --cwd web dev
```

Open `http://127.0.0.1:5188`. This uses a disposable database in `/tmp`; it does not touch Ares or a real learner's records. Use `rpg-veteran` instead of `rpg-playtest` to inspect unlocked spells, equipment, and regions. See [operations and Ares upgrade instructions](docs/rpg-operations.md) before switching a live deployment.

## Playing

Type an answer and press Enter or **Unleash**. Use Q/W/E to select spells, K for skill trees, I for equipment, and Escape to pause. A number pad is available for touch devices. **Help me** offers a hint or the existing worked walkthrough. Pausing, closing the tab, and leaving at checkpoints preserve adventure progress.

## Verification and assets

```sh
bun run --cwd web build
bun run --cwd web verify:rpg
bun run --cwd web verify:recovery
python scripts/blender/validate_assets.py
```

Browser tests start an offline tutor with a fresh temporary SQLite database. Install Playwright Chromium first if needed (`cd web && bun x playwright install chromium`). Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use an existing Chromium executable. The game assets are bundled: [original Blender models](scripts/blender/README.md), [original sound design](scripts/audio/README.md), and locally hosted OFL fonts. Concept direction is in [the art notes](docs/concepts/math-dungeon-rpg/direction-v2.md).

## Configuration

| env var | default | what it does |
| --- | --- | --- |
| `PLAYER_TZ` | `America/New_York` | IANA zone for US Eastern Time (EST/EDT) that defines "today" for the daily correct-answer count and its record. Set it to where the child actually lives — an unknown zone falls back to US Eastern rather than to the machine clock. |

## Curriculum data

The skill graph is curated from the [Marble Skill Taxonomy](https://github.com/withmarbleapp/os-taxonomy)
(v1) · © Generative Spark, Inc. (Marble) · https://withmarble.com — database under
ODbL 1.0, Marble-authored content under CC BY-SA 4.0. See `data/taxonomy/NOTICE`.
