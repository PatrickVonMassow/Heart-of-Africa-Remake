# Point 276 — the bird's-eye framerate regression: measurements and findings

Measured 23./24.07.2026 on a clean, SOLO machine (single session, warm dev
server, vsync disabled), WebGPU backend, viewport 1440x900, zoom 0.5 — the
reachable default, not a debug wide zoom (CLAUDE.md §7.2, point 172).

## The instruments

| script | what it answers | noise |
| --- | --- | --- |
| `scripts/perf-bench.mjs` | frame time (median/p95/p99) per render config × state, plus spike attribution against the point-272 burst probe | ±1.2 ms run to run |
| `scripts/perf-structure.mjs` | what the renderer SUBMITS per frame (draw calls, triangles, memory) | camera/culling dependent |
| `scripts/perf-breakdown.mjs` | per-system triangle breakdown of the live scene graph | none (counts) |
| `scripts/perf-bisect.sh` | one commit's frame time in the throwaway bench worktree | inherits the bench noise |
| `scripts/perf-lod-experiment.sh` | one terrain-LOD variant, priced for both time and geometry | inherits the bench noise |

MUST-DOs, learned the hard way:
1. **VSync OFF** or every run caps at ~60 fps and hides the true cost.
2. **Warm the server** — the first run against a fresh dev server stalls for
   seconds (p99 ~3200 ms). The bench discards a warm-up pass.
3. **SOLO** — no parallel agent, verify or second session.
4. **Judge structure by COUNTS, timing by REPEATS.** A single timing sample
   carries ±1.2 ms here, which is more than most levers are worth; a scene-graph
   triangle count carries none. Commit-level bisection by timing is therefore
   NOT reliable (a re-measured commit swung 5.70 → 4.60 → 4.40 ms) — the
   regression was found structurally instead.

## The regression is real and it is GEOMETRY

v0.1 (cfc2736, 15.07.) vs main (1f575a4, 23.07.), same harness:

| state | v0.1 | main | delta |
| --- | --- | --- | --- |
| savanna standing | 4.40 ms / 227 fps | 5.60 ms / 179 fps | +1.2 ms |
| desert standing (empty) | 4.20 ms / 238 fps | 5.40 ms / 185 fps | +1.2 ms |
| driving savanna | 6.90 ms / 145 fps | 8.70 ms / 115 fps | +1.8 ms |

The surcharge is the SAME in the empty desert as in the dense savanna, so it is
not wildlife and not content. The scene-graph breakdown (desert, triangles):

| system | v0.1 | main | factor |
| --- | --- | --- | --- |
| terrain chunks | 425 114 | 847 076 | **1.99x** |
| flora / dressing | 107 788 | 260 030 | **2.41x** |
| rivers + water | 11 340 | 44 052 | 3.9x |
| climate (new) | — | 3 610 | new |
| sky | 1 216 | 1 216 | — |

### Where the terrain doubling comes from — exactly

Per-chunk triangle histogram in the Sahara (chunk counts by triangle count):

| segments | tris/chunk | v0.1 | main | refine off |
| --- | --- | --- | --- | --- |
| 20 (far ring) | 960 | 88 | 88 | 88 |
| 28 (mid ring) | 1 792 | 56 | 29 | 56 |
| 56 (near ring) | 6 720 | 25 | 37 | 25 |
| **112 (refined)** | **25 984** | **0** | **15** | **0** |
| terrain total | | 352 832 | 774 848 | 352 832 |

The whole difference is point 209's near-ring refinement (`refinedSegments` in
`src/scenes/travel/terrainLod.ts`): a near chunk that is coastal OR carries more
than `MOUNTAIN_CHUNK_RELIEF_M` (400 m) of relief doubles its segments, which
QUADRUPLES its triangles. The threshold's own comment records that 400 m marks
**60 % of all land chunks** — so the "targeted" refinement is in practice
near-universal. Switching it off reproduces v0.1's histogram exactly.

## What each lever is worth ON THIS MACHINE

| lever | savanna | desert | driving | verdict |
| --- | --- | --- | --- | --- |
| baseline (main) | 5.60 | 5.40 | 8.70 | — |
| TRAA off | 5.80 | 5.30 | 8.10 | no win |
| SSAO off | 5.90 | 5.70 | 8.40 | no win |
| shadows off | 6.30 | 5.40 | 8.50 | no win |
| shadow map half | 5.90 | 5.60 | 8.50 | no win |
| all post off | 5.80 | 5.40 | 8.20 | no win |
| everything off | 5.90 | 5.70 | 8.40 | no win |
| device pixel ratio 2 (4x pixels) | 5.50 | 7.90 | 8.60 | barely moves — not fill-rate bound |
| wildlife behaviour LOD (N1) | — | slower | 9.4 vs 9.1 | no win, parked |
| **terrain refine OFF** | **5.20** | **5.00** | **8.10** | **the only real win: ~0.4-0.6 ms (~8 %)** |
| refine rings 0-2 only | 5.80 | 5.00 | 8.60 | little — the 15 near chunks are the cost |
| flora radius 260 -> 170 | 5.40 | 5.00 | 8.60 | rejected: p99 while driving 12 -> 48 ms |

### Consequences

- **The render features are not the problem.** Everything the debug menu can
  switch off is worth almost nothing here; an F7 "Low Details" mode built out of
  those switches would buy the user nothing on hardware like this.
- **The p99 "hitch" trail was a measurement artifact.** A short 6 s sample once
  showed p99 38 ms; 12 s samples put every config at 12-13 ms with a single
  ~28 ms outlier, and the point-272 burst probe attributes ~0 ms of it to
  terrain/flora rebuilds (terrain max 0.3 ms, flora max 0.6 ms per burst). The
  streaming work is genuinely cheap now.
- **Absolute framerates here are high** (179-238 fps standing, 115 fps driving).
  This headless GPU is NOT geometry-bound, which is exactly why doubling the
  geometry costs it only 8 %. A slower or more geometry-bound GPU can pay far
  more for the same doubling — so the numbers that decide which lever ships must
  come from the USER's real hardware, not from here.

## Therefore: the in-game benchmark (user's request, 24.07.2026)

Measure on the real machine, in the DELIVERED build, deterministically — same
route, same seed, same date, same events, with only the graphics config varying
between runs — and hand back a downloadable report. That is point 277.

### The method it uses (F8, design.md §21.1)

| piece | how |
| --- | --- |
| route | the three states above, same anchors as `perf-bench.mjs`: savanna (-2.5, 34.0) standing, desert (23.0, 15.0) standing, driving out of the savanna |
| configs | baseline, traa-off, ssao-off, shadows-off, shadow-half, post-off, dpr-1, terrain-refine-off, terrain-cap-84, all-off |
| determinism | a seeded PRNG replaces `Math.random` for the run (restored in a `finally`); seed, date, position, travel speed, zoom, journal and the event/deadline switches are reset before EVERY section |
| **fixed step** | R3F's frame clock is pinned (`installFixedClock`): every `useFrame` gets dt = 1/60 s and `elapsedTime` advances once per frame, and each section runs a FIXED FRAME COUNT — so the simulated path, the streaming crossings and every roll are identical across configs and only the wall clock varies |
| warm-up | one discarded pass over the whole route, so the cold caches (terrain geometry, flora, shader compiles) do not land on whichever config runs first |
| metrics | THREE series — **real GPU time** from the WebGPU backend's timestamp queries, the CPU time inside the frame (between R3F's before/after render effects) and the wall-clock frame interval — plus `renderer.info` draw calls/triangles and a scene-graph triangle count per system |
| GPU time | `backend.trackTimestamp = true` for the run (three requests every adapter-supported feature at device creation, so `timestamp-query` is already enabled where the hardware has it), then `renderer.resolveTimestampsAsync('render')` per frame; it returns the summed GPU duration of the last frame in the batch, so a phase collects one sample per resolve round-trip (`gpu.n` in the report). Missing feature or a throwing resolve ⇒ the series is marked unavailable WITH a reason and the run continues |
| terrain levers | module-level runtime overrides in `src/scenes/travel/terrainLod.ts` (`setTerrainRefine`), which change the chunk geometry KEYS and therefore rebuild by themselves; restored after the run |

**Reading the numbers.** A page cannot disable vsync, so a config that is
comfortably fast reads as a flat ~16.7 ms and the wall clock cannot separate the
levers (flagged per row as `vsyncLikely`). That matters more than it sounds: the
regression above is GEOMETRY, i.e. a GPU cost — a config 40 % more expensive on
the GPU moves NEITHER a capped wall clock NOR the CPU time, so a CPU-only report
would say "no difference" for exactly the lever in question. Hence the GPU
series, and hence the report names its own headline (`headline`, also written
into the digest and shown in the result panel):

| headline | when | what it means |
| --- | --- | --- |
| `gpu` | GPU timestamps resolved | read the GPU column — vsync-independent, the real cost of the lever |
| `wall` | no timestamps, wall clock NOT capped | the frame column measures end to end |
| `cpu` | no timestamps AND a capped wall clock | only the CPU column carries information, and the GPU cost is NOT measured — do not read this run as a verdict on a geometry lever |

The headless WebGL 2 lane always lands in the third case, which is why the
in-game run on the user's WebGPU machine is the one that decides.

### First results from the instrument itself (headless WebGPU, 24.07.2026)

Two things showed up the moment the benchmark measured geometry rather than
render features:

1. **The terrain lever really is worth its 2x.** With the refinement off, the
   desert scene graph drops from **847 074 to 425 058** triangles — the v0.1
   histogram of the table above, reproduced live and now switchable at runtime.
   (It also caught its own wiring bug: the first version passed the override
   under a mis-named key, so the lever silently did nothing while every test
   stayed green. The gate now asserts the RENDERED triangle drop, not the
   config object.)
2. **OPEN — the dressing creeps upward over a session.** At a FIXED desert
   anchor, with a fixed seed and a fixed date, the instanced dressing grows
   with every flora rebuild: 235 808 → 327 808 triangles over five round trips
   between two anchors (mesh count constant at 37), and 252 766 → 354 958
   across one full benchmark run. Terrain, water and sky stay bit-stable
   meanwhile, so it is the flora instance counts alone. Reproduced OUTSIDE the
   benchmark (plain debug jumps), so it is the game's own behaviour, not a
   measurement artifact — a growing per-frame cost the longer one plays, and a
   candidate for the same regression family as this document. Not diagnosed
   further here; it needs its own point.
