# Point 276 — framerate work: benchmarking method + findings so far

Durable handoff (23.07.2026 evening). The earlier measurements were run while a
PARALLEL batch session was active (two Claude sessions auto-resumed the batch),
so their numbers are **contaminated and discarded**. After a clean single-session
restart, re-run the whole series from scratch, SOLO.

## The benchmark tool
`scripts/perf-bench.mjs` — drives the game on the requested backend
(`VERIFY_GL=webgpu` is the user's), jumps to three reachable states (dense East
savanna, empty desert, driving) at zoom 0.5, and samples per-frame time via a
self-contained rAF loop.

MUST-DO for meaningful numbers (learned the hard way):
1. **VSync OFF** — `launchBenchBrowser()` must pass
   `--disable-gpu-vsync --disable-frame-rate-limit`. Otherwise every run caps at
   ~60 fps (16.7 ms) and masks the true per-frame cost; a capped and an uncapped
   run are NOT comparable.
2. **WARM the server** — the FIRST bench run against a freshly-started dev server
   has multi-second warm-up stalls (p99 ~3200 ms, console errors). Discard a
   warm-up pass (or use the 2nd run). Always compare warm-to-warm.
3. **SOLO** — nothing else on the machine (no parallel agents/verifies/sessions),
   or the CPU-bound parts skew.

## Findings so far (to CONFIRM cleanly after restart)
- Warm + vsync-off, WebGPU: standing ~5–6 ms (~170 fps), **driving-savanna
  ~9.1 ms (~110 fps)**. (The earlier "80 fps driving" was a cold-server artifact.)
- **N1 wildlife behaviour-LOD** (branch `feat/276-wildlife-lod`, picture-neutral by
  construction, tested, gates green) gave **NO measurable win** here (9.4 vs 9.1 ms
  driving) and is slightly slower in the empty desert (its pre-pass overhead with no
  wildlife to throttle). => this machine is **GPU/STREAMING-bound while driving, not
  wildlife-CPU-bound**. The +3 ms driving cost over standing is **streaming**
  (terrain/flora rebuild on movement), not the animal loop.
- Implication: the "gratis" CPU levers (N1–N4) are picture-neutral but won't raise
  FPS on this GPU-bound machine. Park N1 (keep the branch; it may help slow CPUs /
  feed Low-Details, but it is NOT an always-on win). The real wins are GPU-side.

## The comprehensive sweep to run (autonomous, ~10 h, deliver options)
1. Extend perf-bench to a **config sweep**: one warm browser, and for each config
   apply a set of debug-flag overrides via `window.__ui.getState()` then measure the
   3 points. Output a table (config × point → fps/dt/p99). No code changes needed to
   bisect the GPU cost — the debug store already has `traaEnabled`, `ssaoEnabled`,
   `shadowsEnabled`, etc. Configs: baseline, TRAA off, SSAO off, shadows off, all-post
   off, and combinations — to attribute the GPU cost to each feature.
2. Measure the **streaming/driving** cost separately (the p99 spikes while moving) —
   what a further terrain/flora streaming tune or a coarser refine would save.
3. Build + measure the **Low-Details F7 mode** (point 276 Part B): dpr cap to 1
   (App.tsx — likely the single biggest GPU lever, NOT a debug flag so it needs code),
   shadows 3→2 + half-res + off, post off, flora fog-radius ×0.55, terrain refine off,
   water calm, weather reduced — each measured for its FPS gain and its visible cost.
4. Deliver a full results table + ranked options as a **dashboard "Von dir zu klären"
   card** (the user reviews it; no mid-run questions).

Baseline scratch numbers + lessons also in `scratchpad/perf-baseline.txt` (but Temp
may be cleared on a PC restart — this doc is the durable copy).
