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

import * as THREE from 'three/webgpu'
import { color, float, max, mix, mx_fractal_noise_float, positionWorld, uniformArray, vec3 } from 'three/tsl'

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
}

// Slot packing, chosen so the fragment shader needs neither a square root nor a
// divide: (centre x, centre z, r², 1/(r² − (core·r)²)). An INACTIVE slot is all
// zero — its falloff term is (0 − d²)·0 = 0, i.e. it contributes nothing and
// can never divide by zero.
const SLOTS = Array.from({ length: MAX_GROUND_STAINS }, () => new THREE.Vector4(0, 0, 0, 0))

/** The uniform array the terrain material samples (one vec4 per slot). */
export const GROUND_STAIN_U = uniformArray(SLOTS, 'vec4')

/** Read-only view of the packed slots (verification/tests). */
export function groundStainSlots(): readonly THREE.Vector4[] {
  return SLOTS
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
export function setGroundStains(list: readonly GroundStain[], cx: number, cz: number): void {
  const near = selectGroundStains(list, cx, cz)
  for (let i = 0; i < MAX_GROUND_STAINS; i++) {
    const s = near[i]
    if (!s || !(s.r > 0)) {
      SLOTS[i].set(0, 0, 0, 0)
      continue
    }
    const rSq = s.r * s.r
    const coreSq = rSq * STAIN_CORE * STAIN_CORE
    SLOTS[i].set(s.x, s.z, rSq, 1 / (rSq - coreSq))
  }
}

/**
 * CPU mirror of the shader's RADIAL falloff below (the seasonTint.ts mirror
 * pattern): how strongly the ground at (x, z) is soaked, 0..1. Note what it does
 * NOT take: a height. The patch is a function of the horizontal position alone,
 * so it paints whatever relief happens to stand there — that is the whole point
 * of the ground tint over the old floating disc. A change to the falloff must
 * change `groundStainMask` identically; the noise fray the shader multiplies on
 * top is deliberately not mirrored (it only ever weakens the tint, and never
 * below 0.82 of this value, so no assertion here depends on it).
 */
export function groundStainCoverage(list: readonly GroundStain[], x: number, z: number): number {
  let m = 0
  for (const s of list) {
    if (!(s.r > 0)) continue
    const rSq = s.r * s.r
    const coreSq = rSq * STAIN_CORE * STAIN_CORE
    const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z)
    const t = Math.min(1, Math.max(0, (rSq - d) / (rSq - coreSq)))
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
    const dx = px.sub(s.x)
    const dz = pz.sub(s.y)
    const dSq = dx.mul(dx).add(dz.mul(dz))
    const t = s.z.sub(dSq).mul(s.w).clamp(0, 1)
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
