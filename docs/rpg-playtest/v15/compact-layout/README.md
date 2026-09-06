# Compact combat layout evidence

These captures check HUD placement and persistent enemy health. They do not grant an art or animation acceptance score.

- `v2-wounded-{pack,boss}-{390x844,844x390}.png` and matching JSON sidecars come from a complete real-tutor expedition in the isolated legacy-learner browser fixture. A correct starter cast leaves four wounded survivors; the boss capture follows a genuine partial-damage cast later in that expedition. The revised compact notice occupies the room subtitle row, and an earlier relic discovery card clears before the next cast. The browser test asserts no notice/boss rectangle overlap and no stale discovery card during these captures. It passed in 2.4 minutes. These images precede the final landscape formation framing and top-edge health-bar adjustment.
- `v3-wounded-guardian-bar-{844x390,390x844}.png` follows one real starter cast in a new disposable database. The guardian has 6/12 HP. Its actual DOM health bar is visible and in bounds in both layouts; no game clock or pose was manually advanced.
- `v3-wounded-boss-landscape-camera.png` checks the final landscape camera framing. The exact authoritative partial-boss state recorded in the v2 JSON was restored into the new disposable fixture, then a fresh browser context loaded it through the normal `/rpg/state` API. This is a saved-state layout check, not a second live boss cast or effect-timing proof. The boss has 27/36 HP; the ten-actor formation fits below its header and above the dock. The restored screenshot has no transient cast notice.
- `v3-wounded-guardian-bar-evidence.json` records the fixture path, actual HP, bar rectangles, actor head projections and renderer diagnostics. Its `/tmp` image paths describe the original captures; the durable copies are the adjacent versioned PNGs.

All servers used fresh `/tmp` SQLite fixtures. No family server, production database, or live learner profile was contacted. Browser and local server processes were closed after each run. The final small-pane source translates the full formation within the combat area and fits it only when necessary; this is separate from asset quality.

## Final compact correction (v4)

`v4-guardian-*` again uses one real starter cast in a fresh scratch profile; `v4-boss-*` restores the same recorded partial-boss state and loads it through normal APIs in a new browser context. Both390×844 and844×390 are captured. Assertions pass for hidden floating XP in compact layouts and visible wounded guardian/boss bars. Portrait formation framing is included for independent review. No timing or performance isolation is claimed: the parent reported an unrelated camp render loop briefly resumed during this run, then stopped it. These are functional checks and static layout evidence.
