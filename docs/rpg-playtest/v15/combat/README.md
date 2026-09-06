# Persistent damage and supported hit reactions

The user's feedback reopened impact acceptance: prior individual spell-form reviews do not establish satisfying combat.

`starter-two-casts.webm` records two real starter Fire Nova answers in an isolated disposable database, with the ordinary animation loop and actual desktop HUD. `starter-two-casts.json` contains authoritative receipts, per-render enemy health/visibility/positions/erosion, exact hit events, problem IDs, and browser errors. No simulation stepping or answer/reward overrides were used.

- First cast: six enemies with HP `[12,6,8,8,10,6]` become `[6,0,2,2,4,0]`; two defeats, four damaged survivors, same room, new math problem.
- Second cast: the four remaining enemies are defeated; the game advances to room 1 with seven new enemies.
- Maximum visible enemy roots across every captured render: seven. This includes the new room.
- Surviving enemies recover their stance. Defeated enemies retain full-size supported poses, with staggered 1.85–2.10-second contact-to-cleanup lifetimes. At first-cast age 1.61 seconds both corpses remain visible with zero erosion.
- First/second active animation durations were approximately 3.05/2.76 seconds. Recorded active-frame interval median was 20.1 ms; maximum 38.7 ms. These are recording/runtime cadence, not GPU execution time or an unrecorded benchmark.
- No shader, page, failed-request or HTTP errors were observed.

Independent v1 review did **not** pass impact: contact/recoil 6.5, survivor recovery 7, death weight 6, settled hold/erosion 7. The longer hold exposed weak crouched death silhouettes. Functional partial damage was confirmed.

## V2 candidate

`starter-two-casts-v2.webm` and matching JSON/PNG repeat the two real solves after asymmetric survivor leg/hip catch, slower recovery, a lower forward skeleton/revenant fall, wider formation spacing and clearer health bars. The same functional assertions pass with no browser/shader/resource errors and maximum seven visible roots. Recorded active-frame median/max were 20.4/37.5 ms (not GPU cost). Exact exported-geometry tests verify support-foot contact and low rib-cage clearance without meaningful ground penetration.

Independent v2 review remains below the impact gate: contact/catch and survivor recovery 7.5; skeleton/revenant death weight 7, with raised rigid arms/weapon needing a final slack settle. Desktop health bars, formation and outcome communication pass their scoped 8 review. Guardian/wraith death poses have not yet received the corresponding body-specific revision. This proof does not claim cross-device motion coverage or acceptance of other spell effects.

## V3 candidate

`starter-two-casts-v3.webm` and JSON repeat the real two-cast proof with separately delayed support-foot placement, a final arm/weapon slack settle, a lower guardian chest/forearm pose and a full-size wraith hood bow/local cape turn. One supported skeletal fall orientation replaces a mirrored variant whose weapon penetrated the floor during CPU verification. Cached convex support vertices and final arm targets avoid scanning full mesh geometry every frame. No rigid body or garment is globally scaled.

The same functional outcomes pass, with seven maximum visible roots and no browser/shader/resource errors. Recorded active-frame median/max were 22.1/41.6 ms; this is not a GPU benchmark. Twenty-nine focused geometry/pose/reaction tests and TypeScript passed. Independent review of all 250 native frames remains below the impact gate: contact/catch/recovery 7.5, skeleton/revenant death 7.5, guardian 7, and wraith 6.5. Cleanup/order alone passes 8. The remaining issues are an indistinct planted catch, arranged/upturned skeletal limbs, symmetric guardian support, and insufficient wraith height loss. Geometry clearance does not establish convincing weight.

## V7 ordinary-loop proof

`starter-two-casts-v7.webm` and JSON record the two real starter Nova solves with a planted-foot catch, supported skeletal falls, a trailing revenant cape, an asymmetric guardian collapse, and a continuous curved wraith garment with rigid hood/hands. The same authoritative partial-kill outcomes pass: two defeats and four wounded survivors, then a clearing solve. Maximum visible roots: seven. The four wraith cloth parts retain independent morph state through instance compaction and reset on living actors.

`veteran-ball-two-casts-v7.webm` and JSON exercise the new morph/depth path with two real Ball Lightning casts and room transitions. This upgraded fixture defeats the six- and seven-enemy low-HP packs; it is **not** evidence of Ball survivor behavior. Maximum visible roots: eight.

Both recordings use ordinary elapsed time, without simulation stepping or pose overrides. They contain no shader, page, failed-request or HTTP errors. Program count remains 134 from loading through both casts and subsequent rooms. Recorded active-frame median/max intervals are 17.9/28.3 ms for Nova and 18.1/36.7 ms for Ball; these measure observed recording/runtime cadence, not GPU execution cost.

Independent review of all 241 Nova and 266 Ball decoded frames passes the reviewed Nova skeletal survivor catch/recovery, skeleton/revenant falls and settles, guardian final collapse/settle, and cleanup/order at 8. Complete impact remains below the gate: guardian initial contact is 7.5 because the shoulder impulse is weak, and wraith death is 7.5 because its staff hand remains extended through the hold. Ball survivor behavior is unverified in this fixture.

Earlier static pose studies do not establish complete impact acceptance. The v4/v5 zero-delta fixture retained idle height offsets; early v6 fixed-pose intermediates also retained a contact light. Those are diagnostic limitations, not runtime defects or valid support/timing evidence. The real-loop v7 recordings supersede those studies for motion and contact judgment.

## V8 diagnostic failures

The v8 Stormspire run rendered the earlier rooms, then produced a blank battlefield around the room 2→3 transition. It reported 38 WebGL `VALIDATE_STATUS false` errors across unrelated material types, with empty program logs; observed program counts fell from 135 to 44/49. This is a failed graphics run, regardless of completed gameplay receipts. Its JSON/log and blank-scene image are preserved in `diagnostics/ball-v8-*`.

The fresh v8b retry failed earlier on its first answer with Chromium `net::ERR_INSUFFICIENT_RESOURCES` fetching attempt status, followed by a busy-state timeout. It did not reproduce or disprove the transition failure. Its separate JSON/log are `diagnostics/ball-v8b-*`.

Old task-owned temporary archives/decoded frames were subsequently moved to disk-backed ignored storage, retaining their original paths through symlinks. This freed about 2 GiB of temporary memory storage and increased available system memory. It is a resource-pressure mitigation, **not a proven diagnosis or source fix**.

The subsequent isolated unrecorded check passed six real Stormspire answers and transitions from room 0 to the boss room, including both hall/crossing dressing rebuilds. It reported no shader/network/page errors, context-loss events, or lost-context frames, with at most ten visible enemies. Exact evidence is `diagnostics/ball-v8-unrecorded-transition.json`. This pass does not retroactively diagnose the earlier failures or establish animation-art acceptance. The legal eight-target loadout needed two answers in the nine-enemy room; it reached the boss without yet striking it.

`ball-v8-boss-survivor.webm` and JSON resume that legitimately reached disposable save for one real Ball answer: boss HP 52→32, seven defeats, two untouched enemies, same boss room and a new question. Ten visible roots maximum. `ball-v8-ordinary-contact.webm` and JSON record one fresh ordinary cast for the corrected guardian shoulder impulse and wraith staff-hand release. Both runs are graphics/network clean, with no context-loss events and stable program counts (137 boss, 134 ordinary).

These bounded recordings ran at slower observed cadence than v7: active-frame median/max 55.7/92.7 ms for the boss and 54.7/65.0 ms for ordinary combat. The encoded 40 ms frame spacing includes repeated frames. Independent review of all 307 decoded frames gives the guardian initial impulse and genuine boss recovery **8 for observed choreography**: the shoulder displaces against a catching lower mass, then the living boss returns to wounded guard. This is **not a smoothness pass** at the recorded cadence. Wraith death remains **7.5**: ordinary frames 86–105 retain a reaching/prayer-like forearm and crowned head above the shoulder ridge. The next bounded correction should lower the crown below the upper-back ridge and hang the forearm beside the skirt, preserving the accepted cloth bend. No complete impact acceptance or isolated GPU attribution is claimed. The earlier failures remain unresolved in cause despite the subsequent successful checks.
