# Maximum QA — the maximum quality-assurance pass

A single, repeatable, **token-frugal** quality gate that bundles every QA
technique the project has built up (points 173, 184, 195–200, 203/203A, 204,
205, 207). It is the pass to run before promoting a build to a public demo.

**No ultracode / no large agent fan-outs.** Ultracode workflows burn the
session/weekly token budget in minutes. Maximum QA runs as ordinary inline
work: sequential checks, the driven visual sweep inspected in the main loop, and
at most a *single* model-diverse audit pass by the OTHER vendor (`scripts/review-sol.mjs`
/ `scripts/ask-sol.mjs --kind audit`) whose findings are always harvested and verified inline. See the memory
`workflows-token-budget`.

Run the phases **in the order below**. Each real finding becomes its own atomic
TASKS point + commit (append at the end of the queue, per
`new-tasks-append-and-defer`). Fix everything found; the final closing (Phase 8)
must pass clean before any tag.

## Why this order

- **Coherence first (Phase 1), because it can REBUILD the game.** The
  world/functionality audit produces design changes and objective fixes; running
  the expensive detection (bug-finder, visual sweep, fuzzing, soak) before the
  rebuild would test a state that is about to change, and the golden-image
  baseline would be baked stale. So the coherence pass — and the fixes it agrees
  with the user — come first, and *every other phase then tests the rebuilt
  state* (user decision 21.07.2026).
- **Baseline next (Phase 2):** cheaply confirm the rebuild left the tree green
  before investing in deep detection.
- **Invariants armed early (Phase 3):** they are a force multiplier — once armed,
  every later automated phase AND every manual play session becomes a detector,
  so arm/extend them before the heavy detection phases.
- **WebGPU infrastructure before the sweeps (Phase 4):** some bugs are
  WebGPU-only (crown jitter, silhouette float), so the two-backend wiring must be
  in place before the visual sweep and the closing, or those phases silently miss
  a whole class.
- **Code audit before the finder (Phase 5):** a fresh-model read of the rebuilt
  code surfaces bugs the automated finder is not shaped to catch; fixing them
  first means the finder and sweep validate a cleaner state.
- **Finder, then the extra methods (Phases 6–7):** the finder is the primary net;
  the golden-image baseline (7 ii) can only be baked once the game is
  coherence- and finder-stable, so the differential/fuzz/soak methods layer on
  after it.
- **Closing last (Phase 8):** the full 3×-flake-free regression on both backends
  proves the fully-fixed state, immediately before the tag.

---

## Phase 1 — World & functionality coherence audit (FIRST — may rebuild the game)
- A model-diverse read of design.md + the §7.1 systems by the other vendor: does each
  system have a PURPOSE, real USE in the loop, COHERENCE with the others,
  SETTING FIT (~1890 accuracy), and WORTH? Plus world plausibility (ecology,
  economy, exploration, survival, cross-system loop).
- **Design judgments are the USER's call** — write them up and DISCUSS; only
  clear objective incoherences (a predator with no prey, an item with no effect,
  two contradictory rules) are filed as fix-points.
- Apply the agreed objective fixes and user-decided design changes now (the
  point-208 style of work), updating design.md/CLAUDE.md. **This is where the
  game may be rebuilt**; everything below tests the rebuilt state. Extend the
  in-game invariant set (Phase 3) for any system this rebuild changes.

## Phase 2 — Baseline regression (confirm the rebuild is green)
- `npm run build`, `npm run lint` (oxlint, zero errors/warnings), `npm audit`
  (zero CVEs), `npm run test:unit` (the fast Vitest layer) — all green.
- Run the LARGE browser regression (`npm test`) once to establish the baseline
  for the rebuilt state. Record any rotating staging flakes separately (they are
  not findings; a clean single retry confirms them).

## Phase 3 — In-game invariant assertions (the force multiplier, 207 i)
- Ensure the dev-only `devAssert` channel is armed and its invariants current:
  no animal/prop rendered below its own ground (the point-203A anchoring
  tripwire, judged at the logical render spot), no NaN/Infinity position, every
  started drama carries a deadline (I4), a lake sheet never below its bed, herd
  counts bounded, nothing standing on impassable ocean.
- A violation fires `console.error` → every suite's console-error gate fails, so
  every run and every manual play session becomes a detector. Extend the
  invariant set for any system the Phase-1 rebuild changed.

## Phase 4 — WebGPU coverage universal (infrastructure for the sweeps, 204)
- Every render/pixel suite calls `assertBackend` so it cannot silently fall back
  to WebGL2 under `VERIFY_GL=webgpu`.
- Wire the LARGE tier to run the render suites on BOTH backends (WebGL2 and the
  real system-Chrome WebGPU lane); touch/voice stay WebGL2-only (the documented
  headless exception). Resolve any WebGPU-only reds. In place now so the visual
  sweep (Phase 6) and the closing (Phase 8) genuinely cover both backends.

## Phase 5 — Code audit with model diversity
- Sweep the subsystems (systems/state, travel/world, render/ui/i18n) of the
  rebuilt code for test gaps AND real bugs, reading it against the design.
- Mix in a **different model than the recent author** for a blind pass — the
  cross-vendor default, so Sol reads Anthropic-authored code and Claude reads
  Sol's (CLAUDE.md §6; memory `audit-with-model-diversity`). ONE pass,
  harvested and every finding re-verified inline before it is filed.
- **Leak & accumulation code-review class (point 285, prong A):** the same
  fresh-model pass explicitly sweeps for the dispose/prune/re-seed/effect-cleanup
  bug family — three.js resources created but never disposed (`renderer.info.memory`
  must be flat at a fixed state), module-level Map/Set/array caches that only grow,
  streaming/respawn that re-adds without truncating the previous fill (the point-278
  class), and React effects with missing/wrong cleanup. Each finding gets a pure
  convergence test that FAILS on the old behaviour.
- File each confirmed bug as its own point; add the missing tests.

## Phase 6 — The systematic bug-finder (203)
Cheap automated classes first, then the visual sweep:
- **(A) Anchoring** — rendered body vs. terrain at its own anchor (buried/
  floating), incl. posed wing/limb extents and water-surface occupants; static
  water bodies vs. their beds.
- **(B) Liveness** — no actor frozen/oscillating in a live state past a
  deadline; no predator idling within touch range of live prey.
- **(D) Cross-system / targeting** — each emergent system owns a unique actor
  (no two claim one); every reaction keyed to its correct trigger.
- **(E) Visible-effect** ("the picture, not the uniform") — each state toggle
  (season, rain, flood, harmattan, fire, dress, bleach) changes the RENDERED
  frame in pixels where it should and does not leak where it must not.
- **(F–N) cheap extras** — facing tracks velocity; scale/proportion in band;
  no static-object interpenetration; no black/magenta pixels or z-fight; river
  continuity/monotonic descent; no teleport/frozen-phase.
- **(C) The driven visual filmstrip sweep — the PRIMARY net, inspected by me.**
  A principled sample (not the full cross product) over the dimensions:
  location, situation/drama, month, year 1890–1895, **backend (WebGL2 + real
  WebGPU)**, movement (static vs. a driven filmstrip), **zoom** (achievable
  0.25–0.5 AND the unlocked wide debug zooms), **scene** (bird's-eye travel AND
  first-person settlements + the transition), player state (canoe ridden/dragged,
  wounded, swimming), heading. Sampling = cost-split (dense on the cheap
  automated axes, sparse-but-smart on my visual inspection) + causally-located
  effects at their known coordinates (peak month + off month + one transition) +
  a pairwise (2-wise) covering array over the generic dimensions + risk-weighted
  over hot spots (coasts, water edges, dramas, recently-changed code) with
  adaptive densification around any anomaly. At each spot DRIVE and let dramas
  play out; capture a temporal filmstrip; I inspect every frame and the deltas.
  Judge "in view" by projecting to the frame (`__camera.onScreen`/`ndc`), never
  an assumed radius (memory `test-realistic-zoom`).
  KEEP THE EYES OPEN FOR "LOOKS-WRONG" ODDITIES (user directive 21.07.2026): the
  inspection must catch things that are functionally FINE but look WEIRD to a
  human — the aesthetic/plausibility class (a stepped coastline, a sea-arm poking
  into the desert, a river ending in a beach gap, a notch in the water, jagged
  edges/seams/holes, wrong scale or colour). These pass every functional check,
  so only the eye finds them; ask "does this look right to a human?" on every
  frame and file each real one as its own point.

## Phase 7 — Additional finding methods (207 ii–vii)
- **(ii) Golden-image differential** — bake the baseline of the sweep frames NOW
  (the game is coherence- and finder-stable); future runs diff against it and
  flag unintended pixel changes.
- **(iii) Property fuzzing + distribution checks** — thousands of random states
  through the cheap invariants; assert distributions (hunt directions, calf
  ratios, outcomes, spawn counts) are not degenerate.
- **(iv) Soak/endurance — the leak & accumulation runtime harness (point 285,
  prong B).** A long fast-forward sim with the invariants live, driving the game
  over TIME (repeated jumps/round-trips, long driving, repeated place enter/leave
  mount-unmount cycles) and asserting the measured quantities CONVERGE rather than
  grow: scene-graph triangle/mesh counts per system, `renderer.info.memory`
  geometries/textures, `performance.memory` JS heap, instanced and listener counts.
  A monotonic rise beyond a small tolerance over N cycles is a finding (this is what
  would have caught point 278 — the count grew while every one-moment test passed).
  A re-runnable script (`scripts/verify/leaks.mjs` or the documented harness), on
  both backends where the metric is backend-relevant.
- **(v) Metamorphic relations** — A→B→A returns to the same state (the point-278
  witness: same anchor, same seed, same instance count however long the session ran);
  the same scene at two zooms shows the same animals; month X and X+12 match;
  leave-and-re-enter is stable.
- **(vi) Automated player-journey** — many seeds/strategies; the goal stays
  reachable, the hint cascade leads there, no softlock, the deadline beatable.
- **(vii) Console/telemetry mining** — scan every run's console for warnings /
  NaN / shader-recompile / dropped-frame / deprecation noise; fail on new ones.

## Phase 8 — Final closing
- Fix every finding from Phases 1–7 (each its own commit, pushed).
- Dead-code / stale-doc / stale-comment cleanup as separate commits; audit every
  `.md` for accreted cruft (preserve section numbers). Keep the implementation
  sections current (`implementation-sections-current`).
- **The cleanup runs BLIND-PARALLEL (user 11.08.2026, point 631; closing step
  `cleanup-blind-parallel`).** What is dead and what is stale is an ENUMERATING
  stage, so it takes the divergent mode of CLAUDE.md §6: both models work from the
  same inputs to their own complete result, neither seeing the other's before it is
  done; the union is deduplicated BY MEANING, marks what only one side found, and
  drops nothing for being unusual. A reviewer handed a finished list checks that
  list — which is exactly the wrong instrument for the legacy nobody thought of.
- **Graphics detail-level doc current (user 24.07.2026):** explicitly confirm
  `docs/graphics-detail-levels.md` still matches `QUALITY_PRESETS`. The
  `src/config/qualityDoc.test.ts` sync test enforces it on every Vitest run (a
  green regression proves it), but name the check here so a preset/doc drift is
  never assumed away.
- Full regression again (closing step `regression-after-cleanup`): build + lint +
  audit + Vitest + the LARGE browser set on BOTH backends, **3× flake-free** (a
  single retry may clear a rotating staging flake; a persistent fail is a real
  regression). It must come AFTER the last cleanup commit, and the guard checks
  that. The evidence names either the commit being tagged, written as `on <sha>`
  so prose cannot be mistaken for it — a run on it tests
  exactly the state that will be tagged, which is the point of running it again —
  or a time lying after the youngest cleanup step, where the EARLIEST time it names
  decides and none may lie after the moment it was written down. The record times
  must also run in the sequence's own order (first regression before the cleanup,
  second after it), and the two regressions must be two RUNS, not one evidence text
  used twice. A tag would otherwise carry changes nothing ever tested.
- **Cross-browser & mobile smoke at `thorough` depth** (point 213): the
  `crossbrowser.mjs` functional smoke on Firefox + WebKit (desktop) AND the touch
  layer on WebKit-iOS + Chromium-Android (mobile/tablet) — NEVER the whole suite
  per engine (that multiplies the runtime by the engine count), only the tiered
  core-flow subset. Skips gracefully if the engines are not installed.

## Phase 9 — Tag & publish the demo (binding release mechanism, user 24.07.2026)
- **Preconditions, both required before ANY version tag:** (1) the full closing
  run (Phase 8 — LARGE regression on BOTH backends, flake-free) is green on the
  exact commit; (2) the user has given explicit approval for THIS tag (per
  `tags-only-on-request`). No tag without both.
- **ENFORCED (points 306/631):** the closing checklist is machine-checked — the
  PreToolUse guard `scripts/closing-guard.mjs` DENIES the tag/poc create-or-push
  until EVERY closing step (Phase 8, incl. the dead-code/stale-doc/stale-comment
  cleanup + `.md` audit, its blind-parallel form, and the second regression after
  it — whose ORDER is checked, not merely its presence) is recorded done for the
  commit
  (`node scripts/closing-guard.mjs --status` / `--step <id> --evidence "…"`). A
  closing can no longer silently skip a step, which is what happened at v0.2.
  The same checklist gates the OTHER release act: the `[ ]`→`[x]` TICK of a point
  whose own spec delivers a closing (the point-224 shape) is denied on the
  work-order edit while a step is unrecorded — the tick IS the machine-readable
  "the closing is done" claim, and at v0.2 it was made while the cleanup had
  never run. A step the user expressly waives is recorded AS the waiver, naming
  his decision, so the waiver leaves a trace instead of a gap.
- Increment the trailing version digit (v0.1 → v0.2 → v0.3, …).
- Tag the release, and **MOVE the `poc` tag to the SAME commit** — `poc` always
  mirrors the NEWEST version tag (user decision 24.07.2026), playable at
  `…/Heart-of-Africa-Remake/poc/`. Both `/<version>/` and `/poc/` are served (the
  deploy workflow enumerates every `v*` tag + `poc` dynamically).
- The `/poc/` and `/<version>/` rebuild does NOT trigger on a tag push — after the
  tag moves, run the deploy (`workflow_dispatch`) or land a `main` push AFTER the
  tags, then VERIFY both URLs serve the new state. Then freeze.

---

## Keep the retrospective current — the refresh script + the currency guard

The collaboration retrospective (`docs/analysis_de/retrospektive-zusammenarbeit.md`,
git-ignored, German) records the recurring problem classes and their hardened
solutions. Its own lesson #1 — reminders do not keep documents current, only
enforcement does — applies to the document itself, so its currency is
**enforced**:

- **`scripts/retro-refresh.mjs`** scans the durable problem/solution-history
  sources — the feedback/project memories in the project memory dir, the
  guard/hook scripts in `scripts/` (each guard = a hardened solution), the git
  revert trail, and the process/meta TASKS points — and regenerates the
  marker-delimited `<!-- AUTO-GENERATED:START/END -->` section of the doc (a
  machine-maintained table: problem class, #attempts, heuristic severity,
  matching guard measure, status), recording a sources fingerprint + a
  "last refreshed" timestamp. The analysis prose outside the markers is never
  touched; an absent doc gets a minimal skeleton.
- **`scripts/retro-currency-guard.mjs`** (Stop hook) recomputes the
  fingerprint at every turn end and BLOCKS while it differs from the doc's
  recorded one — a new/edited memory, a new guard, a fresh revert or a
  process TASKS change forces the refresh **plus a review whether a NEW
  problem class needs its own prose paragraph** before the turn can end.
  No-ops when the doc is absent or `.claude/batch-paused` exists; stands down
  for non-owner sessions; fail-OPEN on any internal error.
- Shared logic: `scripts/retro-core.mjs` (pure, Vitest-covered in
  `scripts/retro-core.test.mjs`) + `scripts/retro-sources.mjs` (the one
  fs/git collector both scripts use, so their fingerprints can never drift).
