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
| `sunShadows` | on | on | on |
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

## What each setting does

The lever order below follows the real-hardware benchmark (point 277,
`docs/perf-277-user-hardware.md`): fill-rate first (device pixel ratio, then the
post pipeline), geometry last — the cuts that only genuinely weak GPUs feel.

- **`dprCap`** — Device-pixel-ratio cap; `native` keeps R3F's native ratio, `1`
  caps it to one physical pixel per CSS pixel. The single biggest fill-rate lever
  on real hardware (~35 % GPU), so low leads with it.
- **`ssao`** — Screen-space ambient occlusion (design.md §2.7). High only — a
  ~25 % GPU cost kept for the richest level.
- **`traa`** — Temporal anti-aliasing (design.md §2.7). Off only on low; when a
  level turns it off, anti-aliasing falls back to the render pass' multisampling.
- **`bloom`** — Bloom (design.md §2.7). Off only on low.
- **`sunShadows`** — Whether directional sun shadows are cast at all
  (design.md §2.7 / §21). On at every level.
- **`sunShadowResolution`** — Sun shadow-map resolution in texels; climbs
  1024 → 2048 → 4096, high deliberately above today's 2048 default for sharper
  shadows.
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
  shadows. Off on low.
- **`weatherIntensity`** — Atmospheric haze/rain intensity factor (`1` = full);
  low thins the pall to 0.6 so fewer full-screen fragments are shaded
  (design.md §19.13).
- **`waterCalm`** *(declared, not yet consumed)* — A reduced wave field
  (design.md §11.3). Declared for the §21 sort-into-levels registry; will be
  read by the water material once wired. On for low, off otherwise.
- **`wildlifeDensity`** *(declared, not yet consumed)* — Ambient wildlife
  spawn-density factor (`1` = full, design.md §19.2). Declared for the §21
  registry; will be read by the spawner once wired. 0.6 on low.

> **Declared-but-not-yet-consumed keys:** `waterCalm` and `wildlifeDensity` are
> present in every preset (so the completeness gate passes and future work has a
> per-level value to read) but no render consumer reads them yet. They are listed
> honestly here as declared registry keys, not shipped behaviour.
