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

## Round 3 — owner F8 split on the real GPU (19.11.2026)

`scripts/perf-f8-detail.mjs` at db8673c, WebGPU, AMD notebook GPU,
1536x960 @ dpr 1.25, dev server, savanna-driving:

| Pass | CPU median | p95 | p95 / median | Worst 8 frames |
| --- | --- | --- | --- | --- |
| medium-preset | 13.9 | 45.5 | 3.27 | all 45-51 ms (a plateau) |
| high-preset | 20.2 | 36.0 | 1.78 | — |
| low-preset | 4.8 | 8.5 | 1.77 | — |

Share of the medium worst-8 CPU time: render-submit 335 ms = 0.88,
terrain-stream 0.06, unbooked 0.02, wildlife 0.02. The baseline config shows
the same pattern. Conclusion: the p95 owner on the real GPU is inside
`renderer.render` (the post pipeline's render in `Effects`), not terrain.
Next: split render-submit (shadow cascades, main pass, post/TRAA; new
pipelines/programs per frame; any readback/query that waits on the GPU).

## Round 4 — owner F8 split inside render-submit (c5f2f94, real GPU)

WebGPU, AMD notebook, 1536x960 @ dpr 1.25, dev server, full mode,
savanna-driving. CPU median / p95 (ratio); shares of the worst-8 CPU time:

| Pass | Median / p95 (ratio) | Inside render-submit (worst 8) |
| --- | --- | --- |
| medium-preset | 14.2 / 47.6 (3.35), max 1134 (one first-sight frame) | render-submit 0.97; gpu:write-buffer 0.92, render:shadow 0.91, render:main 0.04 |
| high-preset | 20.0 / 33.7 (1.68) | gpu:write-buffer 0.75, render:main 0.53, render:shadow 0.29 |
| low-preset | 4.6 / 12.8 (2.78) | terrain-stream 0.56, shader-programs 0.13, render:main 0.25 |
| baseline | 19.8 / 31.8 | gpu:write-buffer 0.68 |
| shadows-off | 14.2 / 40.6 (2.86) | plateau |
| post-off | 17.0 / 37.3 | plateau |
| all-off | 11.3 / 38.3 | — |

Lowest p95: terrain-cap-84 33.5, climate-haze-off 30.2. The worst frames are a
45-55 ms plateau, almost entirely `queue.writeBuffer` inside `renderer.render`
(on medium inside the shadow pass, the first draw of the frame that meets the
dirty attribute; on high inside the main pass). Owner: a large buffer upload
recurring every few frames.

## Round 4 — delivered (d464d35 … f9b5171)

- Upload booking (src/render/renderSplitWatch.ts): every attribute upload
  through the WebGPU backend's attribute utils is booked; uploads >= 256 KB as
  `gpu:upload <object>.<attribute> <MB>`, naming the scene object and attribute
  whose array they write (instance matrices, instance colours, geometry
  attributes, index), smaller ones as `gpu:upload small`. Armed lazily on the
  first render (the backend initialises asynchronously). `perf-f8-detail.mjs`
  lists them under "inside render-submit".
- Headless check: the hook is installed, but in this container's headless
  WebGPU (SwiftShader) no attribute upload and no `queue.writeBuffer` falls into
  the measured frame window while driving, so the real-GPU plateau cannot be
  reproduced here. The owner's next F8-detail run names the buffer.
- Candidate fix (f9b5171, unconfirmed): a flora fill swap set `needsUpdate` on
  every species' instance matrix and season tint, re-uploading each buffer's
  whole capacity; it now marks an update range over the live instances only
  (`markInstancesForUpload`, src/render/instanceUpload.ts, Vitest). Three's
  InstanceNode forwards the source ranges to its interleaved buffer, so the
  WebGPU writeBuffer shrinks to the drawn instances. A swap happens once per
  fill (every 16 wu), which fits "recurring every few frames" only partly; the
  named upload booking decides.

## Round 5 — owner F8 detail at d464d35 and f9b5171 (real GPU)

Same setup (WebGPU, AMD notebook, 1536x960 @ 1.25, dev server, full mode,
savanna-driving). CPU median / p95 (ratio); shares of worst-8 CPU time inside
render-submit:

| Build | Pass | Median / p95 (ratio) | Worst 8 | Inside render-submit |
| --- | --- | --- | --- | --- |
| d464d35 | medium | 14.6 / 49.5 (3.39) | 49-64 plateau | write-buffer 0.46, shadow 0.42, quad 0.33, get-texture 0.31, main 0.14, upload small 0.07 |
| d464d35 | high | 21.5 / 43.6 (2.03) | 172,145,73,72,72,63,57,44 | write-buffer 0.69, main 0.67, shadow 0.25, upload small 0.04 |
| d464d35 | low | 4.9 / 12.5 (2.55) | — | — |
| f9b5171 | medium | 13.0 / 41.1 (3.16) | 41-58 | write-buffer 0.57, main 0.40, quad 0.24, shadow 0.23, get-texture 0.05 |
| f9b5171 | high | 20.1 / 33.2 (1.65) | — | write-buffer 0.78, main 0.68, shadow 0.17 |
| f9b5171 | low | 4.8 / 12.9 (2.69) | — | — |
| f9b5171 | baseline | 20.1 / 32.8 | — | — |

No upload of >= 256 KB at d464d35; at f9b5171 no `gpu:upload` line at all (the
lazy arming did not take in the F8 run). The live-flora range fix moved medium
p95 47.6 → 41.1, within run noise. Owner hypothesis: GPU back-pressure — Chrome
blocks writeBuffer / getCurrentTexture while the GPU queue is too far behind, so
GPU-bound frames show up as CPU wait.

## Round 5 — delivered (5bb96c8)

- `gpu:write-buffer calls` and `gpu:write-buffer KB` per frame (all
  `queue.writeBuffer` calls: uniform, storage and attribute buffers);
  perf-f8-detail prints their mean per frame over the worst 8 against all
  frames, so many small writes and one big write are told apart.
- Upload booking re-arms on every render whenever the backend's attribute
  utils are new or unwrapped, and counts bookings in `window.__uploadBookings`
  (Vitest: arms after a late backend, re-arms on fresh utils, counts). Check in
  the owner's DEV run: `window.__uploadBookings` > 0 after F8.
- Back-pressure test: the travel probe records per frame the GPU latency from
  the end of the frame's submission to `queue.onSubmittedWorkDone()`;
  perf-f8-detail prints it for the worst 8 and for all frames. If the worst
  frames show a latency of several frame times while all frames do not, the GPU
  runs behind and the CPU "plateau" is wait time (writeBuffer/getCurrentTexture
  blocking under back-pressure).
- Headless finding: in this container the SwiftShader WebGPU device is
  effectively lost (`Instance dropped in popErrorScope` floods,
  `onSubmittedWorkDone` never resolves, no writeBuffer/attribute upload reaches
  the queue). Every headless render-side number in this doc (render-submit
  shares, upload absence) is therefore without value; main-thread JS numbers
  (terrain, wildlife) stand.

## Hand-over (state at 5bb96c8)

Branch `feat/1543-driving-cpu-hitches`, head 5bb96c8 (plus this doc commit).
Gates on 5bb96c8: typecheck:test green, build green, lint green, test:unit
19564 passed / 2 failed (only `scripts/batch-doctor-protected.test.mjs`, see Open).

Proposed fix under the back-pressure cause (not implemented; needs the
latency evidence first):
1. Frame pacing / frames-in-flight cap: before a frame, if the GPU still has
   more than N (1-2) submitted frames pending (counted from
   `onSubmittedWorkDone` promises), skip that rAF's render instead of queueing
   more work — the CPU then never blocks inside writeBuffer/getCurrentTexture,
   and the F8 CPU frame stays at its JS cost. In R3F this means driving the
   loop with `frameloop="demand"`/`advance` or a before-effect gate; it changes
   frame pacing for every scene, so it is an owner decision. OPEN.
2. If the latency shows the GPU is simply over budget on medium in the driving
   phase, cut the GPU cost of the passes the plateau sits in (shadow cascades
   and the post quads on medium), which is a picture decision. OPEN.

Open:
- The real-GPU F8 p95 cause is not yet fixed; target CPU p95 <= 2x median on
  medium and high is NOT met (owner F8 at f9b5171: medium 3.16x, high 1.65x).
- Sliced terrain builds (medium/high): cut the max on the real GPU but not the
  p95; keep or revert is the owner's call. Low builds whole chunks again.
- `scripts/batch-doctor-protected.test.mjs` (2 tests) fails in this container
  in isolation as well; untouched by this branch.
- Not run here: browser suites, picture check, real-GPU F8 (owner), the
  cross-vendor review the point requires.

## Round 6 — owner F8 detail at 5bb96c8 (real GPU, medium-preset)

CPU 13.3 / 44.3 (3.33x), worst 8 44-61 ms. Inside render-submit (worst-8
shares): write-buffer 0.50, render:shadow 0.40, render:quad 0.33,
get-texture 0.24, render:main 0.15. writeBuffer per frame: worst 8 248 KB /
303 calls, all frames 251 KB / 304 calls — identical, so no extra writes in
the slow frames: the same writes simply block. GPU latency
(submit → onSubmittedWorkDone): worst 8 1027 ms, all frames 1024 ms.

Assessment of the 1 s latency (the owner asked to check it first): very likely
an artefact of how the promise is delivered, not the queue depth.
- It is flat (1024-1027 ms) across all frames; a real queue depth would vary
  with the per-frame GPU cost and would differ between worst and typical frames.
- At ~70 fps a 1 s queue would mean ~70 frames in flight; Chrome's swap chain
  admits only a few (getCurrentTexture blocks first).
- Chrome resolves WebGPU completion promises when it polls the device; with no
  other trigger that poll runs on a coarse timer, so the measured time is the
  callback delivery delay.
Consequence: `onSubmittedWorkDone` cannot serve as the fence for a
frames-in-flight cap (a cap would wait on the same delayed callback and pace
the game to ~1 fps), and the latency column of perf-f8-detail is not evidence
of back-pressure. The identical writes that block only in some frames remain
consistent with back-pressure, but GPU time per frame is the deciding number.

Next (owner, real GPU):
1. GPU frame time per preset from the F8 report's own `gpu` column (timestamp
   queries) for savanna-driving medium/high/low: if the medium GPU median sits
   near or above its CPU p95 (~44 ms), medium is over GPU budget on this
   notebook and the CPU plateau is GPU wait.
2. If so, the fix is GPU cost on medium (the plateau sits in the shadow and
   post-quad passes: cascade count / shadow resolution / shadow update rate,
   post chain), a picture decision for the owner; a frames-in-flight cap only
   moves the wait elsewhere and needs a fence other than onSubmittedWorkDone.
   OPEN, not implemented here.


## Round 7 — GPU column in perf-f8-detail (ready)

`scripts/perf-f8-detail.mjs` now prints, per measured pass, the F8 report's own
GPU timestamp-query median/p95 of that pass (`rows[].gpu`, read from the
finished report) next to the CPU numbers; without timestamps it prints
`gpu n/a (<reason>)`. `--json` now writes `{ detail, rows, gpuTiming }`.
Ready for the owner's real-GPU run (`npm run dev`, then
`BASE_URL=http://localhost:5173/ VERIFY_GL=webgpu node scripts/perf-f8-detail.mjs`),
which decides the medium GPU-cost cut. The raw outputs of the owner runs at
c5f2f94, d464d35, f9b5171 and 5bb96c8 exist only on the owner host
(worktree `local/`); this doc carries their tables.

## Round 8 — owner run at 014b9c8 and the timestamp switch

Owner real-GPU run at 014b9c8: every pass printed `gpu n/a (adapter without
the timestamp-query feature)`. CPU median / p95 (ratio), savanna-driving:
medium 12.8 / 46.0 (3.59), high 19.7 / 31.4 (1.59), low 5.0 / 13.7 (2.74),
baseline 20.6 / 32.4, shadows-off 13.6 / 37.1, post-off 16.7 / 29.3.

`scripts/perf-f8-detail.mjs` now launches Chrome, for this measurement only
(its own args, not the shared verify defaults), with
`--enable-dawn-features=allow_unsafe_apis --enable-webgpu-developer-features`
(`BENCH_GPU_TIMESTAMPS=0` leaves them off), and prints first
`# adapter timestamp-query: <true|false>` from a probe page on BASE_URL.
Container check: the script's launch reports `timestamp-query: true`. The check
proves little here, because this container's SwiftShader adapter offers the
feature even without the switches. Whether the switches unlock it on the
owner's AMD adapter shows in that first line of the next owner run.
