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

/** All three levels, low→high, for enumeration (tests). */
export const DETAIL_LEVELS: readonly DetailLevel[] = ['low', 'medium', 'high']

/** One quality preset: a value for every quality-relevant render setting. Adding
 *  a field here is a COMPILE error until all three presets below define it, and
 *  the runtime completeness gate (quality.test.ts) guards the same at test time. */
export interface QualityPreset {
  /** Device-pixel-ratio cap; null keeps R3F's native ratio. The biggest
   *  fill-rate lever on real hardware (~35 % GPU, point 277). Below 1 the
   *  canvas renders fewer pixels than CSS pixels and is upscaled: the LOW
   *  frame is pixel-bound (docs/bench/310-projection.md). */
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
   *  medium's 2048 (user wants sharper shadows on high, softer on low). */
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
  /** Flora/dressing instance-count factor (point 310) on top of the
   *  floraFogFactor radius cut: the share of the NON-collidable dressing
   *  (bush, rock, termite mound, dead tree, papyrus) that draws; collidable
   *  trees and kopjes always draw (floraStreaming.ts floraKeptAtDensity).
   *  The land keeps reading as its region (design.md §19.9), only thinner. */
  floraDensity: number
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
  /** Frames between behaviour steps of an OFF-SCREEN ambient animal (point
   *  310, the CPU lever for the phone): 1 steps everyone every frame; N > 1
   *  lets an animal outside the rendered frame (the shared isOnScreen
   *  projection) that is in no drama hold its pose for N-1 frames. Drama
   *  animals always step, so every §19 deadline runs in sim time as before
   *  (offscreenThrottle.ts). */
  offscreenBehaviourInterval: number
  /** Radial segments of the villager figures' arm/leg/hand primitives (point
   *  479). The limbs are thin and the eye passes within a metre of them at
   *  conversation range, so the count is what decides whether an arm reads as a
   *  rod or as a limb; a settlement holds a couple of dozen figures, which is
   *  why this is a level lever at all rather than a fixed constant. */
  figureLimbSegments: number
  /** Segments along the current of the settlement river's water surface
   *  (work-order 482). The ripple is a vertex displacement, so this is what
   *  decides whether the water undulates or lies as a flat sheet; one surface
   *  per settlement, hence a modest lever. */
  placeRiverSegments: number
  /** How many items of flotsam — foam patches, leaves, grass tufts, twigs —
   *  ride the settlement river's current (work-orders 482, 1280). Never zero on
   *  any level: they are the reading the UPSTREAM/DOWNSTREAM teaching depends
   *  on, so a frugal level shows fewer, never none. */
  placeRiverFlotsam: number
  /** Fractal octaves of the ONE water detail field (work-order 525,
   *  render/waterAppearance.ts). It prices the water's moving pattern, and it
   *  is deliberately a SINGLE lever for BOTH halves of a settlement river — the
   *  surface drawn at the bank and the panorama's continuation of it — because
   *  a level that thinned one of them would put the seam back. */
  waterDetailOctaves: number
  /** Radial segments of the swept torso, neck and head of the detailed
   *  ungulates — zebra, antelope, settlement goat (work-order 1284); their legs,
   *  tails, horns and manes take a fixed fraction of it. It decides whether a
   *  close animal's outline reads round or faceted; a herd draws one instanced
   *  mesh per species, so the cost is vertices per instance. */
  faunaBodySegments: number
  /** Ring resolution of the villagers' code-built skinned body and its dress
   *  (work-order "villager dress"); 0 keeps the primitive cone-and-sphere
   *  figure (user decision 04.10.2026: low keeps it). A settlement draws one
   *  body and its dress layers per inhabitant, so this prices vertices and
   *  draw calls per villager. */
  figureBodySegments: number
  /** The villagers' body is the glTF one (public/models/villager.glb, work-order
   *  "glTF villager body") instead of the code-built one; the dress layers and
   *  every pose stay. Off where `figureBodySegments` is 0 (the primitive figure,
   *  user decision 04.10.2026). The file loads on the first settlement visit,
   *  never at start-up. */
  figureGltfBody: boolean
  /** Flame billboards along the grass fire's burning line (design.md §19.8/
   *  §19.13). The line itself also glows in the ground shader on every level,
   *  so a frugal level thins the tongues, never the front. */
  grassFireFlames: number
  /** Smoke puffs rising behind the grass fire's line; alpha-blended sprites,
   *  so this prices overdraw. */
  grassFireSmoke: number
  /** Level of the Great Sphinx's site mesh (src/world/sphinx.ts, one
   *  definition for every view): `reduced` is the named frugal mesh, `full`
   *  the finest. Drawn every frame at the walkable Giza site, so this prices
   *  its vertices; the bird's-eye landmark and the Cairo skyline have their
   *  own fixed distant levels. */
  sphinxSiteDetail: 'reduced' | 'standard' | 'full'
  /** Radial segments of the 3D spring body at an open-land river source
   *  (design.md §11.3); its ring count follows at half of it. The surface
   *  bubbles by vertex displacement, so this decides how round the welling
   *  dome reads; a handful of springs, one draw each. */
  springSegments: number
  /** Bubble spheres rising out of each spring's welling dome. The dome's
   *  own surface bubbles on every level, so a frugal level drops the
   *  spheres, never the bubbling. */
  springBubbles: number
  /** First-person eye adaptation (design.md §2.7): the exposure follows the
   *  frame's mean luminance inside the bounded balance.exposure range. Never in
   *  the bird's-eye view, whatever the level (a readability rule, not a cost
   *  choice). Prices a 128² luminance mip chain and a 1² feedback pass. */
  eyeAdaptation: boolean
  /** The sun's glare (design.md §2.7): lens-flare ghosts over the bloom plus a
   *  glare star, both cut by a depth occlusion test at the sun's screen
   *  position. Needs bloom; settlement scenes only. */
  sunGlare: boolean
  /** Sun shafts (design.md §2.7): the upstream GodraysNode raymarches the sun's
   *  shadow map along every view ray at half resolution, so a roof edge or a
   *  palm crown casts visible shafts. Settlement scenes only (the bird's-eye
   *  camera never has the sun in its frame); the one per-pixel-priced effect
   *  of the family, so highest level only and measured by F8. */
  godrays: boolean
  /** Gain of the sky dome's sun disc. Above the bloom threshold on every level;
   *  the glare level lifts it so the disc blooms on its own. */
  sunDiscGain: number
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
    dprCap: 0.8, // calibratable: 0.64x the pixels of dpr 1 — the primary LOW lever (docs/bench/310-projection.md)
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
    floraDensity: 0.6, // calibratable: 40 % fewer small-dressing instances (docs/bench/310-projection.md)
    floraCastShadow: false,
    weatherIntensity: 0.6,
    waterCalm: true,
    wildlifeDensity: 0.6,
    offscreenBehaviourInterval: 3, // calibratable: off-screen ambient animals step every 3rd frame
    figureLimbSegments: 5, // point 479: the frugal floor — a limb still reads, faceted
    placeRiverSegments: 8, // a coarse undulation; the current still reads
    placeRiverFlotsam: 12, // x2 only, to spare the weakest tier (frame cost measured, work-order 1280); never none
    waterDetailOctaves: 1, // one octave: the water still moves, at the lowest shading cost
    faunaBodySegments: 12, // the frugal floor: 30° facets, the shapes and markings still read
    figureBodySegments: 0, // the primitive figure stays (user decision 04.10.2026)
    figureGltfBody: false, // the primitive figure stays: no glTF body is loaded at all
    grassFireFlames: 16, // the burning line's tongues; the ground ember edge draws on every level
    grassFireSmoke: 6, // smoke puffs behind the line (overdraw)
    sphinxSiteDetail: 'reduced', // the named reduced Sphinx mesh (calibratable)
    springSegments: 12, // a coarse dome; its surface still bubbles and rings
    springBubbles: 0, // no spheres — the dome surface itself still bubbles
    eyeAdaptation: false, // fixed exposure
    sunGlare: false, // no bloom to build it on
    godrays: false, // per-pixel raymarch: high only
    sunDiscGain: 3, // the disc before point 344
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
    sunShadowResolution: 2048, // the resolution before the presets existed
    fireShadows: true,
    fireShadowResolution: 256, // the point-289 variant
    fireShadowSoft: false,
    terrainRefine: true,
    floraFogFactor: 1,
    floraDensity: 1,
    floraCastShadow: true,
    weatherIntensity: 1,
    waterCalm: false,
    wildlifeDensity: 1,
    offscreenBehaviourInterval: 1,
    figureLimbSegments: 8, // point 479: smooth enough at conversation range
    placeRiverSegments: 32,
    placeRiverFlotsam: 48, // ~3x the 16 foam patches it had, now a mixed drift
    waterDetailOctaves: 3, // the field before the presets existed
    faunaBodySegments: 18, // round at the bird's-eye range
    figureBodySegments: 16, // the skinned, dressed villager; round at conversation range
    figureGltfBody: true, // the CC0 glTF body under the dress
    grassFireFlames: 28, // the burning line's tongues; the ground ember edge draws on every level
    grassFireSmoke: 14, // smoke puffs behind the line (overdraw)
    sphinxSiteDetail: 'standard', // calibratable
    springSegments: 24, // calibratable
    springBubbles: 4, // calibratable
    eyeAdaptation: false, // fixed exposure
    sunGlare: false,
    godrays: false, // per-pixel raymarch: high only
    sunDiscGain: 3, // the disc before point 344
  },
  // HIGH — the richest. SSAO on, sharper sun shadows (4096, above the default),
  // the softer/higher-res campfire shadow variant, everything else full.
  high: {
    dprCap: null,
    ssao: true,
    traa: true,
    bloom: true,
    sunShadows: true,
    sunShadowResolution: 4096, // above medium's 2048 (user wants sharper)
    fireShadows: true,
    fireShadowResolution: 512, // the costlier variant
    fireShadowSoft: true,
    terrainRefine: true,
    floraFogFactor: 1,
    floraDensity: 1,
    floraCastShadow: true,
    weatherIntensity: 1,
    waterCalm: false,
    wildlifeDensity: 1,
    offscreenBehaviourInterval: 1,
    figureLimbSegments: 12, // point 479: no facet on an arm the player stands beside
    placeRiverSegments: 64,
    placeRiverFlotsam: 90, // ~3x the 30 foam patches it had
    waterDetailOctaves: 4, // one octave more structure on the water
    faunaBodySegments: 24, // no facet on the outline at the closest zoom
    figureBodySegments: 24, // no facet on a head or a hem the player stands beside
    figureGltfBody: true, // the CC0 glTF body under the dress
    grassFireFlames: 40, // the burning line's tongues; the ground ember edge draws on every level
    grassFireSmoke: 24, // smoke puffs behind the line (overdraw)
    sphinxSiteDetail: 'full', // the fuller Sphinx mesh (calibratable)
    springSegments: 36, // a round dome at the closest zoom
    springBubbles: 7, // calibratable
    eyeAdaptation: true, // first person only (design.md §2.7)
    sunGlare: true, // first person only
    godrays: true, // first person only; priced by F8 before it is kept
    sunDiscGain: 14, // calibratable: well above the 0.88 bloom threshold
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
