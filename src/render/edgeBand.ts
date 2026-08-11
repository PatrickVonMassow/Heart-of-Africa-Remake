// The settlement edge painted on the ground (design.md §2.6, work-order
// 352/488): where the inhabited ground ends, the swept, trodden earth of the
// settlement gives way to open land across a soft band — so the player can see
// how far he may walk instead of the boundary being invisible until the view
// suddenly changes.
//
// Quiet and of the world: a tonal and textural change in the ground the already
// drawn material carries (the swept inside reads darker, calmer and flatter
// than the mottled open ground outside) — no drawn ring, no glow, nothing a
// traveller of 1890 would not have seen underfoot. It is a term in a material
// that is already drawn, not a pass, so it carries NO quality key: like the sun
// model, it has no measurable cost to switch off.
//
// It must not lie. The band's radius is never written here — it comes from the
// boundary the leave check reads (`src/scenes/place/boundary.ts`), sampled per
// angle into the lookup below, so the two cannot drift. The outline wanders by
// the domain-warp technique the biome borders use (design.md §3.3): the
// coordinate that decides the classification is perturbed by a low-frequency
// noise field before it is measured. The perturbation is bounded by its
// amplitude, so the visible band can never depart from the true boundary by
// more than `EDGE_BAND_MAX_WANDER_M` — it may look natural, it may not mislead.

import * as THREE from 'three/webgpu'
import { atan, float, mx_fractal_noise_float, positionWorld, smoothstep, texture, uniform, vec2, vec3 } from 'three/tsl'
import type { PlaceKind } from '../world/geo'
import { BOUNDARY_LUT_SIZE } from '../scenes/place/boundary'

/** How far the wandering outline may ever sit from the true boundary, in metres.
 *  A hard cap, applied to whatever the debug menu sets: a calibration slip must
 *  not turn the honest edge into a lie. */
export const EDGE_BAND_MAX_WANDER_M = 1.5

/**
 * The share of the band's width the value change is CONCENTRATED into (work-order
 * 581). The band stays as wide as it is calibrated — its tails fade out over the
 * full `widthM` — but the fall from swept to open happens over this fraction of
 * it, centred on the true boundary.
 *
 * The reason is how an eye works, and the user's report is the evidence: at the
 * shipped defaults, with `strength` already at its ceiling, the boundary was
 * "zu schlecht erkennbar". A ~1/5 tonal change SPREAD over three metres is a
 * low-frequency luminance gradient, exactly the signal human vision normalises
 * away — and the settlement ground's own broad mottling carries a change of the
 * same amplitude at the same scale, so the edge had nothing the ground did not
 * already have. Concentrated into about a metre of the same 3 m band, the
 * identical amount of contrast becomes a LOCAL step the eye reads at a glance,
 * while the soft shoulders keep it a give-way rather than a painted stripe.
 */
export const EDGE_RAMP_CORE = 0.5

/** How the swept settlement ground differs from the open land outside. */
export interface SweptLook {
  /** How much darker the compacted, swept inside reads (0..1, multiplicative). */
  tone: number
  /** How much of the ground's micro-relief the swept inside loses (0..1). */
  relief: number
  /** How much of the open ground's blotchy patch mottling it loses (0..1). */
  mottle: number
  /** How far the swept inside is drawn toward its own grey (0..1): the loose,
   *  warm dust is beaten out of a yard that is walked and swept every day, and
   *  what stays is the paler clay under it. Luma-preserving by construction, so
   *  it adds a SECOND dimension to the read on a sand-coloured village where the
   *  value step alone has little to work with (work-order 581). */
  desat: number
}

/**
 * Keyed on `PlaceKind` totality (point 335): a fourth kind of place cannot
 * compile without a decision about its edge. Art constants — the master
 * strength, the band width and the wander are the calibratable balance values.
 *
 * The tones are what `strength: 1` MEANS, and work-order 581 moved them with the
 * design rather than raising a ceiling that was already at its top: the swept
 * ground now reads about two fifths darker than the open land in a village. It
 * can be stated that plainly because the mottling no longer fights it — the
 * swept side is levelled to the open ground's own MEAN (`SWEPT_PATCH_MEAN`)
 * instead of to its bright, unblotched colour, so `tone` is the whole value
 * step, not a number two thirds of which was eaten again.
 */
export const SWEPT_GROUND_BY_KIND: Record<PlaceKind, SweptLook> = {
  // A village floor is swept daily and beaten hard by feet and goats: the
  // strongest read of the three, and the case the user reported (a Bambara
  // village on pale sand, where hue buys nothing and only value carries).
  village: { tone: 0.4, relief: 0.72, mottle: 0.85, desat: 0.35 },
  // A port's outskirts are busier but sandier — the same story, stated softer.
  port: { tone: 0.34, relief: 0.6, mottle: 0.75, desat: 0.3 },
  // The monument site is open desert sand with visitors' tracks over it; too
  // strong a step would read as a drawn ring on an otherwise even plate.
  monument: { tone: 0.26, relief: 0.45, mottle: 0.6, desat: 0.22 },
}

/**
 * How much of the open ground's dark patch mottling the SWEPT side keeps as an
 * even tone (0..1 of the mottling's own weight). Sweeping levels a ground; it
 * does not bleach it. Mixing the swept side to the unblotched colour made it
 * BRIGHTER, which is why a `tone: 0.28` used to arrive in the picture as a step
 * of a twentieth (measured: the shipped band moved a crop by ×0.94 at capetown
 * and ×0.905 at giza). The swept side is levelled to the mottling's MEAN
 * coverage instead, so the blotches disappear at constant value and the tone
 * step lands whole.
 *
 * The value is the mean of the shader's own patch term over the ground —
 * calibratable, and mirrored by `sweptGroundLevel` so the CPU contrast model and
 * the shader cannot drift apart.
 */
export const SWEPT_PATCH_MEAN = 0.34

// --- Pure math (mirrored by the shader below) ---------------------------------

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** Smoothstep, the shader's ramp. */
function smoothstep01(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/** Inverse of `smoothstep01(0, 1, x)`, the closed form of the cubic. */
function invSmoothstep01(y: number): number {
  return 0.5 - Math.sin(Math.asin(1 - 2 * clamp01(y)) / 3)
}

/**
 * Half of the VISIBLE fall, as a fraction of the band's width: where the core
 * (`EDGE_RAMP_CORE`, defined on the ramp's output) lands back in distance. About
 * 0.17 — a 3 m band falls over roughly its middle metre. Derived, never guessed,
 * because the wander is bounded against it: the true boundary has to stay inside
 * the part of the band the player can actually SEE change.
 */
export const EDGE_CORE_HALF = invSmoothstep01(0.5 + EDGE_RAMP_CORE / 2) - 0.5

/**
 * How OPEN the ground reads at a point: 0 deep inside the settlement, 1 out on
 * the open land, ramping across the band. `wander` is this point's warp offset
 * in metres (|wander| <= the wander amplitude). The ramp is CONCENTRATED into
 * the band's core (`EDGE_RAMP_CORE`) so the change reads as a step underfoot
 * rather than as a gradient nobody sees; the tails stay soft.
 */
export function edgeOpenness(radius: number, width: number, distance: number, wander = 0): number {
  const half = Math.max(0.05, width) / 2
  const t = smoothstep01(radius - half, radius + half, distance + wander)
  return smoothstep01(0.5 - EDGE_RAMP_CORE / 2, 0.5 + EDGE_RAMP_CORE / 2, t)
}

/** The band's visible extent around the boundary, worst case over the wander. */
export function edgeBandBounds(radius: number, width: number, wander: number): { inner: number; outer: number } {
  const w = clampWander(wander, width)
  const half = Math.max(0.05, width) / 2
  return { inner: radius - half - w, outer: radius + half + w }
}

/**
 * How far the outline may actually wander: the hard honesty cap, and never more
 * than 90 % of the band's VISIBLE fall (`EDGE_CORE_HALF` of its width). The
 * second bound is what keeps the true boundary inside the give-way the player
 * can see — a narrow band may not be shifted clean off the line it stands for,
 * however the debug menu is set. It is measured against the fall since
 * work-order 581: a warp that pushed the true line out of the ramp and into the
 * band's flat tail would leave the player reading an edge that no longer sat on
 * the boundary, which is the one thing the band may not do.
 */
export function clampWander(wander: number, width = Infinity): number {
  const w = Math.max(0.05, width)
  return Math.min(EDGE_BAND_MAX_WANDER_M, w * EDGE_CORE_HALF * 0.9, Math.max(0, wander))
}

/**
 * CPU mirror of the shader's swept-earth tone step. It is MULTIPLICATIVE and
 * applied after the season tint, so the inside/outside contrast is the same
 * ratio at both ends of the year — the edge stays readable in the dry-season
 * straw as well as in the rains (design.md §19.13).
 */
export function sweptGroundColor(
  c: [number, number, number],
  swept: number,
  look: SweptLook,
  strength = 1,
): [number, number, number] {
  const s = clamp01(swept) * clamp01(strength)
  // The dust beaten out first (toward the colour's OWN grey, so this moves no
  // brightness at all), the compaction darkening on top of it.
  const d = s * look.desat
  const grey = groundLuma(c)
  const f = 1 - s * look.tone
  return [
    (c[0] + (grey - c[0]) * d) * f,
    (c[1] + (grey - c[1]) * d) * f,
    (c[2] + (grey - c[2]) * d) * f,
  ]
}

type Rgb = [number, number, number]

const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

/** Perceived brightness of a linear ground colour, weighted as the rendered
 *  frames are measured (`scripts/verify/polish.mjs`), so the CPU model and the
 *  picture speak about the same quantity. */
export function groundLuma(c: Rgb): number {
  return c[0] * 0.35 + c[1] * 0.5 + c[2] * 0.15
}

/** One settlement ground as `createGroundMaterial` is given it. */
export interface GroundPalette {
  /** The two colours the broad drift mixes between. */
  base: Rgb
  alt: Rgb
  /** The dark blotch colour of the patch mottling. */
  patch: Rgb
  /** How much of that blotch colour the mottling ever mixes in (its ceiling). */
  patchWeight: number
}

/**
 * The MEAN colour of the open settlement ground — the broad drift at its middle,
 * carrying the patch mottling's average coverage. This is the level the swept
 * side is levelled to, so that losing the blotches costs no brightness.
 */
export function openGroundLevel(palette: GroundPalette): Rgb {
  const even = mixRgb(palette.base, palette.alt, 0.5)
  return mixRgb(even, palette.patch, palette.patchWeight * SWEPT_PATCH_MEAN)
}

/**
 * CPU mirror of what the edge does to the ground's VALUE: the swept side's
 * brightness against the open land's, as the picture measures it. The band's
 * whole legibility rests on this number, so it is pinned per place kind and per
 * palette in `edgeBand.test.ts` — a later ground or palette change cannot
 * quietly bleach the boundary away again.
 */
export function edgeGroundContrast(
  look: SweptLook,
  palette: GroundPalette,
  strength = 1,
): { open: Rgb; swept: Rgb; contrast: number } {
  const open = openGroundLevel(palette)
  const swept = sweptGroundColor(open, 1, look, strength)
  return { open, swept, contrast: 1 - groundLuma(swept) / groundLuma(open) }
}

/**
 * The least value contrast a settlement edge may read at, as a share of the open
 * ground's own brightness. Measured against the failure it answers: the shipped
 * band arrived in the rendered frame at 0.05–0.10 and the user could not make
 * the boundary out at all (work-order 581). This bar sits far above that, at a
 * step verified BY LOOKING at the Bambara village it was reported from.
 */
export const MIN_EDGE_CONTRAST = 0.22

// --- Shader side --------------------------------------------------------------

// The boundary sampled over the full turn, as a byte lookup: radius(angle) =
// base + span · texel. A byte is filterable on both backends (a float texture
// is not, on WebGPU) and costs nothing today, where the boundary is a circle
// and every texel is 0 — the radius is then exactly `base`. Module-level, like
// SEASON_TINT_U: one texture and one set of uniforms for the whole game, so a
// place change never relinks a shader program (point 96).
const BOUNDARY_TEX = new THREE.DataTexture(new Uint8Array(BOUNDARY_LUT_SIZE), BOUNDARY_LUT_SIZE, 1, THREE.RedFormat)
BOUNDARY_TEX.wrapS = THREE.RepeatWrapping
BOUNDARY_TEX.minFilter = THREE.LinearFilter
BOUNDARY_TEX.magFilter = THREE.LinearFilter
BOUNDARY_TEX.generateMipmaps = false
BOUNDARY_TEX.needsUpdate = true

// A radius far outside any place: until a settlement drives the band, the whole
// ground reads as swept inside — never as a spurious edge in the picture.
const NO_BAND_RADIUS = 1e6

const EDGE_BASE_U = uniform(NO_BAND_RADIUS)
const EDGE_SPAN_U = uniform(0)
const EDGE_WIDTH_U = uniform(3)
const EDGE_WANDER_U = uniform(0)
const EDGE_TONE_U = uniform(0)
const EDGE_RELIEF_U = uniform(0)
const EDGE_MOTTLE_U = uniform(0)
const EDGE_DESAT_U = uniform(0)

/** Read-only view of the driven state, for the tests that compare the band's
 *  drawn boundary with the leave check's own. */
export function edgeBandState() {
  return {
    base: EDGE_BASE_U.value as number,
    span: EDGE_SPAN_U.value as number,
    width: EDGE_WIDTH_U.value as number,
    wander: EDGE_WANDER_U.value as number,
    tone: EDGE_TONE_U.value as number,
    relief: EDGE_RELIEF_U.value as number,
    mottle: EDGE_MOTTLE_U.value as number,
    desat: EDGE_DESAT_U.value as number,
    /** The boundary the band draws at, decoded back from the lookup. */
    radiusAt: (angle: number) => {
      const u = angle / (Math.PI * 2)
      const j = ((Math.round(u * BOUNDARY_LUT_SIZE - 0.5) % BOUNDARY_LUT_SIZE) + BOUNDARY_LUT_SIZE) % BOUNDARY_LUT_SIZE
      const b = (BOUNDARY_TEX.image.data as Uint8Array)[j] / 255
      return (EDGE_BASE_U.value as number) + b * (EDGE_SPAN_U.value as number)
    },
  }
}

/**
 * Point the band at a settlement's boundary. `radii` is the boundary sampled
 * over the full turn (`buildBoundaryLut`) — the band never holds a radius of
 * its own. Call it when the layout changes.
 */
export function setEdgeBandBoundary(radii: Float32Array) {
  let min = Infinity
  let max = -Infinity
  for (const r of radii) {
    if (r < min) min = r
    if (r > max) max = r
  }
  if (!Number.isFinite(min)) {
    min = NO_BAND_RADIUS
    max = NO_BAND_RADIUS
  }
  const span = max - min
  const data = BOUNDARY_TEX.image.data as Uint8Array
  for (let j = 0; j < data.length; j++) {
    const r = radii[Math.min(radii.length - 1, Math.floor((j * radii.length) / data.length))]
    data[j] = span > 0 ? Math.round(((r - min) / span) * 255) : 0
  }
  EDGE_BASE_U.value = min
  EDGE_SPAN_U.value = span
  BOUNDARY_TEX.needsUpdate = true
}

/**
 * Set this frame's band look: the calibratable width/wander/strength from the
 * balance config, scaled onto the place kind's own swept-ground look. Driven
 * per frame like SEASON_TINT_U, so a debug edit lands live.
 */
export function setEdgeBandLook(
  kind: PlaceKind,
  cfg: { widthM: number; wanderM: number; strength: number },
) {
  const look = SWEPT_GROUND_BY_KIND[kind]
  const s = clamp01(cfg.strength)
  const width = Math.max(0.2, cfg.widthM)
  EDGE_WIDTH_U.value = width
  EDGE_WANDER_U.value = clampWander(cfg.wanderM, width)
  EDGE_TONE_U.value = look.tone * s
  EDGE_RELIEF_U.value = look.relief * s
  EDGE_MOTTLE_U.value = look.mottle * s
  EDGE_DESAT_U.value = look.desat * s
}

/** Clear the band (no settlement drives it). */
export function clearEdgeBand() {
  EDGE_BASE_U.value = NO_BAND_RADIUS
  EDGE_SPAN_U.value = 0
  EDGE_TONE_U.value = 0
  EDGE_RELIEF_U.value = 0
  EDGE_MOTTLE_U.value = 0
  EDGE_DESAT_U.value = 0
}

/** Frequency of the wander's noise field, in cycles per metre: low, so the
 *  outline bows over ~15 m stretches rather than fraying at every step. */
const WANDER_FREQ = 0.065

/** Frequency of the FINGERING octave, in cycles per metre: the shorter swing
 *  that lets the swept ground reach out and fall back over a couple of paces,
 *  the way a daily-swept yard really ends (work-order 581). It shares the wander
 *  amplitude rather than adding to it, so the honesty bound is untouched. */
const FINGER_FREQ = 0.34

/** How the wander amplitude is split between the long bow and the fingering.
 *  The two weights sum to 1, so |warp| <= EDGE_WANDER_U stays exact. */
const FINGER_SHARE = 0.35

/**
 * Shader mirror of `edgeOpenness`: 0 on the swept settlement ground, 1 out on
 * the open land, ramping across the band at the true boundary.
 */
export function edgeOpennessNode() {
  const p = positionWorld.xz
  // Domain warp (design.md §3.3), the same technique the biome borders use: the
  // coordinate that decides the classification is perturbed before it is
  // measured, so the outline meanders instead of describing a machined circle.
  // Two scales of it: the long bow, and a shorter fingering that breaks the
  // remaining regularity now that the ramp is narrow enough to be SEEN as a line.
  // Both clamped and weighted to sum to one, so the offset can never exceed the
  // wander amplitude.
  const bow = mx_fractal_noise_float(vec3(p.mul(WANDER_FREQ), 4.0), 3).clamp(-1, 1)
  const fingers = mx_fractal_noise_float(vec3(p.mul(FINGER_FREQ), 11.0), 2).clamp(-1, 1)
  const warp = bow.mul(1 - FINGER_SHARE).add(fingers.mul(FINGER_SHARE)).mul(EDGE_WANDER_U)
  // The boundary at this bearing, from the leave check's own sampling.
  const u = atan(p.y, p.x).mul(1 / (Math.PI * 2))
  const radius = EDGE_BASE_U.add(texture(BOUNDARY_TEX, vec2(u, 0.5)).r.mul(EDGE_SPAN_U))
  const half = EDGE_WIDTH_U.mul(0.5)
  const t = smoothstep(radius.sub(half), radius.add(half), p.length().add(warp))
  // The core (see EDGE_RAMP_CORE): the same amount of change, concentrated into
  // the middle of the band so it reads as an edge instead of a gradient.
  return smoothstep(float(0.5 - EDGE_RAMP_CORE / 2), float(0.5 + EDGE_RAMP_CORE / 2), t)
}

/** How SWEPT the ground reads here: 1 inside the settlement, 0 outside. */
export function sweptNode() {
  return edgeOpennessNode().oneMinus()
}

/** The band's uniforms, for the material to weight its own terms with. */
export const edgeBandUniforms = {
  tone: EDGE_TONE_U as unknown as ReturnType<typeof float>,
  relief: EDGE_RELIEF_U as unknown as ReturnType<typeof float>,
  mottle: EDGE_MOTTLE_U as unknown as ReturnType<typeof float>,
  desat: EDGE_DESAT_U as unknown as ReturnType<typeof float>,
}
