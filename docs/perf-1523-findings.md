# Walking hitch in the travel view — findings (work-order point 1523)

User report 15.11.2026: a ~0.5 s main-thread stall about once per second
while walking in the travel view, on every preset including LOW; CPU p99 equals
frame p99, GPU p95 stays at 5-7 ms, standing shows no hitch.

## Method

The authoring environment has no GPU: Chromium (the pre-installed Playwright
build) on SwiftShader WebGL 2, Vite dev build, 640x360, savanna start
(-2.5, 34.0), zoom 0.5, travel speed 5.6, forward key held 20-25 s after a
12-15 s settle. Absolute frame times there are dominated by the software
rasteriser (ordinary frames 250-600 ms), so they are NOT comparable to the
user's numbers; only the attributed main-thread work is. Three probes
(scratch drivers, not committed):

1. A CDP CPU profile (200 µs sampling) of the drive, aggregated per long frame.
2. A wrapper on three.js's `NodeManager.getForRender` logging every call that
   adds a node-builder cache entry (a material node-program build), with its ms,
   material, object group and attribute set.
3. A per-frame poll of the scene-sun object, the floored day and the builder
   cache size.

## Culprit (measured)

**Material node-program rebuilds of the whole scene, triggered by the scene
sun's latitude step.** `useSceneSun` re-derives the sun at every 0.25° of
latitude — 2.5 world units of north/south travel (`sceneSun.ts`, `LAT_STEP`
against `pos.z / 10`) — and at every new in-game day. `Effects.tsx` reacted to
each new sun by creating a NEW environment `DataTexture` and assigning it to
`scene.environment`. A new texture object is a new environment node, which
changes the render objects' cache key, so three.js rebuilt the node program
(TSL → shader code, on the main thread) of every lit material in the scene,
then re-created the pipelines and the PMREM.

- Pre-fix, 20 s drive, 4-5 sun steps: 15 material groups rebuilt, ~3.6 s of
  node-program building in total; single builds 13-85 ms (dressing, wildlife,
  terrain, rivers, region borders, sea, lake, figures, PMREM). Every sun step
  coincided with a builder-cache jump; every non-step frame had none.
- The long-frame detector (below) on the pre-fix code named
  `shader-programs` as owner at **818, 1035 and 1330 ms** per sun step (this
  machine's CPU); the user's strong PC shows the same burst as 510-655 ms.
- Walking due north/south at 5.6 wu/s crosses a 2.5 wu step every ~0.45 s,
  diagonally about once per second — the reported cadence. Standing never
  steps the sun, hence no hitch while standing. Presets and render flags do
  not change it, as reported (all-off, shadows-off, LOW).

The dressing triangle drift between runs is the flora streaming's normal
re-centring and is not the stall: flora bursts were 0 in a 20 s drive window
(16 wu hysteresis) and ≤ 70 ms where they fired on this machine.

## Fix

`Effects.tsx` keeps ONE environment texture per scene and re-bakes it in
place on a sun step (`updateEnvironmentTexture`: rewrite the 128x64 float data,
`needsUpdate` + `needsPMREMUpdate`). Same texture object → same environment
node → no program rebuild; the PMREM is re-filtered into its existing target.
The baked data is identical to a fresh texture's, so the picture is unchanged.

- Post-fix, same drive, 5 sun steps: **0** node-program builds; one re-bake
  costs **0.4-1.4 ms** in the browser.

## Guards

- `src/render/environmentRebake.test.tsx`: a 2400-frame walk (fixed dt 1/60,
  seed 18900701, day 181, travel speed 5.6, south then north) asserts the
  environment stays one texture object, the PMREM version advances once per
  sun step (>40 steps), and one re-bake stays within
  `balance.travelFrame.envRebakeBudgetMs`. It fails on the pre-fix code.
- `src/systems/longFrame.ts`: DEV long-frame detector. Frame windows of
  `balance.travelFrame.longFrameMs` (100) or more in the travel view are
  reported with the owning instrumented system (`terrain-stream`,
  `flora-stream`, `environment-rebake`, `shader-programs`), else
  `unattributed`. Soft by design (console.warn + `window.__longFrameLog`):
  headless software-rendered lanes exceed the line on ordinary frames.

## Remaining candidates (not fixed, measured only here)

- Terrain streaming burst: max ~70 ms on a chunk crossing on this machine's
  CPU despite the 5 ms drain budget, i.e. the crossing's planning work outside
  the drain. One long frame in a 20 s drive was owned by `terrain-stream`. On
  the user's hardware this may sit near the 33 ms p99 goal; the owner's
  benchmark re-run decides whether it needs its own point.
- The WebGL 2 first-use compile pump (`asyncPipelines.ts`) dominated the
  software-rendered frames here, but drained (queue 53 → 29) once the rebuilds
  stopped; it is startup backlog on this lane, not a walking cost.

## Owner verification still owed

The acceptance numbers (savanna-driving frame p99 ≤ 33 ms, max ≤ 50 ms on LOW
and the default preset; driving p99 within 2x of standing p99) need the F8
benchmark on real hardware, both backends — not measurable here.

## Owner re-measurement on hardware (15.11.2026)

The verify host has a real GPU (RTX 4070 Ti through WSL/ANGLE, headless
Chrome, 1440x900, Vite dev build, seed 42). F8 benchmark `?bench=short`, same
host and route, `main` before the fix against this branch:

| savanna-driving | before: frame max / cpu p99 | after: frame max / cpu p99 |
| --- | --- | --- |
| baseline (WebGPU) | 595.7 / 592.7 ms | 86.2 / 26.0 ms |
| all-off (WebGPU) | 500.2 / 497.0 ms | 55.6 / 7.0 ms |
| low-preset (WebGPU) | 452.2 / 449.4 ms | 52.7 / 6.4 ms |
| every other config (WebGPU) | 528-577 / 525-574 ms | 59-67 / 6.5-40 ms |
| baseline / low-preset (WebGL 2, after only) | — | 72.4 / 23.6, 58.9 / 9.1 ms |

The full (non-short) sweep on `main` did not finish within 15 min; on this
branch it took about 6 min, with savanna-driving cpu p99 6-27 ms and driving
p99 within 2x of standing p99 in every config. Frame totals on this headless
lane stay GPU-bound (standing medians 17-58 ms), so the absolute goal
(frame p99 <= 33 ms, max <= 50 ms on LOW and default) is judged by the user's
benchmark on the reference profile, not here.
