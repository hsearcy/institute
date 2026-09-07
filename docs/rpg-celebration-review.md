# Reward HUD and celebration review

Date: 2026-09-07. Independent reviewer: `celebration_review`.

Scope: newly exposed learning-help controls, enlarged experience meter, and quest / daily-board / level-up overlays. Existing world, character, item, and combat art are excluded. The scale is the user's requested 1–10 scale, with 10 representing AAA visual quality; this review does not revise earlier scores for the rest of the game.

| Reviewed component | Score | Judgment |
| --- | --- | --- |
| Direct help and experience HUD | **8/10** | Hint and I don't know are readable beside Unleash without expanding the desktop answer form. The luminous, framed XP track is now a prominent reward meter with a clear next-level target. |
| Quest and daily-board reveal | **8/10** | Large gold headline, dimensional star medallion, restrained dark ribbon, rays, and gem sparks make completion immediately recognizable. Four simultaneous quests retain a single readable +75 gems reward instead of four separate currency strings. |
| Level-up reveal | **8/10** | A large new-level numeral, separate LEVEL UP headline, cool aura, and explicit skill-point reward give leveling its own distinct moment. The meter's coordinated glow reinforces the connection to progression. |

Evidence inspected: actual Chromium 1440×900 frames `help-and-xp-desktop.png`, `actual-quest-desktop.png`, `actual-daily-board-desktop.png`, and `actual-level-desktop.png`; presentation-only quest and level frames at 390×844 and 844×390; and a reduced-motion phone frame. The actual desktop quest, daily-board, and level events came from one correct math answer in an isolated test save. Phone and landscape frames replayed presentation events without granting rewards.

Saved evidence: [desktop help and XP](rpg-playtest/rewards-2026-09-07/help-and-xp-desktop.png), [actual quest reward](rpg-playtest/rewards-2026-09-07/actual-quest-desktop.png), [actual daily-board reward](rpg-playtest/rewards-2026-09-07/actual-daily-board-desktop.png), [actual level-up](rpg-playtest/rewards-2026-09-07/actual-level-desktop.png), [phone quests](rpg-playtest/rewards-2026-09-07/diagnostic-quest-phone.png), [phone level-up](rpg-playtest/rewards-2026-09-07/diagnostic-level-phone.png), [landscape quests](rpg-playtest/rewards-2026-09-07/diagnostic-quest-landscape.png), [landscape level-up](rpg-playtest/rewards-2026-09-07/diagnostic-level-landscape.png), and [reduced motion](rpg-playtest/rewards-2026-09-07/diagnostic-level-reduced-motion.png).

All inspected celebration captures are approximately 700 ms into the reveal. These scores assess the rendered composition plus the reviewed animation implementation; they are **not** a claim that the reviewer watched a complete motion recording or listened to the fanfare.

## Corrections checked

- The first landscape implementation could have crossed into the math column. Its layer now ends at the combat viewport boundary and clips decorative particles. Actual 844×390 captures show the reward ribbon clearly separated from the problem, answer, help, and cast controls.
- Simultaneous quest gem rewards are aggregated into one amount. The four-quest phone example fits without clipping its title or reward.
- The desktop answer panel stays on one compact row, honoring the user's explicit preference. Increasing help target sizes by adding a second row is not requested by this review.
- Reduced-motion rendering preserves the medal, title, and reward while removing rays, moving sparks, and the expanding ring.

No visual blocker remains within this change's scope. The overlays are clear and celebratory across the inspected layouts, and the XP meter is substantially more noticeable. A future full audiovisual review could judge entrance timing, transition pacing, and sound together; no AAA-level claim is made here.
