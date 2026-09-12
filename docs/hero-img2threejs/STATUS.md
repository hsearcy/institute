# Hero reconstruction: stopped, not accepted

The requested img2threejs skill 2.0.0 is installed at `~/.codex/skills/img2threejs`. Its official character animation plugin 0.2.0 and img2 helper CLI are installed too.

The new hero is an isolated **untextured blockout**, not a replacement in the playable game. All geometry was authored from `07-teal-hero.png` and the skill. No prior Blender mesh, rig, texture, script or measurement was reused.

The skill stopped at `max-correction-loops-reached:blockout:3/3`. Silhouette IoU progressed from 0.4165 to 0.7062 to 0.7743 against the admitted front crop. The mandatory minimum is 0.85. The final framing checks pass (aspect delta 0.0179, scale delta 0.0667), but the shape comparison does not. No build pass or finished-asset acceptance has been granted.

Independent visual review rated the current result **3/10 as a finished game asset**, and **5/10 as a proportions/silhouette blockout**. Major gaps: featureless face and rounded detached hood, dome shoulders and tubular limbs, waist/knee separations, mitten hands, rigid-looking cape folds, and a disconnected sword. These require geometry work; later textures cannot resolve them. The requested 8/10 bar is not met.

## Inspect

With the local Vite server running, open `http://localhost:5188/hero-study.html`. The game still uses its existing hero. The separate studio has orbit controls, eight camera presets, diagnostic render passes and part selection.

Latest screenshot: `review/blockout-03/hero-beauty.png`. All capture batches retain screenshots, hashes and failed diagnostics. Raw geometry is also stored as `.json.gz`; decompress beside it before running the skill's geometry scripts from a fresh checkout. Large raw JSON files are ignored, not deleted locally.

## Validation and limits

- TypeScript and production web build pass.
- The final 21 visible meshes pass the sampled self-intersection check (see the raw report for sampled/undecided counts).
- Cloth-specific topology and full-vertex tests are recorded in `cloth-surface-decisions.json`.
- Material extraction scores are heuristic. Gold physical maps and mixed face/hair crops remain unaccepted; see `material-evidence/README.md`.
- Animation clips, rig binding, movement checks, material/lighting passes, final visual acceptance and game integration remain outstanding.
- The existing attachment gate initially counted zero attachments because relevant semantic anchor declarations were absent. That result is not a pass for actual equipment behavior; attachment contracts and measured contact points still need work.

## Resume condition

The installed skill explicitly requires stopping when its local state reports `stopped`. Do not reset the state, remove failed reviews, raise scores, or relax thresholds to make the run pass. Further modeling needs the user's direction on whether to override the fixed correction limit or change the requested workflow.

`bd ready` reports that this repository has no beads database. This status file records the unfinished work without initializing unrelated project infrastructure.
