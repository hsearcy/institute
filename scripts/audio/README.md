# RPG sound design

The RPG uses 85 clips made with ElevenLabs sound generation
(`eleven_text_to_sound_v2`). Every prompt is in `rpg_sfx_spec.py`.

| Group | Clips |
| --- | --- |
| Spell casts | One per spell (15). Plays as the cast clip starts. |
| Contacts | `hit-fire`, `hit-frost`, `hit-storm`, `hit-blade` (3 takes each), `hit-heavy` (2) for brutes |
| Area blasts | `blast-fire` (meteor), `blast-frost` (frost guardian), `blast-storm` (thunderclap) |
| Horde | `swing`, `ward`, `collapse` (3 takes each), `alert` when combat starts |
| Unseen pack | `lurk-rattle` (3), `lurk-growl` (2), `lurk-scrape` (2): idle sounds while the hero searches, louder as he comes near, panned by screen side |
| Hero | `step` (4 takes, on each footfall of the run), `charge-ember/frost/storm` on a correct answer |
| Rewards | `soul` (3), `relic-drop`, `relic-pickup`, `reward`, `room-clear`, `level-up`, `boss-defeat` |
| Breakables and elites | `break-wood`, `break-pottery` (3 takes each), `dust-pickup`, `elite-alert` when an elite pack starts a fight, `elite-defeat` |
| Interface | `ui-click`, `ui-select`, `ui-open`, `answer-correct`, `answer-wrong` (soft, never a buzzer) |
| Ambience | `amb-vault`, `amb-forest`, `amb-coast`, `amb-quarry`, `amb-garden`: 22 s seamless loops |

Rebuild: `python3 scripts/audio/generate_rpg_sfx.py [id ...]` (needs
`ELEVENLABS_API_KEY` in `.env`, and ffmpeg). Raw takes are kept in
`assets/rpg-sfx-raw/` (not committed) and reused, so a rerun only re-levels them.
To buy a new take, delete its raw file and run the script for that id.

Processing: leading and trailing silence is cut, then each clip is leveled by
loudness (effects -13 dB RMS, interface -18, ambience -21) with a limiter on the
sharpest transients. Effects are mono 96 kbps MP3; ambience is stereo 128 kbps.
`web/public/assets/rpg/audio/sfx/manifest.json` lists the takes of each clip.

`web/src/rpg/sound.ts` loads the manifest and every effect after the first
gesture (`unlock()`), picks a random take and never repeats the last one, and
skips a clip that is still loading instead of playing it late. Mix levels per
clip are in `VOLUME`. `setAmbience(environment)` crossfades the room tone.
Muting and a hidden tab silence everything; `setDucked(true)` lowers the mix while
the tutor speaks; `dispose()` closes the audio context.

Lifecycle verification: `bun test scripts/audio/sound.test.ts`.
