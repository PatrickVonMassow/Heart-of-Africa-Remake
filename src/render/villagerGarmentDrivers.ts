// The drivers of the villager garments' corrective shapes (work-order point
// "villager garments: pose-driven correction"): per bone of
// VILLAGER_ASSET.garmentDriverBones, the DRAWN local rotation (the hung
// skeleton's, what villagerClipPose.ts `toHung` writes onto the bones) turns
// the bone's hung rest axis — down for a limb, up for the trunk and head — and
// the turned axis's x and z components, split into their positive and
// negative parts, are four drivers in [0, 1]. Driver 0 is constant 1.
//
// The pipeline evaluates exactly this (scripts/villager/correct.py `drivers`)
// to fit the shapes; a garment drawn with them takes these values as its morph
// influences, in this order.
//
// Pure: quaternions in, numbers out.

import * as THREE from 'three/webgpu'
import { VILLAGER_ASSET } from '../config/balance'

const UP = new THREE.Vector3(0, 1, 0)
const DOWN = new THREE.Vector3(0, -1, 0)
const _u = new THREE.Vector3()

/** The drivers' names, in the order of the shapes. */
export function garmentDriverNames(): string[] {
  const out = ['always']
  for (const [b] of VILLAGER_ASSET.garmentDriverBones) out.push(`${b}+x`, `${b}-x`, `${b}+z`, `${b}-z`)
  return out
}

/**
 * The driver values for the drawn bones' local rotations (`local[i]` for
 * `bones[i]`, the hung skeleton's). Writes `out` and returns it.
 */
export function garmentDrivers(
  bones: readonly string[],
  local: readonly THREE.Quaternion[],
  out = new Float32Array(1 + 4 * VILLAGER_ASSET.garmentDriverBones.length),
): Float32Array {
  out[0] = 1
  VILLAGER_ASSET.garmentDriverBones.forEach(([b, axis], k) => {
    const i = bones.indexOf(b)
    if (i < 0) throw new Error(`garment driver: no bone ${b}`)
    _u.copy(axis === 'up' ? UP : DOWN).applyQuaternion(local[i])
    out[1 + 4 * k] = Math.max(0, _u.x)
    out[2 + 4 * k] = Math.max(0, -_u.x)
    out[3 + 4 * k] = Math.max(0, _u.z)
    out[4 + 4 * k] = Math.max(0, -_u.z)
  })
  return out
}

/**
 * A garment's corrective offsets in its hung, baked frame for one pose on one
 * person: Σ_k driver_k · (shape_k + Σ_m influence_m · shapeMorph_m,k), the
 * shapes following the body morphs as the garment does
 * (scripts/villager/correct.py `person_shapes`). `shapes[k]` and
 * `morphs[m][k]` are vertices × 3, flat; writes `out` and returns it.
 */
export function garmentCorrection(
  shapes: readonly Float32Array[],
  morphs: Readonly<Record<string, readonly Float32Array[]>>,
  influences: Readonly<Record<string, number>>,
  drivers: ArrayLike<number>,
  out = new Float32Array(shapes[0]?.length ?? 0),
): Float32Array {
  out.fill(0)
  const add = (src: Float32Array, w: number) => {
    if (!w) return
    for (let i = 0; i < out.length; i++) out[i] += w * src[i]
  }
  shapes.forEach((s, k) => add(s, drivers[k]))
  for (const [m, w] of Object.entries(influences)) {
    const sm = morphs[m]
    if (!sm || !w) continue
    sm.forEach((s, k) => add(s, w * drivers[k]))
  }
  return out
}
