# M2 — Plugin Engine + Spell Cast (Hand-Coded) — Design Spec

**Date:** 2026-04-26
**Status:** Draft for review
**Author:** Houston Searcy (with Claude)
**Parent spec:** `docs/superpowers/specs/2026-04-25-institute-design.md` (V1 milestones → M2; "Mini-game plugin framework" section)
**Predecessor milestones:** M1 (skill engine + SRS) merged. M3 (3D hub + placeholder tutor) merged.

## What this is

The framework that turns the static M3 hub into something a kid can actually *do something* in. M2 builds:

1. The plugin contract (the parent spec's framework, locked into runtime-checked Zod schemas).
2. A `plugin-engine` package that loads plugins, validates LLM output (or hand-coded params) against their schemas, and mounts/unmounts their scenes.
3. The first plugin: **Spell Cast** as a hand-coded round (no LLM yet) — kid taps numbered buttons to fire spells and defeat a placeholder goblin. Scene uses procedural primitives only.
4. The hub integration: tapping a portal in the M3 hub launches the corresponding mini-game; finishing or backing out returns to the hub.

No LLM, no voice, no real 3D assets, no SRS feedback. M2 is the *plumbing* for everything that follows.

## Non-goals (explicitly out of M2)

- LLM-driven problem selection or schema-fill (M5).
- Voice input or kid-speech normalization (M4).
- The other three mini-games — Block Tower, Cookie Share, Door Code (M6).
- Connecting outcomes back to the skill engine's mastery state (M5/M6 — the engine merely emits outcome events for now).
- Kenney/Synty/Meshy assets in the Spell Cast scene (M6+).
- Persistence of session events (M5 backend ingest path).
- Daily quest, gems, streaks (M6+).

## Decisions (locked here, override if wrong)

| Decision | Choice | Why |
| --- | --- | --- |
| Engine package location | `packages/plugin-engine/` | Pure-logic, fully testable, peer of `skill-engine`. |
| Spell Cast location | `packages/minigames/spell-cast/` | Matches the parent repo layout (each mini-game is its own folder). |
| Schema validation | **Zod** (already a dep of skill-engine) | Locked in parent spec. Runtime + TS types from one source. |
| Round params | **Hand-authored fixture** in M2 (no LLM); same shape the LLM will fill in M5 | Forces us to nail the schema shape before AI gets near it. |
| Input modality | **On-screen number tap buttons (1–10 grid)** | Voice deferred to M4; we still need a complete loop. |
| Mini-game canvas | **Reuses the kid-app's existing R3F `<Canvas>`** — overlays content, not a new window | One GL context only (parent spec's perf rule). |
| Hub ↔ mini-game transition | **Top-level state in App.tsx**: `mode = "hub" \| { kind: "minigame", id: PortalId, runId: string }`. Portal tap sets mode; finish/back resets. No router. | Simplest possible state machine. Router lands later if scope demands. |
| Outcome reporting | Plugin's `Scene` calls `onComplete({ outcomes: AttemptOutcome[] })` from the contract; engine surfaces this to App.tsx via callback. | Decouples engine from skill-engine's mastery store. M5 wires the two together. |
| Spell Cast skill | `skip_count_2` only for the hand-coded round | Smallest viable skill that exercises the full sequence pattern. M5 generates rounds for all `supportedSkills`. |
| 3D assets | Procedural primitives — capsule goblin with sphere eyes, sphere sparks | Zero new assets; isolates M2 to engine + integration concerns. |

## Architecture

### The contract (locked in code)

```ts
// packages/plugin-engine/src/contract.ts
import { z } from "zod";
import type { ComponentType } from "react";

/** A single attempt at a problem inside a round. Mirrors @institute/skill-engine. */
export type AttemptOutcome = {
  correct: boolean;
  hinted: boolean;
  scaffolded: boolean;
  difficulty: number; // 0..1
  skillId: string;   // which skill this attempt targeted
  occurredAt: Date;
};

/** Result the Scene reports when the kid finishes (or aborts) a round. */
export type RoundResult = {
  status: "completed" | "aborted";
  outcomes: AttemptOutcome[];
  durationMs: number;
};

/** What the engine hands a Scene component when it mounts. */
export type SceneProps<Params = unknown> = {
  params: Params;                   // already validated against the plugin's schema
  onComplete: (r: RoundResult) => void;
};

/** A plugin manifest is a Zod-validated object. */
export const ManifestSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  supportedSkills: z.array(z.string().min(1)).nonempty(),
  /** The Zod schema for round params is provided as `paramSchema` (a ZodType). */
  // (Not described in the literal Zod schema because Zod schemas can't validate other Zod schemas
  // by introspection; manifest.paramSchema is checked structurally at registration.)
});
export type Manifest<Params = unknown> = z.infer<typeof ManifestSchema> & {
  paramSchema: z.ZodType<Params>;
};

/** A plugin: manifest + scene + evaluator (the evaluator is consulted by the Scene). */
export type Plugin<Params = unknown> = {
  manifest: Manifest<Params>;
  Scene: ComponentType<SceneProps<Params>>;
  /** Pure: was this answer correct for the given step of the round? */
  evaluate: (params: Params, step: number, answer: number) => {
    correct: boolean;
    expected: number;
    isLastStep: boolean;
  };
};
```

The engine's job is small:

- Hold a registry: `register(plugin)` / `getPlugin(id)`.
- Validate any candidate `params` against a plugin's `manifest.paramSchema` (returns `Result<Params, ZodError>`).
- That's it. The engine does not pick problems, render scenes, or judge answers — those belong to the SRS layer (M1), the plugin's Scene (M2+), and the plugin's evaluator (M2+) respectively.

### Plugin folder shape

```
packages/minigames/spell-cast/
├── package.json
├── tsconfig.json
├── src/
│   ├── manifest.ts        # id, title, supportedSkills, paramSchema (Zod)
│   ├── evaluate.ts        # pure: did the kid get this step right?
│   ├── Scene.tsx          # the R3F + UI of the round
│   └── index.ts           # exports Plugin<SpellCastParams>
└── test/
    ├── manifest.test.ts
    └── evaluate.test.ts
```

### Spell Cast — round shape

```ts
// packages/minigames/spell-cast/src/manifest.ts
import { z } from "zod";

export const SpellCastParams = z.object({
  enemyType: z.enum(["goblin", "slime", "ghost"]),
  /** The sequence of correct answers, in order. e.g. [2,4,6,8,10]. */
  sequence: z.array(z.number().int().nonnegative()).nonempty(),
  /** Tutor-spoken intro line. M2 just renders this as on-screen text. */
  intro: z.string().min(1),
});
export type SpellCastParams = z.infer<typeof SpellCastParams>;
```

Hand-coded M2 round:

```ts
{
  enemyType: "goblin",
  sequence: [2, 4, 6, 8, 10],
  intro: "A goblin appears! Cast sparks by 2s to defeat it.",
}
```

`evaluate(params, step, answer)`:

- `correct = answer === params.sequence[step]`
- `expected = params.sequence[step]`
- `isLastStep = step === params.sequence.length - 1`

### Spell Cast — Scene behavior

- Procedural goblin: green capsule + 2 sphere eyes, positioned in front of camera.
- Goblin "HP" = `params.sequence.length`. Each correct answer chips off 1 HP (visual: green capsule shrinks by 20% scale + flashes red, plus a sphere "spark" briefly flies from camera toward goblin).
- Wrong answer: shake the goblin, no HP change. (M2 doesn't punish wrong attempts in the mastery sense — that comes when M5 wires outcomes back.)
- After last correct: goblin shrinks to 0, scene reports `RoundResult { status: "completed", outcomes, durationMs }`.
- A "back" button (top-left, RN UI overlay) reports `{ status: "aborted", outcomes, ... }`.
- Tap input: a row of 10 numbered buttons (RN UI) at the bottom. Each tap calls `evaluate(...)`, mutates Scene state, pushes an `AttemptOutcome` onto the round's outcome list.

### Hub ↔ mini-game transition

```tsx
// apps/kid-app/App.tsx (after M2)
type Mode = { kind: "hub" } | { kind: "minigame"; portalId: PortalId; runId: string };

export default function App() {
  const [mode, setMode] = useState<Mode>({ kind: "hub" });
  // ... existing state ...

  return (
    <View style={styles.root}>
      {/* The R3F Canvas always exists; its children change with mode. */}
      <Canvas>
        {mode.kind === "hub"
          ? <HubScene onPortalTap={(id) => setMode({ kind: "minigame", portalId: id, runId: uuid() })} />
          : <MiniGameMount portalId={mode.portalId} onClose={() => setMode({ kind: "hub" })} />}
      </Canvas>
      {/* RN UI overlays (toast, FpsOverlay, mini-game number-pad, back button) */}
      ...
    </View>
  );
}
```

`<MiniGameMount>` looks up the plugin by id, validates a hand-coded params fixture against its schema, and mounts `plugin.Scene` with `onComplete={(r) => onClose()}`. It also renders the RN UI number-pad + back button.

For M2, only `spell-cast` is wired. The other 3 portals' taps still show the "Coming soon" toast.

### Outcome ingestion (deferred to M5)

The engine emits `RoundResult` with `outcomes[]`. M5 will wire this to the skill engine's `applyOutcome` + `scheduleNextReview`. M2 just logs it (`console.log("round complete", result)`) and returns to the hub.

## Repo placement

```
packages/
├── skill-engine/          # M1
├── plugin-engine/         # NEW (this milestone)
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── contract.ts    # types + ManifestSchema (Zod)
│   │   ├── registry.ts    # register / getPlugin
│   │   ├── validate.ts    # params validation
│   │   └── index.ts
│   └── test/
└── minigames/
    └── spell-cast/        # NEW (this milestone)
        └── ... (shape above)
apps/
└── kid-app/
    ├── src/
    │   ├── minigame/
    │   │   ├── MiniGameMount.tsx   # NEW
    │   │   ├── NumberPad.tsx       # NEW (RN UI 1–10 grid)
    │   │   └── BackButton.tsx      # NEW
    │   └── ... (existing M3 files)
    └── App.tsx (modified for mode state)
```

## Testing strategy

- **plugin-engine** (pure logic): unit tests for register, getPlugin, validateParams (good + bad inputs).
- **spell-cast/manifest**: parse-and-validate-back-out the hand-coded fixture; reject malformed shapes (negative numbers, empty sequence, unknown enemyType).
- **spell-cast/evaluate**: per-step correctness, isLastStep edge cases.
- **kid-app**: pure-logic unit for `MiniGameMount`'s "lookup-then-validate" flow (mock the plugin). Visual rendering is manually verified on the Pixel.
- **No new component smoke tests under Vitest** — the existing `@react-three/test-renderer` tests are still skipped (Flow annotations issue, M3 carry-over).

## Success criteria

M2 is done when:

1. `pnpm test` passes the new plugin-engine + spell-cast tests on top of the existing 53.
2. On the Pixel via Expo Go: tapping the Spell Cast portal in the hub launches the mini-game scene; tapping the right numbers in order ([2,4,6,8,10]) defeats the goblin and returns to the hub; tapping wrong numbers shakes the goblin without progressing; tapping back at any point returns to the hub.
3. `console.log` shows the `RoundResult` with the expected outcomes when a round completes.

## Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Hub's swipe-orbit pan-gesture-handler conflicts with the mini-game's number-pad taps | Disable pan gesture when `mode.kind === "minigame"`. |
| Mini-game scene state leaks into hub after close (e.g., goblin still floating) | `MiniGameMount` is keyed by `runId` — React unmounts/remounts cleanly between rounds. |
| Plugin params schema and `evaluate` drift apart over time | `evaluate.test.ts` parses the fixture through the schema first, so a schema rename forces the test to update. |
| The contract makes assumptions that won't hold for non-sequence games (Block Tower, Cookie Share, Door Code) | The contract is generic in `Params`. Different plugins declare different schemas. Reviewed against parent spec's 4 V1 plugins — fits all of them. |

## Open questions deferred

- **Run-id strategy.** A UUID is fine; could use a counter. Defer to plan.
- **What does the hub do while a mini-game is mounted? Pause animations? Hide?** M2 simplest: replace the entire Canvas children. Hub's tutor bob, decor, etc. are not visible during the round.
- **NumberPad UX.** Five-across-by-two (1–10) is the simplest; could go larger or with sound feedback. Defer styling to plan.
