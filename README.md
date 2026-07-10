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
bun test server shared scripts
```

## Curriculum data

The skill graph is curated from the [Marble Skill Taxonomy](https://github.com/withmarbleapp/os-taxonomy)
(v1) · © Generative Spark, Inc. (Marble) · https://withmarble.com — database under
ODbL 1.0, Marble-authored content under CC BY-SA 4.0. See `data/taxonomy/NOTICE`.
