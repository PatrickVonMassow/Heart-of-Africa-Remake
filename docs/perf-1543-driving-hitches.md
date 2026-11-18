# CPU hitches while driving on medium and high — attribution and fix (point 1543)

Goal: on the savanna-driving route the CPU frame time on medium and high has no
recurring multi-frame spikes: CPU p95 <= 2x CPU median. Low must not get worse.

## The number

"CPU frame time" is the F8 benchmark's `cpuMs` (src/systems/benchmarkRun.ts
`runFrames`): R3F's global before-effect to after-effect, i.e. all `useFrame`
work plus the render submission. The DEV probe measures exactly that window
(`window.__perf.cpuFrames()`, src/scenes/travel/perfProbe.ts) and splits it by
system: every travel-view frame callback books its main-thread time through
`useTimedFrame` (src/render/useTimedFrame.ts → `markFrameWork`,
src/systems/longFrame.ts), node-program builds book as `shader-programs`, and
each frame carries its JS-heap drop (> 0: a GC ran inside it).
`scripts/perf-bench.mjs` prints the attribution per row (`BENCH_PRESET`
selects the level): a spike is a frame above 2x the CPU median, owned by the
system with the most booked ms in it.

## Before — owner reference (real GPU)

F8 benchmark, WebGPU, 1536x960 @ dpr 1.25, build 7050a53, savanna-driving,
CPU median / p95 (ms):

| Preset | Median | p95 | p95 / median | Max |
| --- | --- | --- | --- | --- |
| low | 3.8 | 11.4 | 3.0 | — |
| medium | 15.6 | 41.0 | 2.6 | 142 |
| high | 21.3 | 45.9 | 2.2 | — |

(The point text's older reference: medium 8.8 / 41.2, high 12.2 / 52.4 ms on
the user's notebook.)

## Attribution (headless, this container)

Environment: headless Chrome with WebGPU (renderer backend reported `webgpu`),
1440x900 @ dpr 1, vsync off, savanna-driving from (-2.5, 34.0) at travel speed
5.6 after a warm-up drive elsewhere (fresh ground, as F8). The headless GPU is
not the user's; the MAIN-THREAD split is what this measures. Low cannot be
measured here: on headless WebGPU it fails at start-up on main as well
(`createBuffer ... too large`, environment), and the WebGL 2 software path
renders ~0.3 fps.

First drive, build 2af9de1 (probe only, no fix), medium, 20 s:
CPU median 4.0 ms, p95 12.7 ms (3.2x), max 85.7 ms, 151 spike frames (> 2x median).

| System | Spikes owned | Max ms in a spike | Share of spike time |
| --- | --- | --- | --- |
| terrain-stream | 107 | 60.9 | 0.69 |
| wildlife | 25 | 10.3 | 0.11 |
| unattributed | 11 | — | — |
| render-submit | 5 | 31.0 | 0.06 |
| travel-core | 2 | 14.3 | 0.02 |
| gc (no owner, heap dropped) | 1 | — | — |
| flora-stream | 0 | 0.9 | 0.00 |
| unbooked rest of spike frames | — | 16.0 | 0.11 |

GC ran inside spike frames (heap drop up to 192 MB once) but owned only one.

Inside terrain-stream (temporary per-build marks, medium, 20 s):

| Chunk build | Count | Mean ms | Max ms |
| --- | --- | --- | --- |
| 112 segments (refined coast/mountain) | 41 | 37.1 | 79.5 |
| 56 segments | 80 | 8.4 | 16.7 |
| 28 segments | 47 | 2.5 | 5.7 |
| 20 segments | 69 | 1.2 | 4.8 |
| window planning (crossing / prefetch) | 4 / 6 | 0.2 | 0.3 |

Cause: the terrain build queue drained whole chunk builds under a 5 ms budget,
but one refined 112-segment build (~13k `sampleTerrain` samples) is atomic, so
every refined chunk on new ground overran its frame by tens of ms. Planning,
cache eviction, flora and shader-program builds were not material.

## Fix

- `ChunkGeometryBuild` (src/scenes/travel/TravelScene.tsx): the chunk build is
  resumable — height-grid rows, then vertex rows, then the stitch/index/skirt
  finish — and yields once a deadline passes (at least one unit per step).
  Output is identical to the one-shot build (Vitest compares every attribute).
- `drainSlicedQueue` (src/scenes/travel/terrainQueue.ts) replaces the atomic
  drain: spends the per-frame budget across sliced builds; a hole job (chunk
  without stand-in) preempts a LOD refinement in flight, which is parked
  (max 4) and resumed, so near holes keep their priority (no pop-in change:
  stand-ins still cover re-keyed chunks, the heading prefetch still builds
  ahead).
- Budget: `terrainBuildBudgetMs` per preset in src/config/quality.ts,
  3 ms on all levels, calibratable.

## After (headless, same setup)

| Build | Preset | CPU median | p95 | p95 / median | Max |
| --- | --- | --- | --- | --- | --- |
| before 2af9de1 | medium | 4.7 | 20.9 | 4.45 | 65.5 |
| before 2af9de1 | medium | 3.6 | 16.0 | 4.44 | 92.5 |
| before 2af9de1 | high (12 s) | 4.1 | 19.6 | 4.78 | 80.7 |
| after 8b440c1 | medium | 5.7 | 9.8 | 1.72 | 38.3 |
| after 8b440c1 | medium | 6.0 | 9.5 | 1.58 | 50.8 |
| after 8b440c1 | medium | 3.4 | 6.5 | 1.91 | 21.1 |
| after 8b440c1 | high (8 s) | 6.5 | 9.8 | 1.51 | 20.0 |

After the fix terrain-stream no longer owns the spikes; the remaining spike
time is spread over wildlife (Herds frame: collision, elephant collider,
water drama, streaming — single frames, no recurring burst), render-submit and
travel-core. The median rises (the build work now runs as a steady few ms per
frame instead of bursts); p95 and max fall.

Caveat: headless numbers only. The acceptance number is the owner's F8
benchmark on the real notebook (WebGPU, medium and high, savanna-driving).
