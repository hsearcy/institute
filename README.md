# Institute

An adaptive math tutor for kids, played as a browser dungeon RPG. Solve problems to cast spells, collect equipment, and unlock three skill trees. A mastery map of 58 math topics guides practice, spaced review, and prerequisite help. Hints appear on screen, with optional spoken audio; parents can review learning progress in the journal.

## Quick start

```sh
bun install
bun run dev:server   # API on :8787
bun run dev:web      # game on :5188, in another terminal
```

Copy `.env.example` to `.env` for optional services. The game works without API keys.

| Key | Enables |
| --- | --- |
| `ANTHROPIC_API_KEY` | Generated problems, hints, and walkthroughs; otherwise built-in content is used |
| `ELEVENLABS_API_KEY` | Spoken hints; `ELEVENLABS_VOICE_ID` selects the voice |
| `DEEPGRAM_API_KEY` | Tutor audio checks |
| `TRIPO_API_KEY` | Optional 3D asset tooling |

`PLAYER_TZ` controls daily records and defaults to `America/New_York`.

For a disposable preview with sample learning progress:

```sh
bun --no-env-file scripts/rpg-local-server.ts
# In another terminal:
TUTOR_PROXY_TARGET=http://127.0.0.1:8799 VITE_PROFILE_ID=rpg-playtest bun --no-env-file run --cwd web dev
```

Use `rpg-archmage` instead to preview all spells and upgrades. Neither preview changes an existing learner's records.

## Playing

Answer and press Enter or **Unleash**. Use Q/W/E for favorites, B for the spellbook, K for skills, I for equipment, and Escape to pause. Touch controls are available. **Help me** provides a hint or worked example; progress is saved at checkpoints.

## Suggestions

Choose **💡 Idea**, speak or type, edit, then **Send** or **Cancel**. Speech uses local [Bark](speech/README.md) by default and requires its separate worker plus HTTPS or localhost. Audio is not saved, there is no automatic external fallback, and typing remains available.

Optional [Hermes/Herald parent review](scripts/institute_bridge/README.md) requires separate setup. Approval applies to the exact reviewed scope; deployment stays manual. See the [API reference](docs/suggestions.md) for integration details.

## Development

- `web/`: Vite, TypeScript, Three.js client
- `server/`: Bun, Hono, SQLite backend
- `shared/`: Shared Zod schemas
- `speech/`: Optional local speech worker
- `scripts/`: Curriculum and asset tooling

```sh
bun test server shared scripts web/unit-tests
bun run --cwd web build
bun run --cwd web verify:rpg
bun run --cwd web verify:recovery
bun run --cwd web verify:spellbook
python scripts/blender/validate_assets.py
```

Browser tests use a temporary database. Install Chromium with `cd web && bun x playwright install chromium`, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Bundled assets include [Blender models](scripts/blender/README.md), [sound design](scripts/audio/README.md), and OFL fonts.

## License

Code: [MIT](LICENSE.md). The [Marble Skill Taxonomy](https://github.com/withmarbleapp/os-taxonomy) is © Generative Spark, Inc.: database under ODbL 1.0 and authored content under CC BY-SA 4.0; see `data/taxonomy/NOTICE`. Third-party assets and models retain their own licenses.
