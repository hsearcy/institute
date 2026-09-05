# Sunken Vault sound design

Eight original synthesized WAV clips, authored with Python, NumPy, and the standard
`wave` module. No external samples, model services, music downloads, or licenses are
required. The deterministic generator uses seed 214.

| Cue | Sound |
| --- | --- |
| Fire Nova | Air drawn inward, a warm low impact, fire body and fading ember ticks |
| Frostfall | Crystal crack followed by scattered, softly ringing ice fragments |
| Chain Lightning | Four branching electrical snaps over a restrained thunder tail |
| Loot | Three brief, tuned enchanted-metal chimes |
| Level up | Warm rising D-major bell notes over a soft lower harmony |
| Boss defeated | Crumbling stone resolving into a victorious open interval |
| Footstep | Dry boot impact and stone scuff, with a tiny room reflection |
| Ambience | Seamless twelve-second filtered air, distant low resonance, no ticking |

The spell clips contain a 220 ms anticipation sound before impact, matching
`DungeonWorld.attack()`. Noise is band-limited; transients are softened, reverb is
baked into the effects, and runtime gain leaves room for the tutor's voice. The
ambience is deliberately quiet. Clips are mono 22,050 Hz / 16-bit PCM, about 1.1 MB
combined. The generated manifest records durations, RMS levels, and peak levels.

Rebuild: `python scripts/audio/generate_rpg_audio.py` (requires NumPy).

`web/src/rpg/sound.ts` exposes `unlock`, `setMuted`, `cast`, `loot`, `levelUp`,
`boss`, `startAmbience`, `dispose`, and optional `footstep` / `setDucked` functions.
Call `unlock()` directly from a user gesture. Loading is deduplicated and best
effort; no late sound is queued if an asset is unavailable. Call `dispose()` on
leaving the game. Muting and background-tab visibility silence all game audio.
Use `setDucked(true)` during spoken instruction to reduce the background further.
The module owns its WebAudio context and does not alter the legacy tutor audio.

Lifecycle verification: `bun test scripts/audio/sound.test.ts`.
The test covers autoplay gating, deduplicated preload, mute, hidden-tab behavior,
duplicate event suppression, teardown, and returning to the game.
