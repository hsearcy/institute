# Spell effects upgrade

Intent: Implement all 15 approved effects in docs/plans/spell-effect-bonuses.md. Premium effects at normal game camera distance, small work/token cost, no new creatures or rigs. Preserve old item IDs and cast receipts. Use existing geometry/material/audio assets unless a clear missing asset requires generation.

Skills loaded: threejs-game-director, threejs-gameplay-systems, threejs-aaa-graphics-builder, threejs-game-ui-designer, threejs-audio-generator, threejs-debug-profiler, threejs-qa-release. References: technical-art, shader-cookbook, visual-scorecard, game-feel, visual-test-harness, evidence-manifest.

Ownership: Lead owns shared bonus catalogue/combat, DungeonWorld integration, storm effects, audio decisions, UI labels, final QA. Independent workers own fire and frost bonus modules. All use world/spellBonusTypes.ts; visual helpers cannot mutate combat or apply damage.

Implemented: all 15 shapes in shared combat, boss rolls, equipment labels, and renderer modules. Old save IDs retained. Base Blizzard, Tempest, and Frost Guardian effects improved. Review defects fixed. Slow-frame effect age now uses its scheduled start time. Existing audio reused; no asset generation needed.

Verification: 454 tests pass; production build passes. All 15 real answer submissions and receipts passed again after the final timing and material changes, in a disposable database. Final desktop/phone visual run passed after the timing fix: 30 casts, no browser errors, zero effects left. Full details in final-evidence.md.

Local: the existing test save has all 15 shape examples. Only 12 missing copies were added; equipped item and balances preserved. API 8787 and Vite 5188 restarted.
