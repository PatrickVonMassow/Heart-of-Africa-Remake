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

## Owner rejection (19.11.2026, real GPU)

F8 benchmark (`node scripts/perf-f8-bench.mjs`, WebGPU, 1536x960 @ dpr 1.25,
real AMD GPU), savanna-driving CPU median / p95 (ratio), before 7050a53 →
after 7935956:

| Preset | Before | After |
| --- | --- | --- |
| low | 3.8 / 11.4 (3.0) | 5.6 / 10.9 (1.95) — median worse, forbidden |
| medium | 15.6 / 41.0 (2.63) | 15.9 / 46.1 (2.90) |
| high | 21.3 / 45.9 (2.15) | 22.3 / 47.2 (2.12) |

Only max improved (142 → 63 ms). Conclusion: the headless drive above does not
describe the F8 `cpu` number. Next step: attribute the F8 savanna-driving phase
itself (fixed timestep, its own route) with the per-system probe running inside
the F8 run, and make low not worse than before.

## Round 2 — F8-phase attribution (in progress)

What the F8 `cpu` number is (src/systems/benchmarkRun.ts, src/systems/benchmark.ts):
per phase `resetWorld` (fixed seed/day, `debugJumpTo` the anchor), 80 settle
frames (discarded) and 150 measured frames on the fixed 1/60 s clock at travel
speed 5.6 — the measured drive covers only ~14 wu (less than one 24-wu chunk),
and every config/preset pass repeats the same route from the same anchor after
a jump from the desert phase. `cpuMs` = R3F before-effect → after-effect of each
frame. p95 over 150 frames is the 8th-worst frame, so a handful of slow frames
per phase decide it.

Consequence: the headless free drive of round 1 (20 s, fresh ground, several
crossings) measured a different workload. In the F8 phase the terrain window
is largely cached from the earlier passes, so chunk building is unlikely to be
the p95 owner there; the sliced builds instead add up to 3 ms to many frames
while the prefetch queue drains, which fits the raised low median.

Method now: a temporary DEV hook in `runPhase` stores, per measured phase, the
F8 samples next to the probe's per-system split of the same frames
(`window.__f8detail`), and the F8 run is driven headless (WebGPU) with
`?bench=short` first, then full.

Harness findings (01:55): headless WebGPU in this container emits ~100
`OperationError: Instance dropped in popErrorScope` page errors per second;
Vite 8's dev server forwards client console output and stalls under that flood
(page loads time out after one run). F8 with `?bench=short` started this way
returns a report within 15 s with no measured phase recorded (report flagged
`aborted` key present; contents not yet read). Next: a development-mode build
served by `vite preview` (no console forwarding), same DEV probe hook.

Last headless attempt (development build via `vite preview`, adapter
`google swiftshader`): the short F8 run ends `ABORTED` with no measured phase
and no GPU timestamps. Per owner decision (19.11.2026) the headless F8 harness
is dropped; the owner runs the split on the real GPU with
`scripts/perf-f8-detail.mjs` (below). No per-system split of the F8 phase
exists yet — the F8 attribution is OPEN.

## Round 2 — delivered

- DEV hook: `runPhase` (src/systems/benchmarkRun.ts) stores per phase
  `window.__f8detail[] = { config, phase, measured, cpuMs[], work[], heapDropMb[] }`
  — the F8 samples next to the probe's per-system bookings of the same frames.
- `scripts/perf-f8-detail.mjs` (core: `perf-f8-detail-core.mjs`, Vitest):
  serves nothing; against a DEV server it presses F8, waits for the report and
  prints per measured pass of a phase (default savanna-driving; `--short`,
  `--phase`, `--json`) the CPU median/p95 and each system's share of the 8 worst
  frames (`unbooked` = render internals not wrapped, GC, browser work).
  Owner command: `npm run dev`, then
  `BASE_URL=http://localhost:5173/ VERIFY_GL=webgpu node scripts/perf-f8-detail.mjs`.
  Note: it measures a DEV build (probe and wrappers active), not the preview
  build of `perf-f8-bench.mjs`.
- Low fix: new preset value `terrainBuildSliced` — off on low with the
  pre-change 5 ms budget, so low builds whole chunks exactly as before the
  slicing (its unrefined chunks fit the budget); medium/high keep slicing at
  3 ms. Chosen over "no budget while the prefetch queue holds only
  refinements": that would still slice the window queue on low, and low's
  regression came from spreading work, not from refinements (low has none).
