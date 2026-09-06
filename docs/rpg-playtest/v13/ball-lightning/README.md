# Ball Lightning visual evidence

These are actual Three.js renders and actual game HUD captures. No concept art is presented as gameplay. Tests use disposable local seeded profiles, never the child’s server progress.

The independent art critic scored the pictured electrical volumes, contact/dissolve treatment, asymmetric settled poses, and desktop/fallback/landscape/portrait orb presentation **8/10**. The final normal-loop clip was also sampled at 1fps for overview and 8fps around the cast: the critic found coherent release, contact, supported collapse and erosion, with no further timing redesign indicated. This is scoped visual and sampled-sequence acceptance, not an acceptance of every game effect or an assertion that continuous animation playback was reviewed.

| Evidence | Conditions |
| --- | --- |
| [Single orb](single-contact.png) | Actual HUD, veteran, 26 enemies, desktop full quality |
| [Anticipation](anticipation.png), [desktop contact](desktop-contact.png) | Actual HUD, four-orb upgrade, 48-enemy stress case, 1440×900 |
| [Fallback contact](fallback-contact.png) | Actual HUD, performance framebuffer; strands recover subpixel coverage while retaining the authored paths |
| [Landscape contact](landscape-contact.png) | 844×390 screen, separate 622×305 combat canvas |
| [Portrait contact](portrait-contact.png), [small portrait](portrait-small-contact.png) | 390×844 and 360×780; measured safe area keeps orbitals above the question panel |
| [Settled bodies](settled.png), [fade](fade.png), [cleared](clear.png) | Final asymmetric collapse, world-only 40-enemy inspection at 1.75, 2.2 and 2.55 seconds |
| [Normal-loop boss recording](boss-motion.webm) | Real veteran answer through boss victory, 36 enemies, final asymmetric poses; no manual animation stepping |

HUD stills were manually advanced to exact authored ages after genuine local tutor/reward resolves: anticipation 0.12s, contact 0.95s. They assess material, shape and framing. The context captures precede the final settled-pose refinement; final pose evidence is supplied separately. These are scenario comparisons, not same-room pixel comparisons.

The final pose keeps joints connected and bodies full size, settles by 0.52s, briefly holds, then erodes over the existing death lifetime. The two variants brace a hand/shield or fold one knee farther. Tests measure actual exported lower-leg vertices through 67 frames for both variants of skeleton, revenant and guardian; sole clearance stays between −2.5cm and +3.5cm. GPU inspection verifies shadow/surface erosion, empty completed batches, finite matrices and reset on the next encounter.

## Timing evidence and limits

These are **rAF cadence** measurements, not GPU timer measurements. They come from isolated native-ANGLE Intel Iris Xe Chromium on this machine and should not be generalized to other devices.

| Capture | Casting samples | Median / p95 frame interval | Mean cadence |
| --- | ---: | ---: | ---: |
| Actual HUD, unrecorded four-orb 48-enemy boss | 135 | 16.7 / 33.4ms | 49.1fps |
| Final actual HUD recorded single-orb 36-enemy boss | 78 | 33.3 / 83.3ms | 28.5fps |
| Earlier recorded actual HUD stress, room 4 plus boss | 81 | 50.1 / 200.1ms | 14.8fps |

The unrecorded HUD boss result closely matched the isolated unrecorded renderer result (~47fps). Recording contributes a substantial discrepancy in these runs, but the older stress sample also pooled two room layouts; this is not a quantitative isolation of recording cost. The video file is encoded at 25fps independently of actual rAF cadence. The critic can inspect sampled video frames, but its image tool cannot play continuous video; temporal approval must retain that limitation.

Exact telemetry is retained in [unrecorded HUD boss](unrecorded-hud-boss-telemetry.json), [final recording](boss-motion-telemetry.json), [four-orb HUD](hud-orbit-telemetry.json), [portrait HUD](hud-portrait-telemetry.json), and [final pose validation](final-pose-validation.json). Original capture paths are recorded in [sources.json](sources.json). Review-model request overrides are identified in the telemetry; the final recording uses the accepted second cloth lift at the approved 1.85m wraith height.

The accepted second cloth-lift model has since been promoted to the normal runtime wraith.glb path; the historical capture metadata retains its explicit review override for provenance.
