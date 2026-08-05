// Three graphics quality levels — low / medium / high (design.md §21, F9 /
// point 276 part B). This module is the SINGLE registry the effective* render
// selectors in state/ui.ts read: each level maps to a value for EVERY
// quality-relevant setting, so a new optical feature declares its low/medium/
// high behaviour HERE (design.md §21 convention) and the completeness gate
// (quality.test.ts) fails if any preset omits a key.
//
// The lever PRIORITY follows the real-hardware benchmark (point 277,
// docs/perf-277-user-hardware.md): the biggest wins are fill-rate (device
// pixel ratio, then the post pipeline), while geometry (terrain refinement,
// flora radius) barely moves a fast GPU and matters only for very weak ones —
// so low leads with dpr + post off and adds the geometry cuts on top.

export type DetailLevel = 'low' | 'medium' | 'high'

/** All three levels, low→high, for enumeration (menus, tests). */
export const DETAIL_LEVELS: readonly DetailLevel[] = ['low', 'medium', 'high']

/** One quality preset: a value for every quality-relevant render setting. Adding
 *  a field here is a COMPILE error until all three presets below define it, and
 *  the runtime completeness gate (quality.test.ts) guards the same at test time. */
export interface QualityPreset {
  /** Device-pixel-ratio cap; null keeps R3F's native ratio. The biggest
   *  fill-rate lever on real hardware (~35 % GPU, point 277). */
  dprCap: number | null
  /** Screen-space ambient occlusion (design.md §2.7) — high only (user: SSAO
   *  only in high). */
  ssao: boolean
  /** Temporal anti-aliasing (design.md §2.7). */
  traa: boolean
  /** Bloom (design.md §2.7). */
  bloom: boolean
  /** Directional sun shadows cast at all (design.md §2.7/§21). */
  sunShadows: boolean
  /** Sun shadow-map resolution in texels — low < medium < high, high above
   *  today's 2048 default (user wants sharper shadows on high, softer on low). */
  sunShadowResolution: number
  /** Campfire cube shadows (design.md §19.10, point 289) cast at all. */
  fireShadows: boolean
  /** Campfire cube-shadow map resolution in texels; 0 when fireShadows is off. */
  fireShadowResolution: number
  /** Soft (PCF) campfire shadow edges — the costlier, more realistic high-only
   *  variant (design.md §19.10). */
  fireShadowSoft: boolean
  /** Near-ring terrain refinement (point 209); off on low for weak, geometry-
   *  bound GPUs. */
  terrainRefine: boolean
  /** Flora fog-radius factor; <1 tightens the spawn circle so the instance
   *  count falls quadratically (floraStreaming.ts). */
  floraFogFactor: number
  /** Ground flora (bush/papyrus/rock) casts sun shadows. */
  floraCastShadow: boolean
  /** Atmospheric haze/rain intensity factor (1 = full); low thins the pall so
   *  fewer full-screen fragments are shaded (design.md §19.13). */
  weatherIntensity: number
  /** Calm water — a reduced wave field (design.md §11.3). Declared for the
   *  §21 sort-into-levels registry; consumed by the water material when wired. */
  waterCalm: boolean
  /** Ambient wildlife spawn-density factor (1 = full, design.md §19.2).
   *  Declared for the §21 registry; consumed by the spawner when wired. */
  wildlifeDensity: number
  /** Radial segments of the villager figures' arm/leg/hand primitives (point
   *  479). The limbs are thin and the eye passes within a metre of them at
   *  conversation range, so the count is what decides whether an arm reads as a
   *  rod or as a limb; a settlement holds a couple of dozen figures, which is
   *  why this is a level lever at all rather than a fixed constant. */
  figureLimbSegments: number
}

export const QUALITY_PRESETS: Record<DetailLevel, QualityPreset> = {
  // LOW — very frugal, usable on very weak GPUs. Lead with the fill-rate levers
  // (dpr 1.0, all post off), then drop the sun-shadow passes entirely, then the
  // geometry cuts that only weak GPUs feel. Sun shadows OFF is the point-305
  // M1-Pro tuning: the real-GPU benchmark (local/m1pro-bench.json) shows the
  // shadow passes cost ~8.5 ms GPU (resolution-independent — shadow-half moved
  // nothing), 880 extra draw calls (952→72) and ~2 M extra triangles per frame,
  // the biggest remaining lever once dpr + post are already minimal.
  low: {
    dprCap: 1,
    ssao: false,
    traa: false,
    bloom: false,
    sunShadows: false, // point 305: the M1-Pro benchmark's biggest remaining lever
    sunShadowResolution: 1024, // moot while sunShadows is off; kept below medium for the strict low<medium<high climb
    fireShadows: false,
    fireShadowResolution: 0,
    fireShadowSoft: false,
    terrainRefine: false,
    floraFogFactor: 0.55,
    floraCastShadow: false,
    weatherIntensity: 0.6,
    waterCalm: true,
    wildlifeDensity: 0.6,
    figureLimbSegments: 5, // point 479: the frugal floor — a limb still reads, faceted
  },
  // MEDIUM — the default; a good look on the user's RTX-40-class PC. SSAO off
  // (the ~25 % GPU lever kept for high), TRAA + Bloom on, native dpr, normal
  // shadows, the point-289 256² campfire shadows on, full geometry.
  medium: {
    dprCap: null,
    ssao: false,
    traa: true,
    bloom: true,
    sunShadows: true,
    sunShadowResolution: 2048, // today's default
    fireShadows: true,
    fireShadowResolution: 256, // the point-289 variant
    fireShadowSoft: false,
    terrainRefine: true,
    floraFogFactor: 1,
    floraCastShadow: true,
    weatherIntensity: 1,
    waterCalm: false,
    wildlifeDensity: 1,
    figureLimbSegments: 8, // point 479: smooth enough at conversation range
  },
  // HIGH — the richest. SSAO on, sharper sun shadows (4096, above the default),
  // the softer/higher-res campfire shadow variant, everything else full.
  high: {
    dprCap: null,
    ssao: true,
    traa: true,
    bloom: true,
    sunShadows: true,
    sunShadowResolution: 4096, // above today's default (user wants sharper)
    fireShadows: true,
    fireShadowResolution: 512, // the costlier variant
    fireShadowSoft: true,
    terrainRefine: true,
    floraFogFactor: 1,
    floraCastShadow: true,
    weatherIntensity: 1,
    waterCalm: false,
    wildlifeDensity: 1,
    figureLimbSegments: 12, // point 479: no facet on an arm the player stands beside
  },
}

/** The canonical list of quality keys. Kept in lockstep with QualityPreset by
 *  quality.test.ts (which asserts every preset defines exactly these), so a new
 *  key can never be added to one preset while another silently omits it. */
export const QUALITY_KEYS = Object.keys(QUALITY_PRESETS.medium) as Array<keyof QualityPreset>

/**
 * The F9 cycle: each press steps one level DOWN, and from the bottom it wraps to
 * the TOP — medium → low → high → medium (user decision 24.07.2026). Written as
 * an explicit map so the order is unmistakable and pure-testable.
 */
export function nextDetailLevel(level: DetailLevel): DetailLevel {
  switch (level) {
    case 'medium':
      return 'low'
    case 'low':
      return 'high'
    case 'high':
      return 'medium'
  }
}
