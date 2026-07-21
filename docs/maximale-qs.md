# Maximale QS — the maximum quality-assurance pass

A single, repeatable, **token-frugal** quality gate that bundles every QA
technique the project has built up (points 173, 184, 195–200, 203/203A, 204,
205, 207). It is the pass to run before promoting a build to a public demo.

**No ultracode / no large agent fan-outs.** Ultracode workflows burn the
session/weekly token budget in minutes. Maximale QS runs as ordinary inline
work: sequential checks, the driven visual sweep inspected in the main loop, and
at most a *single* background subagent for model-diverse audit (Fable vs. the
author) whose findings are always harvested and verified inline. See the memory
`workflows-token-budget`.

Run the phases in order. Each real finding becomes its own atomic TASKS point +
commit (append at the end of the queue, per `new-tasks-append-and-defer`). Fix
everything found, then the closing (Phase 8) must pass clean before a tag.

---

## Phase 1 — Baseline regression
- `npm run build`, `npm run lint` (oxlint, zero errors/warnings), `npm audit`
  (zero CVEs), `npm run test:unit` (the fast Vitest layer) — all green.
- Run the LARGE browser regression (`npm test`) once to establish the baseline.
  Record any rotating staging flakes separately (they are not findings; a clean
  single retry confirms them).

## Phase 2 — Code audit with model diversity
- Sweep the subsystems (systems/state, travel/world, render/ui/i18n) for test
  gaps AND real bugs, reading the code against the design.
- Mix in a **different model than the recent author** for a blind pass (e.g. a
  single Fable subagent when the batch runs on Opus, or vice versa) — fresh
  blind spots find more (memory `audit-with-model-diversity`). ONE agent,
  harvested and every finding re-verified inline before it is filed.
- File each confirmed bug as its own point; add the missing tests.

## Phase 3 — In-game invariant assertions (the force multiplier, 207 i)
- Ensure the dev-only `devAssert` channel is armed and its invariants current:
  no animal/prop rendered below its own ground (the point-203A anchoring
  tripwire, judged at the logical render spot), no NaN/Infinity position, every
  started drama carries a deadline (I4), a lake sheet never below its bed, herd
  counts bounded, nothing standing on impassable ocean.
- A violation fires `console.error` → every suite's console-error gate fails, so
  every run and every manual play session becomes a detector. Extend the
  invariant set opportunistically as systems change.

## Phase 4 — The systematic bug-finder (203)
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

## Phase 5 — Additional finding methods (207 ii–vii)
- **(ii) Golden-image differential** — diff the sweep frames against a baked
  baseline; flag unintended pixel changes.
- **(iii) Property fuzzing + distribution checks** — thousands of random states
  through the cheap invariants; assert distributions (hunt directions, calf
  ratios, outcomes, spawn counts) are not degenerate.
- **(iv) Soak/endurance** — a long fast-forward sim with the invariants live;
  watch for leaks, herd ballooning, drama accumulation, slowdown, drift.
- **(v) Metamorphic relations** — A→B→A returns to the same state; the same
  scene at two zooms shows the same animals; month X and X+12 match;
  leave-and-re-enter is stable.
- **(vi) Automated player-journey** — many seeds/strategies; the goal stays
  reachable, the hint cascade leads there, no softlock, the deadline beatable.
- **(vii) Console/telemetry mining** — scan every run's console for warnings /
  NaN / shader-recompile / dropped-frame / deprecation noise; fail on new ones.

## Phase 6 — WebGPU coverage universal (204)
- Every render/pixel suite calls `assertBackend` so it cannot silently fall back
  to WebGL2 under `VERIFY_GL=webgpu`.
- Run the render suites on BOTH backends (WebGL2 and the real system-Chrome
  WebGPU lane); touch/voice stay WebGL2-only (the documented headless
  exception). Resolve any WebGPU-only reds.

## Phase 7 — World & functionality plausibility audit (205)
- A model-diverse (Fable-lens) read of design.md + the §7.1 systems: does each
  system have a PURPOSE, real USE in the loop, COHERENCE with the others,
  SETTING FIT (~1890 accuracy), and WORTH? Plus world plausibility (ecology,
  economy, exploration, survival, cross-system loop).
- **Design judgments are the USER's call** — write them up and DISCUSS; only
  clear objective incoherences (a predator with no prey, an item with no effect,
  two contradictory rules) are filed as fix-points.

## Phase 8 — Final closing
- Fix every finding from Phases 1–7 (each its own commit, pushed).
- Dead-code / stale-doc / stale-comment cleanup as separate commits; audit every
  `.md` for accreted cruft (preserve section numbers). Keep the implementation
  sections current (`implementation-sections-current`).
- Full regression again: build + lint + audit + Vitest + the LARGE browser set
  on BOTH backends, **3× flake-free** (a single retry may clear a rotating
  staging flake; a persistent fail is a real regression).

## Phase 9 — Tag & publish the demo (only on an explicit "new demo" instruction)
- Increment the trailing version digit (v0.2 → v0.3, etc.).
- Tag the release like the prior tags, build, and publish to GitHub Pages at
  `https://patrickvonmassow.github.io/Heart-of-Africa-Remake/<version>/` (same
  wiring as the earlier `/v0.1/`, `/poc/` pages), then freeze.
- Per `tags-only-on-request`: only tag/publish on the user's explicit demo
  instruction; hold the final tag for the user unless told to publish it.
