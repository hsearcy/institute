
## Review amendments (2026-07-16, folded in before execution)

- Costume applies ONLY at serve sites via a `serveProblem()` wrapper (never inside `problemForTopic` — `topicBlock` example-rendering and `freshLocal`'s retry loop must not roll dice or flip the no-repeat flag).
- Costume replaces **spoken only** — the original hint's strategy holds regardless of story, and hints stay within their 200-char cap by construction.
- Stories use third-person characters (Milo/Ruby the miners) — NEVER "you have N gems", even fictional; the kid compares against his live counter.
- `compare_pick` costume preserves Bigger/Smaller polarity; real item names only when both numbers are actual catalog prices, else generic treasure-chest framing.
- `missing_any` costumes only its gap-shaped forms (`a + ? = c`, `? + b = c`); `div` drops off the costume list (its stock spoken is already gem-flavored); `ten_more_less` uses the parsed step (10 or 100).
- Prompt parsing normalizes U+2212 minus, mirroring `arithmeticAnswer`.
- `numberWords` moves to `shared` (Socratic client line needs it); topicgen re-exports for existing tests.
- Pad endpoints validate keys against `PAD_THEME_CATALOG`; the existing `/shop/equip` gains a guard so a pad key can't be equipped as a pickaxe; pad buy buttons use `data-buy-pad` (the shop wires `[data-buy]` to pickaxes).
- Socratic hook: `hud.toggleShop()` returns the new open state; Game caches the last ShopState in `refreshShop`; fires only on OPEN, once per item per session, 60s cooldown.
