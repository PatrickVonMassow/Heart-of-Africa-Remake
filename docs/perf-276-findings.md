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
