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

/** How the swept settlement ground differs from the open land outside. */
export interface SweptLook {
  /** How much darker the compacted, swept inside reads (0..1, multiplicative). */
  tone: number
  /** How much of the ground's micro-relief the swept inside loses (0..1). */
  relief: number
  /** How much of the open ground's blotchy patch mottling it loses (0..1). */
  mottle: number
}

/**
 * Keyed on `PlaceKind` totality (point 335): a fourth kind of place cannot
 * compile without a decision about its edge. Art constants — the master
 * strength, the band width and the wander are the calibratable balance values.
 */
export const SWEPT_GROUND_BY_KIND: Record<PlaceKind, SweptLook> = {
  // A village floor is swept daily and beaten hard by feet and goats: the
  // strongest read of the three.
  village: { tone: 0.2, relief: 0.5, mottle: 0.6 },
  // A port's outskirts are busier but sandier — the same story, stated softer.
  port: { tone: 0.16, relief: 0.42, mottle: 0.5 },
  // The monument site is open desert sand with visitors' tracks over it; too
  // strong a step would read as a drawn ring on an otherwise even plate.
  monument: { tone: 0.12, relief: 0.3, mottle: 0.35 },
}

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

/**
 * How OPEN the ground reads at a point: 0 deep inside the settlement, 1 out on
 * the open land, ramping across the band. `wander` is this point's warp offset
 * in metres (|wander| <= the wander amplitude).
 */
export function edgeOpenness(radius: number, width: number, distance: number, wander = 0): number {
  const half = Math.max(0.05, width) / 2
  return smoothstep01(radius - half, radius + half, distance + wander)
}

/** The band's visible extent around the boundary, worst case over the wander. */
export function edgeBandBounds(radius: number, width: number, wander: number): { inner: number; outer: number } {
  const w = clampWander(wander, width)
  const half = Math.max(0.05, width) / 2
  return { inner: radius - half - w, outer: radius + half + w }
}

/**
 * How far the outline may actually wander: the hard honesty cap, and never more
 * than 45 % of the band's own half-width. The second bound is what keeps the
 * true boundary INSIDE the visible give-way everywhere — a narrow band may not
 * be shifted clean off the line it stands for, however the debug menu is set.
 */
export function clampWander(wander: number, width = Infinity): number {
  const half = Math.max(0.05, width) / 2
  return Math.min(EDGE_BAND_MAX_WANDER_M, half * 0.9, Math.max(0, wander))
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
  const f = 1 - clamp01(swept) * look.tone * clamp01(strength)
  return [c[0] * f, c[1] * f, c[2] * f]
}

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

/** Read-only view of the driven state, for tests and the bug report. */
export function edgeBandState() {
  return {
    base: EDGE_BASE_U.value as number,
    span: EDGE_SPAN_U.value as number,
    width: EDGE_WIDTH_U.value as number,
    wander: EDGE_WANDER_U.value as number,
    tone: EDGE_TONE_U.value as number,
    relief: EDGE_RELIEF_U.value as number,
    mottle: EDGE_MOTTLE_U.value as number,
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
}

/** Clear the band (no settlement drives it). */
export function clearEdgeBand() {
  EDGE_BASE_U.value = NO_BAND_RADIUS
  EDGE_SPAN_U.value = 0
  EDGE_TONE_U.value = 0
  EDGE_RELIEF_U.value = 0
  EDGE_MOTTLE_U.value = 0
}

/** Frequency of the wander's noise field, in cycles per metre: low, so the
 *  outline bows over ~15 m stretches rather than fraying at every step. */
const WANDER_FREQ = 0.065

/**
 * Shader mirror of `edgeOpenness`: 0 on the swept settlement ground, 1 out on
 * the open land, ramping across the band at the true boundary.
 */
export function edgeOpennessNode() {
  const p = positionWorld.xz
  // Domain warp (design.md §3.3), the same technique the biome borders use: the
  // coordinate that decides the classification is perturbed before it is
  // measured, so the outline meanders instead of describing a machined circle.
  // Clamped, so the offset can never exceed the wander amplitude.
  const warp = mx_fractal_noise_float(vec3(p.mul(WANDER_FREQ), 4.0), 3).clamp(-1, 1).mul(EDGE_WANDER_U)
  // The boundary at this bearing, from the leave check's own sampling.
  const u = atan(p.y, p.x).mul(1 / (Math.PI * 2))
  const radius = EDGE_BASE_U.add(texture(BOUNDARY_TEX, vec2(u, 0.5)).r.mul(EDGE_SPAN_U))
  const half = EDGE_WIDTH_U.mul(0.5)
  return smoothstep(radius.sub(half), radius.add(half), p.length().add(warp))
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
}
