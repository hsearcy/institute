# Complete item model coverage

All 23 existing saved item IDs now have distinct installed GLBs and matching model-derived thumbnails. The combined GLB payload is 21,527,764 bytes; the largest item has 11,968 triangles. `asset-audit.json` verifies every file, exact hash, unique geometry, thumbnail and attachment metadata. These are functional reward models; this does not assert that the collection meets the requested overall 8/10 art standard.

`browser-full-report.json` records actual Chromium UI equip/save checks for all 23 items, 92 item/armor mount combinations, persisted equipment after reload, and three correct-answer casts using Apprentice's Runeblade, Staff of Endless Winter and Crown of the Inferno. Each cast earned XP and retained the equipped model. The run also checked the new-player locked collection: every item shows its thumbnail/name and remains disabled until owned. Desktop and phone screenshots are included.

The original full run's final assertion failed on Chromium's optional `/favicon.ico` 404 console message after all functional checks completed. The report is preserved unchanged. `browser-wearable-report.json` identifies that exact favicon URL, excludes it from asset/API failures, and passes all 16 wearable/armor combinations. No full rerun was needed for this unrelated browser request.

Front diagnostic views revealed a buried crown and a partly buried Wayfarer pendant. Only attachment socket translations were corrected: crown +0.06 m on Wayfarer, +0.09 m on the older armor rig, and pendant +0.045 m forward on Wayfarer. `browser-corrected-fit-report.json` passes the eight affected combinations after correction. Included front views use unmodified item/hero geometry and a temporary diagnostic camera; normal-camera screenshots remain in the corresponding `tmp/item-*-fit*` evidence directories.

Validation: 388 unit tests passed across 50 files. After socket corrections, all eight attachment tests and the production build passed. No learning rules, saved IDs, unlock rules or production progress were changed. Browser work used disposable `/tmp` databases and newly created contexts; the existing blank browser tab was preserved.

Repeat functional checks with `bun scripts/audit-rpg-items.ts` and `bun --no-env-file scripts/playtest-rpg-items.ts`. Use `QA_ITEMS=inferno,wardenheart,thunderbell,stormorbit QA_FIT_CLOSE=1 QA_SKIP_COMBAT=1` for the targeted wearable views.
