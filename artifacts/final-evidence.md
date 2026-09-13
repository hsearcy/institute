# Spell effects: local implementation review

All 15 approved boss-item bonuses are implemented. Existing item IDs and saved cast receipts remain valid. The server applies either +30% damage or +2 targets; the maximum remains ten targets. The renderer cannot add damage.

The work used the game director, gameplay, graphics, UI, audio, debug, and QA skills. Fire and frost work was delegated under the director's rules. A separate review found defects in meteor materials, fire cracks, Guardian spike placement, and web visibility. These were corrected. Existing sounds, character models, shaders, and geometry tools were reused. No new creatures, rigs, external assets, or paid generation were needed.

## Changes and review

- Fire: Aftershock, Rift Slash, Molten Core, Blazing Wake, Volcanic Ground.
- Frost: Crystal Bloom, Diamond Drill, Frozen Fault, Whiteout, Glacial Hammer.
- Storm: Thunder Web, Overcharge, Resonance, Twin Orbit, Storm Pillars.
- Blizzard now centres its snow on the horde and has crystal contact effects. Tempest bolts strike the selected victims at the hit cue. The old Guardian's large, flat spike field is replaced with smaller clear crystals; its bonus has one wave from the summoned guardian.
- A timing fault was found during the meteor review. The old effect loop gave a newly scheduled effect the entire frame's age. On a slow frame, the meteor could disappear before impact. Effect age now comes from its scheduled start time.
- Instanced effect buffers are disposed at expiry and world teardown. Each new effect owns its material and geometry.

## Evidence

Raw local capture runs are excluded from Git. Each visual run writes its expected spell/viewport list before capture, then records actual simulation ages, renderer counts, effect names, and cleanup state.

- `spell-baseline/`: all 15 original desktop spells, unpaused.
- `spell-pass-1/`: first desktop/phone review; contains the defects described above.
- `spell-final-2/`: corrected still capture tool, all 15 desktop and phone bonuses, zero effects left after cleanup. Superseded for the meteor and effect clock.
- `spell-input/`: all 15 bonuses selected through the spellbook, correct answers entered through the form, server receipts checked, and unpaused motion frames. Fixture equipment is applied through the real equip API. A disposable SQLite database isolates these tests from the user's save.
- `spell-release/`: final desktop and phone set after the effect-clock fix. All 30 casts passed with no browser errors or effects left after cleanup. Includes a regression check that the core remains present before its scheduled impact.
- `spell-input-release/`: final normal-play pass after the effect-clock fix and solid-core material change. All 15 answer submissions, server receipts, and unpaused animations passed. The corrected canvas adapter reports real budget values; both viewport checks are nonblank.

Requested still times are .35, .75, and 1.2 seconds. Actual ages are recorded. A slow first frame can skip the earliest time. The tool freezes only its local simulation tick for still capture. The real-input motion pass stays unpaused. The game's ordinary pause flag is not a screenshot freeze.

## Graphics and cost

The review used the normal game camera and the packaged scorecard anchors. VFX and materials improved from roughly 2/3 to 2.5/3: distinct shapes and contact cues, dark rock with hot seams, clear faceted ice, and narrow electrical channels. The unchanged world, characters, rewards, and HUD were not given a new whole-game score. Still images cannot establish performance on a physical phone.

The canvas inspector measured desktop colour entropy 4.77, edge density .371, and luminance contrast 89.8. Phone viewport values were 4.88, .398, and 109.7. These are nonblank, varied views with readable contrast. Brave masks the GPU name, so the report does not claim a hardware frame-rate result.

The first inspector adapter incorrectly replaced its renderer object with a renderer name; its empty budget rows are not evidence of a pass. The adapter is corrected in the source. `spell-final-2/render-budget.json` applies the inspector budget function to measured frame samples: desktop peaks were 547 calls, 3,111,267 triangles, 503 geometries, and 151 textures. Phone peaks were 530 calls, 3,018,082 triangles, 504 geometries, and 152 textures. The original desktop baseline already reached 488 calls and 3,118,489 triangles. These exceed the skill's generic budgets, mainly because the existing actor assets are detailed. This task preserves the approved models; it does not claim low-end phone performance. New fragments use batched or instanced geometry and no new textures. Final release peaks were 552 calls and 3,111,267 triangles on desktop, and 529 calls and 3,018,082 triangles in the phone viewport. The RPG JavaScript bundle is 513.61 kB (156.15 kB gzip).

## Reproduce

Validation: 454 shared, server, and web tests passed; the production build passed.

Run `bun test shared/src web/unit-tests server/src/rpg.test.ts server/src/rpg.loot.test.ts server/src/rpgEconomy.test.ts server/src/integration.test.ts` at the repository root. Run `bun run build` in `web`.

After starting the configured Windows Brave debug profile on port 9222, run `node web/scripts/check-spell-effects.mjs` for all visual checks, or set `SPELL_FILTER=meteor` for a focused check. Run `node web/scripts/check-spell-input.mjs` for spellbook and answer submission checks. The optional `SPELL_CANVAS_INSPECTOR` adapter exposes the skill inspector's `sampleCanvas` and `readGpuInfo` functions; it is not required for the input tests.

The local game uses its existing scratch save. Twelve missing bonus examples were added without changing the equipped copy or reward balances. The earlier three examples remain valid. `scripts/add-spell-bonus-test-loot.ts` adds only missing shapes, rejects database paths outside the temporary directory, and writes a backup first.

Final checks: all 30 desktop/phone visual casts and all 15 normal answer submissions passed. The final build passed. Local testing is available at http://localhost:5188/.
