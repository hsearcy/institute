# Institute

A browser Three.js gem-mine math game with an adaptive LLM tutor, built for one 6-year-old.
Solving a math problem mines a gem; mastering topics unlocks deeper tunnels.

- `web/` — Bun + Vite + TypeScript + Three.js client
- `server/` — Bun + Hono + bun:sqlite tutor server (Anthropic LLM problem generation with deterministic fallback and answer verification)
- `shared/` — zod schema contract shared across the boundary
- `scripts/` — taxonomy import/curation tooling

```bash
bun install
bun run dev:server   # tutor server on :8787
bun run dev:web      # game on :5173
bun test server shared scripts web/unit-tests
```

## Configuration

| env var | default | what it does |
| --- | --- | --- |
| `PLAYER_TZ` | `America/New_York` | IANA zone for US Eastern Time (EST/EDT) that defines "today" for the daily correct-answer count and its record. Set it to where the child actually lives — an unknown zone falls back to US Eastern rather than to the machine clock. |

## Curriculum data

The skill graph is curated from the [Marble Skill Taxonomy](https://github.com/withmarbleapp/os-taxonomy)
(v1) · © Generative Spark, Inc. (Marble) · https://withmarble.com — database under
ODbL 1.0, Marble-authored content under CC BY-SA 4.0. See `data/taxonomy/NOTICE`.
