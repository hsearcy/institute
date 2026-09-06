# Cleave v5 — accepted desktop effect on installed assets

Two real math answers in a disposable local save, with **no model routes or asset substitutions**. The installed Wayfarer holds the installed Apprentice sword. The spell was selected through the local API before entering; answers used the actual game UI. The recording used the same effect through its review switch; after this review the default was enabled without changing its geometry, shader, timing, or target behavior.

Independent review of every original 25 fps frame 162–193 and 297–336 scored **8** for material/form, blade handoff, target gaps/individual consumption, and observed contact timing/readability. Unequal end taper and a short hotter region remove v4's uniform bright ruler/fringe appearance. The cutting segments stay out of untouched actor directions and finish at their intended contacts.

The first cast changed room HP from `[12,6,8,8,10,6]` to `[3,0,0,8,10,6]`; the second left `[0,0,0,0,1,6]`. Six visual contacts matched six authoritative receipt hits. No frame exceeded six visible enemies. No shader, page, or resource errors were reported. Existing learner, mastery, retry, and receipt logic was not changed by this effect.

`two-real-casts.webm` is the original recording at 1440 × 900 and explicit device scale factor 1. Selected native PNGs are unscaled 740 × 430 crops at (410,170), named with original one-based frame numbers. Full before/after screenshots and per-frame/receipt data are retained. The viewport calibration is preserved beside the preceding v4 evidence.

The actual loading draw warmup took 338.2 ms. All recorded cast frames retained the 161 shader programs present before the first answer. Synchronous attack setup took 2.2 ms and 0.4 ms. Recorded attack frame intervals were 16.7 ms median, 19.8 ms p95, and 28.7 ms maximum on Intel Iris Xe through ANGLE. These are instrumented, recorded measurements for this desktop setup, not a general device benchmark. No existing game preview was open during the run; the user's original save was not opened or written by this disposable harness.

The accepted scope is this two-partial-cast desktop effect. It does not approve the old enemy models, private replacement skeleton, phone/boss/modifier/equipment-wide presentation, or other armor rigs. Older rigs without measured blade endpoints retain the legacy effect. The authored embedded-sword endpoint path was separately exercised in v3 with a genuinely earned Cinderbranch reward; its final v5 material was not separately re-recorded for that item.

The implementation samples actual mounted Grip/Tip transforms or the rigidly weighted authored embedded blade, releases at the authored strike frame, and calls presentation hits exactly once as each supplied target is reached. It retains scheduled reconciliation for a tab resuming after the visible effect lifetime. The server still determines every target and HP outcome. The first draw is warmed with the same position/UV geometry attributes as the live ribbons.

`warmup-and-timing.json` contains renderer, timing, program, and installed-asset hashes. `captured-source-hashes.json` identifies source at capture before default enable. Final validation after enabling the default: **378 tests passed**, TypeScript/production build passed; logs are included.
