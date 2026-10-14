# Institute

**Institute** is an adaptive math tutor for kids, played as a browser dungeon RPG. Every spell is a math answer: solve a problem to unleash it through a horde, collect rare equipment, gain experience, and grow three branching skill trees with 33 nodes and 23 relics across three expeditions.

Under the game is a real mastery map: 58 math topics in 6 domains, each unlocked by the skills it builds on. The tutor picks the next topic from that map, keeps mastered topics fresh with spaced review, rescues a stuck topic with its prerequisites, and demonstrates each new kind of problem before the first try. Hints are spoken and shown on screen. The parent journal shows what is mastered, practicing, ready, or locked, with a question to ask your child for each topic.

The world keeps moving while you think, but combat waits for your answer. Travel and targeting are automatic. Fifteen abilities span Flame, Frost, and Storm, including Flame Cleave, Meteor, Phoenix Dive, Blizzard, Frost Guardian, and Ball Lightning; each six-encounter expedition ends with a guardian and loot. Distinct rooms include a furnace hall, a lost reliquary, a broken bridge, and a crystal gallery, with automatic travel and progressively denser hordes.

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

### API keys

Copy `.env.example` to `.env` in the repo root. Every key is optional. The game runs with none; each missing key turns off one feature.

| key | service | without it |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | [Anthropic](https://console.anthropic.com/) — word problems, hints, walkthroughs | built-in deterministic problems and hints |
| `ELEVENLABS_API_KEY` | [ElevenLabs](https://elevenlabs.io/) — spoken hints (`ELEVENLABS_VOICE_ID` picks the voice) | hints are text only |
| `DEEPGRAM_API_KEY` | [Deepgram](https://deepgram.com/) — checks each spoken take against its text | every take is kept unchecked |
| `TRIPO_API_KEY` | [Tripo](https://www.tripo3d.ai/) — 3D asset scripts in `scripts/tripo` | not needed to play |

For a safe local preview with seeded existing learning progress, run `bun --no-env-file scripts/rpg-local-server.ts`, then in another terminal:

```sh
TUTOR_PROXY_TARGET=http://127.0.0.1:8799 VITE_PROFILE_ID=rpg-playtest bun --no-env-file run --cwd web dev
```

Open `http://127.0.0.1:5188`. This uses a disposable database in `/tmp`; it does not touch Ares or a real learner's records. Use `rpg-archmage` instead of `rpg-playtest` to inspect all 15 spells, skill upgrades, equipment, and regions.

## Playing

Type an answer and press Enter or **Unleash**. Use Q/W/E for your three school favorites, B for the full spellbook, K for skill trees, I for equipment, and Escape to pause. Choosing a spell in the spellbook updates its school slot; favorites persist on this device. Click a locked spell to track its next prerequisite at camp and in the dungeon; newly learned spells offer **Try it now**. A number pad is available for touch devices. **Help me** offers a hint or the existing worked walkthrough. Pausing, closing the tab, and leaving at checkpoints preserve adventure progress.

## Verification and assets

```sh
bun run --cwd web build
bun run --cwd web verify:rpg
bun run --cwd web verify:recovery
bun run --cwd web verify:spellbook
python scripts/blender/validate_assets.py
```

Browser tests start an offline tutor with a fresh temporary SQLite database. Install Playwright Chromium first if needed (`cd web && bun x playwright install chromium`). Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use an existing Chromium executable. The game assets are bundled: [original Blender models](scripts/blender/README.md), [original sound design](scripts/audio/README.md), and locally hosted OFL fonts.

## Configuration

| env var | default | what it does |
| --- | --- | --- |
| `PLAYER_TZ` | `America/New_York` | IANA zone for US Eastern Time (EST/EDT) that defines "today" for the daily correct-answer count and its record. Set it to where the child actually lives — an unknown zone falls back to US Eastern rather than to the machine clock. |

## Curriculum data

The skill graph is curated from the [Marble Skill Taxonomy](https://github.com/withmarbleapp/os-taxonomy)
(v1) · © Generative Spark, Inc. (Marble) · https://withmarble.com — database under
ODbL 1.0, Marble-authored content under CC BY-SA 4.0. See `data/taxonomy/NOTICE`.

## License

[PolyForm Noncommercial 1.0.0](LICENSE.md). You may use, change and share this code for any noncommercial purpose: personal use, study, teaching, research, charities and schools. Commercial use needs separate permission. Third-party parts keep their own licenses: the Marble taxonomy data (above), the CC0 lich source in `scripts/blender/sources/cc0-lich`, and the OFL fonts.

Required Notice: Copyright 2026 Houston Searcy (https://github.com/hsearcy)
