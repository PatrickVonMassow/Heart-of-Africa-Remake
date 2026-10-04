# Graphics detail levels — low / medium / high

The game offers **three graphics quality levels** — **low**, **medium** (the
default) and **high** — cycled in game with **F9** (each press steps DOWN one
level and wraps the bottom back to the top: medium → low → high → medium) or
picked from the debug menu's single graphics dropdown (design.md §2.7 / §21,
point 276 part B).

Every quality-relevant render setting is mapped per level in ONE registry —
`QUALITY_PRESETS` in `src/config/quality.ts`. The render consumers never read a
preset field directly; they read the current level's value through the
`effective*` selectors in `src/state/ui.ts`, which combine the level's preset
value with the (internal) per-setting allow-flags. Those allow-flags are no
longer exposed in the debug menu — they are set only by the mobile touch-quality
preset (§17.5) and the F8 benchmark.

**This table is the human-readable breakdown of that registry.** It is kept in
lockstep with the code by `src/config/qualityDoc.test.ts`, a Vitest currency
check that parses the table below and asserts every quality key appears as a row
and that each level's value matches `QUALITY_PRESETS` exactly. If a preset value
changes, or a new quality key is added, that test FAILS until this table is
updated — so the doc can never silently drift from the code.

## Per-level values

Boolean settings read `on` / `off`; `dprCap`'s `native` means R3F's native
device pixel ratio is kept (no cap).

| Setting | Low | Medium | High |
| --- | --- | --- | --- |
| `dprCap` | 1 | native | native |
| `ssao` | off | off | on |
| `traa` | off | on | on |
| `bloom` | off | on | on |
| `sunShadows` | off | on | on |
| `sunShadowResolution` | 1024 | 2048 | 4096 |
| `fireShadows` | off | on | on |
| `fireShadowResolution` | 0 | 256 | 512 |
| `fireShadowSoft` | off | off | on |
| `terrainRefine` | off | on | on |
| `floraFogFactor` | 0.55 | 1 | 1 |
| `floraCastShadow` | off | on | on |
| `weatherIntensity` | 0.6 | 1 | 1 |
| `waterCalm` | on | off | off |
| `wildlifeDensity` | 0.6 | 1 | 1 |
| `figureLimbSegments` | 5 | 8 | 12 |
| `placeRiverSegments` | 8 | 32 | 64 |
| `placeRiverFlotsam` | 12 | 48 | 90 |
| `waterDetailOctaves` | 1 | 3 | 4 |
| `faunaBodySegments` | 12 | 18 | 24 |
| `figureBodySegments` | 0 | 16 | 24 |

## What each setting does

The lever order below follows the real-hardware benchmark (point 277,
`docs/perf-277-user-hardware.md`): fill-rate first (device pixel ratio, then the
post pipeline), geometry last — the cuts that only genuinely weak GPUs feel;
later levers (from `figureLimbSegments` on) are appended in the order they were
added.

- **`dprCap`** — Device-pixel-ratio cap; `native` keeps R3F's native ratio, `1`
  caps it to one physical pixel per CSS pixel. The single biggest fill-rate lever
  on real hardware (~35 % GPU), so low leads with it.
- **`ssao`** — Screen-space ambient occlusion (design.md §2.7). High only — a
  ~25 % GPU cost kept for the richest level.
- **`traa`** — Temporal anti-aliasing (design.md §2.7). Off only on low; when a
  level turns it off, anti-aliasing falls back to the render pass' multisampling.
- **`bloom`** — Bloom (design.md §2.7). Off only on low.
- **`sunShadows`** — Whether directional sun shadows are cast at all
  (design.md §2.7 / §21). Off on low (point 305): the M1-Pro real-GPU benchmark
  (`local/m1pro-bench.json`) showed the shadow passes cost ~8.5 ms GPU per frame
  regardless of map resolution (`shadow-half` moved nothing), plus 880 extra
  draw calls (952 → 72) and ~2 M extra shadow-pass triangles — the biggest
  remaining lever once low's dpr and post cuts are in.
- **`sunShadowResolution`** — Sun shadow-map resolution in texels; climbs
  1024 → 2048 → 4096, high deliberately above medium's 2048 for sharper
  shadows. Low's 1024 is moot while its `sunShadows` is off; it stays below
  medium for the strict low < medium < high climb.
- **`fireShadows`** — Whether the campfire cube shadows are cast at all
  (design.md §19.10, point 289). Off on low.
- **`fireShadowResolution`** — Campfire cube-shadow map resolution in texels;
  `0` when `fireShadows` is off, the 256² point-289 variant on medium, the
  costlier 512² variant on high.
- **`fireShadowSoft`** — Soft (PCF) campfire shadow edges — the costlier, more
  realistic high-only variant (design.md §19.10).
- **`terrainRefine`** — Near-ring terrain refinement (point 209); off on low for
  weak, geometry-bound GPUs.
- **`floraFogFactor`** — Flora fog-radius factor; `< 1` tightens the spawn circle
  so the plant instance count falls quadratically (`floraStreaming.ts`). Low
  tightens it to 0.55.
- **`floraCastShadow`** — Whether ground flora (bush / papyrus / rock) casts sun
  shadows. Off on low. The communication PoC's erratic boulder (work-order 482)
  is rock dressing too and rides this same lever rather than inventing a lever
  of its own — it is one mesh, so a separate geometry knob would move nothing
  measurable. Its settlement counterparts, the two play rocks on the bank
  (work-order 688 draws them from the same erratic mesh at settlement scale),
  stand inside a settlement and follow the place scene's `sunShadows` like every
  other prop there.
- **`weatherIntensity`** — Atmospheric haze/rain intensity factor (`1` = full);
  low thins the pall to 0.6 so fewer full-screen fragments are shaded
  (design.md §19.13).
- **`waterCalm`** *(declared, not yet consumed)* — A reduced wave field
  (design.md §11.3). Declared for the §21 sort-into-levels registry; will be
  read by the water material once wired. On for low, off otherwise.
- **`wildlifeDensity`** *(declared, not yet consumed)* — Ambient wildlife
  spawn-density factor (`1` = full, design.md §19.2). Declared for the §21
  registry; will be read by the spawner once wired. 0.6 on low.
- **`figureLimbSegments`** — Radial segments of the villager figures' arms,
  hands and legs (point 479). The limbs are thin and the player stands within a
  metre of them while a figure gestures, so the count decides whether an arm
  reads as a limb or as a rod; a settlement carries a couple of dozen figures,
  which is why the count is a per-level lever rather than a fixed constant.
  Climbs 5 → 8 → 12.
- **`placeRiverSegments`** — Segments along the current of the water surface in
  a settlement that stands on a river (work-order 482). The ripple is a vertex
  displacement, so this decides whether the water undulates or lies flat; one
  surface per settlement, hence a modest climb 8 → 32 → 64.
- **`placeRiverFlotsam`** — How many items of flotsam — foam patches, leaves,
  grass tufts and twigs — ride that current (work-orders 482, 1280). Never zero
  on any level: they carry the reading of WHICH WAY the water runs, which the
  whole upstream/downstream teaching depends on, so a frugal level shows fewer
  (12 → 48 → 90), never none. Medium and high carry ~3x the foam they had; low
  only doubles its 6, to spare the weakest tier — its frame cost was measured.
- **`waterDetailOctaves`** — Fractal octaves of the ONE water detail field
  (work-order 525, `src/render/waterAppearance.ts`): the streaks, the froth and
  the ripple riding the current. It prices the water's per-pixel shading, and it
  is a SINGLE lever for BOTH halves of a settlement river — the surface drawn at
  the bank and the panorama's continuation of it past the ground plate's rim —
  because a level that thinned only one of them would put back the straight seam
  the two used to meet along. Climbs 1 → 3 → 4.
- **`faunaBodySegments`** — Radial segments of the swept torso, neck and head
  of the detailed ungulates — zebra, antelope (gazelle) and the settlement goat
  (work-order 1284); legs take 0.6 of it, tails, horns and manes a third. It
  decides whether a close animal's outline reads round or faceted. The pelt
  markings (zebra stripes, gazelle flank band, giraffe patches, cat and hyena
  spots) are not a lever: they identify the species, so every level draws them;
  they are a per-fragment pattern in the one shared fauna material, antialiased
  by their own screen derivative. Climbs 12 → 18 → 24. Measured cost per
  animal (vertices / triangles; one instanced draw per species, unchanged; the
  walking rigs keep their five draws):

  | Build | Before (capsules) | Low 12 | Medium 18 | High 24 |
  | --- | --- | --- | --- | --- |
  | zebra | 1914 / 2960 | 1201 / 2118 | 1597 / 2886 | 2023 / 3712 |
  | antelope | 1984 / 2992 | 1237 / 2178 | 1633 / 2946 | 2071 / 3792 |
  | goat | 1984 / 2992 | 1272 / 2194 | 1668 / 2962 | 2106 / 3808 |

  So medium (the default) draws slightly fewer triangles per animal than the
  capsule build did, low about a quarter fewer, and high about a quarter more.

- **`figureBodySegments`** — The villagers' body (work-order "villager dress"):
  `0` keeps the primitive cone, sphere and cylinder figure (user decision
  04.10.2026: the low level keeps it); otherwise the ring resolution of the
  code-built skinned body — trunk and head; limbs take two thirds — and of the
  dress layers drawn on it from the appearance table
  (`src/systems/appearance.ts`, `src/render/figureBody.ts`,
  `src/render/figureDress.ts`). Body and dress are merged into ONE skinned
  mesh per inhabitant with one shared material, so a villager is one draw
  (the primitive figure is about a dozen); geometries are cached per distinct
  body and dress. Climbs 0 → 16 → 24. Cost per village, measured 04.10.2026
  (`polish-villagers.mjs` section `villager-dress`; the same view of a village
  on each level, once with `figureBodySegments` forced to
  0 — the "before" — and once as shipped; per-frame draw calls / triangles,
  WebGPU, WebGL 2 within a few percent):

  | Village | Inhabitants | Low (primitive) | Medium before → after | High before → after |
  | --- | --- | --- | --- | --- |
  | Zulu | 25 | 37 / 43 k | 544 / 141 k → 344 / 269 k | 524 / 144 k → 354 / 351 k |
  | Hausa | 25 | 295 / 75 k | 835 / 170 k → 489 / 392 k | 864 / 185 k → 519 / 549 k |
  | Maasai | 25 | 289 / 90 k | 794 / 231 k → 464 / 422 k | 765 / 236 k → 470 / 518 k |

  So on medium and high the skinned villagers cost about 40 % FEWER draw calls
  than the primitive figures did and about twice the triangles (+130 k to
  +360 k per village). The median frame time did not separate the variants on
  this shared, software-composited machine (16.7–66.7 ms in every column,
  quantised to the display's vsync), so no frame-time cost is claimed either
  way; low is unchanged by construction.

> **Declared-but-not-yet-consumed keys:** `waterCalm` and `wildlifeDensity` are
> present in every preset (so the completeness gate passes and future work has a
> per-level value to read) but no render consumer reads them yet. They are listed
> honestly here as declared registry keys, not shipped behaviour.

## Profiling the low preset (F8 benchmark, point 293)

The in-game render benchmark (**F8** / `?bench`, design.md §21.1) exists to price
these levers on the player's own hardware. Its config sweep forces the **high**
level so every lever stays measurable, but a slow-PC player wants the opposite
question: *at the low level, where does the frame cost still sit, and what should
I cut next?* So the benchmark runs one extra **low-preset profiling pass** that
applies the actual `low` values above and reports, per route section at low, the
per-system scene-graph triangle count, the `renderer.info` draw calls/triangles
and the GPU/CPU/wall series — **ranked most-expensive-first** — with a digest line
naming the dominant remaining systems (e.g. *"at LOW the frame is dominated by:
terrain 42 %, flora 28 %, wildlife 12 % …"*), echoed as a localized line in the
result panel. The per-system split is by rendered-triangle share (GPU timestamps
resolve per render pass, not per object group, so a per-system GPU cost cannot be
measured and is never fabricated); the frame series give the absolute cost the
ranking sits inside. The applied `low` preset is echoed into the report file so it
records exactly which values were profiled.
