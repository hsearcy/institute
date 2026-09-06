# Doorway cutaway candidate, 2026-09-06

**The independently reviewed candidate crossing scores 8/10; the global art
gate remains failed.** The reviewer approved its fade, visible shadow/light
continuity, hero visibility, and observed transition. Review tools are available
again. RoomCutaway is now integrated into DungeonWorld with preparation during
loading. The separate integrated recording below also passed the same bounded visual
review at 8/10.
The new `traveling` readout is installed and tested in actual play.

## What changed

The old visibility rule removes every tall object in the previous room when
camera Z passes room center minus 10 m. The candidate varies opacity smoothly
between offsets 8.5 and 12.5 m, preserving the ground and the next room.
It clones materials without owning their textures or geometry, fades torch
light separately, and supplies a matching packed-shadow depth uniform.

Four alternatives were exercised in real Chromium room transitions:

| Approach | Root observation and disposition |
| --- | --- |
| Alpha hash | Lossless `rejected-hash.png` exposes conspicuous stippling. Rejected. |
| Ordinary blending | `rejected-blend.png` exposes internal pier faces like glass. Rejected. |
| Four-sample coverage | `coverage-study.png` largely resolves those artifacts; the diagnostic traversal had median 23.5 ms / p95 33.4 ms frame intervals. Requires broader rendering-cost evaluation. |
| Nearest-surface depth prepass | Preferred candidate. Only the frontmost stone surface blends over the previously rendered background. Extra depth draws occur only during fading; resting scenery uses its original opaque material. |

The final approach needs a real warmup draw before combat. Without it, its first
appearance compiled new programs and stalled the crossing. The warmed run uses
a 128x128 temporary target before starting combat; the target is disposed and
the normal render target restored. Production now performs that preparation
during loading, visiting all six room positions to draw their material variants.

## Exact visual evidence

`candidate.png`, `old-cut-same-camera.png`, and `opaque-same-camera.png` are
lossless views from the same frozen real crossing, with unchanged camera and
actor positions. Candidate opacity is 0.494666 at camera Z -10.514224 m. The
test resumes and reaches the next room after the comparisons.

`actual-room-crossing.webm` is a separate uninterrupted recording of two actual
Fire Nova answers followed by doorway travel. The first cast leaves four
survivors; the second clears the room and spawns seven enemies in room two.
The clip and `uninterrupted-evidence.json` establish:

- Ten hit callbacks, maximum seven visible enemies, zero page/shader/request
  errors and no context loss.
- Seventy-nine intermediate-opacity frames over 1.446 seconds. Largest opacity
  change between recorded frames: 0.02309. The old all-at-once toggle is absent
  from this candidate execution.
- Program count remains 156 during the fade. Recorded transition intervals:
  median 18.0 ms, p95 23.5 ms, maximum 25.8 ms. This is instrumented browser
  timing, not an isolated GPU benchmark or a performance approval.
- Final hero position approximately `(1.1984, 0, -18.5901)`, camera target Z
  -18.4910, `traveling === false`, and previous-room opacity zero.

Independent review confirms the prepass removes the conspicuous stippling and
internal face accumulation in this crossing. Other doorways, biomes, and
transparent objects behind fading walls remain separate coverage. No whole-world
approval follows. See the current art-review ledger for the bounded scores.

## Production integration verification

`integrated-room-crossing.webm` and `integrated-evidence.json` record a fresh
disposable-profile run using the installed class and loading warmup, without
injected fading or preparation. Two Fire Nova casts leave four survivors, then
clear the room and advance to seven enemies. There are ten hit callbacks and no
page errors or context-loss events. The hero reaches approximately
`(1.1964, 0, -18.5775)` with `traveling === false`.

The fade includes 76 intermediate-opacity frames over 1.422 seconds. Programs
remain at 159; recorded intervals are median 18.8 ms, p95 23.2 ms, maximum
24.1 ms. Loading preparation took 1.662 seconds in this run. These instrumented
measurements establish this run's behavior, not general performance approval.
Both the integrated build and all 368 tests pass; their logs are included.

## Travel verification correction

Earlier temporary harnesses waited for `!world.traveling`, but that property
did not exist; `!undefined` let them finish while the hero was still walking.
Their damage, room-state, and visible-enemy records remain valid, but a field
named `afterTravel` in those reports does **not** prove arrival.

DungeonWorld now exposes actual unfinished waypoints or distance to destination
as `traveling`. The first attempted doorway study caught this gap by asserting
that intermediate fade values were actually observed; it failed before reaching
the doorway. Both final studies above wait for the corrected readout and verify
the final position. No learning state or reward logic was changed.

## Checks and remaining work

`bun test server shared scripts web/unit-tests`: 368 passed, zero failed.
`bun run --cwd web build`: passed. Four cutaway tests cover continuity, shared
resource isolation, shadow/flame uniforms, reversible lights, and temporary
prepass lifetime. All gameplay uses disposable local progress.

Verify other doorways and actual browser performance. The existing portal
model, other world art, characters, all item models and remaining spell effects
retain their separate unfinished gates.
