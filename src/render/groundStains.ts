// Blood on the ground (design.md §19.5, point 267): a kill or a trample soaks
// the GROUND SURFACE itself instead of laying a decal over it.
//
// The old depiction was a flat disc mesh floating a few centimetres above the
// terrain along its ground normal. On a slope that reads wrong however it is
// tilted: the disc is a PLANE and the terrain under it is not, so rising ground
// pokes through the middle and the pool shows a see-through hole (user report,
// screenshot 23.07.2026). Raising the disc only makes it hover elsewhere, and
// conforming a mesh to the relief costs geometry per stain.
//
// So the stain became a property of the ground, in the mould of the rain-wet
// ground tint (point 225, seasonTint.ts): the terrain material mixes its albedo
// toward blood inside a round, world-space patch. Being a shading term of the
// ground surface it follows the relief EXACTLY — there is no second surface that
// could part from it, at any slope, at any zoom, on either backend.
//
// The patches ride a small uniform array the travel scene refills each frame
// with the nearest stains (a uniform, not a fresh material, so it never trips
// point 96's program relink).
//
// Its FOOTPRINT is not a circle (point 323). Blood runs into whatever the earth
// gives it, so the radial falloff is domain-warped per stain — the technique the
// §3.3 biome borders use, applied to the coordinate that decides the falloff
// rather than to the biome: the outline radius at a bearing is the base radius
// times a seeded harmonic contour, so every patch has its own ragged outline and
// no two are alike. The warp is a function of the BEARING alone, which is what
// keeps the point-267 promise intact: along every ray out of the centre the mask
// still falls monotonically, so a ragged outline can never open a hole inside
// the pool. Like the settlement edge band it is a term in a material that is
// already drawn — no pass, no texture, nothing measurable to switch off — so it
// carries no quality key.

import * as THREE from 'three/webgpu'
import {
  atan,
  color,
  float,
  max,
  mix,
  mx_fractal_noise_float,
  positionWorld,
  sin,
  uniform,
  uniformArray,
  vec3,
} from 'three/tsl'

/** Ground-tint slots the terrain shader evaluates per fragment. The nearest
 *  stains win (`selectGroundStains`); a bird's-eye view rarely holds more, and
 *  the per-fragment cost is bounded by this number. */
export const MAX_GROUND_STAINS = 8

/** Fraction of the radius that stays FULLY soaked; the tint fades out from
 *  there to the rim, so the patch has a soft edge rather than a stamped circle. */
export const STAIN_CORE = 0.72

/** A blood patch on the ground: a world-space centre and its radius. */
export interface GroundStain {
  x: number
  z: number
  /** Radius in world units — the same radius the decal disc used to have. */
  r: number
  /** Outline seed; derived from the position when absent, so a patch keeps one
   *  shape for its whole life and two patches never share one by accident. */
  seed?: number
}

/** Calibration of the patches (balance.bloodStain, debug-editable per §21). */
export interface StainLook {
  /** Size factor on every patch's radius (1 = the base ~0.9 m kill patch). */
  sizeScale: number
  /** How far the outline swings off that radius, as a fraction of it: 0 is a
   *  machined circle, 0.25 a clearly ragged one. */
  irregularity: number
}

/** Used where no calibration is passed (the pure mirrors, the tests). */
export const STAIN_LOOK_DEFAULT: StainLook = { sizeScale: 1, irregularity: 0.24 }

/** Hard cap on the swing, applied to whatever the debug menu sets: the outline
 *  may be ragged, it may never fold through itself or pinch off the pool. */
export const STAIN_MAX_IRREGULARITY = 0.45

/** The calibrated swing, clamped into the range the contour stays sane over. */
export function clampIrregularity(v: number): number {
  return Math.min(STAIN_MAX_IRREGULARITY, Math.max(0, v || 0))
}

// The contour's harmonics: how many times the outline bows over a full turn.
// Coprime orders, so the four never line up into a rosette, and amplitudes
// summing to 1, so the warp stays inside ±1 and the swing is exactly the
// calibrated fraction. Order 2 gives the broad lopsidedness of a pool that ran
// one way, 8 the small frays at its rim.
const CONTOUR_HARMONICS: readonly { order: number; amp: number }[] = [
  { order: 2, amp: 0.44 },
  { order: 3, amp: 0.28 },
  { order: 5, amp: 0.18 },
  { order: 8, amp: 0.1 },
]

/** Number of seeded phases a stain's outline needs (one per harmonic). */
export const STAIN_PHASES = CONTOUR_HARMONICS.length

const TAU = Math.PI * 2

/** The classic sine hash, 0..1 — deterministic, so a run replays identically. */
function hash01(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** A patch's outline seed: its own, or one derived from where it lies. */
export function stainSeed(s: GroundStain): number {
  return s.seed ?? hash01(s.x, s.z)
}

/** The seeded phase of harmonic `i` — what makes each outline its own. */
export function stainPhase(seed: number, i: number): number {
  return hash01(seed * 97.31 + i * 41.73, seed * 13.79 - i * 7.13) * TAU
}

/**
 * The contour factor at a bearing: what the base radius is multiplied by there.
 * 1 is the plain circle; the value stays inside 1 ± the clamped irregularity, so
 * the outline wanders visibly without ever inverting. Mirrored by the shader.
 */
export function stainContourFactor(seed: number, angle: number, irregularity: number): number {
  const irr = clampIrregularity(irregularity)
  let w = 0
  for (let i = 0; i < CONTOUR_HARMONICS.length; i++) {
    const h = CONTOUR_HARMONICS[i]
    w += h.amp * Math.sin(h.order * angle + stainPhase(seed, i))
  }
  return 1 + irr * w
}

/** Where the patch's outline runs at a bearing, in world units. */
export function stainContourRadius(s: GroundStain, angle: number, look: StainLook = STAIN_LOOK_DEFAULT): number {
  return s.r * look.sizeScale * stainContourFactor(stainSeed(s), angle, look.irregularity)
}

// Slot packing, chosen so the fragment shader needs neither a square root nor a
// divide: (centre x, centre z, r², 1/(r² − (core·r)²)). An INACTIVE slot is all
// zero — its falloff term is (0 − d²)·0 = 0, i.e. it contributes nothing and
// can never divide by zero.
const SLOTS = Array.from({ length: MAX_GROUND_STAINS }, () => new THREE.Vector4(0, 0, 0, 0))

// The outline of the slot in the same index: the four seeded harmonic phases.
// They are constant for a patch's whole life, so they are computed here once per
// upload rather than hashed per fragment.
const WARP_SLOTS = Array.from({ length: MAX_GROUND_STAINS }, () => new THREE.Vector4(0, 0, 0, 0))

/** The uniform array the terrain material samples (one vec4 per slot). */
export const GROUND_STAIN_U = uniformArray(SLOTS, 'vec4')

/** The matching outline phases (one vec4 per slot). */
export const GROUND_STAIN_WARP_U = uniformArray(WARP_SLOTS, 'vec4')

/** The calibrated outline swing — one value for every patch on screen. */
export const GROUND_STAIN_IRREGULARITY_U = uniform(STAIN_LOOK_DEFAULT.irregularity)

/** Read-only view of the packed slots (verification/tests). */
export function groundStainSlots(): readonly THREE.Vector4[] {
  return SLOTS
}

/** Read-only view of the packed outline phases (verification/tests). */
export function groundStainWarpSlots(): readonly THREE.Vector4[] {
  return WARP_SLOTS
}

/**
 * The `max` nearest stains to (cx, cz) — the ones the player can actually see.
 * Pure and allocation-bounded (an insertion into a list capped at `max`).
 */
export function selectGroundStains<T extends GroundStain>(
  list: readonly T[],
  cx: number,
  cz: number,
  maxCount = MAX_GROUND_STAINS,
): T[] {
  const near: T[] = []
  const dists: number[] = []
  for (const s of list) {
    const d = (s.x - cx) * (s.x - cx) + (s.z - cz) * (s.z - cz)
    let i = near.length
    while (i > 0 && dists[i - 1] > d) i--
    if (i >= maxCount) continue
    near.splice(i, 0, s)
    dists.splice(i, 0, d)
    if (near.length > maxCount) {
      near.pop()
      dists.pop()
    }
  }
  return near
}

/** Upload this frame's stains, nearest to (cx, cz) first; unused slots clear. */
export function setGroundStains(
  list: readonly GroundStain[],
  cx: number,
  cz: number,
  look: StainLook = STAIN_LOOK_DEFAULT,
): void {
  const near = selectGroundStains(list, cx, cz)
  GROUND_STAIN_IRREGULARITY_U.value = clampIrregularity(look.irregularity)
  const scale = Math.max(0, look.sizeScale)
  for (let i = 0; i < MAX_GROUND_STAINS; i++) {
    const s = near[i]
    const r = s ? s.r * scale : 0
    if (!s || !(r > 0)) {
      SLOTS[i].set(0, 0, 0, 0)
      WARP_SLOTS[i].set(0, 0, 0, 0)
      continue
    }
    const rSq = r * r
    const coreSq = rSq * STAIN_CORE * STAIN_CORE
    SLOTS[i].set(s.x, s.z, rSq, 1 / (rSq - coreSq))
    const seed = stainSeed(s)
    WARP_SLOTS[i].set(stainPhase(seed, 0), stainPhase(seed, 1), stainPhase(seed, 2), stainPhase(seed, 3))
  }
}

/**
 * CPU mirror of the shader's falloff below (the seasonTint.ts mirror pattern):
 * how strongly the ground at (x, z) is soaked, 0..1, over the seeded outline.
 * Note what it does NOT take: a height. The patch is a function of the
 * horizontal position alone, so it paints whatever relief happens to stand
 * there — that is the whole point of the ground tint over the old floating disc.
 * A change to the falloff must change `groundStainMask` identically; the noise
 * fray the shader multiplies on top is deliberately not mirrored (it only ever
 * weakens the tint, and never below 0.82 of this value, so no assertion here
 * depends on it).
 */
export function groundStainCoverage(
  list: readonly GroundStain[],
  x: number,
  z: number,
  look: StainLook = STAIN_LOOK_DEFAULT,
): number {
  let m = 0
  const scale = Math.max(0, look.sizeScale)
  for (const s of list) {
    const r = s.r * scale
    if (!(r > 0)) continue
    const rSq = r * r
    const coreSq = rSq * STAIN_CORE * STAIN_CORE
    const dx = x - s.x
    const dz = z - s.z
    const d = dx * dx + dz * dz
    // The seeded outline at THIS bearing, squared: it scales the whole falloff,
    // so the soaked core keeps its share of the radius wherever the rim runs.
    const g = stainContourFactor(stainSeed(s), Math.atan2(dz, dx), look.irregularity)
    const gSq = g * g
    const t = Math.min(1, Math.max(0, (rSq * gSq - d) / ((rSq - coreSq) * gSq)))
    m = Math.max(m, t * t)
  }
  return m
}

// The published TSL typings are narrower than the runtime (the same gap
// materials.ts and seasonTint.ts bridge with `unknown`): a uniform-array element
// does not carry its vec4 type through, and the float node aliases differ per
// construction site. The casts below bridge only that gap.
type FloatNode = ReturnType<typeof float>

/** The per-fragment soak, 0..1, over all slots (see groundStainCoverage). */
export function groundStainMask(): FloatNode {
  const px = positionWorld.x as unknown as FloatNode
  const pz = positionWorld.z as unknown as FloatNode
  let m = float(0) as unknown as FloatNode
  for (let i = 0; i < MAX_GROUND_STAINS; i++) {
    // Slot layout: (centre x, centre z, r², 1/(r² − core²)) — see SLOTS above.
    const s = GROUND_STAIN_U.element(i) as unknown as {
      x: FloatNode
      y: FloatNode
      z: FloatNode
      w: FloatNode
    }
    const ph = GROUND_STAIN_WARP_U.element(i) as unknown as {
      x: FloatNode
      y: FloatNode
      z: FloatNode
      w: FloatNode
    }
    const dx = px.sub(s.x)
    const dz = pz.sub(s.y)
    const dSq = dx.mul(dx).add(dz.mul(dz))
    // Mirror of `stainContourFactor`: the seeded harmonics of the outline at
    // this bearing. A function of the bearing ALONE — so the falloff still
    // decays monotonically outward and no ragged rim can open an interior hole.
    const a = atan(dz, dx)
    const warp = sin(a.mul(CONTOUR_HARMONICS[0].order).add(ph.x)).mul(CONTOUR_HARMONICS[0].amp)
      .add(sin(a.mul(CONTOUR_HARMONICS[1].order).add(ph.y)).mul(CONTOUR_HARMONICS[1].amp))
      .add(sin(a.mul(CONTOUR_HARMONICS[2].order).add(ph.z)).mul(CONTOUR_HARMONICS[2].amp))
      .add(sin(a.mul(CONTOUR_HARMONICS[3].order).add(ph.w)).mul(CONTOUR_HARMONICS[3].amp))
    const gSq = float(1).add(GROUND_STAIN_IRREGULARITY_U.mul(warp)).pow2()
    // (r²g² − d²) · 1/(r²−core²) · 1/g². A cleared slot is all zero, so its term
    // is (0 − d²)·0·… = 0 — no tint, and no division by a radius that is not
    // there (1/g² is finite for every reachable irregularity).
    const t = s.z.mul(gSq).sub(dSq).mul(s.w).mul(float(1).div(gSq)).clamp(0, 1)
    m = max(m, t.mul(t)) as unknown as FloatNode
  }
  // Blood does not pool as a drawn circle: one world-space noise field (ONE
  // evaluation for all slots) frays the rim and mottles the soak, so the patch
  // reads as earth drinking it unevenly. It shifts the soak by at most ±18 %
  // and the fully soaked middle clamps back to 1, so the fray works the rim
  // only — no speck of bare ground ever opens inside the pool.
  const grain = mx_fractal_noise_float(vec3(positionWorld.xz.mul(1.7), 4.0), 2).mul(0.5).add(0.5)
  return m.mul(grain.mul(0.36).add(0.82)).clamp(0, 1) as unknown as FloatNode
}

// Soaked earth: dark and red, but never a flat sticker — the ground's own
// brightness carries through, so grain, macro variation and the shading of the
// relief stay legible under the blood.
const BLOOD = color('#7a1310')

/** Mix a ground albedo node toward blood where the mask soaks it. */
export function bloodGroundColor(col: unknown, mask: FloatNode) {
  const c = col as ReturnType<typeof color>
  const luma = c.r.mul(0.35).add(c.g.mul(0.5)).add(c.b.mul(0.15))
  return mix(c, BLOOD.mul(luma.mul(0.9).add(0.35)), mask)
}

/** Fresh blood glistens: pull a ground roughness node down where it soaks. */
export function bloodGroundRoughness(rough: unknown, mask: FloatNode) {
  return (rough as FloatNode).mul(float(1).sub(mask.mul(0.45)))
}
