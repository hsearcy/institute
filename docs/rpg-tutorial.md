# Story and adventure guide

The guide opens once per browser/API/profile on first visit. It has three short
story pages and twelve walkthrough pages. Replay **How to play · Story & tour**
from camp or the pause menu; Next, Back, Skip and Read aloud remain available.

The tour shows real HUD and camp panels. It explains math attacks, direct help,
answer power, spells, XP, skill prerequisites and upgrades, rolled equipment,
the Merchant, Blacksmith, daily/weekly quests, and the next dungeon reward.

During the guide the world and answer clocks pause, background controls are
inert, and workshop views render without retrying pending purchases. Completion
and skipping restore the prior panel, question, input and cosmetic selection.
Only a versioned local onboarding preference is written. The learning system,
server save format, reward math and progression are unchanged.

Narration uses the existing /tts voice, with an available browser voice as a
fallback. Moving pages or closing the guide cancels pending narration/playback.
On phone screens, guided panels occupy their own area above the smaller card;
spotlights respect scroll clipping and reposition after viewport changes.

Validation: 431 configured tests and production build pass. The durable
`scripts/playtest-rpg-tutorial.ts` harness exercises all 15 pages at 1440×900 and
390×844, keyboard navigation, blocked background actions, narration failure,
skip/replay/refresh, and live-question clock/input restoration. It compares
hero, legacy, mastery and learning records before/after and checks that no
mutating tutor/economy request is issued during the guide. Latest evidence:
`/tmp/rpg-tutorial-qa-v3/report.json`. Independent UI review: 8/10; see
`docs/rpg-tutorial-review.md`.
