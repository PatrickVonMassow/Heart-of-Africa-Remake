# Preset performance — findings (work-order point 1524)

User report 15.11.2026: the game got slower over recent weeks on every preset.
Reference: the user's F8 report `hoa-bench-2026-11-15-webgpu.json`, digest in
`docs/bench/1524-reference-digest.md` (RTX-40-class Lovelace, Chrome 157,
WebGPU, 2752x1152 @ dpr 1.25, production build 3c06fa8). Standing frames there
are CPU-bound: 8.3 ms cpu against 2.5 ms gpu, 375 draws.

## Method

- **Host:** the verify host's RTX 4070 Ti through WSL/ANGLE (Dawn OpenGLES
  compat adapter for WebGPU), headless system Chrome, vsync and frame-rate
  limit off. The compat adapter has **no `timestamp-query`**, so the gpu column
  is empty here; the frame column is the end-to-end number. The frame here is
  partly GPU/driver-bound at the reference resolution (the GL path blocks
  inside submission, so "cpu" includes driver time), which makes it ~3x the
  user's absolute numbers — only before/after deltas on the same host are
  compared, never against the reference's absolutes.
- **Driver:** `scripts/perf-f8-bench.mjs` presses F8 in a served production
  build at the reference viewport (2752x1152 CSS px, dpr 1.25) and saves the
  report the overlay downloads — the player's own path, so it also runs
  against older commits.
- **Rows added:** the F8 sweep now ends with `high-preset`, `medium-preset`
  and `low-preset` passes (each level's real `QUALITY_PRESETS` values), and
  every row records the renderer pixel ratio it ran at (`dpr` column).
- **Attribution probes** (scratch, dev build): a `renderer.renderObject` wrap
  counting draws per camera (main / each CSM cascade / post quads) and per
  named scene group, a wrap of the WebGPU `updateBinding` counting per-frame
  buffer writes per object, and CDP CPU profiles of the F8 LOW pass on an
  unminified production build, attributed to the R3F `useFrame` callbacks.

## Profile per preset (before, medium, savanna-standing, dev probe)

| pass | draws | what |
| --- | --- | --- |
| main | 69 | 15 terrain chunks, ~16 **empty** instance pools, figure parts, dressing |
| CSM cascade 0 / 1 / 2 | 81 / 115 / 148 | every caster in each cascade's sunward box |
| post quads | 15 | TRAA, bloom, output |

The shadow pass was ~300 draws in three cascades. Of those:

1. **Far settlement markers** — a village glyph was 6 meshes, each in every
   cascade: ~200 draws. The cascades' light-space boxes reach ~200 units
   toward the sun (CSM `lightMargin`), so markers 300 units away (Lagos,
   Timbuktu, Cairo from the savanna start) fell inside the beam.
2. **Empty instance pools** — 15 vegetation/wildlife `InstancedMesh`es with
   `count = 0` and `frustumCulled = false`: 15 draws per cascade plus 16 in
   the main pass.
3. **Cascades 1 and 2 are never sampled at the default zoom.** The travel
   camera looks steeply down: the deepest visible ground lies 33.0 units deep
   (36.1 at 2 units below sea level), while the practical split puts cascade
   1's first sampled depth (its start minus the fade margin) at 39.9 and
   cascade 2's at 84.9 (breaks 0.1696 / 0.3707 of 0.1..240).

LOW (no sun shadows): 64-66 draws; CPU profile of the LOW savanna pass on this
host: render submission ~3.5 ms/frame (of which WebGPU `writeBuffer` ~2.5 ms —
Dawn's GL path makes each write expensive here), wildlife `useFrame`
~0.58 ms, vegetation ~0.25 ms, everything else < 0.1 ms each. 45 of the 76
per-frame buffer writes were the three ground-stain uniform arrays, re-written
once per terrain chunk.

## The two anomalies

- **`dpr-1` costlier on the GPU than baseline — explained.** The sweep set
  every config to the ratio active when F8 was pressed (`gl.getPixelRatio()`).
  Measured on `main` with a 1.25 display: started from LOW, every sweep config
  ran at **0.8** (LOW's sub-1 cap) except `dpr-1` and `all-off` (1.0); started
  from MEDIUM, all ran at 1.25. The reference's `all-off` (dpr 1, every
  feature off) costing more GPU than `baseline` (everything on) is only
  possible below dpr 1 — so the user's baseline ran at the 0.8 cap and `dpr-1`
  measured 1.56x the pixels. Fixed: the sweep and the uncapped presets now
  render at the NATIVE ratio (R3F's `[1, 2]` clamp of the display ratio), LOW
  at its effective cap, and the `dpr` column records it per row.
- **`post-off` slower on the CPU than baseline (9.2 vs 8.3 ms) — not
  reproduced.** Here `post-off` against `baseline` was +1.1/−0.7/−0.7 ms
  (standing/desert/driving) in one before run, +1.1/−2.3/−1.6 ms in a second,
  and −2.9/−2.9/−2.8 ms after the changes (frame medians),
  i.e. inside this host's run-to-run noise with no consistent sign. In the
  reference it is +0.9/+0.4/+0.1 ms with higher p95. The likeliest candidate is
  ordering: `post-off` is the first config after `shadow-half`, so it
  re-creates the full-size shadow map AND rebuilds the post chain in the same
  80-frame settle; asynchronous pipeline work spilling into the sample would
  read as CPU. OPEN for the owner's next reference run (the per-row `dpr` now
  rules out a ratio difference).

## Regression bisect (recent weeks)

F8 full sweep, production builds of `main`, same host and viewport
(cpu / frame median ms / draws; LOW = low-preset):

| main commit | date | baseline savanna | baseline desert | shadows-off savanna | LOW savanna | LOW desert |
| --- | --- | --- | --- | --- | --- | --- |
| 2f6cabdd9 | 19.09. | 27.5 / 28.4 / 525 | 25.3 / 26.3 / 270 | 12.8 / 13.9 / 74 | 6.3 / 7.0 / 61 | 4.0 / 4.4 / 59 |
| 45053ed11 | 03.10. | 26.6 / 27.8 / 525 | 25.4 / 26.1 / 271 | 12.7 / 13.8 / 74 | 4.4 / 5.1 / 61 | 4.1 / 4.6 / 59 |
| 870f4b669 | 24.10. | 26.6 / 27.7 / 505 | 22.4 / 23.0 / 240 | 13.3 / 14.6 / 70 | 4.1 / 4.9 / 60 | 3.4 / 3.8 / 53 |
| 128eb316a | 31.10. | 26.6 / 27.8 / 509 | 22.6 / 23.2 / 240 | 13.0 / 14.2 / 70 | 4.5 / 5.2 / 61 | 3.3 / 3.7 / 53 |
| ace7f1b0c | 07.11. | 26.5 / 27.6 / 505 | 23.2 / 23.9 / 240 | 13.3 / 14.6 / 70 | 4.8 / 5.4 / 60 | 2.7 / 3.2 / 53 |
| 72c81aa85 | 15.11. | 26.6 / 27.6 / 373 | 23.7 / 24.3 / 213 | 14.2 / 15.3 / 72 | 5.2 / 5.9 / 64 | 3.8 / 4.2 / 56 |

(4af4cecbc, 18.10., did not install at its own lockfile and is left out.)
**No steady-state regression on the fixed F8 route over eight weeks on this
host:** standing medians are flat within ±1 ms while the baseline's draw count
even fell (525 → 373). What the user felt over those weeks is not on this
route: the periodic walking hitch (point 1523, ~0.5 s stalls about once a
second, now fixed) dominates a playing session but not a fixed-step F8 sample.
A machine-specific cause (driver/browser update on the reference PC) cannot be
ruled out from here.

## Levers taken (all picture-neutral)

1. **Range-limited marker shadows** (`src/render/shadowCasterRange.ts`,
   `balance.shadowCasterRange`): a settlement marker casts only within
   `viewReach · zoom + min(maxShadowReach, casterHeight / tan(sun elevation))`
   of the traveller, with hysteresis; outside it its shadow could only fall on
   ground the player does not see.
2. **Empty instance pools hidden** (vegetation, wildlife adult/calf/elder/
   croc-strike): `visible = count > 0`.
3. **Merged map glyphs** (`src/render/placeMarkerGlyphs.ts`): village 6 → 2
   meshes, monument 3 → 1, shared geometry and materials, identical shapes,
   colours and roughness.
4. **Cascade skip** (`src/render/cascadeSkip.ts`, `balance.shadowCascadeSkip`):
   per frame, cascades whose first sampled depth lies beyond the deepest
   visible ground keep their last map (`shadow.autoUpdate = false`, no shader
   change); they render again on the frame a wider zoom reaches them, before
   any pixel samples them.
5. **Ground-stain arrays in the render group**: uploaded once per render
   instead of once per terrain chunk (76 → 37 buffer writes per frame at LOW).

Draws after (medium, savanna-standing, dev probe): main 54, cascade 0 50,
cascades 1-2 0, post 15 — **369 → 120**; rendered triangles 3.0M → 1.7M.

## Before / after (same host, reference viewport, F8 full sweep)

Before = the branch's first commit (main + the preset rows), after = branch
head; frame median / cpu median ms, draws.

| preset · phase | WebGPU frame | WebGPU cpu | WebGL 2 frame | WebGL 2 cpu | draws |
| --- | --- | --- | --- | --- | --- |
| HIGH savanna-standing | 27.1 → 17.2 (−37 %) | 26.1 → 16.0 | 16.1 → 10.8 (−33 %) | 15.4 → 10.2 | 369 → 119 |
| HIGH desert-standing | 25.3 → 15.5 (−39 %) | 24.7 → 14.0 | 13.7 → 10.8 (−21 %) | 13.3 → 10.4 | 213 → 85 |
| HIGH savanna-driving | 30.7 → 17.4 (−43 %) | 28.9 → 15.6 | 18.1 → 12.7 (−30 %) | 16.8 → 11.3 | 378 → 123 |
| MEDIUM savanna-standing | 27.1 → 17.3 (−36 %) | 26.1 → 16.2 | 17.2 → 10.6 (−38 %) | 16.4 → 9.9 | 376 → 123 |
| MEDIUM desert-standing | 25.5 → 14.3 (−44 %) | 25.0 → 13.0 | 13.0 → 9.8 (−25 %) | 12.6 → 9.5 | 212 → 84 |
| MEDIUM savanna-driving | 31.3 → 17.9 (−43 %) | 29.5 → 16.1 | 17.6 → 10.9 (−38 %) | 16.1 → 9.6 | 377 → 121 |
| LOW savanna-standing | 7.1 → 4.3 (−39 %) | 6.0 → 3.6 | 7.5 → 5.6 (−25 %) | 6.9 → 4.9 | 66 → 66 |
| LOW desert-standing | 4.4 → 2.3 (−48 %) | 4.0 → 1.9 | 4.2 → 4.1 (−2 %) | 3.9 → 3.8 | 56 → 56 |
| LOW savanna-driving | 5.6 → 5.5 (−2 %) | 4.2 → 4.0 | 6.0 → 6.0 (0 %) | 4.9 → 4.7 | 65 → 67 |

Reports: `local/perf-1524/{before2,after}-webgpu-ref.json`,
`local/perf-1524/{before,after}-webgl-ref.json` (git-ignored).

**Targets.** MEDIUM ≥ 30 % below: met on WebGPU in all three phases and on
WebGL 2 in two of three (desert −25 %). On the user's CPU-bound profile the
draw cut maps at the reference's ~11 µs per draw (300 shadow draws ↔ 3.4 ms)
to roughly 8.3 → 5.6 ms cpu for MEDIUM standing — an estimate, to be confirmed
by the owner's F8 run. HIGH: the same draws go, with no picture change (see
below). **LOW cpu ≤ 3 ms: not met** — 3.6 / 1.9 / 4.0 ms (WebGPU) on this
host; LOW never had sun shadows, so the shadow levers do not apply there.

## Picture check (before/after, seed 18900701, day 181, (−2.5, 34), zoom 0.5)

`verification/1524-{high,medium,low}-{webgpu,webgl2}-{before,after}.png`.
Terrain, trees, rocks and every cast shadow match; the only differences are
the animated wildlife (an animal at the left edge stands elsewhere) — the
wildlife is not frozen between two sessions.

## Remaining (proposed split)

LOW to ≤ 3 ms needs CPU work that is not a config lever: on this host the LOW
savanna frame is render submission ~3.5 ms (65 draws, 37 buffer writes —
the animated instance pools upload their full capacity buffer, e.g. 9 KB for
10 animals, every frame), wildlife `useFrame` ~0.6 ms, vegetation ~0.25 ms.
Proposed point: partial instance-buffer uploads (`updateRanges` up to `count`)
and a wildlife per-frame budget at LOW, measured against this file's LOW rows.
