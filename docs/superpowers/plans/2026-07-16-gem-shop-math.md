# Gem Shop Math Implementation Plan

> Executed 2026-07-16 (all tasks complete, merged as `feat/gem-shop-math`).

**Goal:** Problems sometimes wear gem-economy clothes (the frame where Sam's real ability shows up — he computed 450−200 unprompted wanting the gold pickaxe), the tutor asks a Socratic "how many more?" at shop-browse moments, and the shop gains a pad-theme shelf so the economy has more price anchors to do math with.

**Architecture:** A pure `costume()` pass (`server/src/costume.ts`) rewrites ONLY `spoken` (never `prompt`/`answer`/`hint`, never numbers — trust-math and topic envelopes stay intact) for compatible GenSpec kinds, ~40% of the time via `serveProblem()`/`maybeCostume()` at serve sites only, using stable quantities (catalog prices, item-vs-item gaps, quantity packs — NEVER the live balance, which goes stale in pre-generated branches). The LLM branch prompt gets the catalog + the same framing rule. The Socratic moment is client-side at shop-open (real live balance — fresh at that instant — spoken AND shown, ungraded, once per item per session, 60s cooldown). Pad themes (`pad_ocean` 75 / `pad_lava` 160 / `pad_galaxy` 340 / `pad_rainbow` 650) reuse `owned_items` + an `equipped_pad_theme` column; the client repaints the pad's per-key `--gem` tints — the crafted key recipe is untouched.

**Key design rules (from review):**
- Costume = story only; third-person miners (Milo/Ruby), never "you have N gems" (he compares against his live counter).
- `compare_pick` preserves Bigger/Smaller polarity; real item names only with their real prices.
- `missing_any` costumes only gap shapes; `div` excluded (stock spoken already gem-flavored); `ten_more_less` uses the parsed step.
- Costume dice roll ONLY at serve sites (`/tutor/first`, `freshLocal` survivor, `localBranches`) — never in `topicBlock` example rendering or retry loops.
- Pickaxe `/shop/equip` guards against pad keys (shared `owned_items` table).

## Review amendments (2026-07-16, folded in before execution)

- Costume applies ONLY at serve sites via a `serveProblem()` wrapper (never inside `problemForTopic` — `topicBlock` example-rendering and `freshLocal`'s retry loop must not roll dice or flip the no-repeat flag).
- Costume replaces **spoken only** — the original hint's strategy holds regardless of story, and hints stay within their 200-char cap by construction.
- Stories use third-person characters (Milo/Ruby the miners) — NEVER "you have N gems", even fictional; the kid compares against his live counter.
- `compare_pick` costume preserves Bigger/Smaller polarity; real item names only when both numbers are actual catalog prices, else generic treasure-chest framing.
- `missing_any` costumes only its gap-shaped forms (`a + ? = c`, `? + b = c`); `div` drops off the costume list (its stock spoken is already gem-flavored); `ten_more_less` uses the parsed step (10 or 100).
- Prompt parsing normalizes U+2212 minus, mirroring `arithmeticAnswer`.
- `numberWords` stays server-side (the Socratic line uses single numbers inside sentences, which don't garble — only digit RUNS do).
- Pad endpoints validate keys against `PAD_THEME_CATALOG`; the existing `/shop/equip` gains a guard so a pad key can't be equipped as a pickaxe; pad buy buttons use `data-buy-pad` (the shop wires `[data-buy]` to pickaxes).
- Socratic hook: `hud.toggleShop()` returns the new open state; Game caches the last ShopState in `refreshShop`; fires only on OPEN, once per item per session, 60s cooldown.
